import { Suspense, type ReactNode } from 'react';
import {
  AppShell,
  CountryScopeTabs,
  Disclaimer,
  Sidebar,
  SubTabs,
  TimeframePills,
  Topbar,
} from '@/components/shell';
import { getFeedHealth, isStale } from '@/lib/features/feedHealth';
import { getBtcSnapshot } from '@/lib/features/snapshot';

/** The topbar ticker must not look stale under a pulsing LIVE dot. */
export const revalidate = 30;

export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const [health, snapshot] = await Promise.all([
    getFeedHealth(),
    getBtcSnapshot({ symbol: 'BTC-USD' }),
  ]);

  return (
    <AppShell sidebar={<Sidebar health={health} />}>
      <Topbar
        ticker={{
          symbol: 'BTC/USD',
          price: snapshot.data.last,
          changePct: snapshot.data.change24hPct,
          stale: snapshot.isMock || isStale(health.lastSyncAt),
        }}
      />
      {/* nuqs reads the query string, so these must sit behind a Suspense
          boundary or the whole route opts out of static prerendering. */}
      <Suspense fallback={null}>
        <CountryScopeTabs />
      </Suspense>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '0 16px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--sunk)',
          flexShrink: 0,
        }}
      >
        <SubTabs />
        <Suspense fallback={null}>
          <TimeframePills />
        </Suspense>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', minHeight: 0, minWidth: 0 }}>
        {children}
        <Disclaimer />
      </main>
    </AppShell>
  );
}
