import { getMonthlyForecast } from '@/lib/features/monthlyForecast';
import { PanelGrid } from '@/components/primitives';
import { MonteCarloChart } from '@/components/features/monthly/MonteCarloChart';
import { DailyLadder } from '@/components/features/monthly/DailyLadder';
import { MonthlyModelPanel } from '@/components/features/monthly/MonthlyModelPanel';
import { BacktestPanel } from '@/components/features/monthly/BacktestPanel';
import { TrackRecord } from '@/components/features/monthly/TrackRecord';

/**
 * The worker writes once a week; nothing here is computed on request, so an
 * hourly revalidate is only about picking up a fresh run promptly.
 */
export const revalidate = 3600;

export default async function MonthlyForecastPage() {
  const fc = await getMonthlyForecast({ trackRecordRuns: 8 });

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <PanelGrid className="ov-split" columns="minmax(0, 2.4fr) minmax(0, 1fr)">
        <MonteCarloChart fc={fc} />
        <MonthlyModelPanel fc={fc} />
      </PanelGrid>

      <DailyLadder fc={fc} />

      <BacktestPanel fc={fc} />
      <TrackRecord fc={fc} />
    </div>
  );
}
