# Public landing page

A public, unauthenticated marketing landing page — the terminal-styled
"Deploy to your own box with one git push" screen mocked in the Claude Design
project (`Piper Landing.dc.html`, project `3f974e7e-…`). This is **net-new
public surface**, not a change to the authenticated dashboard.

## Background

The dashboard is authenticated app surface (`/apps`, `/boxes`, …) wrapped by an
unconditional app shell in `__root.tsx` (`RootLayout` → `AppFrame` → `AppShell`,
which always renders the `pi@piper` header). Today `/` is a bare redirect to
`/apps`. There is no public marketing page.

The mockup's visual language already lives in `src/styles.css` token-for-token:
the terminal palette (`--background` `#0b0b0d`, `--primary` `#ffb454` amber,
`--status-ok` `#4ade80`, `--muted-foreground` `#9a9aa0`, `--border` `#2f2f36`,
`--status-idle` `#6a6a70`), `--radius: 2px`, and JetBrains Mono as the global
`--font-mono`. The `Button` primitive (`src/components/ui/button.tsx`, #41)
provides the terminal button variants and an exported `buttonVariants` for
styling link elements. So this is a **token/primitive mapping job**, not new
visual design.

### Domain context (informs routing, not built here)

The intended topology is landing at the apex (`openpiper.dev`), dashboard at
`dashboard.openpiper.dev`, and untrusted user apps on a **different registrable
domain** (`getpiper.dev`), preserving the dashboard-vs-apps cookie/CSRF
isolation. Those domains do not exist yet, so **host-based routing is out of
scope**; the page is built at `/` with an authed redirect, which stays correct
when the host split is layered on later.

Branding decision: the getpiper→openpiper rename is **org/brand only** — the
product/CLI stays `piper`. See "Branding" below.

## Scope

**In:** repurpose `src/routes/index.tsx` from redirect to landing-or-redirect;
add a `staticData` chrome flag + a conditional in `__root.tsx`'s `RootLayout` so
the landing renders shell-free; add `src/components/landing-page.tsx` and its
test; add a `useCopyToClipboard` hook.

**Out:** host-based routing wiring; the broader getpiper→openpiper rename
elsewhere in the repo/product; real sign-in flow beyond linking `/login`;
responsive redesign beyond the mockup's own `flex-wrap`/`auto-fit`; analytics;
OG/SEO beyond a page `<title>`.

## Routing

`src/routes/index.tsx` (currently `beforeLoad` → `redirect({ to: "/apps" })`)
becomes:

- `beforeLoad` calls `getSession()`; **authenticated → `redirect({ to: "/apps" })`**
  (today's behavior preserved); unauthenticated → falls through.
- `staticData: { chrome: false }`.
- `component: LandingPage`.

`__root.tsx` `RootLayout` gains one conditional: read the active leaf match
(`useRouterState`/`useMatches`) and render a bare `<Outlet/>` (no `AppFrame`)
when `staticData.chrome === false`; otherwise the existing shell. This keeps the
shell unconditional for every current route and opts the landing out by
declaration — no hardcoded pathname.

Route files are not unit-tested (existing convention); the redirect logic is
covered manually, and `LandingPage` is tested as a component.

## Component

New `src/components/landing-page.tsx` exporting `LandingPage`, composed of local
section components in one file: `Header`, `Hero`, `WhySection`, `RelayDiagram`,
`HowSection`, `Footer`. The mockup's data arrays become module consts:

- `whyCards: { glyph, title, body }[]` — Zero-trust relay / Lean by design /
  Developer-first (bodies verbatim from the mock).
- `steps: { n, cmd, body }[]` — `piper connect` / `piper app link …` /
  `git push` (verbatim).

`useCopyToClipboard()` — small hook returning `[copied, copy]`; `copy(text)`
calls `navigator.clipboard.writeText`, sets `copied` true, resets after 1.5s.
Drives both copy buttons (`installCmd` shared const).

Sections map 1:1 to the mockup: sticky header + nav; hero (badge, headline with
amber `git push`, subcopy, install-command row with copy button, docs/star
links); "why piper" 3-card `auto-fit` grid; relay diagram (visitors → relay →
your box, flex-wrap); "how it works" 3 steps + closing CTA; footer.

## Branding (openpiper, CLI stays `piper`)

Deltas from the mockup's strings; everything else verbatim:

- install command → `curl -fsSL https://get.openpiper.dev/install.sh | sh`
- every `github.com/getpiper/piper` → `github.com/openpiper/piper`
- footer `getpiper/piper` → `openpiper/piper`
- logo `pi@piper`, all `piper …` commands, badge/hero/section copy — unchanged
- the two `#` sign-in anchors (header + footer) → `<Link to="/login">`

## Styling

Inline hex → existing tokens (no new tokens):

| mock hex | token / utility |
|---|---|
| `#0b0b0d` page bg | `bg-background` |
| `#0e0e11` panel/header/footer bg | `bg-card` (`--card: #0e0e11`, exact match) |
| `#f2f2f4` | `text-foreground` |
| `#ffb454` amber | `text-primary` / `bg-primary` / `border-primary` |
| `#0a0a0c` | `text-primary-foreground` (dark-on-amber) |
| `#9a9aa0` | `text-muted-foreground` |
| `#2f2f36` | `border-border` |
| `#4ade80` green | `text-status-ok` |
| `#6a6a70` idle | `text-status-idle` |
| `#1a1a1e` | `bg-secondary` |
| radius `2px` | `rounded-[2px]` |

JetBrains Mono is already the global body font — no per-element font needed.
Radial hero glow keeps its inline `radial-gradient` (one-off, no token).

## Buttons

Reuse the `Button` primitive:

- hero "copy install command" → `variant="neutral" size="sm" bracketed={false}`
- how-section CTA → `variant="primary" size="lg" bracketed={false}`
- sign-in → `<Link to="/login" className={buttonVariants({ variant: "secondary", size: "sm" })}>`
  keeping the literal `[ sign in ]` text.

Both copy buttons show the dynamic label (`copy install command` ↔ `✓ copied`),
hence `bracketed={false}`.

## Testing (test-first)

Because `LandingPage` renders a TanStack `<Link>`, the test mounts it via a
`RouterProvider` wrapper — the established `renderInRouter` pattern from
`apps-home.test.tsx` (create a `createRootRoute` whose component renders
`LandingPage`, `createRouter`, navigate to `/`, render `<RouterProvider>`).

`src/components/landing-page.test.tsx` (never in `src/routes/`) asserts:

- hero headline text ("Deploy to your own box") with the amber `git push`;
- install command string including `get.openpiper.dev`;
- the three why-card titles render;
- the three step commands render with their `01/02/03` numbers;
- key relay-diagram labels ("piper-relay · cloud", "your box · piperd");
- sign-in renders `<a href="/login">`;
- a docs link renders `href` containing `github.com/openpiper/piper`;
- copy interaction: mock `navigator.clipboard.writeText`, click the hero copy
  button → `writeText` called with the install command and label flips to
  `✓ copied`.

Verification: `bun run verify` (Biome → tsc → tests → build) passes.

## Deliverables

1. `src/components/landing-page.tsx` + `useCopyToClipboard` hook.
2. `src/components/landing-page.test.tsx`.
3. `src/routes/index.tsx` — landing-or-redirect.
4. `src/routes/__root.tsx` — `staticData.chrome`-driven shell bypass.
