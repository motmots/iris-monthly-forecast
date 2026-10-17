"""Monthly (30-day, daily-resolution) Monte Carlo forecast — the scheduled job.

    python -m iris_worker.monthly                 # fetch, simulate, backtest, write to Supabase
    python -m iris_worker.monthly --dry-run       # same, but only write JSON to ./out
    python -m iris_worker.monthly --csv ../data/btc_master_1.csv --dry-run

One run = one row in ``public.monthly_forecast_runs`` keyed by the as-of date
(the last *completed* UTC daily close). Re-running on the same day upserts the
same row, so a retried or duplicated schedule is harmless.

Each run also scores the previous runs whose forecast days have since passed
(``realized`` column) — the live track record shown on /forecast/monthly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np

from . import __version__
from .backtest import run_backtest
from .fhs import DEFAULT_QUANTILES, simulate
from .prices import load_daily
from .supabase_rest import Supabase
from .tracking import score_run

SOURCE_KEY = "internal_monthly"
TABLE = "monthly_forecast_runs"
QKEYS = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]
TRADING_DAYS = 365  # BTC trades every day


def _seed(as_of: str) -> int:
    return int(hashlib.sha256(f"iris-monthly|{as_of}".encode()).hexdigest()[:8], 16)


def _r(x: float, nd: int = 2) -> float:
    return float(round(float(x), nd))


def build_run(series, horizon: int, n_paths: int, backtest: bool, backtest_paths: int,
              history_days: int, n_lines: int) -> dict:
    closes = np.asarray(series.closes, dtype=float)
    log_ret = np.diff(np.log(closes))
    as_of = series.dates[-1]
    spot = float(closes[-1])

    sim = simulate(log_ret, horizon, n_paths, seed=_seed(as_of), method="fhs", drift_mode="zero")

    d0 = date.fromisoformat(as_of)
    bands = []
    for step in range(horizon + 1):
        row = {"step": step, "date": (d0 + timedelta(days=step)).isoformat()}
        row.update({k: _r(m * spot) for k, m in zip(QKEYS, sim.bands[step])})
        bands.append(row)

    paths = [[_r(m * spot) for m in p] for p in sim.representative_paths(n_lines)]

    term = sim.terminal()
    probs = [
        {"label": f"{'+' if pct > 0 else ''}{pct}%", "multiplier": 1 + pct / 100,
         "price": _r(spot * (1 + pct / 100)), "prob_above": float((term >= 1 + pct / 100).mean())}
        for pct in (-30, -20, -10, 0, 10, 20, 30)
    ]

    ann = lambda s: float(s * np.sqrt(TRADING_DAYS) * 100)  # noqa: E731
    last = sim.bands[horizon]
    model = {
        "engine": "FHS (GARCH(1,1)-filtered historical simulation)",
        **sim.fit.as_dict(),
        "sigma_now_ann_pct": ann(sim.start_sigma),
        "sigma_long_run_ann_pct": ann(sim.fit.long_run_sigma),
        "drift_removed_daily": sim.drift_removed,
        "expected_move_pct": float((last[4] - last[2]) / 2 * 100),
        "range_p5_p95_pct": float((last[6] - last[0]) * 100),
        "probabilities": probs,
        "sigma_path_ann_pct": [ann(s) for s in sim.sigma_path],
    }

    bt = None
    if backtest:
        t0 = time.time()
        bt = run_backtest(log_ret, series.dates[1:], horizons=(7, 14, horizon),
                          n_paths=backtest_paths)
        bt["seconds"] = round(time.time() - t0, 1)

    return {
        "id": as_of,
        "run_at": datetime.now(timezone.utc).isoformat(),
        "as_of": as_of,
        "spot": _r(spot),
        "horizon_days": horizon,
        "n_paths": n_paths,
        "method": sim.method,
        "drift_mode": sim.drift_mode,
        "price_source": series.source.split(":")[0],
        "sample_days": int(len(log_ret)),
        "history_start": series.dates[0],
        "model": model,
        "bands": bands,
        "paths": paths,
        "history": [{"date": d, "close": _r(c)} for d, c in
                    zip(series.dates[-history_days:], series.closes[-history_days:])],
        "backtest": bt,
        "realized": score_run(bands, {}),
        "is_synthetic": False,
        "worker_version": __version__,
    }


def score_previous(db: Supabase, series, as_of: str) -> int:
    prev = db.select(TABLE, {"select": "id,bands", "as_of": f"lt.{as_of}",
                             "order": "as_of.desc", "limit": "12"})
    actual = dict(zip(series.dates, series.closes))
    for row in prev:
        db.patch(TABLE, {"id": row["id"]}, {"realized": score_run(row["bands"], actual)})
    return len(prev)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", help="read closes from a CSV (date + btc_close/close) instead of the APIs")
    ap.add_argument("--horizon", type=int, default=30)
    ap.add_argument("--paths", type=int, default=10_000)
    ap.add_argument("--lines", type=int, default=24, help="representative paths stored for the chart")
    ap.add_argument("--history-days", type=int, default=120)
    ap.add_argument("--no-backtest", action="store_true")
    ap.add_argument("--backtest-paths", type=int, default=1000)
    ap.add_argument("--dry-run", action="store_true", help="do not touch Supabase")
    ap.add_argument("--out", default="out")
    args = ap.parse_args(argv)

    db = None if args.dry_run else Supabase.from_env()
    if not args.dry_run and db is None:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (use --dry-run to run without a database)",
              file=sys.stderr)
        return 2

    try:
        series = load_daily(args.csv)
        print(f"[monthly] {len(series)} closes {series.dates[0]} -> {series.dates[-1]} via {series.source}")
        run = build_run(series, args.horizon, args.paths, not args.no_backtest,
                        args.backtest_paths, args.history_days, args.lines)

        os.makedirs(args.out, exist_ok=True)
        path = os.path.join(args.out, f"monthly_forecast_{run['as_of']}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(run, f, indent=1)
        end = run["bands"][-1]
        print(f"[monthly] spot {run['spot']:,.0f} | D+{args.horizon}: P5 {end['p5']:,.0f}  "
              f"P50 {end['p50']:,.0f}  P95 {end['p95']:,.0f} | GARCH {run['model']['method']} "
              f"sigma_now {run['model']['sigma_now_ann_pct']:.1f}% ann | wrote {path}")
        if run["backtest"]:
            for h in run["backtest"]["horizons"]:
                cells = "  ".join(f"{m['method']}: cov80 {m['coverage']['80']:.1%} pin {m['pinball']:.4f}"
                                  for m in h["methods"])
                print(f"[backtest] h={h['h']:>2} ({h['origins']} origins, ~{h['independent']} independent) {cells}")

        if db:
            db.upsert(TABLE, run, on_conflict="id")
            n = score_previous(db, series, run["as_of"])
            db.report_status(SOURCE_KEY, ok=True, rows=1)
            print(f"[monthly] upserted run {run['id']}, re-scored {n} earlier runs")
        return 0
    except Exception as exc:  # noqa: BLE001 — report, then fail the job loudly
        print(f"[monthly] FAILED: {exc}", file=sys.stderr)
        if db:
            try:
                db.report_status(SOURCE_KEY, ok=False, error=str(exc))
            except Exception as inner:  # noqa: BLE001
                print(f"[monthly] could not record failure: {inner}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
