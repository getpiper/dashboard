# Roadmap

The hosted Piper dashboard: a Vercel-like UI over the same authenticated
control surface the `piper` CLI uses. Full design:
[`docs/superpowers/specs/2026-07-09-dashboard-roadmap-design.md`](docs/superpowers/specs/2026-07-09-dashboard-roadmap-design.md).

## Tier model

- **Free = bring your own box.** piperd on your hardware, free
  `<hash>-<username>.public.getpiper.co` domains, full feature set
  (dashboard, orgs, BYO custom domains, git deploys).
- **Paid = managed hosting only.** getpiper runs the box for you. Nothing
  else is paywalled.
- **The relay is always production-grade**, for every tier.

## Principles

1. Same authenticated surface as the CLI — piper-side API first, then UI.
   No back doors, no closed relay.
2. Stateless dashboard — TanStack Start's server layer is a session/proxy
   shim; every fact and enforcement decision lives in the relay.
3. Tier-agnostic UI — managed and BYO boxes look identical.
4. GitHub is the identity (OAuth device flow for CLI, web flow for the
   dashboard).

## Phases

Each phase is a GitHub milestone with an epic issue; piper-side
dependencies are filed in [getpiper/piper](https://github.com/getpiper/piper).

| Phase | Epic | Ships | Key piper-side deps |
| --- | --- | --- | --- |
| **0 — Web auth** | [#7](https://github.com/getpiper/dashboard/issues/7) | GitHub login, session shim, box list | [piper#99](https://github.com/getpiper/piper/issues/99) GitHub identity, [piper#98](https://github.com/getpiper/piper/issues/98) list-my-boxes |
| **1 — Read-only dashboard** | [#3](https://github.com/getpiper/dashboard/issues/3) | Box liveness, per-app deploy status + public URLs | [piper#100](https://github.com/getpiper/piper/issues/100) public host in apps API |
| **2 — Project management** | [#8](https://github.com/getpiper/dashboard/issues/8) | Repo import, deploy/delete, history + logs, PR previews, BYO domain setup | [piper#101](https://github.com/getpiper/piper/issues/101) logs, [piper#102](https://github.com/getpiper/piper/issues/102) domain API, [piper#103](https://github.com/getpiper/piper/issues/103) delete/stop |
| **3 — Organizations** (free) | [#9](https://github.com/getpiper/dashboard/issues/9) | Orgs, members, roles; org-scoped views | [piper#104](https://github.com/getpiper/piper/issues/104) org model + authz |
| **4 — Paid tier** (deferred) | [#10](https://github.com/getpiper/dashboard/issues/10) | Managed hosting (AWS direction, design spike when picked up), Stripe billing | `[relay]` entitlements + provisioning (filed when picked up) |
