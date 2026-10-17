'use client';

import { Suspense, useState } from 'react';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import type { NewsArticle } from '@/lib/features/news';
import { WorldMap, type DetailPayload } from './WorldMap';
import { GlobeMap } from './GlobeMap';
import { EventNewsRail } from './EventNewsRail';
import { EventDetail } from './EventDetail';
import { EventLayerToggle } from './EventLayerToggle';

export interface GlobalSentimentPanelProps {
  events: Envelope<GeoEvent[]>;
  news: Envelope<NewsArticle[]>;
  activeCats: Set<EventCategory> | null;
}

export function GlobalSentimentPanel({ events, news, activeCats }: GlobalSentimentPanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [view, setView] = useState<'globe' | 'flat'>('globe');

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 460 }}>
      <PanelHeader
        title="GLOBAL EVENT MAP"
        note="CRYPTO · MACRO · GEOPOLITICAL"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {([
                ['globe', '3D'],
                ['flat', '2D'],
              ] as const).map(([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    letterSpacing: '.1em',
                    padding: '3px 8px',
                    border: '1px solid var(--line2)',
                    background: view === v ? '#1b2430' : 'transparent',
                    color: view === v ? 'var(--txt)' : 'var(--mut)',
                    cursor: 'pointer',
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <MockBadge env={events} />
          </div>
        }
      />

      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--sunk)',
        }}
      >
        <Suspense fallback={null}>
          <EventLayerToggle />
        </Suspense>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: 'var(--line)' }}>
        <div
          style={{
            flex: '2 1 560px',
            minWidth: 0,
            position: 'relative',
            background: 'var(--panel)',
          }}
        >
          {view === 'globe' ? (
            <GlobeMap
              events={events.data}
              activeCats={activeCats}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              onOpenDetail={setDetail}
            />
          ) : (
            <WorldMap
              events={events.data}
              activeCats={activeCats}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              onOpenDetail={setDetail}
            />
          )}
          {detail ? (
            <EventDetail
              detail={detail}
              onClose={() => {
                setDetail(null);
                setSelectedKey(null);
              }}
              onPick={(e) => {
                setDetail({ kind: 'event', event: e });
                setSelectedKey(e.id);
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            flex: '1 1 300px',
            minWidth: 0,
            maxHeight: 560,
            background: 'var(--panel)',
          }}
        >
          <EventNewsRail
            events={events.data}
            news={news.data}
            activeCats={activeCats}
            selectedKey={selectedKey}
            onSelectKey={setSelectedKey}
            onOpenDetail={setDetail}
          />
        </div>
      </div>

      <SourceFootnote env={events} />
    </Panel>
  );
}
