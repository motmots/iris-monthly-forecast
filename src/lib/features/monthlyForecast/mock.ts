import { seeded, utcDay, walk } from '@/lib/rng';
import type {
  BacktestHorizon,
  DailyBand,
  MonthlyForecastArgs,
  MonthlyForecastData,
  TrackRecordRow,
} from './types';

/**
 * Placeholder of the same shape the worker writes. Seeded from the UTC day so
 * SSR and hydration agree; never `Math.random` or `Date.now`. Reaches the page
 * only through `defineFeature`, which badges it MOCK.
 */

const Z = { p5: -1.645, p10: -1.2816, p25: -0.6745, p50: 0, p75: 0.6745, p90: 1.2816, p95: 1.645 };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Standard normal from two uniforms (Box–Muller). */
const gauss = (r: () => number) => {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

export function mockMonthlyForecast({ trackRecordRuns = 8 }: MonthlyForecastArgs): MonthlyForecastData {
  const r = seeded('monthlyForecast');
  const horizon = 30;
  const asOf = addDays(utcDay(), -1);
  const sigma = 0.024;

  const closes = walk(r, 64_000, 120, 2.2);
  const spot = closes[closes.length - 1];
  const history = closes.map((close, i) => ({ date: addDays(asOf, i - closes.length + 1), close }));

  const bands: DailyBand[] = Array.from({ length: horizon + 1 }, (_, step) => {
    const s = sigma * Math.sqrt(step);
    const at = (z: number) => spot * Math.exp(z * s);
    return {
      step,
      date: addDays(asOf, step),
      p5: at(Z.p5),
      p10: at(Z.p10),
      p25: at(Z.p25),
      p50: at(Z.p50),
      p75: at(Z.p75),
      p90: at(Z.p90),
      p95: at(Z.p95),
    };
  });

  const paths = Array.from({ length: 24 }, () => {
    let c = 0;
    return Array.from({ length: horizon + 1 }, (_, i) => {
      if (i > 0) c += sigma * gauss(r);
      return spot * Math.exp(c);
    });
  }).sort((a, b) => a[horizon] - b[horizon]);

  const end = bands[horizon];
  const horizons: BacktestHorizon[] = [7, 14, 30].map((h) => ({
    h,
    origins: 385,
    independent: Math.floor((385 * 7) / h),
    naiveMape: 0.02 * Math.sqrt(h),
    methods: (['fhs', 'fhs_dvol', 'fhs_cal', 'iid', 'garch_normal'] as const).map((method) => ({
      method,
      label: method,
      coverage: { '50': 0.5 + r() * 0.1, '80': 0.76 + r() * 0.08, '90': 0.86 + r() * 0.07 },
      pinball: 0.006 * Math.sqrt(h) + r() * 0.001,
      pit: Array.from({ length: 10 }, () => 30 + Math.floor(r() * 20)),
      upperMiss: 0.08 + r() * 0.05,
      lowerMiss: 0.06 + r() * 0.04,
      mapeMedian: 0.02 * Math.sqrt(h),
      width80Pct: 0.073 * Math.sqrt(h),
    })),
  }));

  const trackRecord: TrackRecordRow[] = Array.from({ length: trackRecordRuns }, (_, i) => {
    const runSpot = spot * Math.exp(gauss(r) * 0.06);
    const daysObserved = Math.min(horizon, 7 * (i + 1));
    const inside = 0.65 + r() * 0.35;
    return {
      asOf: addDays(asOf, -7 * (i + 1)),
      spot: runSpot,
      p10End: runSpot * Math.exp(Z.p10 * sigma * Math.sqrt(horizon)),
      p50End: runSpot,
      p90End: runSpot * Math.exp(Z.p90 * sigma * Math.sqrt(horizon)),
      daysTotal: horizon,
      daysObserved,
      complete: daysObserved === horizon,
      insideP10P90: inside,
      insideP5P95: Math.min(1, inside + 0.08),
      lastClose: runSpot * Math.exp(gauss(r) * 0.08),
      lastBucket: 'p25-p50',
    };
  });

  return {
    runId: asOf,
    runAt: `${asOf}T00:20:00Z`,
    asOf,
    spot,
    horizonDays: horizon,
    nPaths: 10_000,
    method: 'fhs',
    priceSource: 'mock',
    sampleDays: 3_900,
    historyStart: '2015-03-08',
    bands,
    paths,
    history,
    model: {
      engine: 'FHS (GARCH(1,1)-filtered historical simulation)',
      volModel: 'garch',
      alpha: 0.11,
      beta: 0.85,
      persistence: 0.96,
      sigmaNowAnnPct: sigma * Math.sqrt(365) * 100,
      sigmaLongRunAnnPct: 65,
      driftRemovedDaily: 0.0013,
      expectedMovePct: ((end.p75 - end.p25) / 2 / spot) * 100,
      rangeP5P95Pct: ((end.p95 - end.p5) / spot) * 100,
      volSource: 'dvol_vrp',
      sigmaGarchAnnPct: 36,
      dvolPct: 44,
      vrpFactor: 0.79,
      calibrationApplied: false,
      calibrationNote: 'evaluated out of sample and rejected: higher pinball loss than uncalibrated bands',
      probabilities: [-30, -20, -10, 0, 10, 20, 30].map((pct) => {
        const z = Math.log(1 + pct / 100) / (sigma * Math.sqrt(horizon));
        // Normal survival via the Abramowitz–Stegun erf approximation.
        const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
        const erf =
          1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-((z / Math.SQRT2) ** 2));
        const cdf = 0.5 * (1 + Math.sign(z) * erf);
        return { label: `${pct > 0 ? '+' : ''}${pct}%`, price: spot * (1 + pct / 100), probAbove: 1 - cdf };
      }),
    },
    backtest: {
      origins: 329,
      warmupOrigins: 56,
      firstOrigin: '2020-04-02',
      lastOrigin: '2026-07-17',
      stepDays: 7,
      refitEveryDays: 365,
      horizons,
      byYear: ['2020', '2021', '2022', '2023', '2024', '2025'].map((year) => ({
        year,
        coverage: 0.6 + r() * 0.35,
        origins: 52,
      })),
      dvolUsed: true,
      byYearDvol: ['2021', '2022', '2023', '2024', '2025'].map((year) => ({
        year,
        coverage: 0.72 + r() * 0.16,
        origins: 52,
      })),
      byYearCal: ['2020', '2021', '2022', '2023', '2024', '2025'].map((year) => ({
        year,
        coverage: 0.7 + r() * 0.25,
        origins: 52,
      })),
    },
    trackRecord,
  };
}
