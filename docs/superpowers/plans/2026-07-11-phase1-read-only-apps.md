# Phase 1 — Read-only apps + box views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard home into an apps-first view of every app across the account's connected boxes (with live deploy status), plus a per-box detail page — the read-only foundation Phase 2 (#8) builds on.

**Architecture:** A thin data layer in `src/server/relay.ts` reaches each box's control API through the relay proxy (`GET {relay}/agents/{base}/v1/apps`), authenticated with the account bearer already in the `piper_session` cookie. Server fns in `src/server/fns.ts` fan the calls out and hand plain data to two React components: a grouped apps home and a box detail page. Offline boxes are shown explicitly rather than dropped, because their app state is unreachable via the relay.

**Tech Stack:** Bun + `bun test` (happy-dom preload, Testing Library), TanStack Start server fns + TanStack Router file routes, React 19, Tailwind, Biome.

## Global Constraints

- **Bun only** — never npm/yarn/node. Test runner is `bun test`; DOM comes from the `happydom.ts`/`testing-library.ts` preloads in `bunfig.toml`.
- **Tests never live in `src/routes/`** — the file router scans that directory. Component tests sit beside their component in `src/components/`.
- **No privileged back door** — all data comes from the same authenticated relay control API the CLI uses. The only credential is the account bearer in the `piper_session` cookie.
- **`bun run verify`** (Biome → `tsc --noEmit` → `bun test` → build) must pass before the work is claimed done; CI runs exactly this.
- **Biome enforces formatting** — tabs for indentation, double quotes. Run `bun run format` before committing; don't hand-fight it.
- Relay JSON contract (verified against `getpiper/piper`):
  - `GET {relay}/agents` → `{ "agents": [{ "agent": base, "connected": bool }] }` (**object-wrapped**).
  - `GET {relay}/agents/{base}/v1/apps` → **bare array**, Go-default **capitalized** keys: `Name, Port, Repo, Branch, CreatedAt, Status`. `Status` ∈ `building | running | failed | stopped | ""` (`""` = never-deployed).
  - Status codes: `401` bad/revoked credential, `404` unknown/unowned agent, `503` agent offline, `502` box unreachable.

---

### Task 1: Fix the `fetchBoxes` parsing bug

The relay returns `{ agents: [...] }`, but `fetchBoxes` parses `(await res.json()) as Box[]` (a bare array). The unit test mocks a bare array so it's green, but against a real relay `boxes.map` throws. Fix the parse and the test mock together.

**Files:**
- Modify: `src/server/relay.ts` (the `fetchBoxes` function)
- Test: `src/server/relay.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetchBoxes(credential: string): Promise<Box[]>` — unchanged signature, now correctly parsing the `{ agents: [...] }` envelope.

- [ ] **Step 1: Update the failing test to the real relay shape**

In `src/server/relay.test.ts`, replace the body of the `"fetchBoxes calls GET {relay}/agents with the bearer credential"` test's mock so it returns the wrapped envelope:

```ts
test("fetchBoxes calls GET {relay}/agents and parses the agents envelope", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json({
			agents: [
				{ agent: "abc123-zoe.public.example", connected: true },
				{ agent: "def456-zoe.public.example", connected: false },
			],
		});
	}) as typeof fetch;

	const boxes = await fetchBoxes("cred-1");
	expect(seenUrl).toBe("https://relay.test/agents");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(boxes).toEqual([
		{ agent: "abc123-zoe.public.example", connected: true },
		{ agent: "def456-zoe.public.example", connected: false },
	]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `fetchBoxes` returns the wrapped object, so `boxes` is `{ agents: [...] }` and `toEqual` against the array mismatches (or a downstream shape error).

- [ ] **Step 3: Fix `fetchBoxes` to parse the envelope**

In `src/server/relay.ts`, change the return line of `fetchBoxes` from:

```ts
	return (await res.json()) as Box[];
```

to:

```ts
	const body = (await res.json()) as { agents: Box[] };
	return body.agents;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/server/relay.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "$(cat <<'EOF'
fix: parse the {agents:[...]} envelope in fetchBoxes

The relay wraps the agent list in an object; fetchBoxes parsed it as a bare
array, so boxes.map threw against a real relay. The unit test mocked a bare
array and hid it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `App` type, `BoxOfflineError`, and `fetchApps`

Add the single-box apps fetch and its data type.

**Files:**
- Modify: `src/server/relay.ts`
- Test: `src/server/relay.test.ts`

**Interfaces:**
- Consumes: `relayUrl()`, `RelayAuthError` (existing exports).
- Produces:
  - `type App = { name: string; port: number; repo: string; branch: string; createdAt: string; status: string }`
  - `class BoxOfflineError extends Error`
  - `fetchApps(credential: string, base: string): Promise<App[]>` — `GET {relay}/agents/{base}/v1/apps`; `401` → `RelayAuthError`, `503` → `BoxOfflineError`, other non-2xx → plain `Error`.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/relay.test.ts` (and add `fetchApps`, `BoxOfflineError` to the existing top-of-file import from `./relay`):

```ts
test("fetchApps GETs {relay}/agents/{base}/v1/apps and maps capitalized keys", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json([
			{
				Name: "web",
				Port: 8081,
				Repo: "getpiper/example",
				Branch: "main",
				CreatedAt: "2026-07-11T10:00:00Z",
				Status: "running",
			},
		]);
	}) as typeof fetch;

	const apps = await fetchApps("cred-1", "abc123-zoe.public.example");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc123-zoe.public.example/v1/apps",
	);
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(apps).toEqual([
		{
			name: "web",
			port: 8081,
			repo: "getpiper/example",
			branch: "main",
			createdAt: "2026-07-11T10:00:00Z",
			status: "running",
		},
	]);
});

test("fetchApps throws BoxOfflineError on 503", async () => {
	globalThis.fetch = (async () =>
		new Response("agent not connected", {
			status: 503,
		})) as unknown as typeof fetch;
	expect(fetchApps("cred-1", "abc123-zoe.public.example")).rejects.toBeInstanceOf(
		BoxOfflineError,
	);
});

test("fetchApps throws RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
	expect(fetchApps("bad", "abc123-zoe.public.example")).rejects.toBeInstanceOf(
		RelayAuthError,
	);
});

test("fetchApps throws a plain error on other failures", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 404 })) as unknown as typeof fetch;
	expect(fetchApps("cred-1", "gone-zoe.public.example")).rejects.toThrow(/404/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `fetchApps` and `BoxOfflineError` are not exported (`undefined is not a function` / import error).

- [ ] **Step 3: Implement the type, error, and fetch**

In `src/server/relay.ts`, add after the existing `RelayAuthError` declaration:

```ts
export class BoxOfflineError extends Error {}

export type App = {
	name: string;
	port: number;
	repo: string;
	branch: string;
	createdAt: string;
	status: string;
};

type RawApp = {
	Name: string;
	Port: number;
	Repo: string;
	Branch: string;
	CreatedAt: string;
	Status: string;
};

export async function fetchApps(
	credential: string,
	base: string,
): Promise<App[]> {
	const res = await fetch(`${relayUrl()}/agents/${base}/v1/apps`, {
		headers: { Authorization: `Bearer ${credential}` },
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (!res.ok) {
		throw new Error(`relay /agents/${base}/v1/apps returned ${res.status}`);
	}
	const raw = (await res.json()) as RawApp[];
	return raw.map((a) => ({
		name: a.Name,
		port: a.Port,
		repo: a.Repo,
		branch: a.Branch,
		createdAt: a.CreatedAt,
		status: a.Status,
	}));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "$(cat <<'EOF'
feat: fetchApps — read a box's apps through the relay proxy

Maps the box control API's capitalized JSON keys to a camelCase App type;
surfaces an offline box (503) as a typed BoxOfflineError.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `fetchAllApps` and `fetchBox` (fan-out + single box)

The two shapes the pages need: every box with its apps (home), and one box with its apps (detail). Offline boxes — including a box that goes offline mid-fan-out (`503`) — carry `connected: false, apps: []` rather than throwing.

**Files:**
- Modify: `src/server/relay.ts`
- Test: `src/server/relay.test.ts`

**Interfaces:**
- Consumes: `fetchBoxes`, `fetchApps`, `BoxOfflineError`, `App`, `Box`.
- Produces:
  - `type BoxWithApps = { base: string; connected: boolean; apps: App[] }`
  - `fetchAllApps(credential: string): Promise<BoxWithApps[]>`
  - `fetchBox(credential: string, base: string): Promise<BoxWithApps>`
  - Both propagate `RelayAuthError`; both swallow `BoxOfflineError` into an offline `BoxWithApps`.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/relay.test.ts` (add `fetchAllApps`, `fetchBox` to the `./relay` import). These drive `fetch` by URL so one mock serves both the agents list and the per-box apps calls:

```ts
function routeFetch(routes: Record<string, unknown>) {
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		const key = String(url);
		if (!(key in routes)) return new Response("no route", { status: 500 });
		const body = routes[key];
		if (body === 503) return new Response("offline", { status: 503 });
		return Response.json(body);
	}) as typeof fetch;
}

test("fetchAllApps pairs each box with its apps and skips offline boxes", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [
				{ agent: "up-zoe.public.example", connected: true },
				{ agent: "down-zoe.public.example", connected: false },
			],
		},
		"https://relay.test/agents/up-zoe.public.example/v1/apps": [
			{
				Name: "web",
				Port: 8081,
				Repo: "r",
				Branch: "main",
				CreatedAt: "2026-07-11T10:00:00Z",
				Status: "running",
			},
		],
	});

	const boxes = await fetchAllApps("cred-1");
	expect(boxes).toEqual([
		{
			base: "up-zoe.public.example",
			connected: true,
			apps: [
				{
					name: "web",
					port: 8081,
					repo: "r",
					branch: "main",
					createdAt: "2026-07-11T10:00:00Z",
					status: "running",
				},
			],
		},
		{ base: "down-zoe.public.example", connected: false, apps: [] },
	]);
});

test("fetchAllApps treats a box that 503s mid-fan-out as offline", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [{ agent: "raced-zoe.public.example", connected: true }],
		},
		"https://relay.test/agents/raced-zoe.public.example/v1/apps": 503,
	});

	const boxes = await fetchAllApps("cred-1");
	expect(boxes).toEqual([
		{ base: "raced-zoe.public.example", connected: false, apps: [] },
	]);
});

test("fetchBox returns one box with its apps", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [{ agent: "up-zoe.public.example", connected: true }],
		},
		"https://relay.test/agents/up-zoe.public.example/v1/apps": [
			{
				Name: "api",
				Port: 8082,
				Repo: "r",
				Branch: "main",
				CreatedAt: "2026-07-11T11:00:00Z",
				Status: "failed",
			},
		],
	});

	const box = await fetchBox("cred-1", "up-zoe.public.example");
	expect(box.connected).toBe(true);
	expect(box.apps.map((a) => a.name)).toEqual(["api"]);
});

test("fetchBox returns an offline box with no apps when not connected", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [{ agent: "down-zoe.public.example", connected: false }],
		},
	});

	const box = await fetchBox("cred-1", "down-zoe.public.example");
	expect(box).toEqual({
		base: "down-zoe.public.example",
		connected: false,
		apps: [],
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `fetchAllApps` / `fetchBox` not exported.

- [ ] **Step 3: Implement the fan-out functions**

Append to `src/server/relay.ts`:

```ts
export type BoxWithApps = { base: string; connected: boolean; apps: App[] };

async function appsForBox(
	credential: string,
	base: string,
	connected: boolean,
): Promise<BoxWithApps> {
	if (!connected) return { base, connected: false, apps: [] };
	try {
		return { base, connected: true, apps: await fetchApps(credential, base) };
	} catch (err) {
		// The box dropped between the liveness snapshot and this fetch.
		if (err instanceof BoxOfflineError) {
			return { base, connected: false, apps: [] };
		}
		throw err;
	}
}

export async function fetchAllApps(
	credential: string,
): Promise<BoxWithApps[]> {
	const boxes = await fetchBoxes(credential);
	return Promise.all(
		boxes.map((box) => appsForBox(credential, box.agent, box.connected)),
	);
}

export async function fetchBox(
	credential: string,
	base: string,
): Promise<BoxWithApps> {
	const boxes = await fetchBoxes(credential);
	const connected = boxes.find((b) => b.agent === base)?.connected ?? false;
	return appsForBox(credential, base, connected);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "$(cat <<'EOF'
feat: fetchAllApps and fetchBox — pair boxes with their apps

Fans the per-box apps fetch out over the account's boxes; offline boxes
(including a mid-fan-out 503 race) come back as connected:false, apps:[].

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Server fns `getApps` and `getBox`; drop the now-unused `getBoxes`

Wire the data layer to the routes. Server fns are thin glue around the tested `fetchAllApps`/`fetchBox` (matching the repo convention that `fns.ts` has no unit tests), so this task has no new test file — its guarantee is that the fetch layer is tested and `bun run verify` (typecheck + build) is green. `getBoxes` loses its only caller in Task 7, so it and its `fetchBoxes`-only wrapper role are removed here.

**Files:**
- Modify: `src/server/fns.ts`
- Test: none (covered by `relay.test.ts` + `bun run verify`)

**Interfaces:**
- Consumes: `fetchAllApps`, `fetchBox`, `RelayAuthError` from `./relay`.
- Produces:
  - `getApps` server fn → `Promise<BoxWithApps[]>` (no input).
  - `getBox` server fn → validated input `base: string`, `Promise<BoxWithApps>`.

- [ ] **Step 1: Confirm `getBoxes` has exactly one caller**

Run: `grep -rn "getBoxes\|fetchBoxes" src --include=*.tsx --include=*.ts | grep -v relay.test`
Expected: `getBoxes` referenced only in `src/server/fns.ts` and `src/routes/index.tsx`; `fetchBoxes` referenced in `src/server/relay.ts` and `src/server/relay.test.ts`. (`index.tsx` is rewired in Task 7; `fetchBoxes` stays — it's used by `fetchAllApps`/`fetchBox`.)

- [ ] **Step 2: Rewrite `fns.ts`**

Replace the whole file `src/server/fns.ts` with:

```ts
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { fetchAllApps, fetchBox, RelayAuthError } from "./relay";

export const getSession = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) return null;
	return { username: getCookie("piper_username") ?? "" };
});

// Revoked/garbage credential: drop the dead session and re-login.
function dropSessionAndRedirect(): never {
	deleteCookie("piper_session", { path: "/" });
	deleteCookie("piper_username", { path: "/" });
	throw redirect({ to: "/login" });
}

export const getApps = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchAllApps(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) dropSessionAndRedirect();
		throw err;
	}
});

export const getBox = createServerFn()
	.validator((base: string) => base)
	.handler(async ({ data: base }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchBox(credential, base);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 3: Typecheck (the route still imports `getBoxes` until Task 7 — expected)**

Run: `bun run typecheck`
Expected: FAIL on `src/routes/index.tsx` — `getBoxes` no longer exported. This is expected and fixed in Task 7; do not add `getBoxes` back.

- [ ] **Step 4: Commit**

```bash
bun run format
git add src/server/fns.ts
git commit -m "$(cat <<'EOF'
feat: getApps and getBox server fns; drop getBoxes

Thin auth-guarded wrappers over fetchAllApps/fetchBox with the shared
revoked-credential redirect. index.tsx is rewired to getApps in the next commit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `StatusPill` + `AppsHome` component

The grouped apps home and the shared status pill it and the detail page both use.

**Files:**
- Create: `src/components/status-pill.tsx`
- Create: `src/components/apps-home.tsx`
- Test: `src/components/apps-home.test.tsx`

**Interfaces:**
- Consumes: `BoxWithApps` from `@/server/relay`; `Link` from `@tanstack/react-router`.
- Produces:
  - `StatusPill({ status }: { status: string })` — labels `running`/`building`/`failed`/`stopped`, and `""` (or any unknown) → `Never deployed`.
  - `AppsHome({ boxes }: { boxes: BoxWithApps[] })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/apps-home.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { RouterProvider, createRootRoute, createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxWithApps } from "@/server/relay";
import { AppsHome } from "./apps-home";

// AppsHome renders <Link>, which needs a router context to mount.
function renderInRouter(boxes: BoxWithApps[]) {
	const rootRoute = createRootRoute({ component: () => <AppsHome boxes={boxes} /> });
	const router = createRouter({ routeTree: rootRoute });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("shows each connected box's apps with their status", () => {
	renderInRouter([
		{
			base: "up-zoe.public.example",
			connected: true,
			apps: [
				{
					name: "web",
					port: 8081,
					repo: "r",
					branch: "main",
					createdAt: "2026-07-11T10:00:00Z",
					status: "running",
				},
			],
		},
	]);
	expect(screen.getByText("web")).toBeTruthy();
	expect(screen.getByText(/running/i)).toBeTruthy();
	expect(screen.getByText("up-zoe.public.example")).toBeTruthy();
});

test("renders an offline box as unavailable, with no app rows", () => {
	renderInRouter([
		{ base: "down-zoe.public.example", connected: false, apps: [] },
	]);
	expect(screen.getByText("down-zoe.public.example")).toBeTruthy();
	expect(screen.getByText(/apps unavailable/i)).toBeTruthy();
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});

test("shows the empty state when the account has no boxes", () => {
	renderInRouter([]);
	expect(screen.getByText(/no boxes yet/i)).toBeTruthy();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/apps-home.test.tsx`
Expected: FAIL — `./apps-home` does not exist.

- [ ] **Step 3: Implement `StatusPill`**

Create `src/components/status-pill.tsx`:

```tsx
const STATUS: Record<string, { label: string; dot: string }> = {
	running: { label: "Running", dot: "bg-emerald-500" },
	building: { label: "Building", dot: "bg-amber-500" },
	failed: { label: "Failed", dot: "bg-red-500" },
	stopped: { label: "Stopped", dot: "bg-gray-400" },
};

export function StatusPill({ status }: { status: string }) {
	const meta = STATUS[status] ?? { label: "Never deployed", dot: "bg-gray-400" };
	return (
		<span className="flex items-center gap-2 text-sm text-muted-foreground">
			<span className={`h-2 w-2 rounded-full ${meta.dot}`} />
			{meta.label}
		</span>
	);
}
```

- [ ] **Step 4: Implement `AppsHome`**

Create `src/components/apps-home.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import type { BoxWithApps } from "@/server/relay";
import { StatusPill } from "./status-pill";

export function AppsHome({ boxes }: { boxes: BoxWithApps[] }) {
	if (boxes.length === 0) {
		return (
			<main className="page-wrap flex flex-col gap-4 px-4 py-8">
				<h1 className="font-semibold text-2xl">Apps</h1>
				<p className="text-muted-foreground">
					No boxes yet — run <code>piper connect</code> on your hardware to
					enroll one.
				</p>
			</main>
		);
	}
	return (
		<main className="page-wrap flex flex-col gap-6 px-4 py-8">
			<h1 className="font-semibold text-2xl">Apps</h1>
			{boxes.map((box) => (
				<section key={box.base} className="flex flex-col gap-2">
					<header className="flex items-center gap-2">
						<span
							className={`h-2 w-2 rounded-full ${
								box.connected ? "bg-emerald-500" : "bg-gray-400"
							}`}
						/>
						<Link
							to="/boxes/$base"
							params={{ base: box.base }}
							className="font-mono text-sm text-muted-foreground hover:underline"
						>
							{box.base}
						</Link>
					</header>
					{!box.connected ? (
						<p className="pl-4 text-muted-foreground text-sm">
							offline — apps unavailable
						</p>
					) : box.apps.length === 0 ? (
						<p className="pl-4 text-muted-foreground text-sm">
							No apps deployed
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{box.apps.map((app) => (
								<li
									key={app.name}
									className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3"
								>
									<span className="font-medium text-sm">{app.name}</span>
									<StatusPill status={app.status} />
								</li>
							))}
						</ul>
					)}
				</section>
			))}
		</main>
	);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test src/components/apps-home.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/components/status-pill.tsx src/components/apps-home.tsx src/components/apps-home.test.tsx
git commit -m "$(cat <<'EOF'
feat: apps-first home grouped by box, with status pills

Connected boxes list their apps + deploy status; offline boxes render as
"apps unavailable"; zero boxes shows the piper-connect empty state.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `BoxDetail` component

The per-box detail page body: liveness + that box's apps, reusing `StatusPill`.

**Files:**
- Create: `src/components/box-detail.tsx`
- Test: `src/components/box-detail.test.tsx`

**Interfaces:**
- Consumes: `BoxWithApps` from `@/server/relay`; `StatusPill`.
- Produces: `BoxDetail({ box }: { box: BoxWithApps })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/box-detail.test.tsx` (no router needed — `BoxDetail` renders no `<Link>`):

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { BoxDetail } from "./box-detail";

test("shows the box as connected and lists its apps with status", () => {
	render(
		<BoxDetail
			box={{
				base: "up-zoe.public.example",
				connected: true,
				apps: [
					{
						name: "api",
						port: 8082,
						repo: "r",
						branch: "main",
						createdAt: "2026-07-11T11:00:00Z",
						status: "failed",
					},
				],
			}}
		/>,
	);
	expect(screen.getByText("up-zoe.public.example")).toBeTruthy();
	expect(screen.getByText(/connected/i)).toBeTruthy();
	expect(screen.getByText("api")).toBeTruthy();
	expect(screen.getByText(/failed/i)).toBeTruthy();
});

test("shows an offline box with no apps", () => {
	render(
		<BoxDetail
			box={{ base: "down-zoe.public.example", connected: false, apps: [] }}
		/>,
	);
	expect(screen.getByText(/offline/i)).toBeTruthy();
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/box-detail.test.tsx`
Expected: FAIL — `./box-detail` does not exist.

- [ ] **Step 3: Implement `BoxDetail`**

Create `src/components/box-detail.tsx`:

```tsx
import type { BoxWithApps } from "@/server/relay";
import { StatusPill } from "./status-pill";

export function BoxDetail({ box }: { box: BoxWithApps }) {
	return (
		<main className="page-wrap flex flex-col gap-4 px-4 py-8">
			<div className="flex items-center gap-2">
				<span
					className={`h-2 w-2 rounded-full ${
						box.connected ? "bg-emerald-500" : "bg-gray-400"
					}`}
				/>
				<h1 className="font-mono font-semibold text-xl">{box.base}</h1>
				<span className="text-muted-foreground text-sm">
					{box.connected ? "Connected" : "Offline"}
				</span>
			</div>
			{!box.connected ? (
				<p className="text-muted-foreground">
					This box is offline — its apps can't be reached.
				</p>
			) : box.apps.length === 0 ? (
				<p className="text-muted-foreground">No apps deployed.</p>
			) : (
				<ul className="flex flex-col gap-2">
					{box.apps.map((app) => (
						<li
							key={app.name}
							className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3"
						>
							<span className="font-medium text-sm">{app.name}</span>
							<StatusPill status={app.status} />
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/box-detail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/box-detail.tsx src/components/box-detail.test.tsx
git commit -m "$(cat <<'EOF'
feat: box detail component — liveness + the box's apps

Read-only for now; this is the surface Phase 2's write actions will hang on.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire the routes; remove the dead box list; full verify

Point the home route at `getApps`/`AppsHome`, add the box detail route, and delete the now-orphaned `box-list.tsx` (+ its test). This is the task that makes `bun run verify` green end-to-end.

**Files:**
- Modify: `src/routes/index.tsx`
- Create: `src/routes/boxes/$base.tsx`
- Delete: `src/components/box-list.tsx`, `src/components/box-list.test.tsx`
- Regenerate: `src/routeTree.gen.ts` (via `bun run generate-routes`)

**Interfaces:**
- Consumes: `getApps`, `getBox` (Task 4); `AppsHome` (Task 5); `BoxDetail` (Task 6).
- Produces: routes `/` and `/boxes/$base`.

- [ ] **Step 1: Rewrite the home route**

Replace `src/routes/index.tsx` with (keeps the existing `RelayError` retry component):

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppsHome } from "@/components/apps-home";
import { getApps } from "@/server/fns";

export const Route = createFileRoute("/")({
	loader: () => getApps(),
	component: HomePage,
	errorComponent: RelayError,
});

function HomePage() {
	const boxes = Route.useLoaderData();
	return <AppsHome boxes={boxes} />;
}

// Relay unreachable / 5xx: the session may be fine, so keep cookies and retry.
function RelayError() {
	const router = useRouter();
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-3">
			<p>Couldn't reach the relay.</p>
			<button
				type="button"
				onClick={() => router.invalidate()}
				className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm"
			>
				Retry
			</button>
		</main>
	);
}
```

- [ ] **Step 2: Add the box detail route**

Create `src/routes/boxes/$base.tsx`:

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BoxDetail } from "@/components/box-detail";
import { getBox } from "@/server/fns";

export const Route = createFileRoute("/boxes/$base")({
	loader: ({ params }) => getBox({ data: params.base }),
	component: BoxPage,
	errorComponent: RelayError,
});

function BoxPage() {
	const box = Route.useLoaderData();
	return <BoxDetail box={box} />;
}

function RelayError() {
	const router = useRouter();
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-3">
			<p>Couldn't reach the relay.</p>
			<button
				type="button"
				onClick={() => router.invalidate()}
				className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm"
			>
				Retry
			</button>
		</main>
	);
}
```

- [ ] **Step 3: Delete the orphaned box list**

Run: `git rm src/components/box-list.tsx src/components/box-list.test.tsx`

- [ ] **Step 4: Regenerate the route tree**

Run: `bun run generate-routes`
Expected: `src/routeTree.gen.ts` updates to include `/boxes/$base` and no longer errors.

- [ ] **Step 5: Full verify**

Run: `bun run verify`
Expected: PASS — Biome clean, `tsc` clean (no lingering `getBoxes`/`BoxList` references), all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/routes/index.tsx src/routes/boxes/$base.tsx src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat: apps-first home + box detail routes

Home loads getApps into the grouped AppsHome; /boxes/$base loads getBox into
BoxDetail. Removes the superseded box-list component.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Manual verification (after Task 7)

Read-only data from a live relay — drive the real flow, not just tests:

1. `bun run dev`, log in with GitHub (existing Phase 0 flow).
2. Home shows connected boxes grouped, each with its apps + status; an offline box shows "offline — apps unavailable"; a box with no apps shows "No apps deployed".
3. Click a box name → `/boxes/{base}` renders liveness + that box's apps.
4. With `PIPER_RELAY_URL` unset or the relay down, the home shows the "Couldn't reach the relay" retry, not a crash.

## Notes for the implementer

- **Server fns take `{ data }`.** `getBox` is called as `getBox({ data: params.base })` from the loader; inside, the validated value arrives as `data`.
- **`Link` needs a router in tests.** `AppsHome` renders `<Link>`, so its test mounts a minimal `RouterProvider` (shown in Task 5). `BoxDetail` renders no `Link`, so its test renders it directly.
- **Don't reintroduce `getBoxes`/`BoxList`.** The typecheck failure at the end of Task 4 is expected and is resolved by Task 7.
- **Offline race is deliberate:** `fetchAllApps` swallowing `BoxOfflineError` is intentional — a box can drop between the `/agents` liveness snapshot and the per-box apps fetch.
