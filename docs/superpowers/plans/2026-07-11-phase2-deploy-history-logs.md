# Phase 2 slice A — Deploy history + logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-app detail page reachable from the box view that shows an app's deployment history (production vs. PR previews) and lets the user read each deploy's build/deploy logs, live-tailing while a deploy is building.

**Architecture:** Extends the Phase 1 thin-proxy pattern. Two new relay-client fetchers (`fetchDeployments`, `fetchDeploymentLogs`) wrap the box control API the relay proxies (`GET /agents/{base}/v1/apps/{app}/deployments` and `.../{id}/logs`, shipped in piper#101). Two server fns expose them over the session cookie. A new standalone route `/boxes/$base/apps/$app` renders a presentational `AppDetail` component; expanding a deployment fetches its logs, and a `building` deploy polls on an interval via a small `useLiveTail` hook.

**Tech Stack:** Bun, TanStack Start + Router (file-based), React, Tailwind, Testing Library + `bun test` (happy-dom preload), Biome.

## Global Constraints

- **Bun only** — never npm/yarn/node. Test with `bun test`; verify with `bun run verify`.
- **Formatting is Biome** — tabs for indentation; run `bun run format` if unsure. Don't hand-fight it.
- **Tests never live in `src/routes/`** (the file router scans it). Component/data tests sit next to their unit in `src/components/` and `src/server/`.
- **`bun run verify`** (Biome → `tsc --noEmit` → `bun test` → build) must pass before any task is claimed done.
- **Wire keys are Go-capitalized** — the box API structs carry no JSON tags. Map to camelCase at the `relay.ts` boundary; nothing above it sees Go casing.
- **Deploy history is already newest-first** — the box orders `ORDER BY created_at DESC`; preserve array order, do not re-sort.
- **Commits** are conventional and end with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 1: Relay client — `fetchDeployments` + `fetchDeploymentLogs`

**Files:**
- Modify: `src/server/relay.ts` (append new types + two functions; reuse existing `relayUrl`, `RelayAuthError`, `BoxOfflineError`)
- Test: `src/server/relay.test.ts` (append)

**Interfaces:**
- Consumes: existing `relayUrl()`, `class RelayAuthError`, `class BoxOfflineError` from `relay.ts`.
- Produces:
  - `type Deployment = { id: string; pr: number; status: string; createdAt: string }`
  - `fetchDeployments(credential: string, base: string, app: string): Promise<Deployment[]>`
  - `fetchDeploymentLogs(credential: string, base: string, app: string, id: string): Promise<string>`

- [ ] **Step 1: Write the failing tests**

Append to `src/server/relay.test.ts`. Also add `fetchDeployments` and `fetchDeploymentLogs` to the existing top-of-file import from `./relay`.

```ts
test("fetchDeployments GETs the deployments path and maps capitalized keys", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json([
			{
				ID: "dep-abc123",
				App: "web",
				PR: 0,
				ImageID: "img",
				ContainerID: "ctr",
				HostPort: 8081,
				Status: "running",
				CreatedAt: "2026-07-11T10:00:00Z",
			},
			{
				ID: "dep-def456",
				App: "web",
				PR: 12,
				ImageID: "img2",
				ContainerID: "ctr2",
				HostPort: 8082,
				Status: "failed",
				CreatedAt: "2026-07-11T09:00:00Z",
			},
		]);
	}) as typeof fetch;

	const deps = await fetchDeployments("cred-1", "abc-zoe.public.example", "web");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web/deployments",
	);
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(deps).toEqual([
		{ id: "dep-abc123", pr: 0, status: "running", createdAt: "2026-07-11T10:00:00Z" },
		{ id: "dep-def456", pr: 12, status: "failed", createdAt: "2026-07-11T09:00:00Z" },
	]);
});

test("fetchDeployments throws RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
	expect(
		fetchDeployments("bad", "abc-zoe.public.example", "web"),
	).rejects.toBeInstanceOf(RelayAuthError);
});

test("fetchDeployments throws BoxOfflineError on 503 and 502", async () => {
	globalThis.fetch = (async () =>
		new Response("offline", { status: 503 })) as unknown as typeof fetch;
	expect(
		fetchDeployments("cred-1", "abc-zoe.public.example", "web"),
	).rejects.toBeInstanceOf(BoxOfflineError);
	globalThis.fetch = (async () =>
		new Response("unreachable", { status: 502 })) as unknown as typeof fetch;
	expect(
		fetchDeployments("cred-1", "abc-zoe.public.example", "web"),
	).rejects.toBeInstanceOf(BoxOfflineError);
});

test("fetchDeployments throws a plain error on other failures", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 404 })) as unknown as typeof fetch;
	expect(
		fetchDeployments("cred-1", "abc-zoe.public.example", "gone"),
	).rejects.toThrow(/404/);
});

test("fetchDeploymentLogs GETs the logs path and returns the text body", async () => {
	let seenUrl = "";
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		seenUrl = String(url);
		return new Response("build step 1\nbuild step 2\n", {
			headers: { "Content-Type": "text/plain" },
		});
	}) as typeof fetch;

	const logs = await fetchDeploymentLogs(
		"cred-1",
		"abc-zoe.public.example",
		"web",
		"dep-abc123",
	);
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web/deployments/dep-abc123/logs",
	);
	expect(logs).toBe("build step 1\nbuild step 2\n");
});

test("fetchDeploymentLogs throws BoxOfflineError on 503", async () => {
	globalThis.fetch = (async () =>
		new Response("offline", { status: 503 })) as unknown as typeof fetch;
	expect(
		fetchDeploymentLogs("cred-1", "abc-zoe.public.example", "web", "dep-x"),
	).rejects.toBeInstanceOf(BoxOfflineError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `fetchDeployments`/`fetchDeploymentLogs` are not exported (import error / not a function).

- [ ] **Step 3: Implement the two fetchers**

Append to `src/server/relay.ts`:

```ts
export type Deployment = {
	id: string;
	pr: number;
	status: string;
	createdAt: string;
};

type RawDeployment = {
	ID: string;
	PR: number;
	Status: string;
	CreatedAt: string;
};

export async function fetchDeployments(
	credential: string,
	base: string,
	app: string,
): Promise<Deployment[]> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps/${encodeURIComponent(
			app,
		)}/deployments`,
		{ headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (!res.ok) {
		throw new Error(
			`relay /agents/${base}/v1/apps/${app}/deployments returned ${res.status}`,
		);
	}
	const raw = (await res.json()) as RawDeployment[];
	return raw.map((d) => ({
		id: d.ID,
		pr: d.PR,
		status: d.Status,
		createdAt: d.CreatedAt,
	}));
}

export async function fetchDeploymentLogs(
	credential: string,
	base: string,
	app: string,
	id: string,
): Promise<string> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps/${encodeURIComponent(
			app,
		)}/deployments/${encodeURIComponent(id)}/logs`,
		{ headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (!res.ok) {
		throw new Error(`relay deployment logs returned ${res.status}`);
	}
	return res.text();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS (all existing + 6 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "$(cat <<'EOF'
feat: relay client for deployment history + logs

fetchDeployments and fetchDeploymentLogs wrap the box control API
(GET .../deployments and .../{id}/logs) proxied by the relay, mapping
the Go-capitalized deployment wire shape to a camelCase Deployment type.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `AppDetail` component + `useLiveTail`

**Files:**
- Create: `src/components/app-detail.tsx`
- Test: `src/components/app-detail.test.tsx`

**Interfaces:**
- Consumes: `type App`, `type Deployment` from `@/server/relay`; `StatusPill` from `./status-pill`; `relativeTime` from `@/lib/relative-time`.
- Produces:
  - `type AppDetailProps = { base: string; connected: boolean; app: App | null; deployments: Deployment[]; fetchLogs: (id: string) => Promise<string>; refresh: () => void }`
  - `function AppDetail(props: AppDetailProps): JSX.Element`

**Behavior notes for the implementer:**
- `app` is `null` when the box is offline or the app was not found on it → render an explicit message, not an empty page.
- Deployments arrive newest-first; render in array order (do not sort).
- Each deployment row is a toggle button; expanding it mounts a log panel. The panel uses `useLiveTail`, so an unmounted (collapsed) panel does no polling.
- `useLiveTail(status, fetchLogs, refresh)`: fetches logs once on mount; while `status === "building"`, re-fetches every 2s and calls `refresh()` each tick (so the loader refetches and the status pill flips). When `status` changes to a terminal value the effect re-runs, fetches a final time, and sets up no interval.
- A production deploy (`pr === 0`) shows a "Production" badge; a preview (`pr > 0`) shows `PR #{pr}` linking to `https://github.com/{app.repo}/pull/{pr}` (plain `<a>`, opens the real GitHub PR).

- [ ] **Step 1: Write the failing tests**

Create `src/components/app-detail.test.tsx`:

```tsx
import { expect, jest, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { App, Deployment } from "@/server/relay";
import { AppDetail } from "./app-detail";

const app: App = {
	name: "web",
	port: 8081,
	repo: "getpiper/example",
	branch: "main",
	createdAt: "2026-07-11T10:00:00Z",
	status: "running",
};

const dep = (over: Partial<Deployment>): Deployment => ({
	id: "dep-abc1234",
	pr: 0,
	status: "running",
	createdAt: "2026-07-11T10:00:00Z",
	...over,
});

const noop = () => {};
const emptyLogs = async () => "";

test("renders the app header with repo and branch", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
		/>,
	);
	expect(screen.getByText("web")).toBeTruthy();
	expect(screen.getByText(/getpiper\/example/)).toBeTruthy();
	expect(screen.getByText(/main/)).toBeTruthy();
});

test("shows an offline message when the app is null", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			connected={false}
			app={null}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/offline/i)).toBeTruthy();
});

test("lists deployments and distinguishes production from PR previews", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			connected={true}
			app={app}
			deployments={[
				dep({ id: "dep-prod0001", pr: 0, status: "running" }),
				dep({ id: "dep-prev0002", pr: 12, status: "failed" }),
			]}
			fetchLogs={emptyLogs}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/Production/)).toBeTruthy();
	const prLink = screen.getByRole("link", { name: /PR #12/ });
	expect(prLink.getAttribute("href")).toBe(
		"https://github.com/getpiper/example/pull/12",
	);
});

test("expanding a deployment fetches and shows its logs", async () => {
	const fetchLogs = async (id: string) => `logs for ${id}`;
	render(
		<AppDetail
			base="abc-zoe.public.example"
			connected={true}
			app={app}
			deployments={[dep({ id: "dep-abc1234", status: "failed" })]}
			fetchLogs={fetchLogs}
			refresh={noop}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /dep-abc1/ }));
	expect(await screen.findByText("logs for dep-abc1234")).toBeTruthy();
});

test("a building deployment live-tails logs and refreshes on interval", async () => {
	jest.useFakeTimers();
	let calls = 0;
	let refreshes = 0;
	const fetchLogs = async () => {
		calls++;
		return `log ${calls}`;
	};
	render(
		<AppDetail
			base="abc-zoe.public.example"
			connected={true}
			app={app}
			deployments={[dep({ id: "dep-build001", status: "building" })]}
			fetchLogs={fetchLogs}
			refresh={() => {
				refreshes++;
			}}
		/>,
	);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /dep-buil/ }));
	});
	expect(calls).toBe(1);
	await act(async () => {
		jest.advanceTimersByTime(4000);
	});
	expect(calls).toBe(3);
	expect(refreshes).toBe(2);
	jest.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/app-detail.test.tsx`
Expected: FAIL — `./app-detail` module / `AppDetail` export not found.

- [ ] **Step 3: Implement the component**

Create `src/components/app-detail.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/lib/relative-time";
import type { App, Deployment } from "@/server/relay";
import { StatusPill } from "./status-pill";

// TODO(https://github.com/getpiper/piper/issues/137): the relay assigns each
// app's real public hostname at deploy time and does not return it in the apps
// API. This mock stands in until that lands (mirrors apps-home.tsx).
function mockAppUrl(app: string, base: string): string {
	return `${app}-${base}.public.getpiper.co`;
}

export type AppDetailProps = {
	base: string;
	connected: boolean;
	app: App | null;
	deployments: Deployment[];
	fetchLogs: (id: string) => Promise<string>;
	refresh: () => void;
};

export function AppDetail({
	base,
	connected,
	app,
	deployments,
	fetchLogs,
	refresh,
}: AppDetailProps) {
	if (!connected || !app) {
		return (
			<main className="page-wrap flex flex-col gap-4 px-4 py-8">
				<p className="text-muted-foreground">
					This box is offline — its apps can't be reached.
				</p>
			</main>
		);
	}

	const url = mockAppUrl(app.name, base);
	return (
		<main className="page-wrap flex flex-col gap-6 px-4 py-8">
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-3">
					<h1 className="font-mono font-semibold text-xl">{app.name}</h1>
					<StatusPill status={app.status} />
				</div>
				<a
					href={`https://${url}`}
					className="text-muted-foreground text-sm underline"
				>
					{url}
				</a>
				<p className="text-muted-foreground text-sm">
					{app.repo} · {app.branch}
				</p>
			</div>

			<section className="flex flex-col gap-2">
				<h2 className="font-semibold text-sm">Deployments</h2>
				{deployments.length === 0 ? (
					<p className="text-muted-foreground text-sm">No deployments yet.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{deployments.map((d) => (
							<DeploymentRow
								key={d.id}
								deployment={d}
								repo={app.repo}
								fetchLogs={fetchLogs}
								refresh={refresh}
							/>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}

function DeploymentRow({
	deployment,
	repo,
	fetchLogs,
	refresh,
}: {
	deployment: Deployment;
	repo: string;
	fetchLogs: (id: string) => Promise<string>;
	refresh: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<li className="rounded-lg border border-[var(--line)]">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
			>
				<span className="flex items-center gap-3">
					<span className="font-mono text-sm">{deployment.id.slice(0, 7)}</span>
					{deployment.pr > 0 ? (
						<a
							href={`https://github.com/${repo}/pull/${deployment.pr}`}
							onClick={(e) => e.stopPropagation()}
							className="text-sm underline"
						>
							PR #{deployment.pr}
						</a>
					) : (
						<span className="text-muted-foreground text-sm">Production</span>
					)}
				</span>
				<span className="flex items-center gap-3">
					<StatusPill status={deployment.status} />
					<span className="text-muted-foreground text-xs">
						{relativeTime(deployment.createdAt)}
					</span>
				</span>
			</button>
			{open && (
				<LogPanel
					status={deployment.status}
					fetchLogs={() => fetchLogs(deployment.id)}
					refresh={refresh}
				/>
			)}
		</li>
	);
}

function LogPanel({
	status,
	fetchLogs,
	refresh,
}: {
	status: string;
	fetchLogs: () => Promise<string>;
	refresh: () => void;
}) {
	const logs = useLiveTail(status, fetchLogs, refresh);
	return (
		<pre className="max-h-96 overflow-auto border-[var(--line)] border-t bg-[var(--chip-bg)] px-4 py-3 font-mono text-xs">
			{logs || "No logs."}
		</pre>
	);
}

function useLiveTail(
	status: string,
	fetchLogs: () => Promise<string>,
	refresh: () => void,
	intervalMs = 2000,
): string {
	const [logs, setLogs] = useState("");
	const fetchRef = useRef(fetchLogs);
	fetchRef.current = fetchLogs;
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	useEffect(() => {
		let live = true;
		const load = () =>
			fetchRef.current().then((t) => {
				if (live) setLogs(t);
			});
		load();
		if (status !== "building") {
			return () => {
				live = false;
			};
		}
		const id = setInterval(() => {
			load();
			refreshRef.current();
		}, intervalMs);
		return () => {
			live = false;
			clearInterval(id);
		};
	}, [status, intervalMs]);
	return logs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/app-detail.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/app-detail.tsx src/components/app-detail.test.tsx
git commit -m "$(cat <<'EOF'
feat: AppDetail component with deploy history + log live-tail

Presentational per-app view: header, deployment list (production vs.
PR-preview with a GitHub PR link), and expandable logs. A building
deploy live-tails via a useLiveTail hook that polls logs and refreshes
the loader every 2s until the status goes terminal.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Make box-view app rows link to the app detail page

**Files:**
- Modify: `src/components/box-detail.tsx` (wrap each app row in a `Link`)
- Test: `src/components/box-detail.test.tsx` (render in a router; assert the link href)

**Interfaces:**
- Consumes: `Link` from `@tanstack/react-router`; the route path `/boxes/$base/apps/$app` (created in Task 4, but the `to`/`params` string is stable and can be written now).
- Produces: no new exports.

**Note:** `BoxDetail` now renders `<Link>`, which needs a router context to mount. The existing two tests must be updated to render inside a router (mirroring `apps-home.test.tsx`).

- [ ] **Step 1: Rewrite the test file to render in a router and assert the link**

Replace the contents of `src/components/box-detail.test.tsx` with:

```tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxWithApps } from "@/server/relay";
import { BoxDetail } from "./box-detail";

// BoxDetail renders <Link>, which needs a router context to mount.
async function renderInRouter(box: BoxWithApps) {
	const rootRoute = createRootRoute({
		component: () => <BoxDetail box={box} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("shows the box as connected and lists its apps with status", async () => {
	await renderInRouter({
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
	});
	expect(screen.getByText("up-zoe.public.example")).toBeTruthy();
	expect(screen.getByText(/connected/i)).toBeTruthy();
	expect(screen.getByText("api")).toBeTruthy();
	expect(screen.getByText(/failed/i)).toBeTruthy();
});

test("links each app to its detail page", async () => {
	await renderInRouter({
		base: "up-zoe.public.example",
		connected: true,
		apps: [
			{
				name: "api",
				port: 8082,
				repo: "r",
				branch: "main",
				createdAt: "2026-07-11T11:00:00Z",
				status: "running",
			},
		],
	});
	const link = screen.getByRole("link", { name: /api/ });
	expect(link.getAttribute("href")).toBe(
		"/boxes/up-zoe.public.example/apps/api",
	);
});

test("shows an offline box with no apps", async () => {
	await renderInRouter({
		base: "down-zoe.public.example",
		connected: false,
		apps: [],
	});
	expect(screen.getByText(/offline/i)).toBeTruthy();
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/box-detail.test.tsx`
Expected: FAIL — the "links each app" test fails (no link rendered / no matching role).

- [ ] **Step 3: Wrap the app row in a `Link`**

In `src/components/box-detail.tsx`, add the import and replace the app `<li>` body. Add to the imports:

```tsx
import { Link } from "@tanstack/react-router";
```

Replace this block:

```tsx
					{box.apps.map((app) => (
						<li
							key={app.name}
							className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3"
						>
							<span className="font-medium text-sm">{app.name}</span>
							<StatusPill status={app.status} />
						</li>
					))}
```

with:

```tsx
					{box.apps.map((app) => (
						<li key={app.name}>
							<Link
								to="/boxes/$base/apps/$app"
								params={{ base: box.base, app: app.name }}
								className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3 hover:bg-[var(--chip-bg)]"
							>
								<span className="font-medium text-sm">{app.name}</span>
								<StatusPill status={app.status} />
							</Link>
						</li>
					))}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/box-detail.test.tsx`
Expected: PASS (3 tests).

> Note: `tsc` will report that the route `/boxes/$base/apps/$app` doesn't exist yet — that's expected and resolved in Task 4 when the route file is generated. Do not run `bun run verify` until Task 4. The `bun test` above passes because the router type-checking is not enforced at test runtime.

- [ ] **Step 5: Commit**

```bash
git add src/components/box-detail.tsx src/components/box-detail.test.tsx
git commit -m "$(cat <<'EOF'
feat: link box-view app rows to the app detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Server fns + app-detail route (wiring)

**Files:**
- Modify: `src/server/fns.ts` (add `getDeployments`, `getDeploymentLogs`)
- Create: `src/routes/boxes/$base_.apps.$app.tsx`
- Regenerate: `src/routeTree.gen.ts` (via `bun run generate-routes`)

**Interfaces:**
- Consumes: `fetchDeployments`, `fetchDeploymentLogs`, `BoxOfflineError`, `RelayAuthError` from `./relay`; existing `getBox`, `dropSessionAndRedirect` in `fns.ts`; `AppDetail` from `@/components/app-detail`; `RelayError` from `@/components/relay-error`.
- Produces:
  - `getDeployments` server fn — validator `{ base: string; app: string }`, returns `Deployment[]` (empty on a mid-request box drop).
  - `getDeploymentLogs` server fn — validator `{ base: string; app: string; id: string }`, returns `string`.
  - Route at path `/boxes/$base/apps/$app`.

This task is integration glue (server fns + route), matching the repo convention that routes and server fns are not unit-tested. Its deliverable is verified end-to-end by `bun run verify` plus a manual smoke check.

- [ ] **Step 1: Add the two server fns**

In `src/server/fns.ts`, extend the existing relay import:

```ts
import {
	BoxOfflineError,
	fetchAllApps,
	fetchBox,
	fetchDeployments,
	fetchDeploymentLogs,
	RelayAuthError,
} from "./relay";
```

Append these server fns to the file:

```ts
export const getDeployments = createServerFn()
	.validator((d: { base: string; app: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchDeployments(credential, data.base, data.app);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			// The box dropped between the box lookup and this fetch.
			if (err instanceof BoxOfflineError) return [];
			throw err;
		}
	});

export const getDeploymentLogs = createServerFn()
	.validator((d: { base: string; app: string; id: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchDeploymentLogs(
				credential,
				data.base,
				data.app,
				data.id,
			);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 2: Create the route file**

Create `src/routes/boxes/$base_.apps.$app.tsx`:

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppDetail } from "@/components/app-detail";
import { RelayError } from "@/components/relay-error";
import { getBox, getDeployments, getDeploymentLogs } from "@/server/fns";

export const Route = createFileRoute("/boxes/$base_/apps/$app")({
	loader: async ({ params }) => {
		const box = await getBox({ data: params.base });
		const app = box.connected
			? (box.apps.find((a) => a.name === params.app) ?? null)
			: null;
		const deployments = app
			? await getDeployments({ data: { base: params.base, app: params.app } })
			: [];
		return { box, app, deployments };
	},
	component: AppDetailPage,
	errorComponent: RelayError,
});

function AppDetailPage() {
	const { base, app: appName } = Route.useParams();
	const { box, app, deployments } = Route.useLoaderData();
	const router = useRouter();
	return (
		<AppDetail
			base={base}
			connected={box.connected}
			app={app}
			deployments={deployments}
			fetchLogs={async (id) => {
				try {
					return await getDeploymentLogs({
						data: { base, app: appName, id },
					});
				} catch {
					return "Couldn't load logs.";
				}
			}}
			refresh={() => {
				router.invalidate();
			}}
		/>
	);
}
```

- [ ] **Step 3: Regenerate the route tree**

Run: `bun run generate-routes`
Expected: `src/routeTree.gen.ts` now contains `path: '/boxes/$base/apps/$app'`.

Verify: `grep "boxes/\$base/apps/\$app" src/routeTree.gen.ts` prints a match.

- [ ] **Step 4: Full verify**

Run: `bun run verify`
Expected: Biome clean, `tsc --noEmit` passes (the `Link` `to` in Task 3 now resolves against the generated route), all tests pass, build succeeds.

- [ ] **Step 5: Manual smoke check**

Run: `bun run dev`, open `http://localhost:3000`, log in, open a box with a deployed app, click the app. Confirm: the app detail page renders; the deployment list shows; clicking a deployment reveals its logs; a `failed` deploy's logs are readable; a `PR #N` row links to the GitHub PR. Stop the dev server.

(If no real box/relay is available, note that in the PR and rely on `bun run verify` + component tests as the automated gate.)

- [ ] **Step 6: Commit**

```bash
git add src/server/fns.ts src/routes/boxes/\$base_.apps.\$app.tsx src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat: app detail route wiring deploy history + logs

getDeployments/getDeploymentLogs server fns over the session cookie, and
a standalone /boxes/$base/apps/$app route rendering AppDetail. Redeploy
and real PR preview URLs remain out of scope (see the slice-A spec).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage:**
- App detail route `/boxes/$base/apps/$app`, apps clickable → Task 3 (link) + Task 4 (route). ✅
- Header (name, prod status, repo/branch, mock prod URL) → Task 2. ✅
- Deployment history, newest-first, previews included → Task 2 (renders array order; Task 1 preserves order). ✅
- Production vs. `PR #N` + GitHub PR link → Task 2. ✅
- On-demand logs, monospace scrollable → Task 2 (`LogPanel`). ✅
- Live-tail while building (poll logs + refresh list) → Task 2 (`useLiveTail`). ✅
- Offline / not-found state → Task 2 (null `app` branch) + Task 4 loader (null when disconnected). ✅
- Data layer `fetchDeployments` / `fetchDeploymentLogs` with 401/offline handling → Task 1. ✅
- Server fns with `RelayAuthError → dropSessionAndRedirect` → Task 4. ✅
- Loader reuses `getBox` (no `getApp`) → Task 4. ✅
- Tests outside `src/routes/`; `bun run verify` gate → all tasks + Task 4 Step 4. ✅
- Out of scope (redeploy, real preview URLs, lifecycle/domains/import, deploy metadata, pagination) → not implemented; noted in commit + spec. ✅

**Placeholder scan:** No TBD/TODO-as-work, no "add error handling"—every step has concrete code and commands. The one `TODO(...)` in `app-detail.tsx` is a deliberate, mirrored code comment pointing at piper#137 (an external blocker), not a plan gap.

**Type consistency:** `Deployment { id, pr, status, createdAt }` defined in Task 1, consumed identically in Task 2 tests and component. `AppDetailProps` fields match between Task 2's definition and Task 4's route usage (`base`, `connected`, `app`, `deployments`, `fetchLogs`, `refresh`). Server-fn validators (`{base, app}`, `{base, app, id}`) match the route's call sites. `getDeployments`/`getDeploymentLogs` names consistent across Tasks 1, 4.
