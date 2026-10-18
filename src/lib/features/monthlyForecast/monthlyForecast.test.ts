import { describe, expect, it, vi } from 'vitest';
import { coverageTone, nextScheduledRun, runInsideTone, ladderRows, shippedMethod } from './present';
import { mockMonthlyForecast } from './mock';

/**
 * The live reader is exercised against a hand-built PostgREST double, shaped
 * exactly like what `worker/iris_worker/monthly.py` writes (snake_case jsonb,
 * numeric columns as strings).
 */
const band = (step: number, spot: number) => ({
  step,
  date: `2026-08-${String(21 + step).padStart(2, '0')}`,
  p5: spot * 0.9,
  p10: spot * 0.93,
  p25: spot * 0.97,
  p50: spot,
  p75: spot * 1.03,
  p90: spot * 1.07,
  p95: spot * 1.1,
});

const latest = {
  id: '2026-08-21',
  run_at: '2026-08-24T00:20:00Z',
  as_of: '2026-08-21',
  spot: '63551.88',
  horizon_days: 2,
  n_paths: 10000,
  method: 'fhs',
  price_source: 'coinbase',
  sample_days: 4184,
  history_start: '2015-03-08',
  model: {
    engine: 'FHS',
    method: 'garch',
    alpha: 0.11,
    beta: 0.85,
    persistence: 0.96,
    sigma_now_ann_pct: 34.8,
    sigma_long_run_ann_pct: 65.8,
    drift_removed_daily: 0.0013,
    expected_move_pct: 8.3,
    range_p5_p95_pct: 44.9,
    probabilities: [{ label: '+10%', price: 69907, prob_above: 0.22 }],
  },
  bands: [band(0, 63551.88), band(1, 63551.88), band(2, 63551.88)],
  paths: [[63551.88, 63000, 62000]],
  history: [{ date: '2026-08-20', close: 63000 }, { date: '2026-08-21', close: 63551.88 }],
  backtest: {
    origins: 385,
    first_origin: '2019-03-07',
    last_origin: '2026-07-16',
    step_days: 7,
    refit_every_days: 365,
    horizons: [],
    fhs_coverage80_by_year_h30: [{ year: '2025', coverage: 0.94, origins: 52 }],
  },
  realized: { days_observed: 0 },
  is_synthetic: false,
};

const previous = {
  id: '2026-08-14',
  as_of: '2026-08-14',
  spot: '60000',
  bands: [band(0, 60000), band(1, 60000), band(2, 60000)],
  realized: {
    days_total: 2,
    days_observed: 2,
    complete: true,
    inside_p10_p90: 0.5,
    inside_p5_p95: 1,
    last_close: 66000,
    last_bucket: 'p90-p95',
  },
};

function query(rows: unknown[]) {
  const q = {
    select: () => q,
    order: () => q,
    lt: () => q,
    limit: async () => ({ data: rows, error: null }),
  };
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  asRow: <T,>(v: unknown) => v as T,
  getSupabase: () => {
    let call = 0;
    return { from: () => query(call++ === 0 ? [latest] : [previous]) };
  },
}));

describe('fetchMonthlyForecast', () => {
  it('maps a worker row into the UI shape', async () => {
    const { fetchMonthlyForecast } = await import('./live');
    const res = await fetchMonthlyForecast({ trackRecordRuns: 4 });
    expect(res).not.toBeNull();
    const d = res!.data;
    expect(d.spot).toBeCloseTo(63551.88);
    expect(d.bands).toHaveLength(3);
    expect(d.model.volModel).toBe('garch');
    expect(d.model.volSource).toBe('garch'); // fixture has no DVOL: the fallback
    expect(d.model.dvolPct).toBeNull();
    expect(d.model.probabilities[0].probAbove).toBeCloseTo(0.22);
    expect(d.backtest?.byYear[0].coverage).toBeCloseTo(0.94);
    expect(d.trackRecord).toHaveLength(1);
    expect(d.trackRecord[0]).toMatchObject({ asOf: '2026-08-14', complete: true, insideP10P90: 0.5, lastBucket: 'p90-p95' });
    expect(d.trackRecord[0].p90End).toBeCloseTo(60000 * 1.07);
    expect(res!.synthetic).toBe(false);
    expect(res!.asOf).toBe(latest.run_at);
  });
});

describe('present helpers', () => {
  it('tones aggregate coverage symmetrically around nominal', () => {
    expect(coverageTone(0.8, 80)).toBe('up');
    expect(coverageTone(0.72, 80)).toBe('amber');
    expect(coverageTone(0.95, 80)).toBe('down');
  });

  it('maps the run method to the backtest row behind the published bands', () => {
    expect(shippedMethod('fhs_dvol')).toBe('fhs_dvol');
    expect(shippedMethod('fhs')).toBe('fhs');
    expect(shippedMethod('fhs_dvol_cal')).toBe('fhs_cal');
  });

  it('never flags a single run for holding too well', () => {
    expect(runInsideTone(1)).toBe('up');
    expect(runInsideTone(0.6)).toBe('amber');
    expect(runInsideTone(0.2)).toBe('down');
  });

  it('schedules the next run for the following Monday 00:20 UTC', () => {
    expect(nextScheduledRun('2026-08-24T00:20:05Z')).toBe('2026-08-31 00:20 UTC'); // a Monday run
    expect(nextScheduledRun('2026-08-26T10:00:00Z')).toBe('2026-08-31 00:20 UTC'); // mid-week
  });

  it('mock has the live shape and a ladder ending on the horizon', () => {
    const m = mockMonthlyForecast({ trackRecordRuns: 3 });
    expect(m.bands).toHaveLength(m.horizonDays + 1);
    expect(m.paths[0]).toHaveLength(m.horizonDays + 1);
    expect(m.trackRecord).toHaveLength(3);
    expect(ladderRows(m).at(-1)?.step).toBe(30);
  });
});
