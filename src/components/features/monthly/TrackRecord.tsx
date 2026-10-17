import { Panel, PanelHeader, DataTable, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { runInsideTone } from '@/lib/features/monthlyForecast';
import { fmtUsd } from '@/lib/format';
import { toneVar } from '@/lib/theme/tokens';

/**
 * Earlier published runs, scored against the closes that actually printed.
 * Unlike the backtest, nothing here could have been tuned after the fact: each
 * row was stored before its outcome existed.
 */
export function TrackRecord({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const rows = fc.data.trackRecord;

  return (
    <Panel>
      <PanelHeader title="LIVE TRACK RECORD" note="previous weekly runs vs realised price" right={<MockBadge env={fc} />} />
      {rows.length === 0 ? (
        <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim)' }}>
          The first run has no predecessors yet — this fills in from the second week.
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>RUN</th>
              <th style={{ textAlign: 'right' }}>SPOT</th>
              <th style={{ textAlign: 'right' }}>D+30 P10–P90</th>
              <th style={{ textAlign: 'right' }}>DAYS</th>
              <th style={{ textAlign: 'right' }}>IN P10–90</th>
              <th style={{ textAlign: 'right' }}>LAST CLOSE</th>
              <th style={{ textAlign: 'left' }}>LANDED</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asOf}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.asOf} {r.complete ? <Tag label="DONE" tone="mut" /> : null}
                </td>
                <td style={{ textAlign: 'right' }}>{fmtUsd(r.spot)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--mut)' }}>
                  {fmtUsd(r.p10End)} – {fmtUsd(r.p90End)}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--dim)' }}>
                  {r.daysObserved}/{r.daysTotal}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color: r.insideP10P90 === null ? 'var(--dim)' : toneVar(runInsideTone(r.insideP10P90)),
                  }}
                >
                  {r.insideP10P90 === null ? '—' : `${(r.insideP10P90 * 100).toFixed(0)}%`}
                </td>
                <td style={{ textAlign: 'right' }}>{r.lastClose === null ? '—' : fmtUsd(r.lastClose)}</td>
                <td style={{ color: 'var(--mut)', whiteSpace: 'nowrap' }}>{r.lastBucket?.toUpperCase() ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <SourceFootnote env={fc} />
    </Panel>
  );
}
