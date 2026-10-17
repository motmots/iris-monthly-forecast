/**
 * Single source of truth for the IRIS terminal palette.
 *
 * These hex values are duplicated as CSS custom properties in `src/app/globals.css`.
 * `tokens.test.ts` parses that file and asserts byte-equality, because
 * `lightweight-charts` renders to canvas and cannot read CSS custom properties —
 * it has to be configured from these constants instead.
 *
 * Ported verbatim from `IRIS BTC Terminal v4.local.html` :root.
 */
export const TOKENS = {
  bg: '#08090c',
  panel: '#0e1014',
  sunk: '#0b0d11',
  line: '#191d24',
  line2: '#242a33',
  txt: '#dfe5ec',
  mut: '#6f7c8a',
  dim: '#4b5663',
  up: '#26d07c',
  down: '#ef4444',
  blue: '#3b82f6',
  amber: '#f5a524',
  purple: '#a78bfa',
} as const;

/** Hover background for nav / indicator buttons (not a :root var in the original). */
export const HOVER_BG = '#12161c';
/** Active nav item background. */
export const ACTIVE_NAV_BG = '#13171d';
/** Active timeframe pill / news filter background. */
export const ACTIVE_PILL_BG = '#1b2430';

export type TokenName = keyof typeof TOKENS;

/** Semantic tone used by KeyValueRow, Tag, StatTile — maps to a CSS var. */
export type Tone = 'txt' | 'mut' | 'dim' | 'up' | 'down' | 'blue' | 'amber' | 'purple';

export const toneVar = (t: Tone) => `var(--${t})`;

/** Sign-driven tone. Zero counts as neutral text, not green. */
export const signTone = (n: number): Tone => (n > 0 ? 'up' : n < 0 ? 'down' : 'txt');
