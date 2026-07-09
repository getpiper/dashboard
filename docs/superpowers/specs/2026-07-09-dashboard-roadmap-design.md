# Piper dashboard roadmap — design

Date: 2026-07-09. Scopes the hosted dashboard product end-to-end: the phases,
the free/paid tier model, and the piper-side (relay/agent) work each phase
depends on. Parent scope: [piper#76](https://github.com/getpiper/piper/issues/76)
(child of epic [piper#49](https://github.com/getpiper/piper/issues/49)).

This document is the map. Each phase gets its own brainstorm → spec → plan
cycle when picked up; nothing below is an implementation spec.

## Tier model

- **Free = bring your own box.** Users run piperd on their own hardware
  (Pi, VPS, laptop), enroll on the hosted relay, and get free
  `<hash>-<username>.public.getpiper.co` domains. The full feature set —
  dashboard, orgs, BYO custom domains, git deploys — is free.
- **Paid = managed hosting only.** getpiper runs the box for you. Nothing
  else is ever paywalled.
- **The relay is always production-grade**, for every tier. There is no
  "better relay" upsell.

## Principles

1. **Same surface as the CLI.** The dashboard only consumes the
   authenticated relay control surface the CLI uses. Every new capability
   lands as a piper-side API first (issue in piper), then dashboard UI
   (issue here). No privileged back doors; nothing requires a closed or
   forked relay.
2. **Stateless dashboard, no separate backend.** TanStack Start's server
   layer is a thin shim: it holds the account credential in an httpOnly
   session cookie and proxies to `api.public.getpiper.co`. Every fact and
   every enforcement decision (auth, authz, orgs, entitlements) lives in
   the relay. A standalone dashboard backend with its own state is the
   back door principle 1 forbids — if dashboard-only state ever appears
   (saved views, UI prefs), prefer a relay-side table or client storage.
3. **Tier-agnostic UI.** A managed (paid) box and a BYO (free) box look
   identical in the dashboard. The only paid-aware surfaces are box
   provisioning and billing.
4. **GitHub is the identity.** Relay accounts move from Google to GitHub
   OAuth (device flow for the CLI, authorization-code flow for the
   browser). One getpiper-owned OAuth app covers both. This is distinct
   from the per-user GitHub App used for git deploys, whose keys never
   leave the user's box.
5. **Each phase ships something usable** and maps to one GitHub milestone
   with an epic issue; child issues are filed when the phase is picked up.

## Phases

### Phase 0 — Web auth & account surface

The gate for everything. Mostly piper-side:

- `[relay]` Switch relay identity from Google to GitHub OAuth: device flow
  for `piper login`, authorization-code flow for the browser. Same account
  credential either way. Cheap now (pre-release, no real accounts to
  migrate); a migration project later.
- `[relay]` "List my boxes" endpoint — the relay can answer liveness for a
  known base domain but nothing enumerates an account's enrolled agents,
  and the dashboard home page needs exactly that.
- `[app]` Session shim: login page → GitHub authorization-code flow →
  account credential in an httpOnly cookie → server-side proxy to the
  relay API.

Ships: you can log into the dashboard with GitHub and see an (empty) box
list.

### Phase 1 — Read-only dashboard

Existing issue [#3](https://github.com/getpiper/dashboard/issues/3) lives
here; piper#76's acceptance criteria are this phase's definition of done.

- Box list with up/down liveness (`GET /agents/<base>`).
- Per-box app list with deploy status (`building` / `running` / `failed` /
  `stopped`), public URL, last-deploy info (`GET .../v1/apps`).
- `[agent]`/`[relay]` dep: surface the relay-assigned public host in the
  apps API (already a tracked gap in piper's PROGRESS.md).

Ships: a free-tier user with a connected Pi watches their boxes and apps
from a browser.

### Phase 2 — Project management

First write operations. All ride the existing remote control path
(relay → tunnel → box) that `create`, `deploy`, `app link`, and
`github setup` already traverse for the CLI.

- **Import a project:** guided flow wrapping `github setup` (one-time
  per-user GitHub App creation) + `app link` — connect repo → git push →
  live URL.
- **App lifecycle:** create, deploy/redeploy, delete (confirm by typing
  the app name — destructive and remote).
- **Deploy history + logs:** per-app past deployments and build/deploy
  logs. `[agent]` dep: a logs endpoint — nothing exposes build output over
  the API today, and a dashboard without logs when a build fails is a
  dead end. The largest piper dependency of this phase.
- **PR previews:** surface `pr-<N>-<app>.<base>` URLs on the app page.
- **BYO custom domains (free):** guided setup — DNS records to create,
  cert issuance status. `[agent]` dep: a domain-config API on piperd
  (today BYO domain is env vars on the box).
- `[agent]` dep to verify: delete/stop endpoints beyond create/deploy/list.

### Phase 3 — Organizations (free)

- `[relay]` The bulk: org model in the relay — orgs, membership, roles
  (owner/member only to start), boxes/apps ownable by an org; the
  caller→agent authz map extends to "caller is a member of the owning
  org". Warrants its own piper design doc.
- Invites are by GitHub username — unambiguous, since accounts are GitHub
  identities after Phase 0. Auto-mirroring GitHub org membership is a
  later nicety, not Phase 3 scope.
- `[app]` Org switcher, org settings (members, invites), all Phase 1–2
  views scoped to the active org.
- CLI parity stays cheap: the org model lives in the control surface, so
  `piper --org` can follow — the dashboard never becomes the only way to
  use orgs.

Phases 2 and 3 are swappable; project management goes first because a
single-user dashboard that can deploy beats a multi-user one that can only
watch.

### Phase 4 — Paid tier: managed hosting + billing (deferred)

Deliberately blurred. Ships much later; nothing here is committed beyond
the tier model. When picked up, the phase starts with a design spike.

- **Direction, not decision:** hosting on AWS, likely EKS — with a
  long-term idea of a piperd-equivalent private service acting as a
  Kubernetes controller, rather than VPS-per-customer. The spike decides.
- **Stable regardless of infra:**
  - Entitlements enforced in the relay (it refuses to provision for a
    non-paying account); BYO boxes stay unlimited, free, and untouched by
    entitlements.
  - Billing via Stripe Checkout + Customer Portal; webhooks land relay-side
    and flip entitlements. The dashboard shows plan state and links out.
  - The dashboard stays tier-agnostic: a managed box behaves like any
    other box; UI additions are a provisioning flow, a billing page, and a
    managed-vs-BYO badge.
- **Open-source boundary:** the provisioner and billing integration are
  the first components that may stay closed (getpiper's business, not the
  protocol). Everything boxes and the relay do remains the open-source
  code — no forked relay (piper#76 criterion).

## Mechanics

- `ROADMAP.md` at the repo root distills this doc: tier model, principles,
  phase list, link per phase to its milestone.
- Milestones `Phase 0` … `Phase 4` in this repo; one epic issue per phase
  with acceptance criteria; child issues filed as each phase starts.
- Cross-repo dependencies are filed in piper with `[area]` prefixes and
  linked from the blocked dashboard epic:
  - `[relay]` GitHub identity (device + web flows) — Phase 0
  - `[relay]` list-my-boxes endpoint — Phase 0
  - `[agent]` surface relay-assigned public host in apps API — Phase 1
  - `[agent]` build/deploy logs endpoint — Phase 2
  - `[agent]` domain-config API (BYO domains) — Phase 2
  - `[agent]` app delete/stop endpoints (verify what exists) — Phase 2
  - `[relay]` organizations model + authz — Phase 3
  - `[relay]` entitlements + provisioning — Phase 4 (deferred)
- Issue #3 slots into the Phase 1 milestone.

## Non-goals

- Box provisioning, billing, or any paid surface before Phase 4.
- A standalone dashboard backend or dashboard-owned database.
- Relay features the open-source relay doesn't have (no closed fork).
- Fine-grained org roles, GitHub-org mirroring, container CPU/mem metrics —
  all deferred until a phase proves the need.
