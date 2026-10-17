import numpy as np
import pytest

from iris_worker.backtest import run_backtest
from iris_worker.fhs import simulate
from iris_worker.garch import fit_garch11, forecast_sigma_path
from iris_worker.monthly import build_run
from iris_worker.prices import Series
from iris_worker.tracking import bucket, score_run


def garch_series(n=3000, omega=2e-6, alpha=0.10, beta=0.85, seed=1, drift=0.0):
    rng = np.random.default_rng(seed)
    v = omega / (1 - alpha - beta)
    out = np.empty(n)
    for i in range(n):
        out[i] = np.sqrt(v) * rng.standard_t(6) / np.sqrt(6 / 4) + drift
        v = omega + alpha * (out[i] - drift) ** 2 + beta * v
    return out


def test_garch_recovers_parameters():
    fit = fit_garch11(garch_series())
    assert fit.converged and fit.method == "garch"
    assert 0.05 < fit.alpha < 0.18
    assert 0.75 < fit.beta < 0.93
    assert fit.persistence < 0.999


def test_short_series_falls_back_to_ewma():
    fit = fit_garch11(garch_series(n=60))
    assert fit.method == "ewma" and not fit.converged


def test_sigma_path_mean_reverts():
    fit = fit_garch11(garch_series())
    path = forecast_sigma_path(fit, 365, start_sigma=fit.long_run_sigma * 0.5)
    assert path[0] < path[-1] <= fit.long_run_sigma * 1.0001


def test_drift_is_removed():
    # +0.2%/day compounds to ~+100%/yr; with drift removed the median must stay near spot.
    r = garch_series(drift=0.002)
    sim = simulate(r, 365, 4000, seed=3, drift_mode="zero")
    assert 0.9 < sim.bands[-1, 3] < 1.1


def test_deterministic_for_a_seed():
    r = garch_series()
    a = simulate(r, 30, 2000, seed=42).bands
    b = simulate(r, 30, 2000, seed=42).bands
    np.testing.assert_array_equal(a, b)


def test_bands_ordered_and_widening():
    sim = simulate(garch_series(), 30, 4000, seed=5)
    assert np.all(np.diff(sim.bands[1:], axis=1) >= 0)
    width = sim.bands[1:, 6] - sim.bands[1:, 0]
    assert width[-1] > width[0]
    assert np.allclose(sim.bands[0], 1.0)


def test_representative_paths_span_distribution():
    sim = simulate(garch_series(), 30, 4000, seed=5)
    p = sim.representative_paths(10)
    assert p.shape == (10, 31)
    assert np.all(np.diff(p[:, -1]) >= 0)  # sorted by terminal outcome
    assert p[0, -1] <= sim.bands[-1, 1] and p[-1, -1] >= sim.bands[-1, 5]


def test_backtest_is_calibrated_on_true_garch_data():
    r = garch_series(n=2400, seed=11)
    dates = [f"2020-01-{(i % 28) + 1:02d}" for i in range(len(r))]
    bt = run_backtest(r, dates, horizons=(7, 14), train_min_days=1200, step_days=5, n_paths=600)
    fhs7 = next(m for m in bt["horizons"][0]["methods"] if m["method"] == "fhs")
    assert 0.70 < fhs7["coverage"]["80"] < 0.92
    assert sum(fhs7["pit"]) == bt["origins"]


def test_tracking_scores_bands():
    bands = [{"step": 0, "date": "2026-01-01", **{k: 100 for k in ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]}}]
    for s, d in enumerate(["2026-01-02", "2026-01-03"], start=1):
        bands.append({"step": s, "date": d, "p5": 80, "p10": 85, "p25": 92, "p50": 100, "p75": 108, "p90": 115, "p95": 120})
    res = score_run(bands, {"2026-01-02": 101, "2026-01-03": 130})
    assert res["days_observed"] == 2 and res["complete"]
    assert res["inside_p10_p90"] == pytest.approx(0.5)
    assert res["last_bucket"] == ">p95"
    assert bucket(101, bands[1]) == "p50-p75"
    assert bucket(79, bands[1]) == "<p5"
    assert score_run(bands, {})["days_observed"] == 0


def test_build_run_shape():
    r = garch_series(n=900)
    closes = list(30000 * np.exp(np.concatenate([[0], np.cumsum(r)])))
    dates = [str(np.datetime64("2023-01-01") + np.timedelta64(i, "D")) for i in range(len(closes))]
    run = build_run(Series(dates, closes, "test"), 30, 2000, False, 0, 60, 12)
    assert run["id"] == run["as_of"] == dates[-1]
    assert len(run["bands"]) == 31 and run["bands"][30]["date"] > run["as_of"]
    assert len(run["paths"]) == 12 and len(run["paths"][0]) == 31
    assert len(run["history"]) == 60
    assert run["realized"]["days_observed"] == 0
    assert run["model"]["probabilities"][3]["label"] == "0%"
