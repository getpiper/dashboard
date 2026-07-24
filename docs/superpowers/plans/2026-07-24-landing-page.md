# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, unauthenticated terminal-styled marketing landing page at `/`, rendered shell-free, redirecting authenticated visitors to `/apps`.

**Architecture:** A single `LandingPage` component (`src/components/landing-page.tsx`) built from local section components and existing terminal tokens + the `Button` primitive. The `/` route (`src/routes/index.tsx`) becomes landing-or-redirect and declares `staticData: { chrome: false }`; `RootLayout` in `__root.tsx` reads that flag and omits the `AppFrame` shell for the landing so it renders full-bleed with its own header.

**Tech Stack:** TanStack Start (file routes, `Link`, `useRouterState`, `createServerFn`), React 19, Tailwind v4 (CSS-first tokens in `src/styles.css`), `class-variance-authority` via the `Button` primitive, `bun test` + Testing Library (happy-dom).

## Global Constraints

- Bun only — `bun test`, `bun run verify`, `bun run format`. Never npm/yarn/node.
- Indent with **tabs** (Biome enforces; run `bun run format` before committing).
- **Styling = existing tokens only**, no new tokens. Panel/header/footer surface is `bg-card` (`--card: #0e0e11`). Amber is `--primary`; green is `--status-ok`; idle grey is `--status-idle`. Radius is `rounded-[2px]`.
- **Branding = openpiper (org/brand only); CLI stays `piper`.** Install command `curl -fsSL https://get.openpiper.dev/install.sh | sh`; all GitHub links `https://github.com/openpiper/piper`; logo `pi@piper`; commands `piper …` verbatim.
- **No jest-dom** in this repo. Assert existence with `expect(screen.getByText(...)).toBeTruthy()` (getBy throws when absent) and inspect `.textContent` / `.className` / `.getAttribute(...)`. Do NOT use `toBeInTheDocument`.
- Tests never live in `src/routes/`. Route files are not unit-tested (existing convention).
- Every `target="_blank"` anchor includes `rel="noreferrer"`.
- `bun run verify` (Biome → tsc → tests → build) must pass before a task is done.

---

### Task 1: LandingPage component

**Files:**
- Create: `src/components/landing-page.tsx`
- Test: `src/components/landing-page.test.tsx`

**Interfaces:**
- Consumes: `Button`, `buttonVariants` from `@/components/ui/button`; `Link` from `@tanstack/react-router`.
- Produces: `export function LandingPage(): JSX.Element` — imported by `src/routes/index.tsx` in Task 2.

- [ ] **Step 1: Write the failing test**

Create `src/components/landing-page.test.tsx`:

```tsx
import { expect, mock, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { LandingPage } from "./landing-page";

// LandingPage renders <Link>, which needs a router context to mount.
async function renderLanding() {
	const rootRoute = createRootRoute({ component: LandingPage });
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("renders the hero headline including the git push accent", async () => {
	await renderLanding();
	const h1 = screen.getByRole("heading", { level: 1 });
	expect(h1.textContent).toContain("Deploy to your own box");
	expect(h1.textContent).toContain("git push");
});

test("shows the openpiper install command", async () => {
	await renderLanding();
	expect(
		screen.getByText("curl -fsSL https://get.openpiper.dev/install.sh | sh"),
	).toBeTruthy();
});

test("renders the three why-piper card titles", async () => {
	await renderLanding();
	expect(screen.getByText("Zero-trust relay")).toBeTruthy();
	expect(screen.getByText("Lean by design")).toBeTruthy();
	expect(screen.getByText("Developer-first")).toBeTruthy();
});

test("renders the three how-it-works steps with numbers", async () => {
	await renderLanding();
	expect(screen.getByText("piper connect")).toBeTruthy();
	expect(
		screen.getByText("piper app link myapp --repo owner/name"),
	).toBeTruthy();
	expect(screen.getByText("step 01")).toBeTruthy();
	expect(screen.getByText("step 03")).toBeTruthy();
});

test("renders the relay diagram labels", async () => {
	await renderLanding();
	expect(screen.getByText("piper-relay · cloud")).toBeTruthy();
	expect(screen.getByText("your box · piperd")).toBeTruthy();
});

test("every sign-in link points to /login", async () => {
	await renderLanding();
	const links = screen.getAllByRole("link", { name: /sign in/i });
	expect(links.length).toBeGreaterThan(0);
	for (const link of links) {
		expect(link.getAttribute("href")).toBe("/login");
	}
});

test("docs links point to the openpiper github repo", async () => {
	await renderLanding();
	const links = screen.getAllByRole("link", { name: "docs" });
	expect(links.length).toBeGreaterThan(0);
	for (const link of links) {
		expect(link.getAttribute("href")).toBe(
			"https://github.com/openpiper/piper",
		);
	}
});

test("copy button copies the install command and flips its label", async () => {
	const writeText = mock(() => Promise.resolve());
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
	await renderLanding();
	const [copyBtn] = screen.getAllByRole("button", {
		name: "copy install command",
	});
	fireEvent.click(copyBtn);
	expect(writeText).toHaveBeenCalledWith(
		"curl -fsSL https://get.openpiper.dev/install.sh | sh",
	);
	expect(await screen.findByText("✓ copied")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/landing-page.test.tsx`
Expected: FAIL — cannot resolve `./landing-page` (module does not exist yet).

- [ ] **Step 3: Write the component**

Create `src/components/landing-page.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

const INSTALL_CMD = "curl -fsSL https://get.openpiper.dev/install.sh | sh";
const GITHUB_URL = "https://github.com/openpiper/piper";

const whyCards = [
	{
		glyph: "◈",
		title: "Zero-trust relay",
		body: "The relay only ever sees ciphertext — L4 SNI passthrough, TLS terminates on your box. Route through a relay you don’t own, safely.",
	},
	{
		glyph: "▰",
		title: "Lean by design",
		body: "SQLite for state, embedded Caddy for TLS, one lightweight daemon. No Kubernetes, no sprawl — light enough to run on a Pi, happy on anything bigger.",
	},
	{
		glyph: "▶",
		title: "Developer-first",
		body: "A scriptable CLI and a full-screen TUI, Dockerfile-based builds, and git-push deploys. On the box itself, no login needed.",
	},
];

const steps = [
	{
		n: "01",
		cmd: "piper connect",
		body: "Enroll your box on the public relay (or your own). One outbound tunnel, no ports opened.",
	},
	{
		n: "02",
		cmd: "piper app link myapp --repo owner/name",
		body: "Link a repo through your own per-user GitHub App — the private key never leaves your box.",
	},
	{
		n: "03",
		cmd: "git push",
		body: "Builds the Dockerfile, health-checks the container, and publishes it live at https://myapp.your-domain.",
	},
];

function useCopyToClipboard(resetMs = 1500) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const copy = useCallback(
		(text: string) => {
			try {
				navigator.clipboard?.writeText(text);
			} catch {}
			setCopied(true);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), resetMs);
		},
		[resetMs],
	);
	useEffect(() => () => clearTimeout(timer.current), []);
	return [copied, copy] as const;
}

function CopyInstallButton({
	variant,
	size,
}: {
	variant: "neutral" | "primary";
	size: "sm" | "lg";
}) {
	const [copied, copy] = useCopyToClipboard();
	return (
		<Button
			type="button"
			variant={variant}
			size={size}
			bracketed={false}
			onClick={() => copy(INSTALL_CMD)}
		>
			{copied ? "✓ copied" : "copy install command"}
		</Button>
	);
}

function Header() {
	return (
		<header className="sticky top-0 z-50 flex items-center border-b border-border bg-card">
			<a
				href="#top"
				className="border-r border-border px-[18px] py-3 font-semibold text-foreground"
			>
				pi@<span className="text-primary">piper</span>
			</a>
			<nav className="flex gap-[22px] px-[22px] text-[13px]">
				<a className="text-muted-foreground" href="#why">
					why piper
				</a>
				<a className="text-muted-foreground" href="#how">
					how it works
				</a>
				<a
					className="text-muted-foreground"
					href={GITHUB_URL}
					target="_blank"
					rel="noreferrer"
				>
					docs
				</a>
			</nav>
			<div className="ml-auto flex items-center gap-3 px-4">
				<a
					className="text-[13px] text-muted-foreground"
					href={GITHUB_URL}
					target="_blank"
					rel="noreferrer"
				>
					github ↗
				</a>
				<Link
					to="/login"
					className={buttonVariants({ variant: "secondary", size: "sm" })}
				>
					[ sign in ]
				</Link>
			</div>
		</header>
	);
}

function Hero() {
	return (
		<div className="bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(255,180,84,0.09),transparent_60%)] pt-[88px] pb-[60px] text-center">
			<div className="mb-[26px] inline-flex items-center gap-2 rounded-full border border-border px-[14px] py-[5px] text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
				<span className="h-1.5 w-1.5 rounded-full bg-status-ok" /> the paas
				that runs on hardware you own
			</div>
			<h1 className="mx-auto max-w-[860px] text-[52px] font-bold leading-[1.1] tracking-[-0.015em] text-balance">
				Deploy to your own box
				<br />
				with one <span className="text-primary">git push</span>.
			</h1>
			<p className="mx-auto mt-6 max-w-[600px] text-base leading-[1.6] text-muted-foreground text-pretty">
				Open-source, developer-first, zero-trust. Piper turns any box you own
				into a real deploy target with a public HTTPS URL — a cloud VM, an old
				laptop, a home server, even a Raspberry Pi behind CGNAT — without
				exposing your network to anyone, including the relay.
			</p>
			<div className="mt-[34px] flex justify-center">
				<div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-[2px] border border-border bg-card px-[14px] py-[11px] text-[13.5px]">
					<span className="text-primary">$</span>
					<span>{INSTALL_CMD}</span>
					<CopyInstallButton variant="neutral" size="sm" />
				</div>
			</div>
			<div className="mt-4 flex justify-center gap-5 text-[13px] text-muted-foreground">
				<a href={GITHUB_URL} target="_blank" rel="noreferrer">
					read the docs →
				</a>
				<span className="text-border">|</span>
				<a href={GITHUB_URL} target="_blank" rel="noreferrer">
					★ star on github
				</a>
			</div>
		</div>
	);
}

function WhySection() {
	return (
		<div id="why" className="py-16">
			<div className="mb-9 text-center">
				<div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-primary">
					why piper
				</div>
				<h2 className="text-[26px] font-semibold">
					Self-hosting without the tradeoffs
				</h2>
			</div>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[18px]">
				{whyCards.map((c) => (
					<div
						key={c.title}
						className="rounded-[2px] border border-border bg-card p-6 text-center"
					>
						<div className="mb-[14px] text-[20px] text-primary">{c.glyph}</div>
						<div className="mb-[10px] text-[15px] font-semibold">{c.title}</div>
						<p className="text-[13px] leading-[1.6] text-muted-foreground text-pretty">
							{c.body}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

function RelaySection() {
	return (
		<div className="py-16">
			<div className="mb-9 text-center">
				<div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-primary">
					the relay
				</div>
				<h2 className="text-[26px] font-semibold">
					Public traffic, private network
				</h2>
				<p className="mx-auto mt-[14px] max-w-[600px] text-sm leading-[1.6] text-muted-foreground text-pretty">
					TLS terminates on your box; the relay splices ciphertext by SNI over
					an outbound tunnel — so it works behind CGNAT and never sees plaintext.
				</p>
			</div>
			<div className="flex flex-wrap items-stretch justify-center text-left">
				<div className="min-w-[220px] flex-1 rounded-[2px] border border-border bg-card p-[18px]">
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-status-idle">
						visitors & cli
					</div>
					<div className="text-[13px] text-foreground">https://app.you.dev</div>
				</div>
				<div className="flex min-w-[78px] flex-col items-center justify-center p-3 text-[12px] text-foreground">
					HTTPS →
				</div>
				<div className="min-w-[220px] flex-[1.15] rounded-[2px] border border-primary bg-primary/[0.07] p-[18px]">
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-primary">
						piper-relay · cloud
					</div>
					<div className="text-[13px] text-foreground">
						SNI passthrough — ciphertext only
					</div>
				</div>
				<div className="flex min-w-[78px] flex-col items-center justify-center p-3 text-center text-[11px] text-foreground">
					← tunnel
					<span className="mt-[3px] text-status-idle">(CGNAT)</span>
				</div>
				<div className="min-w-[220px] flex-[1.15] rounded-[2px] border border-border bg-card p-[18px]">
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-status-ok">
						your box · piperd
					</div>
					<div className="text-[13px] text-foreground">
						Docker · Caddy · TLS ends here
					</div>
				</div>
			</div>
		</div>
	);
}

function HowSection() {
	return (
		<div id="how" className="py-16">
			<div className="mb-9 text-center">
				<div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-primary">
					how it works
				</div>
				<h2 className="text-[26px] font-semibold">
					Three commands to a live URL
				</h2>
			</div>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[18px]">
				{steps.map((s) => (
					<div
						key={s.n}
						className="rounded-[2px] border border-border bg-card p-[22px]"
					>
						<div className="mb-3 text-[12px] text-status-idle">step {s.n}</div>
						<div className="mb-[10px] text-[13.5px] text-foreground">
							<span className="text-primary">$ </span>
							{s.cmd}
						</div>
						<p className="text-[13px] leading-[1.6] text-muted-foreground text-pretty">
							{s.body}
						</p>
					</div>
				))}
			</div>
			<div className="mt-11 border-t border-border pt-[34px] text-center">
				<p className="mx-auto mb-[18px] text-sm text-muted-foreground text-pretty">
					Every push builds your Dockerfile, health-checks it, and serves it at
					your domain.
				</p>
				<CopyInstallButton variant="primary" size="lg" />
			</div>
		</div>
	);
}

function Footer() {
	return (
		<footer className="border-t border-border bg-card">
			<div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 p-6 text-[12px] text-status-idle">
				<span className="font-semibold text-foreground">
					pi@<span className="text-primary">piper</span>
				</span>
				<span>Apache-2.0 · runs on a Pi · openpiper/piper</span>
				<span className="ml-auto flex gap-[18px]">
					<a
						className="text-muted-foreground"
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
					>
						github
					</a>
					<a
						className="text-muted-foreground"
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
					>
						docs
					</a>
					<Link className="text-muted-foreground" to="/login">
						sign in
					</Link>
				</span>
			</div>
		</footer>
	);
}

export function LandingPage() {
	return (
		<div className="min-h-screen bg-background">
			<Header />
			<div id="top" className="mx-auto max-w-[1080px] px-6">
				<Hero />
				<div className="border-t border-border" />
				<WhySection />
				<div className="border-t border-border" />
				<RelaySection />
				<div className="border-t border-border" />
				<HowSection />
			</div>
			<Footer />
		</div>
	);
}
```

- [ ] **Step 4: Format**

Run: `bun run format`
Expected: file reformatted to Biome style, exits clean.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/landing-page.test.tsx`
Expected: PASS — all 8 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing-page.tsx src/components/landing-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: add public landing page component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Route the landing at `/`, shell-free, redirect authed users

**Files:**
- Modify: `src/routes/__root.tsx` (add `StaticDataRouteOption` augmentation; conditionally omit `AppFrame`)
- Modify: `src/routes/index.tsx` (landing-or-redirect; declare `staticData: { chrome: false }`)

**Interfaces:**
- Consumes: `LandingPage` from `@/components/landing-page` (Task 1); `getSession` from `../server/fns`; `useRouterState` from `@tanstack/react-router`.
- Produces: none (leaf route wiring).

No unit test — route files are not unit-tested in this repo. The deliverable is verified by `bun run verify` (typecheck + build + full test run) plus a manual dev-server check described in Step 4.

- [ ] **Step 1: Add the chrome flag augmentation and conditional shell in `__root.tsx`**

Edit `src/routes/__root.tsx`. Add `useRouterState` to the `@tanstack/react-router` import:

```tsx
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
```

Immediately after that import block, declare the static-data augmentation so routes can set `staticData: { chrome }` and `tsc` accepts it:

```tsx
declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		// When false, RootLayout renders the route full-bleed without the app shell.
		chrome?: boolean;
	}
}
```

Replace the `RootLayout` function body so the `AppFrame` shell is omitted when the active leaf route opts out via `chrome: false`:

```tsx
function RootLayout() {
	const data = Route.useLoaderData();
	const chromeless = useRouterState({
		select: (s) => s.matches.some((m) => m.staticData.chrome === false),
	});
	return (
		<OrgScopeProvider
			username={data?.username ?? null}
			orgs={data?.orgs ?? []}
			invites={data?.invites ?? []}
		>
			{chromeless ? (
				<Outlet />
			) : (
				<AppFrame>
					<Outlet />
				</AppFrame>
			)}
		</OrgScopeProvider>
	);
}
```

- [ ] **Step 2: Rewrite `index.tsx` as landing-or-redirect**

Replace the entire contents of `src/routes/index.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";
import { getSession } from "../server/fns";

// Public marketing landing at /. Authenticated visitors go straight to /apps.
export const Route = createFileRoute("/")({
	staticData: { chrome: false },
	beforeLoad: async () => {
		const session = await getSession();
		if (session) throw redirect({ to: "/apps" });
	},
	component: LandingPage,
});
```

- [ ] **Step 3: Format, typecheck, and run the full verify**

Run: `bun run format && bun run verify`
Expected: Biome clean; `tsc --noEmit` passes (augmentation makes `staticData: { chrome: false }` valid); all tests pass; build succeeds.

- [ ] **Step 4: Manual dev-server check**

Run: `bun run dev`, then visit `http://localhost:3000/`.
Expected (logged out): the landing page renders with **one** `pi@piper` header (its own — no stacked app-shell header), all sections present, and the copy button flips to "✓ copied" on click. Confirm `/apps` still renders inside the normal app shell. (If a session cookie is present, `/` should redirect to `/apps`.) Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx src/routes/index.tsx
git commit -m "$(cat <<'EOF'
feat: serve landing page at / with shell bypass

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Notes / out of scope

- **Host-based routing** (apex `openpiper.dev` serves the landing, `dashboard.openpiper.dev` serves the app) is deferred until those domains exist; building at `/` with the authed redirect stays correct under that later split.
- The broader getpiper→openpiper rename elsewhere in the repo/product, real sign-in flow beyond the `/login` link, analytics, and OG/SEO tags are out of scope.
