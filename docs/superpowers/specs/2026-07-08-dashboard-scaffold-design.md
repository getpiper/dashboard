# Dashboard repo scaffold — design

**Date:** 2026-07-08
**Status:** approved
**Tracks:** [#2](https://github.com/getpiper/dashboard/issues/2); parent product issue is [getpiper/piper#76](https://github.com/getpiper/piper/issues/76) (Vercel-like UI over the authenticated control surface, part of piper epic #49), whose dashboard half is [#3](https://github.com/getpiper/dashboard/issues/3).

## What this repo becomes

The hosted Piper dashboard: a Vercel-like frontend where users track deployments, check box health, and control their box (mirroring `piper` CLI functionality). Future direction — not built now, but informing the stack — includes bring-your-own-domain, and a paid tier where getpiper hosts `piperd` for the user. The dashboard consumes the **same authenticated control surface the CLI uses** — no privileged back door, nothing requiring a closed or forked relay (piper#76 acceptance criteria).

The dashboard itself is hosted with piper: production is a Docker image piper builds and runs, serving on container port **8080**.

## Scope of this effort

Repo scaffold → deployable "hello dashboard":

- App skeleton on the chosen stack, rendering a placeholder page.
- Test, lint, and build tooling wired and green.
- CI `verify` gate, then required by branch protection.
- Dockerfile piper can build and serve.
- README, CLAUDE.md, docs structure.

Explicitly **out of scope**: any #76 feature work (health/status UI), auth, billing, custom domains. Those come as their own spec → plan cycles.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime & package manager | **Bun** | Project requirement; fast installs, native test runner. |
| Framework | **TanStack Start** (React) | Full-stack React on Vite: type-safe file-based routing, server functions give the future webhook/session/API surface without a separate backend. First-class on Bun. |
| UI | **Tailwind CSS v4 + shadcn/ui** | Current industry standard for this product shape; accessible Radix primitives, components owned in-repo, themeable later. |
| Lint & format | **Biome** | One fast tool replacing ESLint+Prettier; the norm in Bun projects. |
| Tests | **`bun test`** + Testing Library + happy-dom | Native runner; component tests from day one. Playwright deferred until a real flow exists. |

Architecture note: v1 pages will call the relay's control API from the client with the user's token (no privileged path). TanStack Start's server functions are held in reserve for when sessions/billing need a server side — nothing speculative is built now.

## Repo infrastructure

- **CI**: single GitHub Actions job named `verify` (mirrors piper's gate): Biome check → `tsc --noEmit` → `bun test` → production build. After the first green run, `verify` is added to the `main` branch-protection required status checks.
- **Dockerfile**: multi-stage on `oven/bun` — install + build stage, slim runtime stage running the built server on 8080. Plus `.dockerignore`.
- **Docs**: README (what it is, dev loop, deploying with piper); CLAUDE.md adapted from piper's conventions — trunk-based with PR-only `main`, squash merges, conventional commits, test-first discipline, issue area prefixes `[app]` / `[repo]` / `[docs]`; empty `docs/superpowers/specs/` and `docs/superpowers/plans/` carry the workflow over. No PROGRESS.md until there is progress to map.

## Issue linking (two repos)

piper#76 stays the coordination point in getpiper/piper (it also covers relay-side API work and belongs to epic #49). In getpiper/dashboard:

- `[repo] Scaffold TypeScript + Bun + TanStack Start dashboard` — tracks this effort.
- `[app] Box health + per-app deploy status UI` — the dashboard half of piper#76; body carries `Part of getpiper/piper#76`.

piper#76 gets a task-list comment linking both, so epic-side progress stays visible. Dashboard PRs close dashboard issues; piper#76 closes only when both the relay-side API and the UI land.

## Verification (definition of done)

- `bun dev` serves the placeholder app locally.
- `bun test` passes; Biome and `tsc --noEmit` are clean.
- `docker build` succeeds; `docker run -p 8080:8080` serves the built app.
- The scaffold PR's `verify` check is green; branch protection on `main` requires `verify` thereafter.
