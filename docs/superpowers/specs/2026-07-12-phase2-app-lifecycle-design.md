# Phase 2 slice B — app lifecycle: stop + delete (design)

Second slice of Phase 2 ([#8](https://github.com/getpiper/dashboard/issues/8)),
tracked as [#18](https://github.com/getpiper/dashboard/issues/18). Phase 2 is an
epic of independent subsystems — deploy history + logs (slice A, shipped),
project import (slice D, shipped), BYO custom domains, and this one, app
lifecycle — each shipping as its own spec → plan → PR.

This slice gives the dashboard its first *write control over an existing app*:
**stop** it and **delete** it, riding the same relay → tunnel → box control path
every prior slice used. It builds directly on the app-detail page (slice A),
which already renders an app's status, live URL, and deploy history.

## Goal

From the app-detail page, a user can stop a running app and delete an app —
delete guarded by typing the app's name — without touching the CLI.

Acceptance criteria (from #18):
- An app can be stopped from the dashboard.
- An app can be deleted from the dashboard with explicit type-the-name
  confirmation.

## The control path (verified against `getpiper/piper`)

Everything rides the relay's control proxy (`internal/relay/proxy.go`), which
forwards any `/agents/{base}/v1/*` to the box over the tunnel, authenticated
with the account bearer in the `piper_session` cookie. The relay authorizes
account→agent ownership and swaps in the box's control token; the dashboard
never sees the box token. The proxy's only method restrictions are on the bare
`/agents` list and the no-tail liveness endpoint — the `/v1/*` reverse proxy
forwards **any** method, so both POST and DELETE pass through unchanged. Same
plumbing every prior slice used — **no new piper endpoint is required.**

Dependency [getpiper/piper#103](https://github.com/getpiper/piper/issues/103)
(delete + stop endpoints) is shipped. The two box endpoints, reached through the
proxy:

| Action | Request | Response |
| --- | --- | --- |
| Stop | `POST {relay}/agents/{base}/v1/apps/{name}/stop` | `204`; `404` unknown app; `500` otherwise (`internal/api/api.go:198`) |
| Delete | `DELETE {relay}/agents/{base}/v1/apps/{name}` | `204`; `404` unknown app; `500` otherwise (`internal/api/api.go:208`) |

### Note on the confirmation guard

Issue #18 states the type-the-name confirmation "mirrors the CLI's guard." The
CLI's actual delete guard is a plain `y`/`yes` prompt (`confirmDelete`,
`cmd/piper/main.go:455`), not type-the-name. We follow #18's explicit
requirement — **type-the-name** — because it is a *stronger* guard, and a
dashboard (one stray click) warrants more friction than a terminal (deliberate
typing). The stated "mirrors the CLI" rationale is slightly off; the requirement
itself stands.

## Design

Follows the established write pattern (`createApp`/`linkApp` →
`createAndLinkApp` → `ImportWizard`) exactly. Deviating would fight the
codebase's conventions; there is no second architecture worth weighing.

### 1. Server layer — `src/server/relay.ts`

Two fetch wrappers mirroring `createApp`/`linkApp`, with the same status
handling (`401` → `RelayAuthError`, `502`/`503` → `BoxOfflineError`):

```ts
stopApp(credential, base, name)   → POST   /agents/{base}/v1/apps/{name}/stop
deleteApp(credential, base, name) → DELETE /agents/{base}/v1/apps/{name}
```

Both expect `204`. On a non-204 that isn't 401/502/503, throw an error using the
trimmed response body (so piper's `404 unknown app` surfaces as its message),
falling back to a status-code message. Paths use `encodeURIComponent` on `base`
and `name`, matching the existing wrappers.

### 2. Server functions — `src/server/fns.ts`

Two `createServerFn({ method: "POST" })` handlers, session-guarded exactly like
`createAndLinkApp` — read the `piper_session` cookie, `redirect({ to: "/login" })`
if absent, and `dropSessionAndRedirect()` on `RelayAuthError`:

```ts
stopAppFn   .validator((d: { base: string; name: string }) => d)
deleteAppFn .validator((d: { base: string; name: string }) => d)
```

### 3. Component — `src/components/app-detail.tsx`

`AppDetail` gains two injected async props (keeps the component decoupled from
server fns and testable with fakes, mirroring `fetchLogs`):

```ts
onStop:   () => Promise<void>
onDelete: () => Promise<void>
```

An **actions row** renders in the header, below the repo/branch line:

- **Stop** — direct action (no confirm). Shows a pending/disabled "Stopping…"
  state while `onStop()` runs; on success the parent's `refresh()` re-runs the
  loader and the status pill flips to `stopped`. **Hidden when `app.status` is
  already `stopped`** (a stopped app has nothing to stop).
- **Delete app** — toggles an **inline confirm block** (not a modal): a warning
  line naming the app and stating it is permanent, a text input, and
  **Cancel** / **Delete** buttons. The Delete button is **disabled until the
  typed value exactly equals `app.name`**. On confirm: pending state →
  `onDelete()` → the parent navigates to `/boxes/$base`. **Cancel** collapses
  the block and clears the typed value without calling `onDelete`.

A single `error` state renders a red message (mirrors `ImportWizard`). Every
catch re-throws `isRedirect(err)` first so session-expiry redirects propagate;
other errors set the message.

### 4. Route wiring — `src/routes/boxes/$base_.apps.$app.tsx`

Pass the two props through, mirroring the existing `fetchLogs`/`refresh` wiring:

- `onStop`  → `await stopAppFn({ data: { base, name: appName } })` then
  `router.invalidate()`.
- `onDelete` → `await deleteAppFn({ data: { base, name: appName } })` then
  `router.navigate({ to: "/boxes/$base", params: { base } })`.

## Testing (test-first)

- **`relay.ts`** — `stopApp`/`deleteApp` hit the correct method + path; map
  `401` → `RelayAuthError`, `502`/`503` → `BoxOfflineError`, and a non-204 (e.g.
  `404` with body) → a thrown error carrying the body text.
- **`app-detail.tsx`** (Testing Library, injected fake props):
  - Stop calls `onStop`, shows the pending state, and is **absent** when
    `app.status === "stopped"`.
  - Delete button is disabled until the exact name is typed; the matching name
    enables it; confirming calls `onDelete`; **Cancel** collapses the block
    without calling `onDelete`.
  - A rejected `onStop`/`onDelete` renders the error message.

Tests live outside `src/routes/` (the file router scans it), consistent with the
repo's constraint.

## Out of scope (unchanged from #18)

- **Create / deploy / redeploy** from the dashboard. A hosted dashboard has no
  local source tar, and repo-linked deploys happen via GitHub webhooks. A
  dashboard-triggered rebuild needs a new piper "rebuild latest commit" endpoint
  that is **not yet filed** — file that piper issue before scoping it in.
