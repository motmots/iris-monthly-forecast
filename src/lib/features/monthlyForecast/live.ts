/**
 * Monthly forecast, read from Supabase.
 *
 * Nothing is computed here. The Python worker (`worker/iris_worker/monthly.py`)
 * runs the simulation and the backtest once a week on a schedule and writes one
 * row per run; this file reads the newest row plus a few earlier ones for the
 * track record. Same failure policy as `whaleEvents/live.ts`: unconfigured or
 * empty resolves to `null`, which routes the page to the badged mock.
 */
import { asRow, getSupabase } from '@/lib/supabase/server';
import type {
  BacktestHorizon,
  DailyBand,
  MonthlyBacktest,
  MonthlyForecastArgs,
  MonthlyForecastData,
  ProbabilityRow,
  TrackRecordRow,
} from './types';

interface RunRow {
  id: string;
  run_at: string;
  as_of: string;
  spot: number | string;
  horizon_days: number;
  n_paths: number;
  method: string;
  price_source: string;
  sample_days: number;
  history_start: string;
  model: Record<string, unknown>;
  bands: DailyBand[];
  paths: number[][];
  history: { date: string; close: number }[];
  backtest: Record<string, unknown> | null;
  realized: Record<string, unknown> | null;
  is_synthetic: boolean;
}

type TrackRow = Pick<RunRow, 'id' | 'as_of' | 'spot' | 'bands' | 'realized'>;

const LATEST_COLUMNS =
  'id, run_at, as_of, spot, horizon_days, n_paths, method, price_source, sample_days, history_start, model, bands, paths, history, backtest, realized, is_synthetic';

/** Postgres `numeric` arrives as a string through PostgREST. */
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};

const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : num(v, NaN);

function toModel(m: Record<string, unknown>): MonthlyForecastData['model'] {
  const probs = Array.isArray(m.probabilities) ? (m.probabilities as Record<string, unknown>[]) : [];
  return {
    engine: String(m.engine ?? 'FHS'),
    volModel: m.method === 'ewma' ? 'ewma' : 'garch',
    alpha: num(m.alpha),
    beta: num(m.beta),
    persistence: num(m.persistence),
    sigmaNowAnnPct: num(m.sigma_now_ann_pct),
    sigmaLongRunAnnPct: num(m.sigma_long_run_ann_pct),
    driftRemovedDaily: num(m.drift_removed_daily),
    expectedMovePct: num(m.expected_move_pct),
    rangeP5P95Pct: num(m.range_p5_p95_pct),
    volSource: m.vol_source === 'dvol_vrp' ? 'dvol_vrp' : 'garch',
    sigmaGarchAnnPct: num(m.sigma_garch_ann_pct, num(m.sigma_now_ann_pct)),
    dvolPct: numOrNull(m.dvol_pct),
    vrpFactor: numOrNull(m.vrp_factor),
    calibrationApplied: Boolean((m.calibration as Record<string, unknown> | undefined)?.applied),
    calibrationNote: (() => {
      const c = m.calibration as Record<string, unknown> | undefined;
      return typeof c?.reason === 'string' ? c.reason : null;
    })(),
    probabilities: probs.map(
      (p): ProbabilityRow => ({
        label: String(p.label),
        price: num(p.price),
        probAbove: num(p.prob_above),
      }),
    ),
  };
}

function toBacktest(b: Record<string, unknown> | null): MonthlyBacktest | null {
  if (!b || !Array.isArray(b.horizons)) return null;
  const years = (v: unknown) =>
    (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map((y) => ({
      year: String(y.year),
      coverage: num(y.coverage),
      origins: num(y.origins),
    }));
  const horizons = (b.horizons as Record<string, unknown>[]).map((h) => ({
    h: num(h.h),
    origins: num(h.origins),
    independent: num(h.independent),
    methods: (Array.isArray(h.methods) ? (h.methods as Record<string, unknown>[]) : []).map((m) => ({
      method: m.method as BacktestHorizon['methods'][number]['method'],
      label: String(m.label ?? m.method),
      coverage: m.coverage as BacktestHorizon['methods'][number]['coverage'],
      pinball: num(m.pinball),
      pit: Array.isArray(m.pit) ? (m.pit as number[]) : [],
      upperMiss: numOrNull(m.upper_miss),
      lowerMiss: numOrNull(m.lower_miss),
    })),
  }));
  return {
    origins: num(b.origins),
    warmupOrigins: num(b.warmup_origins),
    firstOrigin: String(b.first_origin ?? ''),
    lastOrigin: String(b.last_origin ?? ''),
    stepDays: num(b.step_days, 7),
    refitEveryDays: num(b.refit_every_days, 365),
    horizons,
    byYear: years(b.fhs_coverage80_by_year_h30),
    byYearCal: years(b.fhs_cal_coverage80_by_year_h30),
    byYearDvol: years(b.fhs_dvol_coverage80_by_year_h30),
    dvolUsed: Boolean(b.dvol_used),
  };
}

function toTrack(r: TrackRow): TrackRecordRow {
  const end = r.bands[r.bands.length - 1];
  const z = r.realized ?? {};
  return {
    asOf: r.as_of,
    spot: num(r.spot),
    p10End: num(end?.p10),
    p50End: num(end?.p50),
    p90End: num(end?.p90),
    daysTotal: num(z.days_total, r.bands.length - 1),
    daysObserved: num(z.days_observed),
    complete: Boolean(z.complete),
    insideP10P90: numOrNull(z.inside_p10_p90),
    insideP5P95: numOrNull(z.inside_p5_p95),
    lastClose: numOrNull(z.last_close),
    lastBucket: typeof z.last_bucket === 'string' ? z.last_bucket : null,
  };
}

export async function fetchMonthlyForecast({ trackRecordRuns = 8 }: MonthlyForecastArgs) {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from('monthly_forecast_runs')
    .select(LATEST_COLUMNS)
    .order('as_of', { ascending: false })
    .limit(1);
  if (error) throw new Error(`monthly_forecast_runs: ${error.message}`);

  const latest = data?.[0] ? asRow<RunRow>(data[0]) : null;
  if (!latest || !Array.isArray(latest.bands) || latest.bands.length < 2) return null;

  const { data: prev, error: prevError } = await db
    .from('monthly_forecast_runs')
    .select('id, as_of, spot, bands, realized')
    .lt('as_of', latest.as_of)
    .order('as_of', { ascending: false })
    .limit(Math.min(Math.max(0, trackRecordRuns), 26));
  // The track record is a garnish on the page; losing it must not cost the chart.
  const trackRows = prevError ? [] : (prev ?? []).map(asRow<TrackRow>);

  const result: MonthlyForecastData = {
    runId: latest.id,
    runAt: latest.run_at,
    asOf: latest.as_of,
    spot: num(latest.spot),
    horizonDays: latest.horizon_days,
    nPaths: latest.n_paths,
    method: latest.method,
    priceSource: latest.price_source,
    sampleDays: latest.sample_days,
    historyStart: latest.history_start,
    bands: latest.bands.map((b) => ({
      step: b.step,
      date: b.date,
      p5: num(b.p5),
      p10: num(b.p10),
      p25: num(b.p25),
      p50: num(b.p50),
      p75: num(b.p75),
      p90: num(b.p90),
      p95: num(b.p95),
    })),
    paths: Array.isArray(latest.paths) ? latest.paths : [],
    history: Array.isArray(latest.history) ? latest.history : [],
    model: toModel(latest.model ?? {}),
    backtest: toBacktest(latest.backtest),
    trackRecord: trackRows.filter((r) => Array.isArray(r.bands) && r.bands.length > 1).map(toTrack),
  };

  return { data: result, asOf: latest.run_at, synthetic: latest.is_synthetic };
}
