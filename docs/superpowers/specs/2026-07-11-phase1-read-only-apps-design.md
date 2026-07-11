# Phase 1 — Read-only apps + box views (design)

Deliverable for dashboard [#3](https://github.com/getpiper/dashboard/issues/3):
the read-only foundation the whole of Phase 2 ([#8](https://github.com/getpiper/dashboard/issues/8))
renders on top of. Turns the dashboard from "logged in, empty box list" into an
apps-first view of what's actually deployed across the account's boxes.

## Goal

A free-tier user with connected boxes opens the dashboard and sees their apps —
each with live deploy status — grouped by the box that serves them, plus a
per-box detail page. Read-only: no writes, no logs, no domains (those are #8
sub-slices).

Acceptance criteria (mirrors #3):
- Dashboard shows box health and per-app deploy status.
- Auth reuses the per-user relay account credential already in the httpOnly
  cookie — no separate trust path, no privileged back door.
- Nothing requires a closed/forked relay: all data comes from the same
  authenticated control API the CLI uses.

## The control path (verified against `getpiper/piper`)

All reads go through the relay's control proxy (`internal/relay/proxy.go`),
authenticated with the account bearer already stored in the `piper_session`
cookie. The relay authorizes that the account owns the agent and swaps in the
box's own control token before proxying over the tunnel — the dashboard never
sees the box token.

| Need | Request | Notes |
| --- | --- | --- |
| List account's boxes | `GET {relay}/agents` | Returns `{ "agents": [{ "agent": base, "connected": bool }] }` — **object-wrapped**. |
| Per-box liveness | `GET {relay}/agents/{base}` | `{ "agent": base, "connected": bool }`. Answered from the relay's in-memory session map; offline is `200 connected:false`, not an error. |
| Per-box apps | `GET {relay}/agents/{base}/v1/apps` | Opens a tunnel stream to the box. **Bare JSON array.** |

Failure modes to handle:
- `401` — bad/revoked account credential → existing `RelayAuthError` path (drop
  session cookies, redirect to `/login`).
- `404` — unknown or unowned agent (existence never leaked across tenants).
- `503` — agent not connected (the box is offline; the relay can't reach it).
- `502` — box unreachable mid-request.

### Apps payload

`GET /agents/{base}/v1/apps` returns a bare array. The Go structs
(`internal/api/api.go` `App` embedding `internal/store/store.go` `App`) carry no
JSON tags, so keys are **Go-default capitalized**:

```json
[
  { "Name": "web", "Port": 8081, "Repo": "getpiper/example",
    "Branch": "main", "CreatedAt": "2026-07-11T10:00:00Z", "Status": "running" }
]
```

`Status` is one of `building | running | failed | stopped | ""`, where `""`
means never-deployed. The data layer maps these to a camelCase `App` type at the
boundary so the rest of the app never sees Go casing.

### Consequence: offline boxes have unknowable apps

App state lives on the box; the relay holds no cache. An offline box `503`s on
`/v1/apps`, so its apps cannot be enumerated remotely. The home view therefore
shows apps only for **connected** boxes, and renders offline boxes explicitly
(see below) rather than silently dropping them.

## Views

### Home (`/`) — apps-first, grouped by box

- **Connected box** → a light section header (box name + green liveness dot)
  with its app cards beneath. Each card: app name and a status pill
  (`building` / `running` / `failed` / `stopped` / `—` for never-deployed).
  Apps are the visual content; box headers are lightweight group labels.
- **Offline box** → a greyed, collapsed row: "offline — apps unavailable". No
  apps fetch is attempted.
- Box header name links to the box detail page.
- **Empty state** when the account has zero boxes: the existing "run
  `piper connect`" copy.

No public-URL column: the apps API carries no hostname yet
([piper#100](https://github.com/getpiper/piper/issues/100) is open). The column
is added when that lands.

### Box detail (`/boxes/{base}`)

Single-box focus: box liveness (up/down) + that box's apps, same app card as the
home. Minimal for this slice — it exists because it's the surface Phase 2's
write actions (deploy, delete, logs, domains) will hang on. Reached by clicking
a box header on the home.

## Components & data flow

### Data layer — `src/server/relay.ts`

- Add `type App = { name: string; port: number; repo: string; branch: string;
  createdAt: string; status: string }`.
- Add `class BoxOfflineError extends Error` (thrown on `503`).
- Add `fetchApps(credential, base): Promise<App[]>` → `GET
  {relay}/agents/{base}/v1/apps`. Maps capitalized keys → `App`. `401` →
  `RelayAuthError`; `503` → `BoxOfflineError`; other non-2xx → plain error.
- **Fix `fetchBoxes`**: the relay returns `{ agents: [...] }`, but the current
  code parses `(await res.json()) as Box[]` (a bare array). Against a real relay
  `boxes.map` throws. Parse `.agents` and update `relay.test.ts` to mock the
  wrapped shape. (Pre-existing Phase 0 bug, folded in because this slice
  rewrites the same plumbing.)

### Server fns — `src/server/fns.ts`

- `getApps()` — reads the `piper_session` cookie (redirect to `/login` if
  absent), lists agents via `fetchBoxes`, then calls `fetchApps` for each
  **connected** box. Returns
  `{ boxes: Array<{ base: string; connected: boolean; apps: App[] }> }` —
  offline boxes carry `connected: false, apps: []`. Reuses the existing
  `RelayAuthError` → delete-cookies + redirect handling.
- `getBox(base)` — liveness (via `fetchBoxes` lookup or the per-agent endpoint)
  + `fetchApps` for the detail page; same auth handling.

### Routing — `src/routes/`

- `index.tsx` loads `getApps()` and renders the grouped home (replaces the
  current bare box list).
- `boxes/$base.tsx` loads `getBox(base)` and renders the detail page.

### UI components — `src/components/`

- Rework/replace `box-list.tsx` into the grouped apps home (component name TBD
  during implementation, e.g. `apps-home.tsx`).
- A shared app card / status-pill component used by both views.
- Box detail component.

## Testing (TDD, component-level)

Every unit starts with a failing test.

- `relay.test.ts`: `fetchApps` success (maps keys), `503` → `BoxOfflineError`,
  `404`/other → error; corrected `fetchBoxes` parses `{ agents: [...] }`.
- Home component: apps present under a connected box; an offline box renders as
  the greyed "apps unavailable" row; zero-boxes empty state.
- Box detail component: liveness + apps render; offline box state.

Tests live outside `src/routes/` (the file router scans it). `bun run verify`
(Biome → tsc → tests → build) must pass before the work is claimed done.

## Out of scope (later #8 sub-slices)

Write actions (create/deploy/delete/stop), deploy history + logs, PR preview
URLs, BYO domains. Public-URL column waits on piper#100.
