import { Panel, PanelHeader, KeyValueRow, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { WORKER_NOTE, fmtProb, nextScheduledRun } from '@/lib/features/monthlyForecast';
import { fmtUsd, fmtAgo } from '@/lib/format';

/** Run metadata, volatility state, and the probability of ending past round moves. */
export function MonthlyModelPanel({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const m = d.model;
  const garch = m.volModel === 'garch';

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="RUN & MODEL STATE"
        note={`run ${d.runId}`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag label={garch ? 'GARCH FIT' : 'EWMA FALLBACK'} tone={garch ? 'up' : 'amber'} />
            <MockBadge env={fc} />
          </div>
        }
      />

      <KeyValueRow label="COMPUTED" value={fmtAgo(d.runAt)} sub={`next scheduled ${nextScheduledRun(d.runAt)}`} />
      <KeyValueRow label="AS OF CLOSE" value={d.asOf} tone="mut" sub={`spot ${fmtUsd(d.spot)} · ${d.priceSource}`} />
      <KeyValueRow
        label="VOL NOW"
        value={`${m.sigmaNowAnnPct.toFixed(1)}%`}
        tone={m.sigmaNowAnnPct > m.sigmaLongRunAnnPct ? 'amber' : 'txt'}
        sub={`annualised · long run ${m.sigmaLongRunAnnPct.toFixed(1)}%`}
      />
      <KeyValueRow
        label="GARCH"
        value={`α ${m.alpha.toFixed(3)} · β ${m.beta.toFixed(3)}`}
        tone="mut"
        sub={`persistence ${m.persistence.toFixed(3)}`}
      />
      <KeyValueRow label="EXPECTED MOVE" value={`±${m.expectedMovePct.toFixed(1)}%`} sub="half the P25–P75 span at D+30" />
      <KeyValueRow label="P5–P95 SPAN" value={`${m.rangeP5P95Pct.toFixed(1)}%`} tone="mut" sub="of spot, at D+30" />
      <KeyValueRow
        label="DRIFT"
        value="REMOVED"
        tone="blue"
        sub={`${(m.driftRemovedDaily * 100).toFixed(3)}%/day stripped · ${d.sampleDays.toLocaleString('en-US')} days since ${d.historyStart}`}
      />

      <div style={{ padding: '10px 12px 4px', fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.14em', color: 'var(--mut)' }}>
        P(CLOSE ≥ LEVEL ON D+{d.horizonDays})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 1, background: 'var(--line)' }}>
        {m.probabilities.map((p) => (
          <div key={p.label} style={{ background: 'var(--panel)', padding: '6px 8px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--dim)' }}>
              {p.label} · {fmtUsd(p.price)}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>
              {fmtProb(p.probAbove)}
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, padding: '10px 12px 0', fontFamily: 'var(--mono)', fontSize: 8.5, lineHeight: 1.55, color: 'var(--dim)' }}>
        {WORKER_NOTE}
      </p>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
