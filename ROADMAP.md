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

| Phase | Ships | Key piper-side deps |
| --- | --- | --- |
| **0 — Web auth** | GitHub login, session shim, box list endpoint | `[relay]` GitHub identity, `[relay]` list-my-boxes |
| **1 — Read-only dashboard** | Box liveness, per-app deploy status + public URLs ([#3](https://github.com/getpiper/dashboard/issues/3)) | `[agent]` surface public host in apps API |
| **2 — Project management** | Repo import, deploy/delete, history + logs, PR previews, BYO domain setup | `[agent]` logs endpoint, domain-config API |
| **3 — Organizations** (free) | Orgs, members, roles; org-scoped views | `[relay]` org model + authz |
| **4 — Paid tier** (deferred) | Managed hosting (AWS direction, design spike when picked up), Stripe billing | `[relay]` entitlements + provisioning |
