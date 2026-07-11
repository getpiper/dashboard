# Phase 2 slice A — Deploy history + logs (design)

First slice of Phase 2 ([#8](https://github.com/getpiper/dashboard/issues/8)).
Phase 2 is an epic of four independent subsystems — deploy history + logs,
app lifecycle, BYO custom domains, project import — each shipping as its own
spec → plan → PR. This slice is the smallest and purely additive: it extends
the read-only box view from Phase 1
([#3](https://github.com/getpiper/dashboard/issues/3)) with a per-app detail
page that surfaces deployment history and build/deploy logs. No destructive
actions, no blocked write paths.

## Goal

From the box view, a user clicks an app and lands on a per-app page showing
that app's deployment history — each deploy's status and when it ran, with
production deploys distinguished from PR previews — and can read the
build/deploy logs of any deploy, including a failed one.

Acceptance criteria (the readable-logs slice of #8):
- A failed build's logs are readable in the dashboard.
- Deploy history is visible per app, newest first, previews included.
- Everything rides the same authenticated relay control API the CLI uses —
  no back door, no closed/forked relay.

## The control path (verified against `getpiper/piper`)

All reads go through the relay's control proxy
(`internal/relay/proxy.go`), authenticated with the account bearer already in
the `piper_session` cookie. The relay authorizes account→agent ownership and
swaps in the box's control token before proxying over the tunnel; the
dashboard never sees the box token. Same plumbing Phase 1 established.

The endpoints this slice needs shipped with piper
[#101](https://github.com/getpiper/piper/issues/101) (closed):

| Need | Request | Response |
| --- | --- | --- |
| Deploy history for an app | `GET {relay}/agents/{base}/v1/apps/{app}/deployments` | Bare JSON array of deployment objects, **Go-default capitalized keys**. |
| Logs for one deployment | `GET {relay}/agents/{base}/v1/apps/{app}/deployments/{id}/logs` | `text/plain` body (not JSON). |

### Deployment payload

`internal/store/store.go`'s `Deployment` struct carries no JSON tags, so keys
are Go-capitalized:

```json
[
  { "ID": "abc123", "App": "web", "PR": 0, "ImageID": "...",
    "ContainerID": "...", "HostPort": 8081, "Status": "running",
    "CreatedAt": "2026-07-11T10:00:00Z" }
]
```

The data layer maps these to a camelCase type at the boundary. This slice
consumes only `ID`, `PR`, `Status`, `CreatedAt` — `ImageID`, `ContainerID`,
`HostPort` are dropped (YAGNI; add when a consumer needs them). `Status` is the
same vocabulary as apps: `building | running | failed | stopped`. `PR` is `0`
for a production deploy and the PR number for a preview deploy
(`GET .../deployments` returns previews too, unlike the app's `LatestDeployment`
which is production-only).

Failure modes (same handling as Phase 1):
- `401` — bad/revoked credential → `RelayAuthError` → drop session, redirect
  `/login`.
- `502` / `503` — box offline / unreachable → `BoxOfflineError`.
- `404` — unknown app or deployment.

## Views

### App detail (`/boxes/{base}/apps/{app}`)

Reached by clicking an app row in the box view (rows become links).

- **Header**: app name, its production `StatusPill`, repo/branch. Prod public
  URL reuses the existing `mockAppUrl` stand-in with its current caveat
  (real hostname waits on
  [piper#137](https://github.com/getpiper/piper/issues/137)).
- **Deployments** list, newest first, all deploys incl. previews. Each row:
  - short deployment id,
  - `StatusPill` (`building` / `running` / `failed` / `stopped`),
  - relative time (`relativeTime`),
  - a **Production** badge, or **PR #N** linking to the real GitHub PR
    (`https://github.com/{app.repo}/pull/{N}`). The live preview *URL* is out
    of scope (blocked on piper#137); the PR link is real and correct today.
  - Clicking a row toggles its **logs** panel.
- **Logs panel**: fetched on demand when a row is expanded; rendered as a
  monospace, vertically scrollable block. For a completed deploy this is the
  whole log (satisfies the failed-build acceptance criterion). For a
  `building` deploy it live-tails (see below).
- **Offline / not-found states**: if the box is offline or the app isn't found
  on it, render an explicit message rather than an empty page.

### Box view change (`components/box-detail.tsx`)

App rows, currently non-interactive `<li>`s, become links to
`/boxes/{base}/apps/{app}`. No other change to that view.

## Components & data flow

### Data layer — `src/server/relay.ts`

- Add `type Deployment = { id: string; pr: number; status: string;
  createdAt: string }` and a `RawDeployment` for the capitalized wire shape.
- `fetchDeployments(credential, base, app): Promise<Deployment[]>` →
  `GET {relay}/agents/{base}/v1/apps/{app}/deployments`. Maps keys →
  `Deployment`. Reuses `RelayAuthError` (401) and `BoxOfflineError` (502/503);
  other non-2xx → plain error. `encodeURIComponent` on `base` and `app`.
- `fetchDeploymentLogs(credential, base, app, id): Promise<string>` →
  `GET .../deployments/{id}/logs`. Returns `res.text()` (text/plain). Same
  401/offline handling.

### Server fns — `src/server/fns.ts`

- `getDeployments` — `.validator((d: { base: string; app: string }) => d)`,
  reads `piper_session` (redirect `/login` if absent), calls
  `fetchDeployments`, with the existing `RelayAuthError → dropSessionAndRedirect`
  handling.
- `getDeploymentLogs` — validator `{ base, app, id }`, same auth handling,
  returns the log string.
- No new `getApp` fn: the app-detail route loader reuses **`getBox(base)`** —
  it already returns `connected` plus the app records, so the header renders
  from the app found by name in that list. The loader fetches `getBox(base)`
  first; **only if** the box is connected and the app is present does it also
  fetch `getDeployments({ base, app })`. Offline box or missing app → the
  inline state (below), mirroring how Phase 1's box-detail renders offline
  rather than routing through the error component. A box that drops
  mid-request still throws `BoxOfflineError` → `RelayError` fallback.

### Routing — `src/routes/`

- New `boxes/$base/apps/$app.tsx`: `loader` fetches box + deployments (see
  above), `component` renders `<AppDetail>`, `errorComponent` reuses
  `RelayError`.

### UI components — `src/components/`

- New `app-detail.tsx`: header + deployments list + expandable logs. Reuses
  `StatusPill` and `relativeTime`.
- `box-detail.tsx`: wrap each app row in a `<Link>`.

### Live-tail while building

The stack has no react-query today (route loaders + `useLoaderData` only), so
keep it small and local to the logs panel:

- The expanded logs panel holds its text in `useState`.
- A `useEffect` starts a `setInterval` (~2s) that re-calls `getDeploymentLogs`
  and replaces the text **only while the deployment's status is `building`**.
- To notice the transition to a terminal status, the same effect calls
  `router.invalidate()` on that interval so the loader refetches the
  deployments list and the row's `StatusPill` flips; once the status is no
  longer `building`, the interval clears (also on unmount).

This is the whole polling story — no websockets, no streaming endpoint, no
query cache.

## Testing (TDD, component-level)

Every unit starts with a failing test. Tests live outside `src/routes/` (the
file router scans it).

- `relay.test.ts`: `fetchDeployments` maps the capitalized wire shape;
  `502`/`503` → `BoxOfflineError`; `401` → `RelayAuthError`; other → error.
  `fetchDeploymentLogs` returns the text body.
- `box-detail.test.tsx`: app rows render as links to
  `/boxes/{base}/apps/{app}`.
- `app-detail.test.tsx`: deployments render newest-first; a `PR #N` deploy
  shows a link to the GitHub PR; a production deploy shows the Production
  badge; expanding a row fetches and shows its logs; a `building` deploy's
  panel drives the polling path and stops at a terminal status.

`bun run verify` (Biome → tsc → tests → build) must pass before the work is
claimed done.

## Out of scope (later #8 slices / blocked)

- **Redeploy** button — the box's `POST /v1/apps/{name}/deploy` takes a source
  tar built from a local checkout; a hosted dashboard has none, and deploys of
  repo-linked apps happen via GitHub webhooks. A dashboard-triggered redeploy
  needs a new piper "rebuild latest commit" endpoint (not yet filed).
- **Real PR preview URLs** — blocked on
  [piper#137](https://github.com/getpiper/piper/issues/137); we link the GitHub
  PR instead.
- App lifecycle (stop/delete), BYO domains, project import — the other three
  Phase 2 slices.
- Deployment image/container metadata; history pagination.
