# Piper Dashboard

The hosted dashboard for [Piper](https://github.com/getpiper/piper) — an
open-source, developer-first PaaS that turns `git push` into a live HTTPS URL
on hardware you own. The dashboard is a Vercel-like UI for tracking
deployments, checking box health, and controlling your box, built on the same
authenticated control surface the `piper` CLI uses — no privileged back door.

Product scope is tracked in
[getpiper/piper#76](https://github.com/getpiper/piper/issues/76).

## Stack

Bun · TanStack Start (React) · Tailwind CSS + shadcn/ui · Biome · `bun test`.

## Development

```sh
bun install
bun run dev        # dev server on :3000
bun test           # unit/component tests
bun run verify     # Biome → typecheck → tests → build (what CI runs)
```

## Deployment

The dashboard is hosted with piper itself: the `Dockerfile` builds a
multi-stage Bun image whose server listens on port **8080** (piper's app
default). Locally:

```sh
docker build -t piper-dashboard . && docker run --rm -p 8080:8080 piper-dashboard
```

## License

[Apache-2.0](LICENSE)
