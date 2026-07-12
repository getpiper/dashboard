# Phase 3 slice C — invite inbox: pending invites, accept/decline

Issue: getpiper/dashboard#27 (part of #9 — organizations). Depends on slice A
(#25) for the org context + switcher; complements slice B (#26), which sends
the invites.

## Goal

The invitee side that closes the join loop. A user with a pending org invite
sees it in the org switcher and can accept or decline. Accepting joins the org
(it then appears in `GET /v1/orgs`) and auto-switches scope to it; declining
drops the invite. Invite-before-first-login already works relay-side (matched
on GitHub login at sign-in) — the dashboard just reads `GET /v1/invites`.

## Relay surface (account bearer)

Exact contracts from `getpiper/piper` `internal/relay/orgs_api.go`:

- `GET /v1/invites` → 200 `{invites: [{org}]}` — the caller's pending invites.
  Empty list when none.
- `POST /v1/invites/{slug}/accept` → 200 `{accepted: slug}`. 404 (`ErrNoInvite`)
  when the invite is gone (already consumed/revoked).
- `POST /v1/invites/{slug}/decline` → 200 `{declined: slug}`. 404 when gone.

401 → `RelayAuthError` everywhere, consistent with the rest of `relay.ts`.

## Architecture

Three layers, mirroring the slice-A/B pattern.

### 1. Relay layer (`src/server/relay.ts`)

Three fetch wrappers:

```ts
fetchInvites(cred): Promise<string[]>       // GET /v1/invites → unwrap {invites:[{org}]} to slugs
acceptInvite(cred, slug): Promise<void>      // POST /v1/invites/{slug}/accept
declineInvite(cred, slug): Promise<void>     // POST /v1/invites/{slug}/decline
```

- `fetchInvites` unwraps `{invites: {org: string}[]}` to `string[]` (the org
  slugs), matching how `fetchOrgs` maps `{org, role}` down to `{slug, role}`.
- `acceptInvite`/`declineInvite` treat a **404 as a clean error** — surface a
  readable `"invite no longer available"` message (the invite was consumed or
  revoked between load and click) rather than a raw status. Non-ok/non-404 fall
  back to the existing `msg || fallback` pattern.
- All three map 401 → `RelayAuthError`. Path slug is `encodeURIComponent`-wrapped.

### 2. Server fns (`src/server/fns.ts`)

One `createServerFn` per relay fn, copying the `getOrgs` / `createOrgFn`
pattern verbatim: read `piper_session`, redirect to `/login` when absent, call
the relay fn, map `RelayAuthError` → `dropSessionAndRedirect()`.

```ts
getInvites            // GET,  no args
acceptInviteFn        // POST, validator (slug: string)
declineInviteFn       // POST, validator (slug: string)
```

### 3. Data flow (`__root.tsx` → `OrgScopeProvider` → context)

The root loader already returns `{ ...session, orgs }`. Add
`invites: await getInvites()` so invites load with the session on every
navigation (no polling — the acceptance criteria only need refresh-on-refetch).

Thread `invites` through `OrgScopeProvider` into the `OrgScope` context
alongside `orgs`, so `HeaderSwitcher` reads it the same way it reads `orgs`.
`OrgScopeProvider` treats `invites` as pass-through display data (the
scope-validation effect keys off `orgs`, not `invites`).

### 4. Switcher (`src/components/org-switcher.tsx`)

Two new props: `invites: string[]` and async `onAccept(slug)` / `onDecline(slug)`.

- **Badge** — when `invites.length > 0`, a small count badge on the switcher
  button (styled with existing tokens).
- **Pending invites section** — rendered at the top of the open dropdown, above
  Personal. Each invite row shows the org slug with **Accept** and **Decline**
  buttons. Per-invite busy state disables both buttons while a call is in
  flight; on error, an inline `role="alert"` message (matching the create-org
  form's error rendering). No section when `invites` is empty.

`HeaderSwitcher` wires the callbacks:

- `onAccept(slug)` → `await acceptInviteFn({ data: slug })`, then
  `setScope(slug)` (auto-switch) + `router.invalidate()` (the org now appears in
  `orgs`, the invite drops from `invites`).
- `onDecline(slug)` → `await declineInviteFn({ data: slug })`, then
  `router.invalidate()`.

Errors thrown by the fns propagate to the switcher's inline alert; the switcher
does not close the menu on error so the user sees the message.

## Testing (test-first)

- `relay.test.ts` — the three new wrappers:
  - `fetchInvites` unwraps `{invites:[{org}]}` to slugs; empty list stays empty.
  - `acceptInvite`/`declineInvite` resolve on 200; **404 → error** with the
    "no longer available" message; 401 → `RelayAuthError`.
- `org-switcher.test.tsx` — extend the existing suite:
  - Badge shows the pending count; absent when `invites` is empty.
  - The pending section lists each invite slug.
  - Accept / Decline invoke `onAccept` / `onDecline` with the slug.
  - No pending section renders when `invites` is `[]`.

Server fns are un-unit-tested by convention (they need cookie context); their
behaviour is covered by the relay-layer tests plus the switcher wiring.

## Out of scope (YAGNI)

- Notifications / polling / real-time badge — invites refresh on navigation via
  the root loader.
- Invite-before-first-login handling — already resolved relay-side at sign-in;
  the dashboard only reads `GET /v1/invites`.
- Optimistic UI — changes reflect on `router.invalidate()`, per the acceptance
  criteria.
