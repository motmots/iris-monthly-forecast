/**
 * The monthly forecast as the Python worker writes it to
 * `public.monthly_forecast_runs` (see `worker/iris_worker/monthly.py`), reshaped
 * into camelCase for the UI. Prices are absolute USD throughout.
 */

export interface DailyBand {
  /** 0 = the as-of close; 1..horizon = days ahead. */
  step: number;
  /** ISO yyyy-mm-dd. */
  date: string;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface ClosePoint {
  date: string;
  close: number;
}

export interface ProbabilityRow {
  label: string;
  price: number;
  /** Share of simulated paths at or above `price` on the final day. */
  probAbove: number;
}

export interface MonthlyModelState {
  engine: string;
  /** 'garch' when the fit converged, 'ewma' when it fell back. */
  volModel: 'garch' | 'ewma';
  alpha: number;
  beta: number;
  persistence: number;
  sigmaNowAnnPct: number;
  sigmaLongRunAnnPct: number;
  driftRemovedDaily: number;
  /** Half the P25–P75 span at the horizon, % of spot. */
  expectedMovePct: number;
  /** P5–P95 span at the horizon, % of spot. */
  rangeP5P95Pct: number;
  probabilities: ProbabilityRow[];
}

export interface BacktestMethod {
  method: 'fhs' | 'iid' | 'garch_normal';
  label: string;
  /** Empirical coverage of the central 50 / 80 / 90 % bands, 0–1. */
  coverage: { '50': number; '80': number; '90': number };
  pinball: number;
  /** 10-bin PIT histogram counts. */
  pit: number[];
}

export interface BacktestHorizon {
  h: number;
  origins: number;
  /** Non-overlapping windows — what the sample size really is. */
  independent: number;
  methods: BacktestMethod[];
}

export interface MonthlyBacktest {
  origins: number;
  firstOrigin: string;
  lastOrigin: string;
  stepDays: number;
  refitEveryDays: number;
  horizons: BacktestHorizon[];
  byYear: { year: string; coverage: number; origins: number }[];
}

/** One earlier run scored against what price actually did. */
export interface TrackRecordRow {
  asOf: string;
  spot: number;
  p10End: number;
  p50End: number;
  p90End: number;
  daysTotal: number;
  daysObserved: number;
  complete: boolean;
  /** Share of observed days inside P10–P90 (0–1); null before any day passed. */
  insideP10P90: number | null;
  insideP5P95: number | null;
  lastClose: number | null;
  lastBucket: string | null;
}

export interface MonthlyForecastData {
  runId: string;
  runAt: string;
  asOf: string;
  spot: number;
  horizonDays: number;
  nPaths: number;
  method: string;
  priceSource: string;
  sampleDays: number;
  historyStart: string;
  bands: DailyBand[];
  /** Representative simulated paths, each `horizonDays + 1` prices long. */
  paths: number[][];
  history: ClosePoint[];
  model: MonthlyModelState;
  backtest: MonthlyBacktest | null;
  /** Previous runs, newest first, excluding the current one. */
  trackRecord: TrackRecordRow[];
}

export interface MonthlyForecastArgs {
  /** How many earlier runs to score in the track record. */
  trackRecordRuns?: number;
}
