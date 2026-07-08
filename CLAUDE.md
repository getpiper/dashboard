# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Coding Principles

Shared with [getpiper/piper](https://github.com/getpiper/piper) — they apply
here verbatim.

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"

For multi-step tasks, state a brief plan with clear verification steps.

## What this is

The hosted **Piper dashboard**: a Vercel-like frontend over the same
authenticated control surface the `piper` CLI uses. Parent project:
[getpiper/piper](https://github.com/getpiper/piper).

Product scope: getpiper/piper#76 (dashboard half tracked here as #3). Design
docs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.

## Development

- **Test-first.** Plans are written failing-test-first; keep that discipline.
  Every feature or bugfix starts with a test that fails, then the
  implementation that makes it pass (component tests via `bun test` +
  Testing Library).
- Match the idiom and style of the surrounding code; Biome enforces
  formatting — don't fight it, run `bun run format`.

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
