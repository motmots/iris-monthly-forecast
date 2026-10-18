import numpy as np
import pytest

from iris_worker.backtest import conformal_k, run_backtest
from iris_worker.fhs import recalibrate, simulate
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


def test_backtest_has_no_lookahead():
    """Rewrite everything after `cut`: no origin whose outcome ends by `cut` may move.

    Covers every input an origin uses — GARCH fit, volatility state, residual
    pool, removed drift and, the easy one to get wrong, the walk-forward
    calibration factors (which must use only outcomes realised before the origin).
    """
    r = garch_series(n=2000, seed=21)
    dates = [str(np.datetime64("2018-01-01") + np.timedelta64(i, "D")) for i in range(len(r))]
    kw = dict(horizons=(7, 14), train_min_days=900, step_days=7, n_paths=300, min_cal_origins=20,
              return_records=True)
    cut = 1700
    a = run_backtest(r, dates, **kw)

    r2 = r.copy()
    rng = np.random.default_rng(99)
    r2[cut:] = rng.standard_normal(len(r) - cut) * 0.08 + 0.01   # a wildly different future
    b = run_backtest(r2, dates, **kw)

    rec_b = {x["t"]: x for x in b["records"]}
    checked = 0
    for x in a["records"]:
        if x["t"] + 14 <= cut:
            assert x["scores"] == rec_b[x["t"]]["scores"], f"origin {x['t']} saw the future"
            checked += 1
    assert checked > 20
    # ...and the test is not vacuous: later origins do change.
    assert any(x["scores"] != rec_b[x["t"]]["scores"] for x in a["records"] if x["t"] >= cut)


def test_conformal_k_hits_target_tail():
    rng = np.random.default_rng(3)
    ratios = rng.standard_normal(5000) * 1.3
    k = conformal_k(ratios, tail=0.10)
    assert abs((ratios > k).mean() - 0.10) < 0.01


def test_calibration_widens_bands_that_are_too_narrow():
    # Trending data: zero-drift bands miss on the upside; calibration must fix most of it.
    r = garch_series(n=2600, seed=4, drift=0.004)
    dates = [str(np.datetime64("2018-01-01") + np.timedelta64(i, "D")) for i in range(len(r))]
    bt = run_backtest(r, dates, horizons=(14,), train_min_days=1000, step_days=5, n_paths=500)
    m = {x["method"]: x for x in bt["horizons"][0]["methods"]}
    raw, cal = m["fhs"]["coverage"]["80"], m["fhs_cal"]["coverage"]["80"]
    assert abs(cal - 0.80) < abs(raw - 0.80)
    assert m["fhs_cal"]["upper_miss"] < m["fhs"]["upper_miss"]
    assert bt["calibration"]["k_up"][13] > 1.0


def test_recalibrate_keeps_median_and_order():
    sim = simulate(garch_series(), 10, 3000, seed=8)
    cal = recalibrate(sim, [1.5] * 10, [0.8] * 10)
    # even path count: the median averages two middle paths, so allow float-level drift
    np.testing.assert_allclose(cal.bands[:, 3], sim.bands[:, 3], rtol=1e-4)
    assert np.all(np.argsort(cal.cum[-1]) == np.argsort(sim.cum[-1]))
    up_raw = np.log(sim.bands[-1, 5] / sim.bands[-1, 3])
    up_cal = np.log(cal.bands[-1, 5] / cal.bands[-1, 3])
    assert up_cal == pytest.approx(1.5 * up_raw, rel=1e-3)
