import { defineFeature } from '@/lib/defineFeature';
import { fetchMonthlyForecast } from './live';
import { mockMonthlyForecast } from './mock';
import type { MonthlyForecastArgs, MonthlyForecastData } from './types';

export const getMonthlyForecast = defineFeature<MonthlyForecastArgs, MonthlyForecastData>({
  key: 'monthly_forecast',
  source: 'internal_monthly',
  live: fetchMonthlyForecast,
  mock: mockMonthlyForecast,
});

export type {
  MonthlyForecastData,
  MonthlyForecastArgs,
  DailyBand,
  ClosePoint,
  ProbabilityRow,
  MonthlyModelState,
  MonthlyBacktest,
  BacktestHorizon,
  BacktestMethod,
  TrackRecordRow,
} from './types';

export {
  MONTHLY_NOTE,
  WORKER_NOTE,
  BACKTEST_NOTE,
  CALIBRATION_NOTE,
  DVOL_NOTE,
  ERROR_NOTE,
  WHY_NOT_ML_NOTE,
  LADDER_STEPS,
  ladderRows,
  pctVsSpot,
  fmtSignedPct,
  fmtProb,
  fmtPctOrDash,
  coverageTone,
  runInsideTone,
  bestByPinball,
  methodShort,
  shippedMethod,
  nextScheduledRun,
} from './present';
