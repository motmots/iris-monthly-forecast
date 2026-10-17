'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  NAV_GROUPS,
  SECTIONS,
  sectionHref,
  sectionsInGroup,
  type Section,
} from '@/lib/nav';
import { useDrawer } from './AppShell';
import { StatusFooter, type FeedHealth } from './StatusFooter';

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}

function NavItem({
  section,
  active,
  onNavigate,
}: {
  section: Section;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={sectionHref(section)}
      className="nav-btn"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 13px',
        borderLeft: `2px solid ${active ? 'var(--down)' : 'transparent'}`,
        background: active ? '#13171d' : 'transparent',
        color: active ? 'var(--txt)' : '#9aa7b4',
        fontFamily: 'var(--font-body)',
        fontSize: 11.5,
        fontWeight: active ? 600 : 400,
        letterSpacing: '.06em',
      }}
    >
      <NavIcon d={section.icon} />
      <span>{section.label}</span>
    </Link>
  );
}

export function Sidebar({ health }: { health: FeedHealth }) {
  const pathname = usePathname();
  const activeKey = pathname.split('/').filter(Boolean)[0];
  const { open, setOpen } = useDrawer();

  return (
    <aside
      data-open={open ? 'true' : 'false'}
      style={{
        background: 'var(--sunk)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
      }}
      className="iris-rail"
    >
      {/* Logo: a 3x16 --down block, the wordmark, and the sub-line. */}
      <div style={{ padding: '12px 13px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 3, height: 16, background: 'var(--down)', flexShrink: 0 }} />
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '.12em',
              color: 'var(--txt)',
            }}
          >
            IRIS BTC
          </span>
        </div>
        <div
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            letterSpacing: '.18em',
            color: 'var(--dim)',
            marginTop: 5,
            paddingLeft: 11,
          }}
        >
          INTELLIGENCE TERMINAL
        </div>
      </div>

      <nav
        aria-label="Sections"
        style={{ flex: 1, overflowY: 'auto', padding: '10px 0', minHeight: 0 }}
      >
        {NAV_GROUPS.map((group) => {
          const items = sectionsInGroup(group);
          if (items.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: 10 }}>
              <div
                className="iris-micro"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 8.5,
                  letterSpacing: '.18em',
                  color: 'var(--dim)',
                  padding: '7px 13px 5px',
                }}
              >
                {group.toUpperCase()}
              </div>
              {items.map((s) => (
                <NavItem
                  key={s.key}
                  section={s}
                  active={s.key === activeKey}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          );
        })}
      </nav>

      <StatusFooter health={health} />
    </aside>
  );
}

export { SECTIONS };
