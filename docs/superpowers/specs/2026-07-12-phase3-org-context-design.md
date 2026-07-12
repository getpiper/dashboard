# Phase 3 slice A — org context: switcher, org-scoped views, create org

Design for [#25](https://github.com/getpiper/dashboard/issues/25), the backbone
slice of Phase 3 — organizations (epic [#9](https://github.com/getpiper/dashboard/issues/9)).
Organizations are a **free** feature (see `ROADMAP.md`).

## Context

The relay dependency shipped: [piper#104](https://github.com/getpiper/piper/issues/104)
(getpiper/piper#149) delivered the org model, membership, and org-scoped agent
authz. The relevant facts the dashboard builds on:

- **`GET /agents` returns every box the caller can see** — personal boxes *and*
  every box owned by an org the caller belongs to — in one response, each row
  tagged `{agent, owner, connected}` where `owner` is the owning account/org
  **slug**.
- A **personal** box's `owner` equals the caller's own account slug. The
  dashboard already stores that slug in the `piper_username` cookie: the relay's
  web-login sets the fragment `username=acc.Username` (`internal/relay/api.go:160`),
  the same derived slug used as `owner`. So `owner === piper_username`
  identifies personal boxes exactly; `owner === <orgSlug>` identifies org boxes.
- `GET /v1/orgs` returns the caller's orgs with roles: `{orgs:[{org,role}]}`.
- `POST /v1/orgs {name}` creates an org; the caller becomes `owner`. Returns
  `{org,role}`.

All org endpoints authenticate the same account bearer the dashboard already
uses. **Authorization is per-request on the relay** (`CanControl`): membership
is enforced server-side on every call, so nothing the dashboard does with scope
selection can widen access.

Enrolling a box *into* an org (`POST /v1/enroll {org}`, owner-only) is a
CLI/relay concern — the dashboard only ever displays boxes from `/agents`, so
it is out of scope here.

## Decision: scope is a client-side display preference

Because `/agents` already returns personal + all org boxes in one payload, the
"active scope" is nothing more than a **filter over data the client already
has**. There is no per-org fetch and no org in the routing path. This keeps the
dashboard a stateless shim (roadmap principle 2) and keeps the diff small.

Rejected alternatives:

- **URL-prefixed org routes** (`/orgs/{slug}/boxes/{base}`): shareable per-org
  URLs, but duplicates every existing box/app route under an org prefix for no
  functional gain — `{base}` is already globally unique, and the relay authorizes
  each box regardless of how the URL was shaped. Much larger routing refactor.
- **Server-side scoped fetch** (a loader that fetches only the active scope's
  boxes): forces the scope into the request path and re-runs the loader on every
  switch, when the data is already in hand. Adds round-trips for nothing.

The scope carries **no authz weight** — a tampered `piper_scope` cookie can only
hide or reveal boxes already present in the caller's own `/agents` response; it
can never surface a box the relay didn't already authorize. Domains are split
(dashboard and untrusted user apps on separate registrable domains), so the
cookie is not reachable by user-app JavaScript regardless.

## Data model & server functions

**`src/server/relay.ts`:**

- `Box` gains `owner: string`; `fetchBoxes` reads `owner` from each `/agents`
  row. `BoxWithApps` gains `owner` (threaded through `appsForBox` /
  `fetchAllApps` / `fetchBox`).
- `export type Org = { slug: string; role: "owner" | "member" }`.
- `fetchOrgs(credential): Promise<Org[]>` — `GET /v1/orgs`; maps
  `{orgs:[{org,role}]}` → `Org[]`. 401 → `RelayAuthError`.
- `createOrg(credential, name): Promise<Org>` — `POST /v1/orgs {name}`; maps
  `{org,role}` → `Org`. 401 → `RelayAuthError`; on non-ok, throw with the
  relay's trimmed body text (surfaces name-collision / validation messages).

**`src/server/fns.ts`:**

- `getOrgs` server fn — reads `piper_session`, calls `fetchOrgs`, same
  `RelayAuthError → dropSessionAndRedirect()` handling as `getApps`. Returns
  `Org[]` (empty array when the caller has no orgs).
- `createOrgFn` — `createServerFn({ method: "POST" })` with a `name` validator;
  calls `createOrg`; `RelayAuthError → dropSessionAndRedirect()`, other errors
  bubble so the caller can show the message.
- `getSession` is unchanged (still cookie-only: `{username}`).
- `getApps` is unchanged — it already returns owner-tagged boxes.

The **root loader** (`src/routes/__root.tsx`) awaits both `getSession()` and,
when a session exists, `getOrgs()`, exposing `{ username, orgs }` to the layout.
The persisted scope is read from the `piper_scope` cookie on the client (see
below) rather than the loader, so switching scope never re-runs the loader.

## Active scope: context + persistence

A small React context provides scope to both the header switcher and the home
view, which live on opposite sides of the `<Outlet/>`:

- `OrgScopeProvider` wraps `Header` and `Outlet` in `RootLayout`. It holds
  `scope: string` (`"personal"` or an org slug), `setScope(next)`, and the
  `orgs` list. Initial `scope` is read once from the `piper_scope` cookie
  (`document.cookie`), defaulting to `"personal"`; unknown slugs (e.g. an org
  the caller just left) fall back to `"personal"`.
- `setScope` writes `piper_scope` via `document.cookie` (host-only, `Path=/`,
  `SameSite=Lax`) so the choice survives reloads, then updates state.
- `useOrgScope()` hook exposes `{ scope, setScope, orgs }`.

## Components

**Switcher** — new `src/components/org-switcher.tsx`, rendered in `Header`
alongside `SessionControls` (only when a session exists):

- A button showing the active scope label ("Personal" or the org slug) that
  opens a menu: "Personal", then each org with a small role hint
  (`owner`/`member`), then a "Create org…" action.
- Selecting an entry calls `setScope`.
- "Create org…" reveals an inline single-field form (org name). Submit calls
  `createOrgFn`; on success the new org is appended to the list and made the
  active scope; on failure the relay's message renders inline in the form.
  After a successful create, the router is invalidated so `getOrgs` refetches
  and the switcher reflects server truth.

**Home** — `src/components/apps-home.tsx` consumes `useOrgScope()` and filters
`boxes` before rendering:

- personal: `boxes.filter(b => b.owner === username)`.
- org `s`: `boxes.filter(b => b.owner === s)`.
- Header counts ("N boxes · N online", "N apps live") derive from the filtered
  list.
- Empty state is scope-aware: personal keeps today's copy; an empty org reads
  "No boxes in this org yet — enroll one with `piper enroll --org <slug>`"
  (enrollment stays CLI).

`AppsHome` needs `username` to compute the personal filter; it is already
available from the root session and is passed down (via the scope context or a
prop) — the exact wiring is an implementation detail for the plan.

## Routes unchanged

`/boxes/$base` and the app/deploy/domain routes stay flat; `$base` is globally
unique and the relay authorizes each box on its own. Box detail
(`src/components/box-detail.tsx`) shows the owning slug as a small badge so
context is preserved when deep-linking across scopes. (A read-only badge only;
no behavior change.)

## Error handling

- `getOrgs`: `RelayAuthError` → drop session + redirect to `/login` (mirrors
  `getApps`); other errors bubble to the existing `RelayError` boundary.
- `createOrgFn`: `RelayAuthError` → drop session; other errors surface inline in
  the create form (name required / name collision come back as relay body text).
- Logged out (no `piper_session`): no switcher renders, exactly like today's
  header with a null username.

## Testing (TDD, component-level)

Failing-test-first, one seam at a time; no tests in `src/routes/`:

- **`src/server/relay.test.ts`**: `/agents` rows parse `owner`; `fetchOrgs`
  maps the payload and raises `RelayAuthError` on 401; `createOrg` maps
  `{org,role}` and throws the relay message on a non-ok (collision) response.
- **`src/components/org-switcher.test.tsx`**: renders "Personal" + orgs with
  role hints; selecting an org calls `setScope`; "Create org…" submits the name,
  calls the create fn, adds the org, and makes it active; a failed create shows
  the message.
- **`src/components/apps-home.test.tsx`**: with an org active, only that org's
  boxes render and the counts follow; with Personal active, org boxes are hidden;
  empty-org state shows the enroll hint.

## Acceptance criteria (from #25)

- [ ] With the switcher on an org, the home view shows that org's boxes/apps
  identically to personal ones; on Personal, only personal boxes.
- [ ] Creating an org from the dashboard works and the new org appears in the
  switcher.

## Non-goals (later slices)

- Members / roles / invite management — slice B ([#26](https://github.com/getpiper/dashboard/issues/26)).
- Invite inbox (pending invites, accept/decline) — slice C ([#27](https://github.com/getpiper/dashboard/issues/27)).
- Enrolling a box into an org (CLI/relay: `POST /v1/enroll {org}`).
- Org rename / delete (delete lands in slice B's owner controls).
- URL-addressable per-org views.
