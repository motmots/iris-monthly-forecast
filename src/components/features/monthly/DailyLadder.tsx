import { Panel, PanelHeader, DataTable, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { ladderRows, pctVsSpot, fmtSignedPct } from '@/lib/features/monthlyForecast';
import { fmtUsd, fmtDayMonth } from '@/lib/format';

/** The bands read off at D+1 / 7 / 14 / 21 / 30, in price and in % of spot. */
export function DailyLadder({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const rows = ladderRows(d);
  const cols = ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'] as const;

  return (
    <Panel>
      <PanelHeader title="DAILY BAND LADDER" note={`spot ${fmtUsd(d.spot)}`} right={<MockBadge env={fc} />} />
      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>DAY</th>
            {cols.map((c) => (
              <th key={c} style={{ textAlign: 'right' }}>
                {c.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.step}>
              <td style={{ whiteSpace: 'nowrap' }}>
                D+{b.step} <span style={{ color: 'var(--dim)' }}>{fmtDayMonth(b.date)}</span>
              </td>
              {cols.map((c) => (
                <td
                  key={c}
                  style={{
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    fontWeight: c === 'p50' ? 700 : 400,
                    color: c === 'p50' ? 'var(--blue)' : 'var(--txt)',
                  }}
                >
                  {fmtUsd(b[c])}
                  <span style={{ display: 'block', fontSize: 8, color: 'var(--dim)' }}>
                    {fmtSignedPct(pctVsSpot(b[c], d.spot))}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </DataTable>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
