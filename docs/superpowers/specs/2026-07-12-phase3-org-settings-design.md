# Phase 3 slice B — org settings: members, roles, invites

Issue: getpiper/dashboard#26 (part of #9 — organizations). Depends on slice A
(#25) for the org context + switcher.

## Goal

The management surface for an org, reached from the org switcher. Owners
invite/revoke, promote/demote, remove members, and delete the org; members see
a read-only roster and can leave. The UI respects the relay's guardrails.

## Relay surface (all under the account bearer)

Exact contracts from `getpiper/piper` `internal/relay/orgs_api.go`:

- `GET /v1/orgs/{slug}/members` → `{members: [{username, role}]}`. 404 for
  non-members/unknown org (existence never leaks).
- `PUT /v1/orgs/{slug}/members/{username}` `{role}` — owner-only (403
  otherwise). 400 bad role; 409 `an org must keep at least one owner`; 404 not
  a member. 200 `{username, role}`.
- `DELETE /v1/orgs/{slug}/members/{username}` — owner removes anyone; a plain
  member may only remove themselves (403 otherwise). 409 last-owner; 404 not a
  member. 200 `{removed}`. Serves both "remove member" and "leave".
- `POST /v1/orgs/{slug}/invites` `{github_username}` — owner-only. 400 empty;
  409 `already a member`. 200 `{invited}`.
- `GET /v1/orgs/{slug}/invites` — owner-only (403 for members). 200
  `{invites: string[]}` (github logins, lowercased).
- `DELETE /v1/orgs/{slug}/invites/{login}` — owner-only. 404 no such invite.
  200 `{revoked}`.
- `DELETE /v1/orgs/{slug}` — owner-only. 409 `org still owns agents`. 200
  `{deleted}`.

401 → `RelayAuthError` everywhere, consistent with the rest of `relay.ts`.

## Architecture

Three layers, mirroring the domain slice.

### 1. Relay layer (`src/server/relay.ts`)

New type and seven fetch wrappers. Each maps status → error and surfaces the
server's plaintext body as `error.message` (the existing `msg || fallback`
pattern) so 409s carry a readable message the UI can display verbatim.

```ts
export type OrgMember = { username: string; role: "owner" | "member" };

fetchOrgMembers(cred, slug): Promise<OrgMember[]>
fetchOrgInvites(cred, slug): Promise<string[]>          // owner-only; 403 for members
inviteOrgMember(cred, slug, githubUsername): Promise<void>
revokeOrgInvite(cred, slug, login): Promise<void>
setOrgMemberRole(cred, slug, username, role): Promise<void>
removeOrgMember(cred, slug, username): Promise<void>     // also serves "leave" (remove self)
deleteOrg(cred, slug): Promise<void>
```

Path segments are `encodeURIComponent`-wrapped like the app fns.

### 2. Server fns (`src/server/fns.ts`)

One `createServerFn` per relay fn: read `piper_session`, redirect to `/login`
when absent, call the relay fn, map `RelayAuthError` → `dropSessionAndRedirect()`.
Matches the existing wrappers exactly.

### 3. Route (`src/routes/orgs/$slug.settings.tsx`) — thin

Loader:

1. `getSession()` for the caller's username.
2. `getOrgMembers({ slug })`. Reaching this proves membership (relay 404s
   non-members → `RelayError`).
3. Derive the caller's role:
   `members.find(m => m.username === session.username)?.role ?? "member"`
   (default `"member"` safely hides owner controls).
4. If owner → `getOrgInvites({ slug })`, else `[]`.

Component wires callbacks to server fns + `router.invalidate()`. **Leave** and
**delete** additionally reset the scope cookie to `personal` and navigate to
`/` (the caller no longer belongs to / the org no longer exists).
`errorComponent: RelayError`.

### 4. Component (`src/components/org-settings.tsx`) — pure

Props: `slug`, `role`, `username`, `members`, `invites`, and async callbacks
`onInvite`, `onRevokeInvite`, `onSetRole`, `onRemoveMember`, `onLeave`,
`onDelete`.

Sections:

- **Members** — roster table (username + role); the caller's own row is marked
  "you". *Owner only:* each other member gets a promote/demote toggle and a
  Remove button.
- **Invites** *(owner only)* — a GitHub-username input + Invite button; the
  pending list, each row with Revoke.
- **Danger zone** — Leave org (all members); Delete org (owner only,
  type-the-slug-to-confirm like `domain-panel`, surfaces the 409 message).

Errors are caught per action and rendered inline; redirects are re-thrown
(`isRedirect`), matching `domain-panel`.

### 5. Switcher entry (`src/components/org-switcher.tsx`)

Each org row gains a gear `Link` to `/orgs/$slug/settings`. Clicking the row
still switches scope; clicking the gear navigates. The gear shows for every org
(members reach a read-only view).

## Guardrails in the UI

- **Non-owner:** read-only roster + Leave only — no invite form, no invites
  list, no promote/demote/remove-others, no delete.
- **Last owner:** proactively disable demote/remove on the sole remaining owner
  and disable the caller's own Leave; *also* surface any 409 message the relay
  returns (belt-and-suspenders — the relay is the source of truth).
- All relay error messages ("already a member", "an org must keep at least one
  owner", "org still owns agents") render inline next to the triggering action.

## Testing (test-first)

- `org-settings.test.tsx`
  - Owner: promote/demote/remove/invite/revoke fire the callbacks with correct
    args; delete gated behind typing the exact slug.
  - Member: read-only roster (no owner controls, no invites section) + Leave.
  - Sole-owner Leave is disabled; demote/remove disabled on the last owner.
  - 409 messages render (`already a member`, `at least one owner`,
    `org still owns agents`).
- `org-switcher.test.tsx` — a gear per org links to `/orgs/$slug/settings`.
- `relay.test.ts` — new fns map success and 409/403/404 → messages.

## Out of scope (YAGNI)

- The invitee side (`GET /v1/invites`, accept/decline) — a separate surface,
  tracked elsewhere.
- Optimistic UI — changes reflect on refetch (`router.invalidate()`), per the
  acceptance criteria.
