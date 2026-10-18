import { Panel, PanelHeader, Tag, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MonthlyForecastData } from '@/lib/features/monthlyForecast';
import { MONTHLY_NOTE, pctVsSpot, fmtSignedPct } from '@/lib/features/monthlyForecast';
import { fmtUsd, fmtDayMonth } from '@/lib/format';

/**
 * Monte Carlo line chart: actual price on the left, the next 30 days on the
 * right as confidence ribbons with a handful of real simulated paths on top.
 *
 * The paths are the worker's `representative_paths` — chosen across the range
 * of terminal outcomes, not at random, so the lines show the spread instead of
 * twenty variations on the median. The ribbons carry the statistics; the lines
 * only make "this is what a path through that ribbon looks like" concrete.
 */

const W = 900;
const H = 320;
const PAD_T = 14;
const PAD_B = 26;
const PAD_R = 62;
const HISTORY_SHARE = 0.3;
const TICK_STEPS = [0, 7, 14, 21, 30];

const CLIP_ID = 'mc-plot-area';

const mono = { fontFamily: 'var(--mono)', fontSize: 8, fill: 'var(--dim)' } as const;

export function MonteCarloChart({ fc }: { fc: Envelope<MonthlyForecastData> }) {
  const d = fc.data;
  const steps = d.bands.length - 1;
  const hist = d.history;

  if (steps < 1 || hist.length < 2) {
    return (
      <Panel>
        <PanelHeader title="30-DAY MONTE CARLO" right={<MockBadge env={fc} />} />
        <div style={{ padding: 20, textAlign: 'center', ...mono, color: 'var(--dim)' }}>
          No forecast run stored yet
        </div>
        <SourceFootnote env={fc} />
      </Panel>
    );
  }

  const splitX = (W - PAD_R) * HISTORY_SHARE;
  const histX = (i: number) => (i / (hist.length - 1)) * splitX;
  const coneX = (step: number) => splitX + (step / steps) * (W - PAD_R - splitX);

  // Scale on history and the P5–P95 envelope only. A single extreme path would
  // otherwise set the axis and squash the ribbons; paths are clipped instead.
  const prices = [...hist.map((p) => p.close), ...d.bands.flatMap((b) => [b.p5, b.p95])].filter(
    (p) => Number.isFinite(p) && p > 0,
  );
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const y = (price: number) => H - PAD_B - ((price - lo) / span) * (H - PAD_T - PAD_B);

  const line = (pts: [number, number][]) =>
    pts.map(([x, py], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y(py).toFixed(1)}`).join(' ');

  const ribbon = (upper: 'p95' | 'p90' | 'p75', lower: 'p5' | 'p10' | 'p25') => {
    const up = line(d.bands.map((b) => [coneX(b.step), b[upper]]));
    const down = [...d.bands]
      .reverse()
      .map((b) => `L${coneX(b.step).toFixed(1)},${y(b[lower]).toFixed(1)}`)
      .join(' ');
    return `${up} ${down} Z`;
  };

  const last = d.bands[steps];
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * span);

  return (
    <Panel>
      <PanelHeader
        title="30-DAY MONTE CARLO"
        note={`${d.nPaths.toLocaleString('en-US')} paths · FHS${d.model.volSource === 'dvol_vrp' ? ' · DVOL vol' : ''} · as of ${fmtDayMonth(d.asOf)}`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag label="P25–P75" tone="blue" />
            <Tag label="P10–P90" tone="blue" />
            <Tag label="P5–P95" tone="mut" />
            <MockBadge env={fc} />
          </div>
        }
      />

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Simulated BTC price range for the next ${steps} days`}
          style={{ width: '100%', height: 320, display: 'block', background: 'var(--sunk)' }}
        >
          {axisTicks.map((p, i) => (
            <g key={i}>
              <line x1={0} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={W - PAD_R + 6} y={y(p) + 3} {...mono}>
                {fmtUsd(p)}
              </text>
            </g>
          ))}

          {TICK_STEPS.filter((s) => s <= steps).map((s) => (
            <g key={s}>
              <line x1={coneX(s)} x2={coneX(s)} y1={PAD_T} y2={H - PAD_B} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              <text x={coneX(s) + 3} y={H - 8} {...mono}>
                {s === 0 ? 'NOW' : `D+${s} ${fmtDayMonth(d.bands[s].date)}`}
              </text>
            </g>
          ))}

          <path d={ribbon('p95', 'p5')} fill="var(--blue)" fillOpacity={0.08} stroke="none" />
          <path d={ribbon('p90', 'p10')} fill="var(--blue)" fillOpacity={0.12} stroke="none" />
          <path d={ribbon('p75', 'p25')} fill="var(--blue)" fillOpacity={0.18} stroke="none" />

          <defs>
            <clipPath id={CLIP_ID}>
              <rect x={0} y={PAD_T} width={W - PAD_R} height={H - PAD_T - PAD_B} />
            </clipPath>
          </defs>
          {d.paths.map((p, i) => (
            <path
              key={i}
              d={line(p.map((price, s) => [coneX(s), price]))}
              fill="none"
              stroke="var(--mut)"
              strokeOpacity={0.45}
              clipPath={`url(#${CLIP_ID})`}
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={line(d.bands.map((b) => [coneX(b.step), b.p50]))} fill="none" stroke="var(--blue)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={line(d.bands.map((b) => [coneX(b.step), b.p10]))} fill="none" stroke="var(--down)" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={line(d.bands.map((b) => [coneX(b.step), b.p90]))} fill="none" stroke="var(--up)" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />

          <path d={line(hist.map((p, i) => [histX(i), p.close]))} fill="none" stroke="var(--txt)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />

          <line x1={splitX} x2={splitX} y1={PAD_T} y2={H - PAD_B} stroke="var(--line2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={4} y={H - 8} {...mono} letterSpacing="0.12em">
            {hist.length}D ACTUAL
          </text>
        </svg>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
          {(
            [
              ['P5 · D+' + steps, last.p5, 'var(--down)'],
              ['P10', last.p10, 'var(--down)'],
              ['P50', last.p50, 'var(--blue)'],
              ['P90', last.p90, 'var(--up)'],
              ['P95', last.p95, 'var(--up)'],
            ] as const
          ).map(([label, price, color]) => (
            <div key={label}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '.14em', color: 'var(--mut)' }}>{label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color }}>{fmtUsd(price)}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--dim)' }}>{fmtSignedPct(pctVsSpot(price, d.spot))}</div>
            </div>
          ))}
        </div>

        <p style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 8.5, lineHeight: 1.55, color: 'var(--dim)' }}>{MONTHLY_NOTE}</p>
      </div>

      <SourceFootnote env={fc} />
    </Panel>
  );
}
