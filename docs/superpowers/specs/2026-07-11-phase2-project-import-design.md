# Phase 2 slice D — project import (repo → live URL) (design)

Fourth slice of Phase 2 ([#8](https://github.com/getpiper/dashboard/issues/8)),
tracked as [#20](https://github.com/getpiper/dashboard/issues/20). Phase 2 is an
epic of four independent subsystems — deploy history + logs (slice A, shipped),
app lifecycle, BYO custom domains, and this one, project import — each shipping
as its own spec → plan → PR.

This is the headline Phase 2 flow: take a user from a GitHub repo to a live URL
entirely in the dashboard, wrapping the same steps the CLI's `github setup` +
`app link` already perform. It builds on the read-only box view (Phase 1,
[#3](https://github.com/getpiper/dashboard/issues/3)) and the app-detail page
(slice A), which already surface an app's deploy history and live URL.

## Goal

From the box view, a user clicks **New project**, connects GitHub (once per
box), creates and links an app to a repo, pushes, and lands on the app page
where the deploy appears and the live URL is shown — without touching the CLI.

Acceptance criterion (from #20):
- A repo can be taken to a live URL from the dashboard without touching the CLI.

## The control path (verified against `getpiper/piper`)

Everything rides the relay's control proxy (`internal/relay/proxy.go`), which
forwards any `/agents/{base}/v1/*` to the box over the tunnel, authenticated
with the account bearer already in the `piper_session` cookie. The relay
authorizes account→agent ownership and swaps in the box's control token; the
dashboard never sees the box token. Same plumbing every prior slice used — **no
new piper endpoint is required for the core flow.**

The two CLI commands this slice replaces map to these box endpoints (all reached
through the proxy):

| CLI step | Request(s) | Response |
| --- | --- | --- |
| `github setup` — mint App manifest | `POST {relay}/agents/{base}/v1/github/manifest` body `{"redirect_url": "…"}` | `200 {"manifest": "<json>"}` |
| `github setup` — exchange redirect code | `POST {relay}/agents/{base}/v1/github/exchange` body `{"code": "…"}` | `204` (box stores App creds) |
| `app link` — create the app | `POST {relay}/agents/{base}/v1/apps` body `{"name": "…", "port": 8080}` | `201`; `409` if the app already exists; `400` if name is `hooks` (reserved) |
| `app link` — link repo/branch | `POST {relay}/agents/{base}/v1/apps/{name}/link` body `{"repo": "owner/name", "branch": "main"}` | `204`; `404` if app unknown |

Key facts that shape the design:

- **`link` does not deploy.** It only records repo/branch on the box
  (`UpdateAppRepo`). A deploy fires when the user pushes to the tracked branch →
  the installed GitHub App sends a webhook → the box builds and runs → the
  deployment shows up in slice A's history. The **git push is a plain developer
  action** the dashboard cannot perform; the dashboard's job is the two guided
  flows plus surfacing the result.
- **`github setup` is per box, not per user.** The App creds are stored on the
  box (`SaveGitHubApp`). The issue's "one-time per-user" is per-box in practice.
- **No status endpoint exists** to ask whether a box already has a GitHub App —
  only the two POSTs. So the dashboard cannot detect "already connected"; step 1
  is offered as a **skippable** step (see follow-ups).
- The manifest embeds `redirect_url`, and the box builds it as
  `github.BuildManifest("piper-"+baseDomain, "https://hooks."+baseDomain, redirectURL)`.
  The port defaults to `8080` on the box when `0`/omitted; each app runs in its
  own container network namespace, so the shared default is fine.

## The GitHub App manifest flow leaves the dashboard

This is the one non-obvious mechanic and it drives the whole UI shape. The
GitHub App manifest flow is a **top-level browser navigation**, not a `fetch`:

1. The browser POSTs a `<form>` (hidden `manifest` field) to
   `https://github.com/settings/apps/new` (or the org variant,
   `…/organizations/{org}/settings/apps/new`).
2. GitHub creates the App and **redirects the browser** to the manifest's
   `redirect_url` with `?code=<temporary>` appended.
3. The dashboard reads `code` and calls the exchange endpoint.

This is exactly what the CLI does with its loopback form server
(`cmd/piper/main.go` `githubSetup`); the dashboard has a real browser UI, so it
renders the auto-submitting form itself. Because the browser **leaves the
dashboard and comes back**, any in-memory wizard state is destroyed. Therefore
the import flow must be a **dedicated route** the callback can land back on — not
an ephemeral modal.

GitHub's redirect happens in the *user's browser*, so a `localhost:3000`
`redirect_url` works in dev (the CLI relies on the same fact with `127.0.0.1`);
in production the dashboard is public behind the tunnel.

## Views

### Import wizard — `/boxes/$base/import`

A dedicated route with a 3-step wizard. The current step and the GitHub
round-trip are reflected in the URL so the flow survives the navigation to
GitHub and back. The box `base` is in the path, so no state param is needed to
carry it across the round-trip.

**Step 1 — Connect GitHub** (skippable)
- A **"Skip — already connected"** control advances to step 2 immediately
  (needed because no status endpoint exists to detect prior setup).
- Otherwise: an optional **org** field (blank = personal account) and a
  **Connect GitHub** button. On click, the component calls `getGithubManifest`
  ({ base, redirectUrl }) where `redirectUrl = ${origin}/boxes/{base}/import`,
  then renders a hidden auto-submitting `<form method="post" action="…">` with
  the manifest in a hidden input and submits it. The **org** is used only here,
  in the browser, to choose the form's `action` (personal vs. org variant) — it
  is not sent to the box.
- On return, the route **loader** sees `?code=…`, calls `exchangeGithub`
  ({ base, code }), scrubs the param from the URL, and the wizard resumes at
  step 2. An exchange failure (`502` from the box) renders an inline error with
  a retry, not a redirect.
- After connecting, step 1 shows **"Install the Piper App on your repo"**
  guidance with a link to GitHub's installed-apps settings
  (`https://github.com/settings/installations`). The exchange returns `204`
  (no app slug), so a deep link to the specific app's install page is not
  possible today — folded into the piper follow-up (below).

**Step 2 — Create & link app**
All form entry lives here, *after* the GitHub round-trip, so nothing typed is
ever lost when the browser leaves for GitHub.
- Fields: **app name** (required; the box rejects `hooks`), **repo**
  (`owner/name`, required), **branch** (default `main`), and an optional
  **port** (advanced; box defaults `8080`).
- Submit calls `createAndLinkApp` ({ base, name, port?, repo, branch }). On
  success, advances to step 3.
- Validation/error surfacing: a `400 name reserved`, a link `404`, or a box
  `502` renders inline next to the form.

**Step 3 — Push & go live**
- Plain-language instructions: push to the tracked branch (`git push origin
  {branch}`); the installed App's webhook triggers the build.
- A prominent link to the **app page** `/boxes/{base}/apps/{name}`, where slice
  A's deploy history and the `mockAppUrl` live URL already render the result.
  No new URL-surfacing code — the app page is the destination.

### Box view change — `components/box-detail.tsx`

Add a **New project** button/link to `/boxes/{base}/import` in the box header.
No other change.

## Components & data flow

### Data layer — `src/server/relay.ts`

Four new functions, each hitting the relay proxy and reusing the existing
`RelayAuthError` (401) and `BoxOfflineError` (502/503) handling;
`encodeURIComponent` on `base` and `name`:

- `githubManifest(credential, base, redirectUrl): Promise<string>` →
  `POST /agents/{base}/v1/github/manifest` body `{ redirect_url }`. Returns the
  `manifest` string from the `200` body. (The **org** does not go to the box —
  it only selects GitHub's form `action` URL in the browser — so it is *not* a
  parameter here.)
- `exchangeGithub(credential, base, code): Promise<void>` →
  `POST /agents/{base}/v1/github/exchange` body `{ code }`. Expects `204`; a
  `502` (box → GitHub exchange failed) surfaces as a plain error.
- `createApp(credential, base, name, port): Promise<void>` →
  `POST /agents/{base}/v1/apps` body `{ name, port }`. `201` → ok. **`409` app
  exists is tolerated** (resolves as success so re-runs and pre-existing apps
  proceed to link). Other non-2xx → plain error carrying the box's message.
- `linkApp(credential, base, name, repo, branch): Promise<void>` →
  `POST /agents/{base}/v1/apps/{name}/link` body `{ repo, branch }`. Expects
  `204`; `404` → plain error ("unknown app").

### Server fns — `src/server/fns.ts`

All `createServerFn({ method: "POST" })` with a `.validator`, reading
`piper_session` (redirect `/login` if absent), and the existing
`RelayAuthError → dropSessionAndRedirect` handling:

- `getGithubManifest` — validator `{ base: string; redirectUrl: string }` →
  `githubManifest`, returns the manifest string.
- `exchangeGithub` — validator `{ base: string; code: string }` →
  `exchangeGithub`.
- `createAndLinkApp` — validator `{ base, name, repo, branch, port? }` → calls
  `createApp` (tolerating 409) then `linkApp`, so the two box calls are one
  round-trip from the client and always ordered create-before-link.

### Routing — `src/routes/`

- New `boxes/$base_.import.tsx` (the `$base_` escape keeps it a sibling of
  `boxes/$base.tsx`, matching how `boxes/$base_.apps.$app.tsx` is laid out). The
  route reads `?code` from search params in its `loader`: if present, it calls
  `exchangeGithub` and then renders the wizard at step 2; otherwise it renders
  the wizard at step 1. `errorComponent` reuses `RelayError`.

### UI components — `src/components/`

- New `import-wizard.tsx`: the 3-step wizard described above. Step state is
  local (`useState`), seeded by whether the loader performed an exchange. The
  GitHub form submit uses a hidden `<form ref>` auto-submitted on click. Reuses
  existing button/input styles from the shadcn setup.
- `box-detail.tsx`: add the **New project** link.

## Mutations in this stack

No prior slice performs writes — all server fns so far are reads. This slice
introduces the first control-plane writes. They stay simple: server fns with
`{ method: "POST" }` called from client handlers, followed by
`router.invalidate()` / `router.navigate()` to move between steps and to reach
the app page. No react-query, no optimistic UI, no mutation cache — consistent
with the rest of the dashboard.

## Testing (TDD, component-level)

Every unit starts with a failing test. Tests live outside `src/routes/` (the
file router scans it). `bun run verify` (Biome → tsc → tests → build) must pass
before the work is claimed done.

- `relay.test.ts`:
  - `githubManifest` posts `{ redirect_url }` and returns the `manifest` string;
    `401` → `RelayAuthError`; `502`/`503` → `BoxOfflineError`.
  - `exchangeGithub` posts `{ code }`, resolves on `204`; `502` → error.
  - `createApp` resolves on `201` **and on `409`** (tolerance); a `400` →
    error carrying the message.
  - `linkApp` posts `{ repo, branch }`, resolves on `204`; `404` → error.
- `import-wizard.test.tsx`:
  - Step 1 → clicking **Skip** advances to step 2.
  - Step 1 → **Connect GitHub** fetches the manifest and submits a form whose
    `action` targets `github.com/settings/apps/new` (and the org variant when an
    org is entered).
  - Seeding the wizard as "just exchanged" starts it at step 2 (the loader→step
    handoff).
  - Step 2 → submitting name/repo/branch calls `createAndLinkApp` and advances
    to step 3; a reserved-name / link error renders inline.
  - Step 3 → renders push instructions and a link to `/boxes/{base}/apps/{name}`.
- `box-detail.test.tsx`: the **New project** link points to
  `/boxes/{base}/import`.

## Out of scope / follow-ups

- **The git push itself** — a developer action from their machine, outside the
  dashboard by nature. The wizard instructs it and surfaces the resulting deploy
  via the existing app page.
- **Real live URL** — still cosmetically blocked on
  [piper#137](https://github.com/getpiper/piper/issues/137); `mockAppUrl` (from
  slice A) stands in.
- **New piper follow-up issue** to file: (a) a `GET /v1/github` status endpoint
  so step 1 can be *gated* instead of merely skippable, and (b) returning the
  App slug / `html_url` from `POST /v1/github/exchange` so step 1 can deep-link
  to the specific App's install page. Both are niceties; neither blocks this
  slice.
- App lifecycle (stop/delete) and BYO domains — the other two open Phase 2
  slices.
