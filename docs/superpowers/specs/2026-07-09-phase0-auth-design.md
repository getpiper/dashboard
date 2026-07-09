# Phase 0 — GitHub login + session shim: design

Design for [#7]: a browser logs into the dashboard via the relay's GitHub
authorization-code flow, the credential lives in an httpOnly cookie, and the
logged-in home lists the account's boxes. Both piper-side dependencies are
merged: piper#99 (GitHub identity, PR 105) and piper#98 (list boxes, PR 107).

## Relay contract (what we consume)

- **Web login**: browser → `GET {relay}/v1/login/web?redirect_uri=…`
  (`redirect_uri` must prefix-match the relay's `PIPER_RELAY_WEB_REDIRECTS`
  allowlist; `http://` prefixes are accepted, so local dev works) → GitHub →
  relay callback → 302 to `{redirect_uri}#credential=<cred>&username=<name>`.
  The credential arrives in the URL **fragment**: it never appears in any
  request line, so no server, proxy, or log between GitHub and the browser
  sees it.
- **Box list**: `GET {relay}/agents` with `Authorization: Bearer <credential>`
  → `[{"agent": "<base-domain>", "connected": <bool>}]`. 401 on
  missing/unknown/disabled credential; empty (non-null) array when the
  account has no boxes.

## Decisions (settled during brainstorming)

1. **Transient fragment handoff.** The epic's "credential never reaches
   browser JS" cannot be literal — a fragment is readable *only* by page JS;
   that is why the relay uses one (keeps the long-lived credential out of
   every server/proxy/CDN log, including self-hosted deployments we can't
   audit). Resolution: the callback page reads `location.hash` exactly once,
   POSTs the credential to a dashboard server route that sets the httpOnly
   cookie, and scrubs the hash. The criterion is met as "never *persisted*
   where JS can read it".
2. **Raw credential in the cookie.** `piper_session=<credential>`,
   `HttpOnly; Secure; SameSite=Lax`. No encryption wrapper: it would add a
   mandatory server secret for every self-hoster while defending against no
   coherent threat (the CLI already stores the same credential in a plaintext
   config file). The dashboard stays a stateless shim — no session store.
3. **Per-endpoint server layer, no generic proxy.** Each relay endpoint the
   UI needs gets a small typed server function/route. The browser session can
   only reach relay surface deliberately exposed; loaders get SSR and types.
   A catch-all `/api/relay/*` proxy is speculative generality — Phase 0 needs
   exactly one data endpoint.
4. **Show the connected indicator now.** `/agents` already returns
   `connected`; hiding it would ship a page that suppresses what it knows.
   A minimal badge in Phase 0; Phase 1 (#3) designs real liveness UI.
5. **No hardcoded relay URL.** Single server-side env var `PIPER_RELAY_URL`,
   no default in code (acceptance criterion bans hardcoded `getpiper.co`;
   the hosted default lives in deploy config). Missing → throw with an
   explicit message at first server use.

## Routes & flow

Pages (`src/routes/`):

- `/login` — public. Centered card, piper wordmark, one "Continue with
  GitHub" button linking to the dashboard's own `GET /api/auth/login`.
- `/auth/callback` — transient handoff. On mount: parse
  `#credential=…&username=…`, POST to `/api/auth/session`, scrub the hash via
  `history.replaceState`, navigate to `/`. Missing/malformed fragment → error
  state with a "Back to login" link (no cookie set).
- `/` — protected home. Loader calls the `getBoxes` server function; no
  session → redirect `/login`.

Server routes:

- `GET /api/auth/login` — 302 to
  `{PIPER_RELAY_URL}/v1/login/web?redirect_uri={origin}/auth/callback`.
  Origin derives from the incoming request (piper's tunnel preserves `Host`).
  The browser never learns the relay address from us.
- `POST /api/auth/session` — body `{credential, username}`. Sets two
  `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30 days)
  cookies: `piper_session` (credential) and `piper_username` (display name).
  400 on empty credential.
- `POST /api/auth/logout` — clears both cookies.

Server function:

- `getBoxes` (home loader) — reads `piper_session` (and `piper_username` for
  display); missing session → redirect `/login`; calls
  `GET {PIPER_RELAY_URL}/agents` with `Bearer`; returns
  `{username, boxes: [{agent, connected}]}`. SSR'd on first load.

Login sequence: `/` (no cookie) → `/login` → `/api/auth/login` → relay
`/v1/login/web` → GitHub → relay callback → `/auth/callback#…` → POST
`/api/auth/session` → `/` renders boxes.

## UI

Home: existing `Header` gains the username and a "Log out" button (POST
`/api/auth/logout`, then navigate to `/login`). Body: one row per box — base
domain plus a connected/offline badge (green dot "Connected", gray
"Offline"). Empty state: "No boxes yet" pointing at `piper connect`.
Tier-agnostic (roadmap principle 3): a box is a box.

## Error handling

- Callback fragment missing/invalid → error state on the callback page.
- `POST /api/auth/session` without a credential → 400; page shows the error.
- Relay 401 on `/agents` (revoked/garbage credential) → clear cookies,
  redirect `/login`. Doubles as the logout-everywhere path.
- Relay unreachable / 5xx → route error boundary: "Couldn't reach the relay"
  + retry. Cookies stay — the session isn't invalid, the relay is down.
- `PIPER_RELAY_URL` unset → throw with an explicit config-error message.

## Testing (test-first)

Logic lives in `src/server/` with colocated tests; route files stay thin
wrappers (tests never in `src/routes/`).

- `src/server/auth.ts` — cookie set/clear/parse helpers; session + logout
  handlers as plain `Request → Response` functions. Tests: cookie attributes
  (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`), 400 on empty credential,
  logout clears both cookies.
- `src/server/relay.ts` — the `/agents` call. Tests (mocked `fetch`): 200
  maps to the typed list, 401 clears cookies + redirects, 5xx throws, missing
  `PIPER_RELAY_URL` throws.
- Component tests (happy-dom + Testing Library): login renders the GitHub
  link; callback parses fragment → POSTs → scrubs hash → navigates (mocked
  fetch/history); home renders boxes with badges and the empty state.
- Manual e2e: local relay with `PIPER_RELAY_FAKE_APPROVE=1` and
  `PIPER_RELAY_WEB_REDIRECTS=http://localhost:3000/` — login → box list →
  session survives reload → logout.

## Acceptance criteria (from #7)

- [ ] Log in with GitHub, session survives reload, log out works.
- [ ] Credential never persisted where browser JS can read it (httpOnly
      cookie; relay calls proxied server-side; fragment scrubbed after the
      one-time handoff).
- [ ] Box list renders from the relay endpoint.
- [ ] Relay URL comes from config/env — no hardcoded `getpiper.co` anywhere
      in the app.

[#7]: https://github.com/getpiper/dashboard/issues/7
