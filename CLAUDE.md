# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

The hosted **Piper dashboard**: a Vercel-like frontend over the same
authenticated control surface the `piper` CLI uses. Parent project:
[getpiper/piper](https://github.com/getpiper/piper) — read its CLAUDE.md for
the project-wide philosophy (think before coding, simplicity first, surgical
changes, goal-driven execution). Those principles apply here verbatim.

Product scope: getpiper/piper#76 (dashboard half tracked here as #3). Design
docs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.

## Stack & commands

Bun-only (never npm/yarn/node). TanStack Start + Tailwind/shadcn + Biome.

- `bun run dev` — dev server on :3000
- `bun test` — bun test runner; DOM via happy-dom preloads in `bunfig.toml`
- `bun run verify` — Biome → `tsc --noEmit` → tests → build; **run before
  claiming work done or pushing** (CI runs exactly this)
- `bun run format` — Biome auto-fix

## Hard constraints

- Production serves on **port 8080** (piper's app-container default); the
  `Dockerfile` is how piper hosts this app.
- The dashboard consumes the **same authenticated API the CLI uses** — never
  add a privileged back door or anything requiring a closed/forked relay.
- Tests never live in `src/routes/` (the file router scans it).

## Workflow

Trunk-based, same as piper: branch `<gh-name>/<short-description>` off `main`,
PR into `main`, squash-merge. `main` requires the `verify` check. Conventional
commits ending with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Issues use `[area]` title prefixes: `[app]` (dashboard UI/features), `[repo]`
(CI, tooling, governance), `[docs]`.
