import { Panel, PanelHeader, DataTable, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import {
  BACKTEST_NOTE,
  CALIBRATION_NOTE,
  WHY_NOT_ML_NOTE,
  bestByPinball,
  coverageTone,
  methodShort,
} from '@/lib/features/monthlyForecast';
import { toneVar } from '@/lib/theme/tokens';

const note = { margin: 0, fontFamily: 'var(--mono)', fontSize: 8.5, lineHeight: 1.55, color: 'var(--dim)' } as const;

/**
 * Did the bands hold, historically? Coverage per band against its nominal level,
 * and pinball loss — the score that cannot be gamed by simply widening bands.
 * The shipped engine (FHS) is compared with two baselines on the same origins.
 */
export function BacktestPanel({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const bt = fc.data.backtest;
  const shipped = fc.data.model.calibrationApplied ? 'fhs_cal' : 'fhs';

  return (
    <Panel>
      <PanelHeader
        title="OUT-OF-SAMPLE BACKTEST"
        note={bt ? `${bt.origins} weekly origins · ${bt.firstOrigin} → ${bt.lastOrigin} · ${bt.warmupOrigins} warm-up excluded` : 'not run'}
        right={<MockBadge env={fc} />}
      />

      {bt ? (
        <>
          <DataTable>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>HORIZON</th>
                <th style={{ textAlign: 'left' }}>ENGINE</th>
                <th style={{ textAlign: 'right' }}>P25–75 (50%)</th>
                <th style={{ textAlign: 'right' }}>P10–90 (80%)</th>
                <th style={{ textAlign: 'right' }}>P5–95 (90%)</th>
                <th style={{ textAlign: 'right' }}>PINBALL</th>
                <th style={{ textAlign: 'right' }}>INDEP.</th>
              </tr>
            </thead>
            <tbody>
              {bt.horizons.map((h) => {
                const best = bestByPinball(h.methods);
                return h.methods.map((m, i) => (
                  <tr key={`${h.h}-${m.method}`}>
                    <td style={{ whiteSpace: 'nowrap', color: i === 0 ? 'var(--txt)' : 'transparent' }}>{h.h}D</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {methodShort[m.method]}
                      {m.method === shipped ? <span style={{ color: 'var(--dim)' }}> · shipped</span> : null}
                      {m.method === 'fhs_cal' && shipped !== 'fhs_cal' ? (
                        <span style={{ color: 'var(--dim)' }}> · not shipped</span>
                      ) : null}
                    </td>
                    {(['50', '80', '90'] as const).map((k) => (
                      <td key={k} style={{ textAlign: 'right', color: toneVar(coverageTone(m.coverage[k], Number(k))) }}>
                        {(m.coverage[k] * 100).toFixed(1)}%
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: m === best ? 700 : 400 }}>
                      {m.pinball.toFixed(4)}
                      {m === best ? <span style={{ marginLeft: 6 }}><Tag label="BEST" tone="up" /></span> : null}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--dim)' }}>{i === 0 ? `~${h.independent}` : ''}</td>
                  </tr>
                ));
              })}
            </tbody>
          </DataTable>

          {[
            { label: 'FHS', rows: bt.byYear },
            { label: 'FHS + CAL', rows: bt.byYearCal },
          ].map(({ label, rows }) =>
            rows.length ? (
              <div key={label} style={{ padding: '10px 12px 0' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: '.14em', color: 'var(--mut)', marginBottom: 6 }}>
                  {label} · P10–P90 COVERAGE AT 30D, BY YEAR (TARGET 80%)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, gap: 1, background: 'var(--line)' }}>
                  {rows.map((y) => (
                    <div key={y.year} style={{ background: 'var(--panel)', padding: '6px 4px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--dim)' }}>{y.year}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: toneVar(coverageTone(y.coverage, 80)) }}>
                        {(y.coverage * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </>
      ) : (
        <div style={{ padding: 16, ...note }}>The latest run skipped the backtest (--no-backtest).</div>
      )}

      <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={note}>{BACKTEST_NOTE}</p>
        <p style={note}>{CALIBRATION_NOTE}</p>
        <p style={note}>{WHY_NOT_ML_NOTE}</p>
      </div>
      <SourceFootnote env={fc} />
    </Panel>
  );
}
