# Design Philosophy — Terminal / amber-on-dark

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Scope:** The dashboard's visual design system — tokens and principles.
Layout/IA is explicitly out of scope (see §7).

## 1. Context & goal

The dashboard currently ships a "coastal glass" look (teal/green `--lagoon`/`--palm`
palette, translucent white surfaces, Fraunces + Manrope, light-first). We are
replacing that with a deliberate design philosophy aimed at the product's real
audience: **DIY / Raspberry Pi hobbyists** — people comfortable in a shell.

The goal of this spec is to lock the **design philosophy and design tokens** so
that a future `src/components/ui/` primitive layer (shadcn) can be built on a
stable, intentional foundation instead of ad-hoc per-screen Tailwind. This spec
does **not** design any screen or layout.

## 2. Direction (decisions & rationale)

Each was chosen deliberately during brainstorming (visual mockups compared side
by side):

| Decision | Choice | Rationale |
|---|---|---|
| Mood | **Terminal / hacker** | Speaks the audience's native language; feels like a tool, not a marketing site. |
| Canvas | **Dark (classic)** | Matches the shell the Pi crowd lives in; easy on the eyes. |
| Accent | **Amber** (`#ffb454`) | Warm, retro monochrome-monitor heritage; distinctive; ownable. |
| Typography | **All monospace** | The dashboard shows short status lines, not long docs — mono stays readable and maximally on-theme. |
| Edges / surfaces | **Sharp / full-terminal** | Hard rectangles, hairline boxes, flat surfaces, bracketed buttons — reads like `htop`/`lazygit`. (Softened variant was considered and rejected.) |
| Status vs brand | **Separate** | Device health uses its own green/orange/red/gray palette; amber is reserved for brand/interactive so "healthy" and "clickable" are never confused. |

## 3. Guiding principles

1. **It's a tool, not a website.** Chrome recedes, data leads. No decoration
   that doesn't carry information.
2. **Terminal literacy is the aesthetic.** Monospace everywhere, lowercase
   system labels (`boxes`, `apps`), command-echo touches (`pi@piper:~$`,
   `$ piper connect`, `# heading`, `↳ link`), TUI status glyphs.
3. **One warm signal in the dark.** Amber is the *only* brand/interactive color
   — buttons, links, focus rings, active nav. Everything else is grayscale.
   Color means "actionable."
4. **Sharp, flat, honest.** Hard edges, hairline borders, no shadow, no raised
   fills. Panels are outlines on the raw background; the active nav tab is a
   solid amber block; buttons are bracketed (`[ enroll a box ]`).
5. **Status is sacred — and separate.** Device state uses a dedicated
   green/orange/red/gray palette and never the amber brand color.
6. **Calm density.** Compact enough to scan a shelf of Pis at a glance, with
   enough breathing room that it never becomes a wall of text.

## 4. Token spec

Canonical values. These become CSS custom properties in `src/styles.css`.

### Neutrals (dark canvas)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0b0d` | app background (warm near-black) |
| `--surface` | `#0e0e11` | panel background (near-flat vs bg) |
| `--surface-2` | `#1a1a1e` | inputs, hover fills |
| `--border` | `#2f2f36` | primary hairline borders |
| `--grid` | `#1e1e24` | interior row dividers |
| `--fg` | `#f2f2f4` | primary text |
| `--fg-muted` | `#9a9aa0` | secondary text |
| `--fg-subtle` | `#6a6a70` | meta / labels / glyph marks |

### Amber accent — brand + interactive ONLY
| Token | Value | Use |
|---|---|---|
| `--accent` | `#ffb454` | buttons, links, focus, active nav, kickers |
| `--accent-hover` | `#ffc373` | hover state |
| `--accent-fg` | `#0a0a0c` | text on solid amber |

### Status — device health, never amber
| Token | Value | Glyph | Meaning |
|---|---|---|---|
| `--ok` | `#4ade80` (green) | `●` | online / healthy |
| `--warn` | `#fb923c` (orange) | `▲` | degraded / attention |
| `--danger` | `#f87171` (red) | `●` | error / critical |
| `--idle` | `#6a6a70` (gray) | `○` | offline / stopped / unknown |

### Shape
- `--radius: 2px` (near-square; sharp direction). Buttons/inputs share it.
- Shadow: **none** by default. Depth comes from hairline borders, not elevation.

### Typography
- Family: **JetBrains Mono** (free, OFL), ligatures **off**; fallback
  `ui-monospace, "SF Mono", Menlo, monospace`. Used for **all** text.
- Base size: `13px` (mono runs wide). Small/meta: `11px`.
- Headings via size + weight, not a second family. Kickers uppercase with
  `letter-spacing: 0.1em`, in `--accent`.

### Spacing
- 4px base grid. Row padding ~`8px 12px`. Panel padding `18px`.

## 5. Terminal idiom (usage conventions)

Conventions primitives should encode so the look is consistent:
- **Buttons:** bracketed label; solid amber for primary (`[ enroll a box ]`),
  amber outline for secondary (`[ deploy app ]`).
- **Links:** amber, prefixed `↳`.
- **Section headings:** prefixed `#`; kickers uppercase amber.
- **Hints/commands:** prefixed `$`, command words in amber `code`.
- **Status:** glyph + label in the status color (see §4 table).
- **Nav:** horizontal tabs divided by vertical hairlines; active tab = solid
  amber block with `--accent-fg` text.

## 6. Implementation mapping (not the plan — orientation only)

Current `src/styles.css` uses Tailwind v4 with shadcn oklch tokens
(`--background`, `--primary`, …), a `@theme inline` block, a `.dark` custom
variant, and the coastal brand tokens + Fraunces/Manrope webfonts. Landing this
philosophy means:

- **Replace** the coastal brand tokens (`--sea-ink`, `--lagoon`, `--palm`,
  `--foam`, glass `--surface`, etc.) with the §4 tokens.
- **Remap** the shadcn semantic tokens to the terminal palette: `--background`
  → `--bg`, `--foreground` → `--fg`, `--primary` → `--accent` /
  `--primary-foreground` → `--accent-fg`, `--muted`/`--border`/`--input`/`--ring`
  accordingly; set `--radius` to `2px`.
- **Dark-first:** the app defaults to the dark palette (today `:root` is light
  and `.dark` overrides — this inverts).
- **Fonts:** drop Fraunces + Manrope; add JetBrains Mono; set the base font to
  mono globally.
- **Future `ui/` primitives:** `bunx shadcn add` copies primitives that read
  these tokens; the §5 idiom is applied when each primitive is added/migrated.

Existing feature components in `src/components/` migrate onto the new tokens/
primitives incrementally (not a big-bang rewrite).

## 7. Out of scope / open follow-ups

Deliberately **not** decided here — these are per-screen layout/IA questions for
later specs:
- Wide-screen strategy (the 640px centered mockup was demo-only; real screens
  may use a sidebar, multi-column grids, or a wider max-width).
- Placement of the org indicator (top bar vs elsewhere).
- The landing route (apps vs boxes) and overall navigation structure.
- Light theme (dark-first now; a light "paper terminal" variant could follow).

## 8. Success criteria

- `src/styles.css` exposes the §4 tokens; the coastal palette and
  Fraunces/Manrope are gone; the app renders dark-first in JetBrains Mono.
- At least a first set of `ui/` primitives (e.g. button, badge/status,
  panel/card) exist under `src/components/ui/`, built on these tokens and the
  §5 idiom, with tests.
- At least one existing feature screen is migrated onto them as proof.
- No screen hardcodes a brand color where a token exists; amber never denotes
  device status.
