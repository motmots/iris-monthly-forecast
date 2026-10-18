import type { BacktestMethod, DailyBand, MonthlyForecastData } from './types';

export const MONTHLY_NOTE =
  'A distribution of where price could be on each of the next 30 days, conditional on today’s volatility — not a call on direction. Drift is removed, so the median sits near spot by construction. Thin lines are real simulated paths picked across the range of outcomes; they illustrate the spread, they are not predictions.';

export const WORKER_NOTE =
  'Computed once a week (Monday 00:20 UTC) by the Python worker, not on page load. Same FHS engine as the Distribution page, run on 10,000 paths and stored, so every published forecast can later be scored against the price that actually happened.';

export const BACKTEST_NOTE =
  'Rolling-origin and out of sample: at every weekly origin the model saw only earlier data, GARCH was re-fitted yearly on an expanding window. Overlapping windows are not independent — the INDEP. column is the honest sample size.';

export const CALIBRATION_NOTE =
  'FHS + CAL rescales the bands per side with split-conformal factors learned only from origins whose outcome had already happened (t′ + h ≤ t). It pulls coverage toward 80% in some years but raised pinball loss at every horizon, so the published bands are raw FHS. Early origins are a warm-up for that calibration and are excluded for every engine, so all rows are scored on the same dates.';

export const WHY_NOT_ML_NOTE =
  'Why no ML model here: XGBoost quantile models on price, technical, macro and on-chain features did not beat a constant historical-quantile baseline on pinball loss in walk-forward tests, and their median got the 30-day direction right less often than “always up”. Volatility is forecastable; direction at this horizon was not. See worker/research/.';

/** Days ahead shown in the ladder. */
export const LADDER_STEPS = [1, 7, 14, 21, 30];

export const ladderRows = (d: MonthlyForecastData): DailyBand[] =>
  LADDER_STEPS.map((s) => d.bands[Math.min(s, d.bands.length - 1)]).filter(Boolean);

export const pctVsSpot = (price: number, spot: number) =>
  spot > 0 ? ((price - spot) / spot) * 100 : 0;

export const fmtSignedPct = (v: number, digits = 1) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;

export const fmtProb = (p: number) => `${(p * 100).toFixed(p > 0.995 || p < 0.005 ? 1 : 0)}%`;

export type CoverageTone = 'up' | 'amber' | 'down';

/** Within 5 points of nominal reads as calibrated; 5–10 is a warning; beyond is a miss. */
export function coverageTone(empirical: number, nominal: number): CoverageTone {
  const gap = Math.abs(empirical * 100 - nominal);
  return gap <= 5 ? 'up' : gap <= 10 ? 'amber' : 'down';
}

/**
 * Tone for ONE run's share of days inside its P10–P90 band. Unlike aggregate
 * coverage, a single run holding 100% is not "too wide" — it simply held. Only
 * falling short is a warning.
 */
export const runInsideTone = (share: number): CoverageTone =>
  share >= 0.8 ? 'up' : share >= 0.5 ? 'amber' : 'down';

/** Lowest pinball loss at a horizon — the method that actually scored best. */
export const bestByPinball = (methods: BacktestMethod[]) =>
  methods.reduce((a, b) => (b.pinball < a.pinball ? b : a), methods[0]);

export const methodShort: Record<BacktestMethod['method'], string> = {
  fhs: 'FHS',
  fhs_cal: 'FHS + CAL',
  iid: 'IID',
  garch_normal: 'GARCH-N',
};

/** Next Monday 00:20 UTC after `iso` — when the worker is scheduled to run again. */
export function nextScheduledRun(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 20));
  do next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() !== 1);
  return next.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
