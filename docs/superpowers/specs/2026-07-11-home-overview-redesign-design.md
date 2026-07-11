# Home / Overview redesign

Redesign the `/` route (the boxes-and-apps overview) to match the "Home ·
Overview" screen in `docs/piper-dashboard.html` (the Claude design canvas). This
is a **visual upgrade of an existing screen**, not new data plumbing.

## Background

The design canvas mocks every dashboard screen in light and dark. Its visual
language already lives in `src/styles.css` token-for-token (`--sea-ink`,
`--lagoon`, `--palm`, Fraunces + Manrope, `.feature-card`, `.island-kicker`,
`.page-wrap`). The current `/` route renders `apps-home.tsx`, a thin box-grouped
app list. The mockup's "Home · Overview" is the richer treatment of that same
screen.

## Scope

**In:** redesign `src/components/apps-home.tsx` in place and update its test.
Add two small helpers (relative time, status badge). Keep the route, loader
(`getApps`), and `BoxWithApps[]` data shape unchanged.

**Out:** the other planned screens (App detail, deploy logs, billing, etc.); any
relay/API change; the real per-app hostname (tracked separately — see below).

## Data

`getApps()` returns `BoxWithApps[]` where
`BoxWithApps = { base: string; connected: boolean; apps: App[] }` and
`App = { name, port, repo, branch, createdAt, status }`.

Everything the redesign renders maps to this, **except the per-app public URL**.

### Per-app public URL — mock for now

The mockup shows a clickable `blog-7f3c9a2-octocat.public.getpiper.co` per app.
Confirmed in the piper source (`internal/deploy/deploy.go`,
`internal/api/api.go`, `internal/store/store.go`): the hostname is
**relay-assigned at deploy time** (`registrar.Register(app) → host`) as
`<app-hash>-<username>.public.getpiper.co`, where `<app-hash>` is a per-app hash
the relay generates. It is **not** stored on the box and **not** returned by the
`/v1/apps` payload the dashboard proxies, so it cannot be derived from available
data.

Decision: render a **clearly-marked mock** `{app}-{base}.public.getpiper.co` with
a `TODO` in the code referencing a tracking issue, until the relay exposes the
real hostname. File the tracking issue in **getpiper/piper** (the API owner);
reference it from the code TODO here.

## Layout (matches the mockup)

1. **Page header row** (`page-wrap`):
   - Left: `.island-kicker` "Your hardware" + `<h1>` "Boxes".
   - Right: two summary chips computed from real data —
     `"{boxCount} boxes · {onlineCount} online"` and `"{liveAppCount} apps live"`
     (live = `status === "running"`). Chip style = existing chip tokens
     (`--chip-bg`, `--chip-line`).

2. **Box cards** — one `.feature-card` per box (rounded-2xl, the class already
   produces the mockup's gradient + inset glint + shadow). Card header:
   - mono `box.base`
   - `"{n} apps"` count (omit when 0)
   - Connected (emerald dot + "Connected") / Offline (gray dot + "Offline")
     indicator on the right.

3. **App rows** inside each card, separated by hairline top-borders
   (`border-t border-[var(--line)]`):
   - Left: app name (semibold) + mock public URL link (mono, lagoon-deep).
   - Right: status badge + relative deploy time (`createdAt` → "2h ago").

4. **Empty / edge states:**
   - No boxes at all → existing "run `piper connect`" message, restyled inside
     the page shell.
   - Offline box → card with no app rows, "No apps deployed on this box."
   - Connected box, 0 apps → same "No apps deployed on this box."

Light + dark are handled entirely by existing tokens; no new theme work.

## New pieces

- **`relativeTime(iso: string): string`** — "just now" (<1m), "{n}m ago",
  "{n}h ago", "{n}d ago". Small pure helper, colocated or in `lib`.
- **Status badge** — filled pill matching the mockup. Reuse `status-pill.tsx`'s
  status vocabulary but render the badge style. Mapping:
  - `running` → green **"Live"**
  - `building` → amber "Building"
  - `failed` → red "Failed"
  - `stopped` → gray "Stopped"
  - unknown/`""` → gray "Never deployed"

  Decided: `running` displays as **"Live"** to match the mockup wording. Whether
  this replaces `StatusPill` or is a sibling badge is an implementation detail;
  keep `box-detail.tsx` working either way.

## Testing (test-first)

Update `apps-home.test.tsx` to assert:
- summary chips show correct counts (boxes, online, live apps) from fixture data;
- each connected box renders its app rows with name, "Live"/"Building" badge, and
  a relative-time string;
- the mock URL renders as a link containing `{app}-{base}.public.getpiper.co`;
- offline box and zero-app box render the empty message;
- no-boxes state renders the `piper connect` prompt.

Verification: `bun run verify` (Biome → tsc → tests → build) passes.

## Deliverables

1. Redesigned `src/components/apps-home.tsx` + helper(s) + status badge.
2. Updated `src/components/apps-home.test.tsx`.
3. Tracking issue in getpiper/piper for exposing the per-app hostname, referenced
   by a code TODO on the mock URL.
