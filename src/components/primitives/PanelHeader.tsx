import type { ReactNode } from 'react';

/** 9px mono, .16em tracking, 1px bottom hairline. The panel title idiom. */
export function PanelHeader({
  title,
  right,
  note,
}: {
  title: string;
  /** Badges or controls pinned to the right edge (MockBadge, filters). */
  right?: ReactNode;
  /** Secondary label rendered next to the title in --dim. */
  note?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '8px 12px',
        borderBottom: '1px solid var(--line)',
        minHeight: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            letterSpacing: '.16em',
            color: 'var(--txt)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </span>
        {note ? (
          <span
            className="iris-micro"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              letterSpacing: '.12em',
              color: 'var(--dim)',
              whiteSpace: 'nowrap',
            }}
          >
            {note}
          </span>
        ) : null}
      </div>
      {right ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{right}</div> : null}
    </div>
  );
}
