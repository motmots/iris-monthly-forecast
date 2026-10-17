"""Rolling-origin, out-of-sample calibration backtest.

For every origin ``t`` (one per ``step_days``) the model sees only returns
before ``t``:

* GARCH parameters are re-fitted on an expanding window every
  ``refit_every_days`` (never on data after the origin);
* the volatility *state* at ``t`` is filtered forward with those parameters;
* the residual pool and the drift that is removed come from data before ``t``.

The realised ``h``-day log return is then scored against the simulated
distribution. Three engines are compared so the default is falsifiable:

``fhs``           Filtered Historical Simulation (what ships).
``iid``           Resampled raw returns — no volatility clustering.
``garch_normal``  Closed form: Normal with the GARCH expected-variance path.

Metrics
-------
* **coverage** of the central 50 / 80 / 90 % bands (target = nominal);
* **pinball loss** averaged over the 7-quantile ladder (lower is better; the
  proper score for a quantile forecast — coverage alone can be gamed by width);
* **PIT histogram** (10 bins; flat means calibrated, U-shape means bands too
  narrow, hump means too wide);
* ``independent``: origins / (h / step) — overlapping windows are *not*
  independent observations, and the report says how many really are.
"""

from __future__ import annotations

from statistics import NormalDist

import numpy as np

from .fhs import DEFAULT_QUANTILES, simulate
from .garch import GarchFit, filter_sigma, fit_garch11, forecast_sigma_path

BANDS = {50: (0.25, 0.75), 80: (0.10, 0.90), 90: (0.05, 0.95)}
METHOD_LABELS = {
    "fhs": "FHS · GARCH-filtered bootstrap",
    "iid": "i.i.d. bootstrap",
    "garch_normal": "GARCH + Normal (closed form)",
}
_ND = NormalDist()


def _pinball(y: float, qs: np.ndarray, levels: np.ndarray) -> float:
    d = y - qs
    return float(np.mean(np.maximum(levels * d, (levels - 1) * d)))


def run_backtest(
    log_returns: np.ndarray,
    dates: list[str],
    horizons: tuple[int, ...] = (7, 14, 30),
    train_min_days: int = 1460,
    step_days: int = 7,
    refit_every_days: int = 365,
    n_paths: int = 1000,
    seed: int = 7,
) -> dict:
    """``dates[i]`` is the date of the close that ends return ``i``; origin ``t``
    is therefore dated ``dates[t - 1]`` (the last close the model has seen)."""
    r = np.asarray(log_returns, dtype=float)
    n = len(r)
    H = max(horizons)
    levels = DEFAULT_QUANTILES
    if n < train_min_days + H + step_days:
        raise ValueError(f"backtest needs > {train_min_days + H} returns, got {n}")

    origins = list(range(train_min_days, n - H + 1, step_days))
    methods = ("fhs", "iid", "garch_normal")
    pit = {m: {h: [] for h in horizons} for m in methods}
    pin = {m: {h: [] for h in horizons} for m in methods}
    by_year: dict[str, list[float]] = {}

    fit: GarchFit | None = None
    fit_end = -1
    for k, t in enumerate(origins):
        if fit is None or t - fit_end >= refit_every_days:
            fit_end = t
            train = r[:t] - r[:t].mean()
            fit = fit_garch11(train)
            pool = (train / fit.sigma)[np.isfinite(train / fit.sigma)]

        hist = r[:t] - r[:t].mean()
        _, s_now = filter_sigma(hist, fit)

        sims = {
            "fhs": simulate(hist, H, n_paths, seed + k, "fhs", "none", fit=fit,
                            start_sigma=s_now, residual_pool=pool),
            "iid": simulate(hist, H, n_paths, seed + k, "iid", "none", fit=fit),
        }
        sig_path = forecast_sigma_path(fit, H, s_now)

        for h in horizons:
            y = float(r[t:t + h].sum())
            for m in methods:
                if m == "garch_normal":
                    s = float(np.sqrt(np.sum(sig_path[:h] ** 2)))
                    u = _ND.cdf(y / s) if s > 0 else 0.5
                    qs = np.array([_ND.inv_cdf(q) * s for q in levels])
                else:
                    c = sims[m].cum[h]
                    u = float((c <= y).mean())
                    qs = np.quantile(c, levels)
                pit[m][h].append(u)
                pin[m][h].append(_pinball(y, qs, levels))
            if h == 30:
                yr = dates[t - 1][:4]
                lo, hi = BANDS[80]
                by_year.setdefault(yr, []).append(1.0 if lo <= pit["fhs"][30][-1] <= hi else 0.0)

    out_h = []
    for h in horizons:
        rows = []
        for m in methods:
            u = np.array(pit[m][h])
            cov = {str(b): float(((u >= lo) & (u <= hi)).mean()) for b, (lo, hi) in BANDS.items()}
            hist10, _ = np.histogram(u, bins=10, range=(0, 1))
            rows.append({
                "method": m,
                "label": METHOD_LABELS[m],
                "coverage": cov,
                "pinball": float(np.mean(pin[m][h])),
                "pit": hist10.astype(int).tolist(),
            })
        out_h.append({
            "h": h,
            "origins": len(origins),
            "independent": int(len(origins) * step_days // h),
            "methods": rows,
        })

    return {
        "origins": len(origins),
        "first_origin": dates[origins[0] - 1],
        "last_origin": dates[origins[-1] - 1],
        "step_days": step_days,
        "refit_every_days": refit_every_days,
        "train_min_days": train_min_days,
        "n_paths": n_paths,
        "horizons": out_h,
        "fhs_coverage80_by_year_h30": [
            {"year": y, "coverage": float(np.mean(v)), "origins": len(v)}
            for y, v in sorted(by_year.items())
        ],
    }
