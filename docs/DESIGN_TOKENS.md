# Design tokens — the visual contract

Ported verbatim from `IRIS BTC Terminal v4.local.html`. Declared twice on
purpose: as CSS custom properties in `src/app/globals.css`, and as constants in
`src/lib/theme/tokens.ts` because the canvas price chart cannot read CSS
variables. `src/lib/theme/tokens.test.ts` asserts the two agree.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#08090c` | app background |
| `--panel` | `#0e1014` | card / panel surface |
| `--sunk` | `#0b0d11` | rail, topbar, footer |
| `--line` | `#191d24` | hairline border *and* grid gutter fill |
| `--line2` | `#242a33` | stronger border (buttons, bar outlines) |
| `--txt` | `#dfe5ec` | primary text |
| `--mut` | `#6f7c8a` | muted labels |
| `--dim` | `#4b5663` | tertiary text |
| `--up` | `#26d07c` | bullish / success |
| `--down` | `#ef4444` | bearish / danger, and the brand accent |
| `--blue` | `#3b82f6` | info, RSI, P50, country tabs |
| `--amber` | `#f5a524` | warning, greed, MOCK badge |
| `--purple` | `#a78bfa` | fourth series |

Non-token hexes: `#12161c` (hover), `#13171d` (active nav), `#1b2430` (active
pill), `#9aa7b4` (inactive nav label).

## Rules that must survive any change

- **Panels are made by a grid with `gap: 1px; background: var(--line)`.** The
  gutter *is* the border. No double borders, and every divider aligns for free.
- **`border-radius: 0` everywhere.** One exception: the 5px LIVE dot.
- **No box-shadow, no blur, no glow.** Depth comes from the three-step surface
  ramp `#08090c → #0b0d11 → #0e1014` plus 1px hairlines. Nothing else.
- **Micro typography.** Mono (JetBrains Mono) at 8.5–11px for every label,
  number, ticker and tag. Archivo only for prose and large display figures.
  Letter-spacing ladder: `.06em` → `.18em`.
- **One animation:** `irisPulse` on the LIVE dot.

## Deliberate departures from the original

The original had no accessibility affordances at all, which is not something to
port faithfully:

- 150ms hover transitions and visible focus rings on every interactive element.
- ARIA roles on the tab strips, `aria-current` on the active nav item, real
  `aria-label`s on icon-only buttons.
- `prefers-reduced-motion` honoured.
- Below 1024px the 198px rail becomes an overlay drawer, the micro-type floor is
  raised to 11px (`.iris-micro`), and wide tables scroll inside their own panel
  instead of widening the shell.
