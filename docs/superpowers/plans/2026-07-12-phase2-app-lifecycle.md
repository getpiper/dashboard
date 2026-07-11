# Phase 2 slice B — app lifecycle (stop + delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the app-detail page, a user can **stop** a running app and **delete** an app (delete guarded by typing the app's name) — without touching the CLI.

**Architecture:** Rides the existing relay control proxy (`{relay}/agents/{base}/v1/*`) with the `piper_session` bearer — no new piper endpoint. Two relay fetchers (`stopApp`/`deleteApp`) mirror `createApp`/`linkApp`; two `createServerFn({ method: "POST" })` handlers wrap them; the presentational `AppDetail` component gains injected `onStop`/`onDelete` callbacks and renders an actions row (direct Stop; Delete behind an inline type-the-name confirm). The existing app route wires the server fns to the component.

**Tech Stack:** Bun, TanStack Start (file router + server fns), React, Tailwind v4, Biome. Tests: `bun test` + Testing Library (happy-dom preloaded via `bunfig.toml`).

## Global Constraints

- **Bun only** — never npm/yarn/node. Dev: `bun run dev`; tests: `bun test`; gate: `bun run verify` (Biome → `tsc --noEmit` → tests → build) must pass before the work is claimed done.
- **Tests never live in `src/routes/`** — the file router scans it. Route behavior is verified via its extracted component's test + the `verify` build/typecheck.
- **All writes ride the relay control proxy** `{relay}/agents/{base}/v1/*` with `Authorization: Bearer <piper_session>` — no privileged back door, no new piper endpoint.
- **Failure modes mirror existing fetchers:** `401` → `RelayAuthError` (→ drop session, redirect `/login`); `502`/`503` → `BoxOfflineError`; other non-2xx → plain `Error` carrying the box's trimmed message body (so piper's `404 unknown app` surfaces as its message). Both endpoints return `204` on success.
- **Delete guard is type-the-name** (per #18): the Delete button stays disabled until the typed value exactly equals `app.name`. This is a deliberately stronger guard than the CLI's `y`/`yes` prompt.
- **Match surrounding style;** Biome enforces formatting — run `bun run format`, don't hand-fight it.
- **`isRedirect(err)` re-throws first** in every async event-handler catch, so session-expiry redirects propagate; other errors set a red inline message (mirrors `ImportWizard`).

The box endpoints (reached through the proxy), verified against `getpiper/piper` `internal/api/api.go`:

| Action | Request | Success | Errors |
| --- | --- | --- | --- |
| Stop | `POST {relay}/agents/{base}/v1/apps/{name}/stop` | `204` | `404` unknown app; `500` otherwise |
| Delete | `DELETE {relay}/agents/{base}/v1/apps/{name}` | `204` | `404` unknown app; `500` otherwise |

---

### Task 1: Data layer — relay fetchers for stop + delete

**Files:**
- Modify: `src/server/relay.ts` (append two functions)
- Test: `src/server/relay.test.ts` (append tests + extend the import)

**Interfaces:**
- Consumes: existing `relayUrl()`, `RelayAuthError`, `BoxOfflineError` from `relay.ts`.
- Produces (later tasks rely on these exact signatures):
  - `stopApp(credential: string, base: string, name: string): Promise<void>`
  - `deleteApp(credential: string, base: string, name: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add `deleteApp` and `stopApp` to the existing top import from `./relay` (keep the other names), then append to `src/server/relay.test.ts`:

```ts
test("stopApp POSTs to the stop path and resolves on 204", async () => {
	let seenUrl = "";
	let seenMethod = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await stopApp("cred-1", "abc-zoe.public.example", "web");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web/stop",
	);
	expect(seenMethod).toBe("POST");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
});

test("stopApp throws RelayAuthError on 401 and BoxOfflineError on 503", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(stopApp("bad", "b", "web")).rejects.toBeInstanceOf(RelayAuthError);
	globalThis.fetch = (async () =>
		new Response("offline", { status: 503 })) as unknown as typeof fetch;
	expect(stopApp("cred-1", "b", "web")).rejects.toBeInstanceOf(BoxOfflineError);
});

test("stopApp surfaces the box message on 404 (unknown app)", async () => {
	globalThis.fetch = (async () =>
		new Response("unknown app", { status: 404 })) as unknown as typeof fetch;
	expect(stopApp("cred-1", "b", "gone")).rejects.toThrow(/unknown app/);
});

test("deleteApp DELETEs the app path and resolves on 204", async () => {
	let seenUrl = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await deleteApp("cred-1", "abc-zoe.public.example", "web");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web",
	);
	expect(seenMethod).toBe("DELETE");
});

test("deleteApp throws RelayAuthError on 401 and BoxOfflineError on 502", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(deleteApp("bad", "b", "web")).rejects.toBeInstanceOf(RelayAuthError);
	globalThis.fetch = (async () =>
		new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;
	expect(deleteApp("cred-1", "b", "web")).rejects.toBeInstanceOf(
		BoxOfflineError,
	);
});

test("deleteApp surfaces the box message on 404 (unknown app)", async () => {
	globalThis.fetch = (async () =>
		new Response("unknown app", { status: 404 })) as unknown as typeof fetch;
	expect(deleteApp("cred-1", "b", "gone")).rejects.toThrow(/unknown app/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `stopApp`/`deleteApp` are not exported yet (`stopApp is not a function`, etc.).

- [ ] **Step 3: Implement the two functions**

Append to `src/server/relay.ts`:

```ts
export async function stopApp(
	credential: string,
	base: string,
	name: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps/${encodeURIComponent(
			name,
		)}/stop`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${credential}` },
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
		throw new Error(msg || `relay stop app returned ${res.status}`);
	}
}

export async function deleteApp(
	credential: string,
	base: string,
	name: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps/${encodeURIComponent(
			name,
		)}`,
		{
			method: "DELETE",
			headers: { Authorization: `Bearer ${credential}` },
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
		throw new Error(msg || `relay delete app returned ${res.status}`);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS (all new tests green, existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "feat: relay fetchers for app stop + delete (#18)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: AppDetail actions row — Stop + type-the-name Delete

**Files:**
- Modify: `src/components/app-detail.tsx` (add `onStop`/`onDelete` props + an `AppActions` child component rendered in the header)
- Test: `src/components/app-detail.test.tsx` (add `onStop`/`onDelete` to existing renders + append new tests)

**Interfaces:**
- Consumes: `isRedirect` from `@tanstack/react-router`; existing `useState` from React.
- Produces (the route in Task 3 relies on these exact prop names/types added to `AppDetailProps`):
  - `onStop: () => Promise<void>`
  - `onDelete: () => Promise<void>`

Notes for the implementer:
- The hooks live in a **child** component (`AppActions`), like the existing `DeploymentRow`/`LogPanel`, so `AppDetail`'s early `!connected` / `!app` returns stay hook-free (no conditional-hook violation).
- Stop is a **direct action** (no confirm), shows a disabled "Stopping…" state while `onStop()` runs, and is **hidden when `app.status === "stopped"`**. On success the parent's `refresh()` re-runs the loader (component stays mounted).
- Delete toggles an **inline confirm block** (not a modal): a red warning line naming the app, a text input (`aria-label="Confirm app name"`), and **Cancel** / **Delete** buttons. Delete stays disabled until the typed value exactly equals `app.name`. On confirm the parent navigates away (component unmounts), so only reset the pending flag in the error path. **Cancel** collapses the block and clears the typed value without calling `onDelete`.

- [ ] **Step 1: Write the failing tests**

In `src/components/app-detail.test.tsx`: change the import line to `import { expect, jest, mock, test } from "bun:test";`, add `const noopAsync = async () => {};` beside the existing `noop`/`emptyLogs`, and add `onStop={noopAsync}` and `onDelete={noopAsync}` to **all six** existing `<AppDetail .../>` renders (TypeScript now requires them). Then append these new tests:

```tsx
test("Stop calls onStop and shows a pending state while it runs", async () => {
	let release: () => void = () => {};
	const gate = new Promise<void>((r) => {
		release = r;
	});
	const onStop = mock(() => gate);
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={onStop}
			onDelete={noopAsync}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
	expect(onStop).toHaveBeenCalledTimes(1);
	expect(screen.getByRole("button", { name: /stopping/i })).toBeTruthy();
	await act(async () => {
		release();
		await gate;
	});
});

test("hides Stop when the app is already stopped", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={{ ...app, status: "stopped" }}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	expect(screen.queryByRole("button", { name: /^stop$/i })).toBeNull();
});

test("Delete stays disabled until the exact app name is typed, then calls onDelete", async () => {
	const onDelete = mock(async () => {});
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={onDelete}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /delete app/i }));
	const confirm = screen.getByRole("button", { name: /^delete$/i });
	expect((confirm as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm app name/i), {
		target: { value: "web" },
	});
	expect((confirm as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
	expect(onDelete).toHaveBeenCalledTimes(1);
});

test("Cancel collapses the confirm block without calling onDelete", () => {
	const onDelete = mock(async () => {});
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={onDelete}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /delete app/i }));
	fireEvent.change(screen.getByLabelText(/confirm app name/i), {
		target: { value: "web" },
	});
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(screen.queryByLabelText(/confirm app name/i)).toBeNull();
	expect(onDelete).not.toHaveBeenCalled();
});

test("a rejected onStop renders the error message", async () => {
	const onStop = async () => {
		throw new Error("boom stop");
	};
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={onStop}
			onDelete={noopAsync}
		/>,
	);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
	});
	expect(screen.getByText(/boom stop/i)).toBeTruthy();
});

test("a rejected onDelete renders the error and keeps the confirm block", async () => {
	const onDelete = async () => {
		throw new Error("boom delete");
	};
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={onDelete}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /delete app/i }));
	fireEvent.change(screen.getByLabelText(/confirm app name/i), {
		target: { value: "web" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
	});
	expect(screen.getByText(/boom delete/i)).toBeTruthy();
	expect(screen.getByLabelText(/confirm app name/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/app-detail.test.tsx`
Expected: FAIL — `onStop`/`onDelete` are not props yet and the actions row / confirm block don't exist (`AppDetailProps` type errors + missing buttons).

- [ ] **Step 3: Implement the props and the `AppActions` child**

In `src/components/app-detail.tsx`:

(a) Extend the top React import and add the router import:

```tsx
import { isRedirect } from "@tanstack/react-router";
```

(`useState` is already imported alongside `useEffect`/`useRef`.)

(b) Add the two props to `AppDetailProps`:

```tsx
export type AppDetailProps = {
	base: string;
	appName: string;
	connected: boolean;
	app: App | null;
	deployments: Deployment[];
	fetchLogs: (id: string) => Promise<string>;
	refresh: () => void;
	onStop: () => Promise<void>;
	onDelete: () => Promise<void>;
};
```

(c) Destructure `onStop`, `onDelete` in the `AppDetail({ ... })` signature (append them to the existing list).

(d) In the header `<div className="flex flex-col gap-1.5">`, render the actions component as the **last child**, immediately after the repo/branch `<p>`:

```tsx
					<AppActions
						name={app.name}
						status={app.status}
						onStop={onStop}
						onDelete={onDelete}
					/>
```

(e) Add these style consts near the top of the module (after the imports, before `mockAppUrl`):

```tsx
const actionBtn =
	"rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)] disabled:opacity-50";
const dangerBtn =
	"rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50";
const confirmInput =
	"rounded-md border border-[var(--line)] px-3 py-2 text-sm";
```

(f) Add the `AppActions` child component (e.g. after `AppDetail`, beside `DeploymentRow`):

```tsx
function AppActions({
	name,
	status,
	onStop,
	onDelete,
}: {
	name: string;
	status: string;
	onStop: () => Promise<void>;
	onDelete: () => Promise<void>;
}) {
	const [stopping, setStopping] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleStop() {
		setError(null);
		setStopping(true);
		try {
			await onStop();
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't stop the app.");
		} finally {
			setStopping(false);
		}
	}

	async function handleDelete() {
		setError(null);
		setDeleting(true);
		try {
			await onDelete();
			// On success the parent navigates away and unmounts this component,
			// so no state reset here.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't delete the app.");
			setDeleting(false);
		}
	}

	return (
		<div className="mt-1 flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				{status !== "stopped" && (
					<button
						type="button"
						onClick={handleStop}
						disabled={stopping}
						className={actionBtn}
					>
						{stopping ? "Stopping…" : "Stop"}
					</button>
				)}
				<button
					type="button"
					onClick={() => setConfirming(true)}
					className={actionBtn}
				>
					Delete app
				</button>
			</div>

			{confirming && (
				<div className="flex flex-col gap-2 rounded-lg border border-red-600/40 p-3">
					<p className="text-red-600 text-sm">
						This permanently deletes{" "}
						<span className="font-mono">{name}</span> and its deployments. This
						can't be undone — type the app name to confirm.
					</p>
					<input
						aria-label="Confirm app name"
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						className={confirmInput}
					/>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => {
								setConfirming(false);
								setTyped("");
							}}
							className={actionBtn}
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleDelete}
							disabled={typed !== name || deleting}
							className={dangerBtn}
						>
							{deleting ? "Deleting…" : "Delete"}
						</button>
					</div>
				</div>
			)}

			{error && <p className="text-red-600 text-sm">{error}</p>}
		</div>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/app-detail.test.tsx`
Expected: PASS (all new tests + the six existing tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/app-detail.tsx src/components/app-detail.test.tsx
git commit -m "feat: app-detail Stop + type-the-name Delete actions (#18)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Server fns + route wiring + full verify

**Files:**
- Modify: `src/server/fns.ts` (add two server fns + extend the `./relay` import)
- Modify: `src/routes/boxes/$base_.apps.$app.tsx` (wire `onStop`/`onDelete` to `AppDetail`)

**Interfaces:**
- Consumes: `stopApp`, `deleteApp` (Task 1); the `onStop`/`onDelete` props on `AppDetail` (Task 2); existing `getCookie`, `redirect`, `dropSessionAndRedirect`, `RelayAuthError`.
- Produces (the route consumes these server fns):
  - `stopAppFn` — `{ base: string; name: string }` → `Promise<void>`
  - `deleteAppFn` — `{ base: string; name: string }` → `Promise<void>`

Note: this slice adds **no new route file** (it only edits the existing app route), so `routeTree.gen.ts` is not regenerated — no react-start Register-block footgun here.

- [ ] **Step 1: Add the two server fns**

In `src/server/fns.ts`, extend the import from `./relay` to also pull in `deleteApp, stopApp` (keep the existing names, alphabetical to satisfy Biome), then append:

```ts
export const stopAppFn = createServerFn({ method: "POST" })
	.validator((d: { base: string; name: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await stopApp(credential, data.base, data.name);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const deleteAppFn = createServerFn({ method: "POST" })
	.validator((d: { base: string; name: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await deleteApp(credential, data.base, data.name);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 2: Wire the props in the route**

In `src/routes/boxes/$base_.apps.$app.tsx`, extend the `@/server/fns` import to add `deleteAppFn, stopAppFn`, then add the two props to the `<AppDetail .../>` element (after `refresh`):

```tsx
				onStop={async () => {
					await stopAppFn({ data: { base, name: appName } });
					router.invalidate();
				}}
				onDelete={async () => {
					await deleteAppFn({ data: { base, name: appName } });
					await router.navigate({ to: "/boxes/$base", params: { base } });
				}}
```

(`router` is already in scope via `useRouter()`.)

- [ ] **Step 3: Verify the full build, types, and tests**

Run: `bun run verify`
Expected: PASS — Biome clean (run `bun run format` first if it flags formatting), `tsc --noEmit` clean (server-fn generics + route wiring typecheck), all tests green, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/server/fns.ts src/routes/boxes/$base_.apps.$app.tsx
git commit -m "feat: wire app stop + delete server fns into the app route (#18)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Manual end-to-end verification + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Drive the flow in the running app**

Run `bun run dev`, open a running app's detail page (`/boxes/{base}/apps/{name}`). Verify:
- The header shows a **Stop** button (running app) and a **Delete app** button.
- Clicking **Stop** shows a disabled "Stopping…" state; on success the status pill flips to `stopped` and the **Stop** button disappears (an already-`stopped` app shows no Stop).
- Clicking **Delete app** reveals the inline confirm block; the **Delete** button is disabled until the typed value exactly matches the app name; **Cancel** collapses it without deleting.
- Confirming **Delete** navigates back to `/boxes/{base}`.

If no live relay/credentials are available in the sandbox, the `bun run verify` gate (component tests exercising the same handlers with fake props + typecheck + build) stands in — note that in the PR, consistent with prior slices. Use the `/run` skill if a scripted browser drive is preferred.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin ozykhan/app-lifecycle-stop-delete
gh pr create --title "feat: phase 2 slice B — app lifecycle stop + delete (#18)" --body "<summary + Closes #18>"
```

---

## Notes on scope (from the spec)

- **Create / deploy / redeploy** from the dashboard is out of scope — a hosted dashboard has no local source tar, and repo-linked deploys happen via GitHub webhooks. A dashboard-triggered rebuild needs a new piper "rebuild latest commit" endpoint that is not yet filed.
- The delete guard is **type-the-name** (#18's explicit requirement), a stronger guard than the CLI's `y`/`yes` prompt.
