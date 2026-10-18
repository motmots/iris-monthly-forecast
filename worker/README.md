# IRIS worker

Python jobs that run outside the web app and write to Supabase. The Next.js app only reads.

## `iris_worker.monthly` — 30-day Monte Carlo, run weekly

| Step | What |
|---|---|
| Data | Daily BTC-USD closes from Coinbase Exchange (paged back to ~2016), Kraken fallback. Only completed UTC days. |
| Model | GARCH(1,1), variance-targeted, grid-search MLE (EWMA fallback). Port of `src/lib/quant/garch.ts`. |
| Simulation | Filtered Historical Simulation, 10,000 paths, 30 daily steps, drift removed. Port of `src/lib/quant/fhs.ts`. |
| Start vol | Deribit DVOL × walk-forward VRP factor (realised/implied over 30-day windows already closed). Falls back to GARCH if DVOL cannot be fetched. `--no-dvol` forces GARCH, `--dvol-csv` reads a CSV. |
| Output | P5/P10/P25/P50/P75/P90/P95 for every day D+0…D+30, 24 representative paths, probability ladder. |
| Backtest | Rolling-origin out-of-sample (weekly origins, yearly refits, everything at origin *t* from data before *t*): coverage, pinball, PIT, upside/downside misses for FHS vs FHS+conformal vs i.i.d. vs GARCH-Normal, all on the same origins. |
| Calibration | Split-conformal band rescaling, learned only from outcomes realised before each origin. Evaluated and **off by default** — it raised pinball loss at every horizon. `--calibrate` opts in. |
| Leakage test | `test_backtest_has_no_lookahead` rewrites the future and requires past origins to score identically. |
| Track record | Each run re-scores the previous 12 runs against realised closes (`realized` column). |
| Storage | One row per as-of date in `public.monthly_forecast_runs` (upsert, so reruns are safe). |

### Run locally

```bash
cd worker
pip install -r requirements.txt
python -m pytest -q tests

# no database, write JSON to ./out
python -m iris_worker.monthly --dry-run
# offline, from a frozen dataset (date + btc_close columns)
python -m iris_worker.monthly --dry-run --csv ../path/to/btc_master_1.csv

# against Supabase
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...      # service role, NOT the anon key
python -m iris_worker.monthly
```

Flags: `--horizon 30`, `--paths 10000`, `--lines 24`, `--no-backtest`, `--backtest-paths 1000`, `--calibrate`, `--dvol-csv FILE`, `--no-dvol`, `--out out`.

Deribit is unreachable from some Indonesian ISPs; that only matters for local runs. GitHub Actions reaches it, and a local run can use `--dvol-csv` with a file fetched there.

### Deploy (one-time)

1. Apply `supabase/migrations/0003_monthly_forecast.sql` (SQL editor or `supabase db push`).
2. GitHub → Settings → Secrets and variables → Actions: add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Actions → **Monthly forecast** → *Run workflow* once. The page `/forecast/monthly` switches from MOCK to live.

The schedule is `20 0 * * 1` (Monday 00:20 UTC = 07:20 WIB). GitHub only fires schedules from
the **default branch**; on a feature branch use *Run workflow*. GitHub also pauses schedules on
public repos after 60 days without commits; re-enable from the Actions tab.

To change cadence (e.g. daily), edit the cron line only — runs are keyed by as-of date, so a
daily schedule produces one row per day with no other change.

## `research/benchmark_xgb_vs_baselines.py`

Reproduces the comparison that ruled out a directional ML model (see `docs/DECISIONS.md` §4):

```bash
pip install -r research/requirements.txt
python research/benchmark_xgb_vs_baselines.py path/to/btc_master_2.csv
python research/improve_monthly.py path/to/btc_master_1.csv          # 8 price-only candidates: none survived test
python research/dvol_monthly.py path/to/btc_master_1.csv dvol.csv   # DVOL candidates: the shipped one
python research/dvol_monthly.py path/to/btc_master_1.csv dvol.csv --self-test   # lookahead check
```
