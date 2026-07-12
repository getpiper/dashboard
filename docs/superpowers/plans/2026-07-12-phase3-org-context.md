# Phase 3 Slice A — Org Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an org switcher to the dashboard and scope the home view to the active org, plus create-org — so a member sees an org's boxes/apps exactly like personal ones.

**Architecture:** `GET /agents` already returns personal + all org boxes in one payload, each tagged with its owning slug (`owner`). "Active scope" is therefore a client-side filter over data already in hand, held in a small React context and persisted in a `piper_scope` cookie — no per-org fetch, no org in the routing path. Presentational components (`AppsHome`, `OrgSwitcher`) take data/callbacks as props (matching the existing `ImportWizard` idiom); routes wire the real server functions.

**Tech Stack:** Bun, TanStack Start + React, TanStack Router, Tailwind, Biome, `bun:test` + Testing Library (happy-dom preload).

Spec: `docs/superpowers/specs/2026-07-12-phase3-org-context-design.md`. Issue: [#25](https://github.com/getpiper/dashboard/issues/25).

## Global Constraints

- **Bun only** — never npm/yarn/node. Test: `bun test`. Full gate: `bun run verify` (Biome → `tsc --noEmit` → tests → build).
- **Tests never live in `src/routes/`** (the file router scans it).
- **Run `bun run format`** (Biome) before committing; don't hand-fight formatting.
- `owner` on a box is the owning account/org **slug**; a personal box's `owner` equals the caller's own account slug, which the dashboard stores in the `piper_username` cookie.
- Scope is a **display preference only** — never gate any relay call on it.
- Conventional commits ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Thread `owner` through the box types

**Files:**
- Modify: `src/server/relay.ts` (Box type, fetchBoxes, BoxWithApps, appsForBox, fetchAllApps, fetchBox)
- Test: `src/server/relay.test.ts`

**Interfaces:**
- Produces: `Box = { agent: string; owner: string; connected: boolean }`; `BoxWithApps = { base: string; owner: string; connected: boolean; apps: App[] }`.

- [ ] **Step 1: Update the failing tests**

In `src/server/relay.test.ts`, update the existing `fetchBoxes` test's mock rows and expectation to include `owner`, and add an owner assertion to a `fetchBox`/`fetchAllApps` test. Replace the `fetchBoxes` envelope + `toEqual` block with:

```ts
		return Response.json({
			agents: [
				{ agent: "abc123-zoe.public.example", owner: "zoe", connected: true },
				{ agent: "def456-acme.public.example", owner: "acme", connected: false },
			],
		});
	}) as typeof fetch;

	const boxes = await fetchBoxes("cred-1");
	expect(seenUrl).toBe("https://relay.test/agents");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(boxes).toEqual([
		{ agent: "abc123-zoe.public.example", owner: "zoe", connected: true },
		{ agent: "def456-acme.public.example", owner: "acme", connected: false },
	]);
```

Add a focused test:

```ts
test("fetchBox carries the box's owner through to BoxWithApps", async () => {
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		if (String(url).endsWith("/agents")) {
			return Response.json({
				agents: [
					{ agent: "abc123-zoe.public.example", owner: "zoe", connected: false },
				],
			});
		}
		return Response.json([]);
	}) as typeof fetch;

	const box = await fetchBox("cred-1", "abc123-zoe.public.example");
	expect(box.owner).toBe("zoe");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `fetchBoxes` result missing `owner`; `box.owner` is `undefined`.

- [ ] **Step 3: Implement**

In `src/server/relay.ts`:

Change the `Box` type:
```ts
export type Box = { agent: string; owner: string; connected: boolean };
```

`fetchBoxes` already returns `body.agents` as `Box[]` — the raw JSON now carries `owner`, so no mapping change is needed there; the type change is enough.

Change `BoxWithApps`:
```ts
export type BoxWithApps = {
	base: string;
	owner: string;
	connected: boolean;
	apps: App[];
};
```

Update `appsForBox` to accept and set `owner`:
```ts
async function appsForBox(
	credential: string,
	base: string,
	owner: string,
	connected: boolean,
): Promise<BoxWithApps> {
	if (!connected) return { base, owner, connected: false, apps: [] };
	try {
		return {
			base,
			owner,
			connected: true,
			apps: await fetchApps(credential, base),
		};
	} catch (err) {
		if (err instanceof BoxOfflineError) {
			return { base, owner, connected: false, apps: [] };
		}
		throw err;
	}
}
```

Update the two callers:
```ts
export async function fetchAllApps(credential: string): Promise<BoxWithApps[]> {
	const boxes = await fetchBoxes(credential);
	return Promise.all(
		boxes.map((box) => appsForBox(credential, box.agent, box.owner, box.connected)),
	);
}

export async function fetchBox(
	credential: string,
	base: string,
): Promise<BoxWithApps> {
	const boxes = await fetchBoxes(credential);
	const match = boxes.find((b) => b.agent === base);
	return appsForBox(credential, base, match?.owner ?? "", match?.connected ?? false);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "feat: thread box owner slug through the relay client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `fetchOrgs` and `createOrg` relay client functions

**Files:**
- Modify: `src/server/relay.ts`
- Test: `src/server/relay.test.ts`

**Interfaces:**
- Produces: `Org = { slug: string; role: "owner" | "member" }`; `fetchOrgs(credential): Promise<Org[]>`; `createOrg(credential, name): Promise<Org>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/server/relay.test.ts` (and add `createOrg`, `fetchOrgs` to the import from `./relay`):

```ts
test("fetchOrgs maps the orgs envelope to Org[]", async () => {
	let seenUrl = "";
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		seenUrl = String(url);
		return Response.json({
			orgs: [
				{ org: "acme", role: "owner" },
				{ org: "widgets", role: "member" },
			],
		});
	}) as typeof fetch;

	const orgs = await fetchOrgs("cred-1");
	expect(seenUrl).toBe("https://relay.test/v1/orgs");
	expect(orgs).toEqual([
		{ slug: "acme", role: "owner" },
		{ slug: "widgets", role: "member" },
	]);
});

test("fetchOrgs raises RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as typeof fetch;
	await expect(fetchOrgs("cred-1")).rejects.toBeInstanceOf(RelayAuthError);
});

test("createOrg POSTs the name and maps the created org", async () => {
	let seenBody = "";
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		seenBody = String(init?.body);
		return Response.json({ org: "acme", role: "owner" });
	}) as typeof fetch;

	const org = await createOrg("cred-1", "Acme");
	expect(JSON.parse(seenBody)).toEqual({ name: "Acme" });
	expect(org).toEqual({ slug: "acme", role: "owner" });
});

test("createOrg throws the relay message on a collision", async () => {
	globalThis.fetch = (async () =>
		new Response("name taken", { status: 409 })) as typeof fetch;
	await expect(createOrg("cred-1", "Acme")).rejects.toThrow("name taken");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `fetchOrgs`/`createOrg` are not exported.

- [ ] **Step 3: Implement**

Add to `src/server/relay.ts`:

```ts
export type Org = { slug: string; role: "owner" | "member" };

export async function fetchOrgs(credential: string): Promise<Org[]> {
	const res = await fetch(`${relayUrl()}/v1/orgs`, {
		headers: { Authorization: `Bearer ${credential}` },
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		throw new Error(`relay /v1/orgs returned ${res.status}`);
	}
	const body = (await res.json()) as { orgs: { org: string; role: string }[] };
	return body.orgs.map((o) => ({ slug: o.org, role: o.role as Org["role"] }));
}

export async function createOrg(
	credential: string,
	name: string,
): Promise<Org> {
	const res = await fetch(`${relayUrl()}/v1/orgs`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${credential}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ name }),
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay create org returned ${res.status}`);
	}
	const body = (await res.json()) as { org: string; role: string };
	return { slug: body.org, role: body.role as Org["role"] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "feat: add fetchOrgs and createOrg relay client functions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `OrgScopeProvider` context + `useOrgScope` hook

**Files:**
- Create: `src/components/org-scope.tsx`
- Test: `src/components/org-scope.test.tsx`

**Interfaces:**
- Consumes: `Org` from `@/server/relay`.
- Produces: `OrgScopeProvider({ username, orgs, children })`; `useOrgScope(): { scope: string; setScope: (s: string) => void; orgs: Org[]; username: string | null }`. Persists `scope` in the `piper_scope` cookie; default `"personal"`; a persisted slug not in `orgs` falls back to `"personal"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/org-scope.test.tsx`:

```tsx
import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Org } from "@/server/relay";
import { OrgScopeProvider, useOrgScope } from "./org-scope";

afterEach(() => {
	document.cookie = "piper_scope=; Path=/; Max-Age=0";
});

function Probe() {
	const { scope, setScope } = useOrgScope();
	return (
		<>
			<span data-testid="scope">{scope}</span>
			<button type="button" onClick={() => setScope("acme")}>
				pick acme
			</button>
		</>
	);
}

const orgs: Org[] = [{ slug: "acme", role: "owner" }];

test("defaults to personal scope", () => {
	render(
		<OrgScopeProvider username="zoe" orgs={orgs}>
			<Probe />
		</OrgScopeProvider>,
	);
	expect(screen.getByTestId("scope").textContent).toBe("personal");
});

test("setScope updates scope and persists the cookie", async () => {
	render(
		<OrgScopeProvider username="zoe" orgs={orgs}>
			<Probe />
		</OrgScopeProvider>,
	);
	fireEvent.click(screen.getByText("pick acme"));
	expect(screen.getByTestId("scope").textContent).toBe("acme");
	expect(document.cookie).toContain("piper_scope=acme");
});

test("a persisted org the caller no longer belongs to falls back to personal", async () => {
	document.cookie = "piper_scope=ghost; Path=/";
	render(
		<OrgScopeProvider username="zoe" orgs={orgs}>
			<Probe />
		</OrgScopeProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId("scope").textContent).toBe("personal"),
	);
});

test("a persisted org the caller still belongs to is restored", async () => {
	document.cookie = "piper_scope=acme; Path=/";
	render(
		<OrgScopeProvider username="zoe" orgs={orgs}>
			<Probe />
		</OrgScopeProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId("scope").textContent).toBe("acme"),
	);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/org-scope.test.tsx`
Expected: FAIL — module `./org-scope` not found.

- [ ] **Step 3: Implement**

Create `src/components/org-scope.tsx`:

```tsx
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import type { Org } from "@/server/relay";

type OrgScope = {
	scope: string;
	setScope: (s: string) => void;
	orgs: Org[];
	username: string | null;
};

const Ctx = createContext<OrgScope | null>(null);

function readScopeCookie(): string {
	if (typeof document === "undefined") return "personal";
	const m = document.cookie.match(/(?:^|;\s*)piper_scope=([^;]*)/);
	return m ? decodeURIComponent(m[1]) : "personal";
}

export function OrgScopeProvider({
	username,
	orgs,
	children,
}: {
	username: string | null;
	orgs: Org[];
	children: ReactNode;
}) {
	// Start at "personal" so server and first client render match; a mount
	// effect then restores a valid persisted scope (avoids hydration mismatch).
	const [scope, setScopeState] = useState("personal");

	useEffect(() => {
		const persisted = readScopeCookie();
		if (persisted === "personal") return;
		if (orgs.some((o) => o.slug === persisted)) setScopeState(persisted);
		else setScopeState("personal");
	}, [orgs]);

	const setScope = (next: string) => {
		document.cookie = `piper_scope=${encodeURIComponent(next)}; Path=/; SameSite=Lax`;
		setScopeState(next);
	};

	return (
		<Ctx.Provider value={{ scope, setScope, orgs, username }}>
			{children}
		</Ctx.Provider>
	);
}

export function useOrgScope(): OrgScope {
	const v = useContext(Ctx);
	if (!v) throw new Error("useOrgScope must be used within OrgScopeProvider");
	return v;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/org-scope.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/org-scope.tsx src/components/org-scope.test.tsx
git commit -m "feat: org scope context with cookie persistence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Scope-filter the home view

**Files:**
- Modify: `src/components/apps-home.tsx`
- Test: `src/components/apps-home.test.tsx`

**Interfaces:**
- Consumes: `BoxWithApps` (now with `owner`).
- Produces: `AppsHome({ boxes, username, scope })` — filters `boxes` to the active scope before rendering. `personal` → `owner === username`; an org slug → `owner === scope`.

- [ ] **Step 1: Write the failing tests**

In `src/components/apps-home.test.tsx`, update the `renderInRouter` helper to accept and pass `scope`/`username`, add `owner` to the box literals, and add scope tests. Replace the helper and add tests:

```tsx
async function renderInRouter(
	boxes: BoxWithApps[],
	scope = "personal",
	username = "octocat",
) {
	const rootRoute = createRootRoute({
		component: () => (
			<AppsHome boxes={boxes} scope={scope} username={username} />
		),
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}
```

For existing tests, add `owner: "octocat"` to each box literal so they survive the personal filter (e.g. `{ base: "7f3c9a2-octocat", owner: "octocat", connected: true, apps: [...] }`). Then add:

```tsx
test("personal scope hides org-owned boxes", async () => {
	await renderInRouter(
		[
			{ base: "mine-octocat", owner: "octocat", connected: true, apps: [] },
			{ base: "theirs-acme", owner: "acme", connected: true, apps: [] },
		],
		"personal",
		"octocat",
	);
	expect(screen.getByText("mine-octocat")).toBeTruthy();
	expect(screen.queryByText("theirs-acme")).toBeNull();
	expect(screen.getByText("1 boxes · 1 online")).toBeTruthy();
});

test("an org scope shows only that org's boxes", async () => {
	await renderInRouter(
		[
			{ base: "mine-octocat", owner: "octocat", connected: true, apps: [] },
			{ base: "theirs-acme", owner: "acme", connected: false, apps: [] },
		],
		"acme",
		"octocat",
	);
	expect(screen.queryByText("mine-octocat")).toBeNull();
	expect(screen.getByText("theirs-acme")).toBeTruthy();
});

test("an empty org scope shows the enroll hint", async () => {
	await renderInRouter(
		[{ base: "mine-octocat", owner: "octocat", connected: true, apps: [] }],
		"acme",
		"octocat",
	);
	expect(screen.getByText(/piper enroll --org acme/)).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/apps-home.test.tsx`
Expected: FAIL — `AppsHome` does not accept `scope`/`username` and does not filter.

- [ ] **Step 3: Implement**

In `src/components/apps-home.tsx`, change the signature and filter at the top; make the empty state scope-aware:

```tsx
export function AppsHome({
	boxes,
	username,
	scope,
}: {
	boxes: BoxWithApps[];
	username: string | null;
	scope: string;
}) {
	const scoped = boxes.filter((b) =>
		scope === "personal" ? b.owner === username : b.owner === scope,
	);

	if (scoped.length === 0) {
		return (
			<main className="page-wrap flex flex-col gap-4 px-4 py-8">
				<div className="island-kicker">Your hardware</div>
				<h1 className="font-semibold text-2xl text-[var(--sea-ink)]">Boxes</h1>
				<p className="text-muted-foreground">
					{scope === "personal" ? (
						<>
							No boxes yet — run <code>piper connect</code> on your hardware to
							enroll one.
						</>
					) : (
						<>
							No boxes in this org yet — enroll one with{" "}
							<code>piper enroll --org {scope}</code>.
						</>
					)}
				</p>
			</main>
		);
	}
```

Then replace every remaining reference to `boxes` in the render body (the counts and the `.map`) with `scoped`. Specifically: `onlineCount`/`liveAppCount` reduce over `scoped`, the `{boxes.length} boxes` chip reads `{scoped.length}`, and `boxes.map((box) => …)` becomes `scoped.map((box) => …)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/apps-home.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/apps-home.tsx src/components/apps-home.test.tsx
git commit -m "feat: scope the home box list to the active org

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `OrgSwitcher` presentational component

**Files:**
- Create: `src/components/org-switcher.tsx`
- Test: `src/components/org-switcher.test.tsx`

**Interfaces:**
- Consumes: `Org` from `@/server/relay`.
- Produces: `OrgSwitcher({ scope, orgs, onSelect, onCreate })` where `onSelect: (scope: string) => void` and `onCreate: (name: string) => Promise<Org>`. On a successful create it calls `onSelect(createdOrg.slug)`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/org-switcher.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Org } from "@/server/relay";
import { OrgSwitcher } from "./org-switcher";

const orgs: Org[] = [
	{ slug: "acme", role: "owner" },
	{ slug: "widgets", role: "member" },
];
const noopCreate = async () => ({ slug: "x", role: "owner" as const });

test("labels the active scope and lists Personal + orgs when open", () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={() => {}}
			onCreate={noopCreate}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	expect(screen.getByRole("button", { name: /acme/ })).toBeTruthy();
	expect(screen.getByRole("button", { name: /widgets/ })).toBeTruthy();
});

test("selecting an org calls onSelect with its slug", () => {
	let picked = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={(s) => {
				picked = s;
			}}
			onCreate={noopCreate}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /acme/ }));
	expect(picked).toBe("acme");
});

test("creating an org calls onCreate then selects the new org", async () => {
	let createdWith = "";
	let picked = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={(s) => {
				picked = s;
			}}
			onCreate={async (name) => {
				createdWith = name;
				return { slug: "neworg", role: "owner" };
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /create org/i }));
	fireEvent.change(screen.getByLabelText(/org name/i), {
		target: { value: "New Org" },
	});
	fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
	await waitFor(() => expect(picked).toBe("neworg"));
	expect(createdWith).toBe("New Org");
});

test("a failed create surfaces the error message", async () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={() => {}}
			onCreate={async () => {
				throw new Error("name taken");
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /create org/i }));
	fireEvent.change(screen.getByLabelText(/org name/i), {
		target: { value: "Acme" },
	});
	fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain("name taken"),
	);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/org-switcher.test.tsx`
Expected: FAIL — module `./org-switcher` not found.

- [ ] **Step 3: Implement**

Create `src/components/org-switcher.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import type { Org } from "@/server/relay";

export type OrgSwitcherProps = {
	scope: string;
	orgs: Org[];
	onSelect: (scope: string) => void;
	onCreate: (name: string) => Promise<Org>;
};

export function OrgSwitcher({
	scope,
	orgs,
	onSelect,
	onCreate,
}: OrgSwitcherProps) {
	const [open, setOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const label = scope === "personal" ? "Personal" : scope;

	function pick(s: string) {
		onSelect(s);
		setOpen(false);
		setCreating(false);
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		setError("");
		setBusy(true);
		try {
			const org = await onCreate(name.trim());
			setName("");
			setCreating(false);
			setOpen(false);
			onSelect(org.slug);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Create failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)]"
			>
				{label}
			</button>
			{open && (
				<div
					role="menu"
					className="absolute right-0 z-50 mt-1 flex w-56 flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--header-bg)] p-1.5 shadow-lg"
				>
					<button
						type="button"
						onClick={() => pick("personal")}
						className="rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--chip-bg)]"
					>
						Personal
					</button>
					{orgs.map((o) => (
						<button
							key={o.slug}
							type="button"
							onClick={() => pick(o.slug)}
							className="flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--chip-bg)]"
						>
							<span className="font-mono">{o.slug}</span>
							<span className="text-muted-foreground text-xs">{o.role}</span>
						</button>
					))}
					{creating ? (
						<form onSubmit={submit} className="flex flex-col gap-1.5 p-1.5">
							<input
								aria-label="Org name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Org name"
								className="rounded-lg border border-[var(--line)] px-2 py-1 text-sm"
							/>
							<button
								type="submit"
								disabled={busy || name.trim() === ""}
								className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-sm"
							>
								Create
							</button>
							{error && (
								<p role="alert" className="text-red-600 text-xs">
									{error}
								</p>
							)}
						</form>
					) : (
						<button
							type="button"
							onClick={() => setCreating(true)}
							className="rounded-lg px-3 py-1.5 text-left text-muted-foreground text-sm hover:bg-[var(--chip-bg)]"
						>
							Create org…
						</button>
					)}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/org-switcher.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/org-switcher.tsx src/components/org-switcher.test.tsx
git commit -m "feat: org switcher component with inline create-org

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire it together — server fns, root loader, header, home route, box badge

This task has no new unit-test harness (the repo does not test `createServerFn` wrappers directly); it is verified by `bun run verify` plus a dev smoke, and it carries one presentational test for the box-detail owner badge.

**Files:**
- Modify: `src/server/fns.ts` (add `getOrgs`, `createOrgFn`)
- Modify: `src/routes/__root.tsx` (root loader fetches orgs; wrap layout in `OrgScopeProvider`)
- Modify: `src/components/Header.tsx` (render `OrgSwitcher`)
- Modify: `src/routes/index.tsx` (pass `scope`/`username` to `AppsHome`)
- Modify: `src/components/box-detail.tsx` (owner badge)
- Test: `src/components/box-detail.test.tsx`

**Interfaces:**
- Consumes: `fetchOrgs`, `createOrg`, `Org` (Task 2); `OrgScopeProvider`, `useOrgScope` (Task 3); `AppsHome` props (Task 4); `OrgSwitcher` (Task 5).

- [ ] **Step 1: Add the server functions**

In `src/server/fns.ts`, add `createOrg`, `fetchOrgs` to the `./relay` import, then add:

```ts
export const getOrgs = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchOrgs(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) dropSessionAndRedirect();
		throw err;
	}
});

export const createOrgFn = createServerFn({ method: "POST" })
	.validator((name: string) => name)
	.handler(async ({ data: name }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await createOrg(credential, name);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 2: Fetch orgs in the root loader and provide scope**

In `src/routes/__root.tsx`, import the provider and `getOrgs`, extend the loader, and wrap the layout:

```tsx
import { OrgScopeProvider } from "../components/org-scope";
import { getOrgs, getSession } from "../server/fns";
```

```tsx
	loader: async () => {
		const session = await getSession();
		if (!session) return null;
		return { ...session, orgs: await getOrgs() };
	},
```

```tsx
function RootLayout() {
	const data = Route.useLoaderData();
	return (
		<OrgScopeProvider username={data?.username ?? null} orgs={data?.orgs ?? []}>
			<Header username={data?.username ?? null} />
			<Outlet />
		</OrgScopeProvider>
	);
}
```

- [ ] **Step 3: Render the switcher in the header**

In `src/components/Header.tsx`, import the switcher, the scope hook, the create fn, and the router; render the switcher when signed in. Replace the file body's controls region:

```tsx
import { Link, useRouter } from "@tanstack/react-router";
import { createOrgFn } from "../server/fns";
import { useOrgScope } from "./org-scope";
import { OrgSwitcher } from "./org-switcher";
import SessionControls from "./SessionControls";
import ThemeToggle from "./ThemeToggle";
```

In the JSX, inside the `ml-auto` controls `div`, before `<SessionControls />`, add:

```tsx
					{username && <HeaderSwitcher />}
```

And add this small connector component at the bottom of the file (it reads context and wires the real server fn + refetch — keeping `OrgSwitcher` itself pure):

```tsx
function HeaderSwitcher() {
	const { scope, setScope, orgs } = useOrgScope();
	const router = useRouter();
	return (
		<OrgSwitcher
			scope={scope}
			orgs={orgs}
			onSelect={setScope}
			onCreate={async (name) => {
				const org = await createOrgFn({ data: name });
				router.invalidate();
				return org;
			}}
		/>
	);
}
```

- [ ] **Step 4: Pass scope + username to the home view**

Replace `src/routes/index.tsx`'s `HomePage`:

```tsx
import { useOrgScope } from "@/components/org-scope";
```

```tsx
function HomePage() {
	const boxes = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	return <AppsHome boxes={boxes} scope={scope} username={username} />;
}
```

- [ ] **Step 5: Box-detail owner badge (with a test)**

First, add an `owner` field to **every** existing `BoxWithApps` literal passed to `renderInRouter` in `src/components/box-detail.test.tsx` (e.g. `owner: "zoe"` beside each `base`/`connected`) — Task 1 made `owner` required, so `tsc` fails otherwise. Then add this test (the file's helper is `renderInRouter(box)`):

```tsx
test("shows the owning org slug as a badge", async () => {
	await renderInRouter({
		base: "abc-acme",
		owner: "acme",
		connected: true,
		apps: [],
	});
	expect(screen.getByText("acme")).toBeTruthy();
});
```

In `src/components/box-detail.tsx`, render the owner next to the title:

```tsx
				<h1 className="font-mono font-semibold text-xl">{box.base}</h1>
				<span className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-0.5 text-xs text-muted-foreground">
					{box.owner}
				</span>
```

- [ ] **Step 6: Run tests + full verify**

Run: `bun test`
Expected: PASS (all component + relay tests, including the new box-detail badge test).

Run: `bun run verify`
Expected: Biome clean, `tsc --noEmit` clean, tests pass, build succeeds.

- [ ] **Step 7: Dev smoke**

Run: `bun run dev`, sign in, and confirm: the header shows a "Personal" switcher; opening it lists your orgs with roles and a "Create org…" action; creating an org switches to it and shows the empty-org enroll hint; switching back to Personal restores your personal boxes; reloading preserves the selected scope.

- [ ] **Step 8: Commit**

```bash
bun run format
git add src/server/fns.ts src/routes/__root.tsx src/components/Header.tsx src/routes/index.tsx src/components/box-detail.tsx src/components/box-detail.test.tsx
git commit -m "feat: wire org switcher, scoped home, and create-org end to end

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes for the implementer

- After all tasks: open a PR into `main` titled `feat: phase 3 slice A — org context (switcher, scoping, create org) (#25)`; `main` requires the `verify` check.
- Do **not** add org enrollment, member management, or invite handling here — those are slices B (#26) and C (#27).
- If `bun run verify` flags an unused import after the Header edit, remove only the imports your change orphaned.
