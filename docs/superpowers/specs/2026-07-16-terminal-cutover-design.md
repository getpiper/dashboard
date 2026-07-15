# Design — Terminal cutover (app-wide)

**Date:** 2026-07-16
**Status:** Approved (design), pending implementation plan
**Scope:** Replace the coastal look app-wide with the approved terminal design
system; build the terminal app shell/nav; add `/apps` and `/domains` top-level
routes; migrate every existing screen. Dark-only.

Builds directly on the approved token spec:
[`2026-07-15-design-philosophy-design.md`](./2026-07-15-design-philosophy-design.md)
and its landed foundation (PR #39: `.terminal` scope + `Button`/`StatusDot`/
`Panel` + `/ui`). This design resolves the layout/IA questions that spec §7
deliberately deferred.

## 1. Context & goal

Today the dashboard ships **coastal** by default (`:root` light + `.dark`,
lagoon/palm/sea-ink tokens, Fraunces/Manrope, gradient body, glass surfaces).
Terminal exists only as an opt-in `.terminal` scope plus three primitives on
`/ui`. The goal is the **cutover**: make terminal the app's only look, remove
coastal entirely, and migrate every screen — so the whole product speaks the
approved amber-on-dark terminal language.

This is a cohesive single effort (all screens share the token cutover), sized
for one plan decomposed into many tasks.

## 2. Decisions (locked in brainstorming)

| Decision | Choice |
|---|---|
| App frame | **Terminal top bar + centered content** (~1080px max-width). |
| Navigation | Tabs: `boxes` (`/`) · `apps` (`/apps`, new) · `domains` (`/domains`, new) · `settings` (org settings). Hairline-divided; active tab = solid amber block. |
| Brand / org | `pi@piper` brand left (amber `piper`); org indicator + session controls right. |
| Theme | **Dark-only.** Remove the light palette, `ThemeToggle`, and theme-init/`data-theme` wiring. |
| Migration scope | **Full cutover, one plan.** Coastal removed, terminal at `:root`, all coastal-referencing screens migrated. |
| Domains view | **Per-box custom domains** (see §5). |

Deferred (not this spec): light "paper terminal" variant; new relay endpoints;
any IA change beyond the above.

## 3. Token cutover (`src/styles.css`)

Promote the current `.terminal` block to be the app's `:root`, dark-only:

- Base font → JetBrains Mono; `--radius: 2px`; amber `--primary: #ffb454`
  (`--primary-foreground: #0a0a0c`); neutrals `--background:#0b0b0d`,
  `--card:#0e0e11`, `--border:#2f2f36`, `--muted-foreground:#9a9aa0`, etc.;
  `--ring: #ffb454`. Status palette (`--status-ok/warn/danger/idle`) unchanged.
- Body background/color come from these tokens (flat near-black, no gradient).

**Remove:**

- Coastal tokens: `--sea-ink*`, `--lagoon*`, `--palm`, `--sand`, `--foam`,
  `--surface*`, `--line`, `--inset-glint`, `--kicker`, `--bg-base`,
  `--header-bg`, `--chip-*`, `--link-bg-hover`, `--hero-*`.
- The `.dark` block and `@custom-variant dark`.
- Fraunces + Manrope `@import`; keep the JetBrains Mono `@import`.
- The gradient `body`, `body::before`, `body::after`.
- Coastal component classes: `.island-shell`, `.feature-card`,
  `.page-wrap`, `.display-title`, `.island-kicker`, `.nav-link`,
  `.site-footer`, `.rise-in` (+ `@keyframes rise-in`), and the coastal
  `a`/`code`/`.prose pre` overrides that reference removed tokens.
- The `--font-sans` Manrope mapping in `@theme inline` (base font is mono).

**Note:** `styles.css` is excluded from Biome (biome.json) — indentation style
is not enforced; match the file's existing style.

## 4. App shell (`src/components/ui/` + `__root.tsx` + `Header.tsx`)

Replace today's minimal `Header` with a terminal top bar:

- **`AppShell`** — wraps `<TopBar/>` + a centered content container
  (`mx-auto w-[min(1080px,100%-2rem)]`), applied in `__root.tsx` around the
  `<Outlet/>`. `<html>`/`<body>` render terminal directly (no `.terminal`
  wrapper needed once it's `:root`).
- **`TopBar`** — `pi@piper` brand (link to `/`), `<Nav/>`, then org indicator
  (`OrgSwitcher`, restyled) + `SessionControls`. Hairline borders, no shadow.
- **`Nav`** — horizontal tabs divided by vertical hairlines; active tab (by
  route match) is a solid amber block with `--primary-foreground` text.
  Destinations: boxes/apps/domains/settings. `settings` links to
  `/orgs/$slug/settings` for the active org scope; hidden in personal scope.

`__root.tsx`: remove `THEME_INIT_SCRIPT` and its `<script>`; drop the coastal
`selection:` body class (replace with a terminal selection color); keep
`suppressHydrationWarning`.

## 5. New routes

### `/apps` — aggregate apps list
- **Loader:** reuse `getApps()` (returns `BoxWithApps[]`); flatten to
  `{ box, app }[]`. Zero extra relay calls.
- **View:** `PageHeader` (`# apps`) + a `Panel` of `Row`s. Per row: status
  glyph (`StatusDot` from `app.status`) · app name · box (`base`) · repo@branch
  · served URL. Served URL = `app.hostname` rendered as an amber `Link`, or
  muted "not deployed" when `hostname === ""`. Row links to
  `/boxes/$base/apps/$app`.
- Empty state: hint to deploy an app.

### `/domains` — per-box custom domains
- **Data model (confirmed from piper repo):** custom domain is **per-box**
  (`getDomainFn(base)` — one call per box; status `issuing`/`active`/`failed`,
  DNS records, cert expiry, `dns_ok`). When active, the box's apps are served
  at `<app>.<domain>`.
- **Loader:** new server fn `getDomainsFn()` — fetch boxes (`getApps` gives
  `BoxWithApps[]`), then `getDomain(credential, base)` per box; return
  `{ box, apps, domain }[]` where `domain` is the box's config or null. One
  relay call per box (same order as the boxes list).
- **View:** `PageHeader` (`# domains`) + one `Panel` per box. Boxes **with** a
  custom domain: show domain, status (`StatusDot`-style glyph), `dns_ok`
  health, cert expiry, and the apps served under it (`<app>.<domain>`). Boxes
  **without** one: a muted row with an "add domain" `Link` into that box's
  detail (where `domain-panel` manages it). This view is read-through +
  navigation; **domain management stays in `domain-panel`** (not
  re-implemented).
- Empty state (no boxes): hint to enroll a box.

## 6. Primitives (`src/components/ui/`)

Existing: `Button`, `StatusDot`, `Panel`/`PanelHeader`. Add **only what ≥2
screens reuse** (YAGNI — single-use styling stays inline in the screen):

| Primitive | Purpose | Reused by |
|---|---|---|
| `AppShell` / `TopBar` / `Nav` | the frame (§4) | every route |
| `PageHeader` | amber kicker + `#`-prefixed heading + subtitle | nearly every screen |
| `Link` | amber, `↳`-prefixed anchor (wraps router `Link`) | apps/domains/box/app screens |
| `HintBar` | `$`-prefixed line with amber `code` | empty states, box/app hints |
| `Field` / `Input` | terminal-styled labeled input | import-wizard, org-settings, create-org, domain-panel |
| `Row` | panel row: status glyph · label · meta · trailing state | apps-home (boxes), /apps, org members |

Each is built on the existing tokens and the spec §5 terminal idiom
(bracketed buttons already in `Button`; `#`/`↳`/`$` prefixes; uppercase amber
kickers).

## 7. Screen migrations

Every component that references coastal tokens/classes moves onto terminal
tokens + primitives. Heaviest first:

- **apps-home** (boxes list) — `PageHeader`, `Panel`+`Row`, count chips → muted
  meta, `Button`, `HintBar`; drop `page-wrap`/`island-*`/`sea-ink`.
- **org-switcher** — restyle the switcher/dropdown onto tokens (12 coastal refs).
- **app-detail** — `PageHeader`, `Panel`, status, `Link`, `Button`, `Field`.
- **box-detail**, **import-wizard**, **org-settings**, **domain-panel** —
  `Panel`/`PageHeader`/`Field`/`Button`/status.
- **login-card**, **status-badge**, **SessionControls**, **relay-error**,
  **auth-callback** — token swaps; light touches.
- **status-pill** — already token-only (verify renders correctly).

Screens already on shadcn semantic tokens (`bg-card`, `text-muted-foreground`,
`border-border`) re-map for free under the new `:root`; migration work is
removing the remaining coastal references and adopting primitives where they
reduce bespoke markup.

## 8. Sequencing (for the plan)

1. **Token flip:** `:root` → terminal, dark-only, remove theme wiring
   (`__root.tsx`). App renders dark globally; shadcn-token screens already look
   right, coastal-classed screens look off but stay functional.
2. **Shell + primitives:** build `AppShell`/`TopBar`/`Nav` + the new primitives
   (§6), wire the shell into `__root.tsx`.
3. **New routes:** `/apps`, `/domains` (+ `getDomainsFn`).
4. **Screen migrations:** one task per screen, heaviest first (§7).
5. **Cleanup (last):** delete orphaned coastal CSS (§3) and the `ThemeToggle`
   file; drop the `/ui` route's now-redundant `.terminal` wrapper. Grep-gate
   that zero coastal references remain.

Each task ends with an independently testable deliverable; the app's end state
is fully terminal even though intermediate tasks may look mixed.

## 9. Testing (TDD, per CLAUDE.md)

- Failing test first for each new primitive, the shell (`Nav` active state,
  brand link), and both new routes' loaders + views.
- Migrated screens keep their existing tests green (they assert content/
  behavior, not coastal colors) and add assertions for new terminal
  affordances where meaningful (bracketed buttons, `#`/`↳` prefixes, nav
  active state, served-URL/"not deployed" rendering).
- Tests never live in `src/routes/` (the file router scans it).
- **Final gates:** `grep -rE "sea-ink|lagoon|palm|island-shell|feature-card|page-wrap|Fraunces|Manrope" src` returns nothing; `bun run verify` (Biome → tsc → tests → build) is green.

## 10. Success criteria

- `styles.css` renders the app dark-first in JetBrains Mono on the terminal
  palette; coastal tokens/classes and Fraunces/Manrope are gone; no `.dark`
  variant or theme toggle remain.
- The terminal top bar + centered content is the app frame; nav exposes
  boxes/apps/domains/settings.
- `/apps` lists all apps with served URLs; `/domains` lists per-box custom
  domains with status.
- Every screen renders terminal; no screen references a coastal token/class or
  hardcodes a brand color where a token exists; amber never denotes device
  status.
- `bun run verify` green; the coastal-reference grep gate is clean.
