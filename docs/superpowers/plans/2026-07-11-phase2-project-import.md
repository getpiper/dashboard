# Phase 2 slice D — project import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user take a GitHub repo to a live URL from the dashboard — a guided wizard wrapping the CLI's `github setup` + `app link` — without touching the CLI.

**Architecture:** A dedicated route `/boxes/$base/import` renders a 3-step wizard (Connect GitHub → Create & link app → Push & go live). The GitHub App manifest flow is a top-level browser navigation to `github.com` that redirects back to the route with `?code=`, so the flow lives in a route (not a modal) and all form entry happens *after* the round-trip. New writes ride the existing relay control proxy (`/agents/{base}/v1/*`) with the `piper_session` bearer — no new piper endpoint. The wizard is a props-driven presentational component (like `AppDetail`); the route wires server fns to it.

**Tech Stack:** Bun, TanStack Start (file router + server fns), React, Tailwind v4, Biome. Tests: `bun test` + Testing Library (happy-dom preloaded via `bunfig.toml`).

## Global Constraints

- **Bun only** — never npm/yarn/node. Dev: `bun run dev`; tests: `bun test`; gate: `bun run verify` (Biome → `tsc --noEmit` → tests → build) must pass before the work is claimed done.
- **Tests never live in `src/routes/`** — the file router scans it. Route behavior is verified via its extracted component's test + the `verify` build/typecheck.
- **All writes ride the relay control proxy** `POST {relay}/agents/{base}/v1/*` with `Authorization: Bearer <piper_session>` — no privileged back door, no new piper endpoint.
- **Failure modes mirror existing fetchers:** `401` → `RelayAuthError` (→ drop session, redirect `/login`); `502`/`503` → `BoxOfflineError`; other non-2xx → plain `Error` carrying the box's message body.
- **Match surrounding style;** Biome enforces formatting — run `bun run format`, don't hand-fight it.
- **Real live URL stays mocked** — cosmetically blocked on piper#137; slice A's `mockAppUrl` on the app page stands in. This slice adds no URL-surfacing code.

---

### Task 1: Data layer — relay fetchers for manifest, exchange, create, link

**Files:**
- Modify: `src/server/relay.ts` (append four functions)
- Test: `src/server/relay.test.ts` (append tests)

**Interfaces:**
- Consumes: existing `relayUrl()`, `RelayAuthError`, `BoxOfflineError` from `relay.ts`.
- Produces (later tasks rely on these exact signatures):
  - `githubManifest(credential: string, base: string, redirectUrl: string): Promise<string>`
  - `exchangeGithub(credential: string, base: string, code: string): Promise<void>`
  - `createApp(credential: string, base: string, name: string, port: number): Promise<void>`
  - `linkApp(credential: string, base: string, name: string, repo: string, branch: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/server/relay.test.ts`. Also add the four names to the existing top import from `./relay`.

```ts
test("githubManifest POSTs redirect_url and returns the manifest string", async () => {
	let seenUrl = "";
	let seenBody = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json({ manifest: '{"name":"piper-x"}' });
	}) as typeof fetch;

	const manifest = await githubManifest(
		"cred-1",
		"abc-zoe.public.example",
		"https://dash.test/boxes/abc-zoe.public.example/import",
	);
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/github/manifest",
	);
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(JSON.parse(seenBody)).toEqual({
		redirect_url: "https://dash.test/boxes/abc-zoe.public.example/import",
	});
	expect(manifest).toBe('{"name":"piper-x"}');
});

test("githubManifest throws RelayAuthError on 401 and BoxOfflineError on 503", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(githubManifest("bad", "b", "r")).rejects.toBeInstanceOf(RelayAuthError);
	globalThis.fetch = (async () =>
		new Response("offline", { status: 503 })) as unknown as typeof fetch;
	expect(githubManifest("cred-1", "b", "r")).rejects.toBeInstanceOf(
		BoxOfflineError,
	);
});

test("exchangeGithub POSTs the code and resolves on 204", async () => {
	let seenUrl = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await exchangeGithub("cred-1", "abc-zoe.public.example", "code-xyz");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/github/exchange",
	);
	expect(JSON.parse(seenBody)).toEqual({ code: "code-xyz" });
});

test("exchangeGithub throws BoxOfflineError when the box fails the exchange (502)", async () => {
	globalThis.fetch = (async () =>
		new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;
	expect(
		exchangeGithub("cred-1", "abc-zoe.public.example", "code-xyz"),
	).rejects.toBeInstanceOf(BoxOfflineError);
});

test("createApp POSTs name+port and resolves on 201", async () => {
	let seenUrl = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		return new Response(null, { status: 201 });
	}) as typeof fetch;

	await createApp("cred-1", "abc-zoe.public.example", "web", 8080);
	expect(seenUrl).toBe("https://relay.test/agents/abc-zoe.public.example/v1/apps");
	expect(JSON.parse(seenBody)).toEqual({ name: "web", port: 8080 });
});

test("createApp tolerates 409 app-exists as success", async () => {
	globalThis.fetch = (async () =>
		new Response("app exists", { status: 409 })) as unknown as typeof fetch;
	// resolves (does not throw) so the caller proceeds to link
	await createApp("cred-1", "abc-zoe.public.example", "web", 8080);
});

test("createApp surfaces the box message on 400 (reserved name)", async () => {
	globalThis.fetch = (async () =>
		new Response("name reserved", { status: 400 })) as unknown as typeof fetch;
	expect(
		createApp("cred-1", "abc-zoe.public.example", "hooks", 8080),
	).rejects.toThrow(/name reserved/);
});

test("linkApp POSTs repo+branch and resolves on 204", async () => {
	let seenUrl = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await linkApp(
		"cred-1",
		"abc-zoe.public.example",
		"web",
		"getpiper/example",
		"main",
	);
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web/link",
	);
	expect(JSON.parse(seenBody)).toEqual({
		repo: "getpiper/example",
		branch: "main",
	});
});

test("linkApp surfaces the box message on 404 (unknown app)", async () => {
	globalThis.fetch = (async () =>
		new Response("unknown app", { status: 404 })) as unknown as typeof fetch;
	expect(
		linkApp("cred-1", "abc-zoe.public.example", "gone", "r", "main"),
	).rejects.toThrow(/unknown app/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — the four functions are not exported yet (`githubManifest is not a function`, etc.).

- [ ] **Step 3: Implement the four functions**

Append to `src/server/relay.ts`:

```ts
export async function githubManifest(
	credential: string,
	base: string,
	redirectUrl: string,
): Promise<string> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/github/manifest`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ redirect_url: redirectUrl }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (!res.ok) {
		throw new Error(`relay github manifest returned ${res.status}`);
	}
	const body = (await res.json()) as { manifest: string };
	return body.manifest;
}

export async function exchangeGithub(
	credential: string,
	base: string,
	code: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/github/exchange`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ code }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (res.status !== 204) {
		throw new Error(`relay github exchange returned ${res.status}`);
	}
}

export async function createApp(
	credential: string,
	base: string,
	name: string,
	port: number,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name, port }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	// The app already exists — a safe re-run; proceed to link.
	if (res.status === 409) return;
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay create app returned ${res.status}`);
	}
}

export async function linkApp(
	credential: string,
	base: string,
	name: string,
	repo: string,
	branch: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps/${encodeURIComponent(
			name,
		)}/link`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ repo, branch }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (res.status !== 204) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay link returned ${res.status}`);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS (all new tests green, existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "feat: relay fetchers for github manifest/exchange + app create/link (#20)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Import wizard component

**Files:**
- Create: `src/components/import-wizard.tsx`
- Test: `src/components/import-wizard.test.tsx`

**Interfaces:**
- Consumes: `isRedirect`, `Link` from `@tanstack/react-router`; React.
- Produces (the route in Task 3 relies on these):
  - `githubAppNewUrl(org: string): string` — pure; personal vs. org GitHub App-creation URL.
  - `type CreateAndLinkInput = { name: string; repo: string; branch: string; port?: number }`
  - `type ImportWizardProps = { base: string; pendingCode: string | null; getManifest: () => Promise<string>; exchange: (code: string) => Promise<void>; createAndLink: (input: CreateAndLinkInput) => Promise<void>; submitManifest?: (actionUrl: string, manifest: string) => void }`
  - `function ImportWizard(props: ImportWizardProps): JSX.Element`

Notes for the implementer:
- The wizard is presentational + callback-driven (like `AppDetail`): the route injects the server-fn wrappers.
- `submitManifest` is the one real DOM side-effect (a top-level form POST to GitHub). It defaults to a real implementation and is injectable so tests assert the target URL without navigating.
- `pendingCode` (from the `?code=` GitHub redirect) triggers a one-time exchange on mount, then the URL is scrubbed with `history.replaceState` (mirrors `auth-callback.tsx`) so a refresh won't re-exchange a spent code.

- [ ] **Step 1: Write the failing tests**

Create `src/components/import-wizard.test.tsx`:

```tsx
import { expect, mock, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import {
	githubAppNewUrl,
	ImportWizard,
	type ImportWizardProps,
} from "./import-wizard";

const noopAsync = async () => {};

// ImportWizard renders <Link> (step 3), which needs a router context to mount.
async function renderWizard(props: Partial<ImportWizardProps> = {}) {
	const full: ImportWizardProps = {
		base: "abc-zoe.public.example",
		pendingCode: null,
		getManifest: async () => '{"name":"piper-x"}',
		exchange: noopAsync,
		createAndLink: noopAsync,
		submitManifest: () => {},
		...props,
	};
	const rootRoute = createRootRoute({
		component: () => <ImportWizard {...full} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("githubAppNewUrl uses the personal path when no org, the org path otherwise", () => {
	expect(githubAppNewUrl("")).toBe("https://github.com/settings/apps/new");
	expect(githubAppNewUrl("acme")).toBe(
		"https://github.com/organizations/acme/settings/apps/new",
	);
});

test("Skip advances from Connect to the Create step", async () => {
	await renderWizard();
	fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	expect(screen.getByText(/create & link/i)).toBeTruthy();
});

test("Connect fetches the manifest and submits a form to GitHub (org variant)", async () => {
	const submitManifest = mock(() => {});
	await renderWizard({
		getManifest: async () => '{"name":"piper-x"}',
		submitManifest,
	});
	fireEvent.change(screen.getByLabelText(/organization/i), {
		target: { value: "acme" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /connect github/i }));
	});
	expect(submitManifest).toHaveBeenCalledWith(
		"https://github.com/organizations/acme/settings/apps/new",
		'{"name":"piper-x"}',
	);
});

test("a pending code runs the exchange once and lands on the Create step", async () => {
	const exchange = mock(async () => {});
	await renderWizard({ pendingCode: "code-xyz", exchange });
	await waitFor(() => expect(screen.getByText(/create & link/i)).toBeTruthy());
	expect(exchange).toHaveBeenCalledTimes(1);
	expect(exchange).toHaveBeenCalledWith("code-xyz");
});

test("a failed exchange shows an inline error", async () => {
	const exchange = async () => {
		throw new Error("boom");
	};
	await renderWizard({ pendingCode: "code-xyz", exchange });
	await waitFor(() => expect(screen.getByText(/couldn't finish/i)).toBeTruthy());
});

test("Create & link submits the form and advances to Push", async () => {
	const createAndLink = mock(async () => {});
	await renderWizard({ createAndLink });
	fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	fireEvent.change(screen.getByLabelText(/app name/i), {
		target: { value: "web" },
	});
	fireEvent.change(screen.getByLabelText(/repository/i), {
		target: { value: "getpiper/example" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /create & link/i }));
	});
	expect(createAndLink).toHaveBeenCalledWith({
		name: "web",
		repo: "getpiper/example",
		branch: "main",
		port: undefined,
	});
	const link = screen.getByRole("link", { name: /view app/i });
	expect(link.getAttribute("href")).toBe(
		"/boxes/abc-zoe.public.example/apps/web",
	);
});

test("a failed create shows an inline error and stays on the Create step", async () => {
	const createAndLink = async () => {
		throw new Error("name reserved");
	};
	await renderWizard({ createAndLink });
	fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	fireEvent.change(screen.getByLabelText(/app name/i), {
		target: { value: "hooks" },
	});
	fireEvent.change(screen.getByLabelText(/repository/i), {
		target: { value: "getpiper/example" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /create & link/i }));
	});
	expect(screen.getByText(/name reserved/i)).toBeTruthy();
	expect(screen.getByText(/create & link/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/import-wizard.test.tsx`
Expected: FAIL — `./import-wizard` does not exist yet.

- [ ] **Step 3: Implement the component**

Create `src/components/import-wizard.tsx`:

```tsx
import { isRedirect, Link } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

export function githubAppNewUrl(org: string): string {
	const trimmed = org.trim();
	return trimmed
		? `https://github.com/organizations/${encodeURIComponent(trimmed)}/settings/apps/new`
		: "https://github.com/settings/apps/new";
}

// Real DOM side-effect: POST the manifest to GitHub as a top-level navigation.
// Injectable via the submitManifest prop so tests assert the target instead.
function postManifestToGitHub(actionUrl: string, manifest: string): void {
	const form = document.createElement("form");
	form.method = "post";
	form.action = actionUrl;
	const input = document.createElement("input");
	input.type = "hidden";
	input.name = "manifest";
	input.value = manifest;
	form.appendChild(input);
	document.body.appendChild(form);
	form.submit();
}

export type CreateAndLinkInput = {
	name: string;
	repo: string;
	branch: string;
	port?: number;
};

export type ImportWizardProps = {
	base: string;
	pendingCode: string | null;
	getManifest: () => Promise<string>;
	exchange: (code: string) => Promise<void>;
	createAndLink: (input: CreateAndLinkInput) => Promise<void>;
	submitManifest?: (actionUrl: string, manifest: string) => void;
};

type Step = "connect" | "exchanging" | "create" | "push";

const inputClass = "rounded-md border border-[var(--line)] px-3 py-2 text-sm";
const primaryBtn =
	"self-start rounded-md bg-foreground px-4 py-2 text-background text-sm";
const secondaryBtn =
	"rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--chip-bg)]";

export function ImportWizard({
	base,
	pendingCode,
	getManifest,
	exchange,
	createAndLink,
	submitManifest = postManifestToGitHub,
}: ImportWizardProps) {
	const [step, setStep] = useState<Step>(
		pendingCode ? "exchanging" : "connect",
	);
	const [org, setOrg] = useState("");
	const [appName, setAppName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const exchanged = useRef(false);

	// Exchange the GitHub redirect code exactly once, then scrub it from the URL
	// so a refresh won't replay a spent code (mirrors auth-callback.tsx).
	useEffect(() => {
		if (!pendingCode || exchanged.current) return;
		exchanged.current = true;
		exchange(pendingCode)
			.then(() => {
				window.history.replaceState(null, "", `/boxes/${base}/import`);
				setStep("create");
			})
			.catch((err) => {
				if (isRedirect(err)) throw err;
				setError("Couldn't finish connecting to GitHub. Try again.");
				setStep("connect");
			});
	}, [pendingCode, exchange, base]);

	async function onConnect() {
		setError(null);
		try {
			const manifest = await getManifest();
			submitManifest(githubAppNewUrl(org), manifest);
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError("Couldn't start GitHub setup. Try again.");
		}
	}

	async function onCreate(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		const data = new FormData(e.currentTarget);
		const name = String(data.get("name") ?? "").trim();
		const repo = String(data.get("repo") ?? "").trim();
		const branch = String(data.get("branch") ?? "").trim() || "main";
		const portRaw = String(data.get("port") ?? "").trim();
		try {
			await createAndLink({
				name,
				repo,
				branch,
				port: portRaw ? Number(portRaw) : undefined,
			});
			setAppName(name);
			setStep("push");
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't create the app. Try again.");
		}
	}

	return (
		<main className="page-wrap flex flex-col gap-6 px-4 py-8">
			<div className="flex flex-col gap-1">
				<h1 className="font-mono font-semibold text-xl">New project</h1>
				<p className="text-muted-foreground text-sm">{base}</p>
			</div>
			{error && <p className="text-red-600 text-sm">{error}</p>}

			{step === "connect" && (
				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-sm">1 · Connect GitHub</h2>
					<p className="text-muted-foreground text-sm">
						Create the Piper GitHub App on your account, then install it on the
						repo you want to deploy. Already connected this box? Skip ahead.
					</p>
					<label className="flex flex-col gap-1 text-sm">
						Organization (optional)
						<input
							name="org"
							value={org}
							onChange={(e) => setOrg(e.target.value)}
							placeholder="leave blank for your personal account"
							className={inputClass}
						/>
					</label>
					<div className="flex gap-2">
						<button type="button" onClick={onConnect} className={primaryBtn}>
							Connect GitHub
						</button>
						<button
							type="button"
							onClick={() => setStep("create")}
							className={secondaryBtn}
						>
							Skip — already connected
						</button>
					</div>
					<a
						href="https://github.com/settings/installations"
						className="text-muted-foreground text-sm underline"
					>
						Manage installed GitHub Apps
					</a>
				</section>
			)}

			{step === "exchanging" && (
				<p className="text-muted-foreground text-sm">Connecting to GitHub…</p>
			)}

			{step === "create" && (
				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-sm">2 · Create &amp; link app</h2>
					<form onSubmit={onCreate} className="flex flex-col gap-3">
						<label className="flex flex-col gap-1 text-sm">
							App name
							<input name="name" required className={inputClass} />
						</label>
						<label className="flex flex-col gap-1 text-sm">
							Repository (owner/name)
							<input
								name="repo"
								required
								placeholder="getpiper/example"
								className={inputClass}
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							Branch
							<input name="branch" defaultValue="main" className={inputClass} />
						</label>
						<label className="flex flex-col gap-1 text-sm">
							Port (optional)
							<input
								name="port"
								inputMode="numeric"
								placeholder="8080"
								className={inputClass}
							/>
						</label>
						<button type="submit" className={primaryBtn}>
							Create &amp; link
						</button>
					</form>
				</section>
			)}

			{step === "push" && (
				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-sm">3 · Push &amp; go live</h2>
					<p className="text-muted-foreground text-sm">
						Push to the tracked branch to trigger the first deploy — the
						installed GitHub App's webhook builds and runs it:
					</p>
					<pre className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 text-sm">
						git push origin main
					</pre>
					<Link
						to="/boxes/$base/apps/$app"
						params={{ base, app: appName }}
						className={primaryBtn}
					>
						View app
					</Link>
				</section>
			)}
		</main>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/import-wizard.test.tsx`
Expected: PASS (all eight tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/import-wizard.tsx src/components/import-wizard.test.tsx
git commit -m "feat: import wizard component (connect/create/push) (#20)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Server fns, import route, and box-page entry point

**Files:**
- Modify: `src/server/fns.ts` (add three server fns + imports)
- Create: `src/routes/boxes/$base_.import.tsx`
- Modify: `src/components/box-detail.tsx` (add a "New project" link)
- Test: `src/components/box-detail.test.tsx` (append one test)

**Interfaces:**
- Consumes: `githubManifest`, `exchangeGithub`, `createApp`, `linkApp` (Task 1); `ImportWizard`, `CreateAndLinkInput` (Task 2); existing `getCookie`, `redirect`, `dropSessionAndRedirect`, `RelayAuthError`, `RelayError`.
- Produces (the route consumes these server fns):
  - `getGithubManifest` — `{ base: string; redirectUrl: string }` → `Promise<string>`
  - `exchangeGithubApp` — `{ base: string; code: string }` → `Promise<void>`
  - `createAndLinkApp` — `{ base: string; name: string; repo: string; branch: string; port?: number }` → `Promise<void>`

- [ ] **Step 1: Write the failing test (box-page entry point)**

Append to `src/components/box-detail.test.tsx`:

```tsx
test("offers a New project link to the import route", async () => {
	await renderInRouter({
		base: "up-zoe.public.example",
		connected: true,
		apps: [],
	});
	const link = screen.getByRole("link", { name: /new project/i });
	expect(link.getAttribute("href")).toBe("/boxes/up-zoe.public.example/import");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/box-detail.test.tsx`
Expected: FAIL — no "New project" link exists yet.

- [ ] **Step 3: Add the "New project" link to box-detail**

In `src/components/box-detail.tsx`, add the link into the header `<div className="flex items-center gap-2">`, as its last child (after the "Connected" span):

```tsx
				<Link
					to="/boxes/$base/import"
					params={{ base: box.base }}
					className="ml-auto rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)]"
				>
					New project
				</Link>
```

(`Link` is already imported in this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/box-detail.test.tsx`
Expected: PASS (new test green, existing three still green).

- [ ] **Step 5: Add the three server fns**

In `src/server/fns.ts`, extend the import from `./relay` to also pull in
`createApp, exchangeGithub, githubManifest, linkApp` (keep the existing names),
then append:

```ts
export const getGithubManifest = createServerFn({ method: "POST" })
	.validator((d: { base: string; redirectUrl: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await githubManifest(credential, data.base, data.redirectUrl);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const exchangeGithubApp = createServerFn({ method: "POST" })
	.validator((d: { base: string; code: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await exchangeGithub(credential, data.base, data.code);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const createAndLinkApp = createServerFn({ method: "POST" })
	.validator(
		(d: {
			base: string;
			name: string;
			repo: string;
			branch: string;
			port?: number;
		}) => d,
	)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await createApp(credential, data.base, data.name, data.port ?? 8080);
			await linkApp(credential, data.base, data.name, data.repo, data.branch);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 6: Create the import route**

Create `src/routes/boxes/$base_.import.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ImportWizard } from "@/components/import-wizard";
import { RelayError } from "@/components/relay-error";
import {
	createAndLinkApp,
	exchangeGithubApp,
	getGithubManifest,
} from "@/server/fns";

export const Route = createFileRoute("/boxes/$base_/import")({
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code : undefined,
	}),
	component: ImportPage,
	errorComponent: RelayError,
});

function ImportPage() {
	const { base } = Route.useParams();
	const { code } = Route.useSearch();
	return (
		<ImportWizard
			base={base}
			pendingCode={code ?? null}
			getManifest={() =>
				getGithubManifest({
					data: {
						base,
						redirectUrl: `${window.location.origin}/boxes/${base}/import`,
					},
				})
			}
			exchange={(c) => exchangeGithubApp({ data: { base, code: c } })}
			createAndLink={(input) => createAndLinkApp({ data: { base, ...input } })}
		/>
	);
}
```

Note: `window.location.origin` is read inside the `getManifest` closure (only invoked on a user click, client-side), so it never runs during SSR of the route.

- [ ] **Step 7: Verify the full build, types, and tests**

Run: `bun run verify`
Expected: PASS — Biome clean (run `bun run format` first if it flags formatting), `tsc --noEmit` clean (route wiring + server-fn generics typecheck), all tests green, build succeeds. If `createServerFn({ method: "POST" })` is flagged by tsc as an unexpected argument, check the installed `@tanstack/react-start` version's `createServerFn` signature and adjust (the read fns use the no-arg form; POST is the correct method for writes).

- [ ] **Step 8: Commit**

```bash
git add src/server/fns.ts src/routes/boxes/$base_.import.tsx src/components/box-detail.tsx src/components/box-detail.test.tsx
git commit -m "feat: import wizard route + New project entry point (#20)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Manual end-to-end verification + follow-up issue

**Files:** none (verification + issue filing).

- [ ] **Step 1: Drive the flow in the running app**

Run `bun run dev`, open a box page, click **New project**. Verify:
- Step 1 renders with the org field, Connect, and Skip.
- **Skip** advances to the Create form; submitting a name + repo (against a real/connected box, or confirm the network call shape in devtools) advances to Push.
- The Push step shows the `git push` instruction and a **View app** link to `/boxes/{base}/apps/{name}`.
- (If a real box + GitHub account are available) **Connect GitHub** navigates to GitHub's App-creation page and the `?code=` return lands back on the import route and advances to Create.

Use the `/run` skill if a scripted browser drive is preferred.

- [ ] **Step 2: File the piper follow-up issue**

File one `getpiper/piper` issue titled **"[api] github-status endpoint + return App slug from exchange"** capturing the two niceties the dashboard import flow wants (neither blocks this slice):
- a `GET /v1/github` status endpoint so the dashboard can *gate* the Connect step instead of always offering a skippable one;
- returning the created App's slug / `html_url` from `POST /v1/github/exchange` so the dashboard can deep-link to that App's install page.

Reference dashboard #20. Use:

```bash
gh issue create --repo getpiper/piper --title "[api] github-status endpoint + return App slug from exchange" --body "<the two bullets above, referencing getpiper/dashboard#20>"
```

- [ ] **Step 3: Open the PR**

```bash
git push -u origin ozykhan/phase2-project-import
gh pr create --title "feat: phase 2 slice D — project import (repo → live URL) (#20)" --body "<summary + Closes #20 + link to the piper follow-up issue>"
```

---

## Notes on scope (from the spec)

- The **git push itself** is a developer action from their machine — out of the dashboard by nature. The wizard instructs it; the resulting deploy surfaces on the app page via slice A.
- **Real live URL** stays mocked (piper#137).
- App lifecycle (stop/delete) and BYO domains are the other two open Phase 2 slices — not in this plan.
