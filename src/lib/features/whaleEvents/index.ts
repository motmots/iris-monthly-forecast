import { defineFeature } from '@/lib/defineFeature';
import { fetchWhaleEvents } from './live';
import { mockWhaleEvents } from './mock';
import type { WhaleEvent, WhaleEventsArgs } from './types';

export const getWhaleEvents = defineFeature<WhaleEventsArgs, WhaleEvent[]>({
  key: 'whale_events',
  source: 'whale_alert',
  live: fetchWhaleEvents,
  mock: mockWhaleEvents,
});

export type { WhaleEvent, WhaleEventsArgs } from './types';
export {
  toWhaleEventRow,
  summarizeWhaleFlow,
  netflowColor,
  netflowWord,
  fmtAmount,
  type WhaleFlowSummary,
} from './present';
