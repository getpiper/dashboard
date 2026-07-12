# Phase 3 slice C — invite inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user with a pending org invite see it in the org switcher and accept (auto-joining and switching scope to that org) or decline it.

**Architecture:** Three layers mirroring slices A/B — typed relay fetch wrappers (`relay.ts`) → `createServerFn` handlers (`fns.ts`) → data threaded through the root loader and `OrgScope` context into the `OrgSwitcher`, which renders a count badge and a pending-invites section.

**Tech Stack:** TanStack Start server fns, React + Tailwind (shadcn tokens), Biome, `bun test` with Testing Library (happy-dom preload).

## Global Constraints

- Bun only — `bun test`, `bun run format`, `bun run verify`. Never npm/yarn/node.
- Biome enforces formatting; run `bun run format` before committing.
- Tests never live under `src/routes/` (the file router scans it).
- Every feature/bugfix is test-first: failing test → implementation → passing test → commit.
- Conventional commits ending with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Relay contract (from `getpiper/piper` `internal/relay/orgs_api.go`):
  - `GET /v1/invites` → 200 `{invites: [{org}]}`
  - `POST /v1/invites/{slug}/accept` → 200 `{accepted: slug}`; 404 when gone
  - `POST /v1/invites/{slug}/decline` → 200 `{declined: slug}`; 404 when gone
  - 401 → `RelayAuthError` everywhere.

## File Structure

- `src/server/relay.ts` — add `fetchInvites`, `acceptInvite`, `declineInvite`.
- `src/server/relay.test.ts` — add tests for the three wrappers.
- `src/server/fns.ts` — add `getInvites`, `acceptInviteFn`, `declineInviteFn`.
- `src/components/org-scope.tsx` — add `invites` to the context + provider.
- `src/routes/__root.tsx` — load `invites` in the loader, pass to provider.
- `src/components/Header.tsx` — read `invites` from context, wire accept/decline.
- `src/components/org-switcher.tsx` — badge + pending-invites section + props.
- `src/components/org-switcher.test.tsx` — add badge/section/accept/decline tests.

---

### Task 1: Relay wrappers for the invitee endpoints

**Files:**
- Modify: `src/server/relay.ts` (append after `deleteOrg`, end of file ~line 685)
- Test: `src/server/relay.test.ts` (append after the last org test)

**Interfaces:**
- Consumes: `relayUrl()`, `RelayAuthError` (already in `relay.ts`).
- Produces:
  - `fetchInvites(credential: string): Promise<string[]>`
  - `acceptInvite(credential: string, slug: string): Promise<void>`
  - `declineInvite(credential: string, slug: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/server/relay.test.ts`. Also add `acceptInvite`, `declineInvite`, `fetchInvites` to the existing import block from `"./relay"` at the top of the file.

```ts
test("fetchInvites GETs /v1/invites and maps the envelope to slugs", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json({ invites: [{ org: "acme" }, { org: "widgets" }] });
	}) as typeof fetch;

	const invites = await fetchInvites("cred-1");
	expect(seenUrl).toBe("https://relay.test/v1/invites");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(invites).toEqual(["acme", "widgets"]);
});

test("fetchInvites returns an empty array when there are none", async () => {
	globalThis.fetch = (async () =>
		Response.json({ invites: [] })) as typeof fetch;
	expect(await fetchInvites("cred-1")).toEqual([]);
});

test("fetchInvites raises RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	await expect(fetchInvites("cred-1")).rejects.toBeInstanceOf(RelayAuthError);
});

test("acceptInvite POSTs the accept path and resolves on 200", async () => {
	let seenUrl = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		return Response.json({ accepted: "acme" });
	}) as typeof fetch;

	await acceptInvite("cred-1", "acme");
	expect(seenUrl).toBe("https://relay.test/v1/invites/acme/accept");
	expect(seenMethod).toBe("POST");
});

test("acceptInvite throws a clean message when the invite is gone (404)", async () => {
	globalThis.fetch = (async () =>
		new Response("", { status: 404 })) as unknown as typeof fetch;
	await expect(acceptInvite("cred-1", "acme")).rejects.toThrow(
		/no longer available/i,
	);
});

test("acceptInvite raises RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	await expect(acceptInvite("cred-1", "acme")).rejects.toBeInstanceOf(
		RelayAuthError,
	);
});

test("declineInvite POSTs the decline path and resolves on 200", async () => {
	let seenUrl = "";
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		seenUrl = String(url);
		return Response.json({ declined: "acme" });
	}) as typeof fetch;

	await declineInvite("cred-1", "acme");
	expect(seenUrl).toBe("https://relay.test/v1/invites/acme/decline");
});

test("declineInvite throws a clean message when the invite is gone (404)", async () => {
	globalThis.fetch = (async () =>
		new Response("", { status: 404 })) as unknown as typeof fetch;
	await expect(declineInvite("cred-1", "acme")).rejects.toThrow(
		/no longer available/i,
	);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `fetchInvites` / `acceptInvite` / `declineInvite` are not exported (import error / not defined).

- [ ] **Step 3: Implement the three wrappers**

Append to `src/server/relay.ts` (after `deleteOrg`):

```ts
export async function fetchInvites(credential: string): Promise<string[]> {
	const res = await fetch(`${relayUrl()}/v1/invites`, {
		headers: { Authorization: `Bearer ${credential}` },
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		throw new Error(`relay /v1/invites returned ${res.status}`);
	}
	const body = (await res.json()) as { invites: { org: string }[] };
	return body.invites.map((i) => i.org);
}

async function consumeInvite(
	credential: string,
	slug: string,
	action: "accept" | "decline",
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/v1/invites/${encodeURIComponent(slug)}/${action}`,
		{ method: "POST", headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 404) {
		throw new Error("invite no longer available");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay invite ${action} returned ${res.status}`);
	}
}

export async function acceptInvite(
	credential: string,
	slug: string,
): Promise<void> {
	await consumeInvite(credential, slug, "accept");
}

export async function declineInvite(
	credential: string,
	slug: string,
): Promise<void> {
	await consumeInvite(credential, slug, "decline");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS (all new tests green, existing tests unaffected).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "$(cat <<'EOF'
feat: relay wrappers for the invitee invites endpoints

fetchInvites/acceptInvite/declineInvite for GET /v1/invites and
POST /v1/invites/{slug}/{accept,decline}; 404 → "no longer available".

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server fns for invites

**Files:**
- Modify: `src/server/fns.ts` (add to the import block from `./relay`; append fns after `deleteOrgFn`)

**Interfaces:**
- Consumes: `fetchInvites`, `acceptInvite`, `declineInvite` (Task 1); `getCookie`, `redirect`, `RelayAuthError`, `dropSessionAndRedirect` (already in `fns.ts`).
- Produces:
  - `getInvites` — server fn, no args → `Promise<string[]>`
  - `acceptInviteFn` — POST server fn, `data: string` (slug) → `Promise<void>`
  - `declineInviteFn` — POST server fn, `data: string` (slug) → `Promise<void>`

No unit test — server fns need cookie context and are covered by Task 1 (relay) + Task 5 (switcher wiring). This task's deliverable is verified by `tsc` in `bun run verify`.

- [ ] **Step 1: Add the imports**

In `src/server/fns.ts`, add `acceptInvite`, `declineInvite`, `fetchInvites` to the existing alphabetical import block from `./relay`.

- [ ] **Step 2: Implement the three server fns**

Append to `src/server/fns.ts` (after `deleteOrgFn`):

```ts
export const getInvites = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchInvites(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) dropSessionAndRedirect();
		throw err;
	}
});

export const acceptInviteFn = createServerFn({ method: "POST" })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await acceptInvite(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const declineInviteFn = createServerFn({ method: "POST" })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await declineInvite(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 4: Format and commit**

```bash
bun run format
git add src/server/fns.ts
git commit -m "$(cat <<'EOF'
feat: server fns getInvites/acceptInviteFn/declineInviteFn

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Thread invites through the OrgScope context

**Files:**
- Modify: `src/components/org-scope.tsx`

**Interfaces:**
- Consumes: `Org` type (already imported).
- Produces: `OrgScope` gains `invites: string[]`; `OrgScopeProvider` gains an `invites: string[]` prop; `useOrgScope()` returns `invites`.

- [ ] **Step 1: Add `invites` to the context type**

In `src/components/org-scope.tsx`, extend the `OrgScope` type:

```ts
type OrgScope = {
	scope: string;
	setScope: (s: string) => void;
	orgs: Org[];
	invites: string[];
	username: string | null;
};
```

- [ ] **Step 2: Accept and provide `invites`**

Update `OrgScopeProvider`'s props and the provider value. The full signature and provider become:

```ts
export function OrgScopeProvider({
	username,
	orgs,
	invites,
	children,
}: {
	username: string | null;
	orgs: Org[];
	invites: string[];
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
		<Ctx.Provider value={{ scope, setScope, orgs, invites, username }}>
			{children}
		</Ctx.Provider>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: FAIL — `__root.tsx` renders `<OrgScopeProvider>` without the new required `invites` prop. That is fixed in Task 4; this confirms the prop is now required.

- [ ] **Step 4: Commit**

```bash
bun run format
git add src/components/org-scope.tsx
git commit -m "$(cat <<'EOF'
feat: carry pending invites in the OrgScope context

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Load invites in the root loader

**Files:**
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `getInvites` (Task 2); `OrgScopeProvider` `invites` prop (Task 3).
- Produces: loader data gains `invites: string[]`; provider receives it.

- [ ] **Step 1: Import `getInvites`**

In `src/routes/__root.tsx`, add `getInvites` to the import from `../server/fns`:

```ts
import { getInvites, getOrgs, getSession } from "../server/fns";
```

- [ ] **Step 2: Load invites alongside orgs**

Update the loader to fetch orgs and invites together:

```ts
	loader: async () => {
		const session = await getSession();
		if (!session) return null;
		const [orgs, invites] = await Promise.all([getOrgs(), getInvites()]);
		return { ...session, orgs, invites };
	},
```

- [ ] **Step 3: Pass invites to the provider**

Update `RootLayout`:

```ts
function RootLayout() {
	const data = Route.useLoaderData();
	return (
		<OrgScopeProvider
			username={data?.username ?? null}
			orgs={data?.orgs ?? []}
			invites={data?.invites ?? []}
		>
			<Header username={data?.username ?? null} />
			<Outlet />
		</OrgScopeProvider>
	);
}
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (the Task 3 error is resolved).

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/routes/__root.tsx
git commit -m "$(cat <<'EOF'
feat: load pending invites in the root loader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Switcher badge + pending-invites section

**Files:**
- Modify: `src/components/org-switcher.tsx`
- Test: `src/components/org-switcher.test.tsx`

**Interfaces:**
- Consumes: nothing new (pure component).
- Produces: `OrgSwitcherProps` gains `invites: string[]`, `onAccept: (slug: string) => Promise<void>`, `onDecline: (slug: string) => Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/org-switcher.test.tsx`. Note the existing tests construct `OrgSwitcher` without the new props — update the three shared helpers/usages by adding defaults. Add near the top, after `noopManage`:

```ts
const noopAccept = async () => {};
const noopDecline = async () => {};
```

Then add `invites={[]}`, `onAccept={noopAccept}`, `onDecline={noopDecline}` to each existing `<OrgSwitcher .../>` render in this file (the existing tests must keep compiling). Then append these new tests:

```ts
test("shows a badge with the pending invite count", () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			invites={["initech", "hooli"]}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={noopManage}
			onAccept={noopAccept}
			onDecline={noopDecline}
		/>,
	);
	expect(screen.getByText("2")).toBeTruthy();
});

test("no badge when there are no pending invites", () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			invites={[]}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={noopManage}
			onAccept={noopAccept}
			onDecline={noopDecline}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /personal/i }));
	expect(screen.queryByText(/pending invite/i)).toBeNull();
});

test("lists pending invites and Accept calls onAccept with the slug", async () => {
	let accepted = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			invites={["initech"]}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={noopManage}
			onAccept={async (s) => {
				accepted = s;
			}}
			onDecline={noopDecline}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /personal/i }));
	expect(screen.getByText("initech")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: /accept/i }));
	await waitFor(() => expect(accepted).toBe("initech"));
});

test("Decline calls onDecline with the slug", async () => {
	let declined = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			invites={["initech"]}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={noopManage}
			onAccept={noopAccept}
			onDecline={async (s) => {
				declined = s;
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /personal/i }));
	fireEvent.click(screen.getByRole("button", { name: /decline/i }));
	await waitFor(() => expect(declined).toBe("initech"));
});

test("a failed accept surfaces the error message", async () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			invites={["initech"]}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={noopManage}
			onAccept={async () => {
				throw new Error("invite no longer available");
			}}
			onDecline={noopDecline}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /personal/i }));
	fireEvent.click(screen.getByRole("button", { name: /accept/i }));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain(
			"invite no longer available",
		),
	);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/org-switcher.test.tsx`
Expected: FAIL — the badge text/pending section/props don't exist yet (and the existing renders now pass extra props the component ignores until implemented).

- [ ] **Step 3: Implement the badge, section, and props**

Edit `src/components/org-switcher.tsx`. Extend the props type:

```ts
export type OrgSwitcherProps = {
	scope: string;
	orgs: Org[];
	invites: string[];
	onSelect: (scope: string) => void;
	onCreate: (name: string) => Promise<Org>;
	onManage: (slug: string) => void;
	onAccept: (slug: string) => Promise<void>;
	onDecline: (slug: string) => Promise<void>;
};
```

Update the function signature to destructure the new props:

```ts
export function OrgSwitcher({
	scope,
	orgs,
	invites,
	onSelect,
	onCreate,
	onManage,
	onAccept,
	onDecline,
}: OrgSwitcherProps) {
```

Add invite-handling state next to the existing `useState` calls:

```ts
	const [inviteBusy, setInviteBusy] = useState("");
	const [inviteError, setInviteError] = useState("");

	async function act(
		slug: string,
		fn: (slug: string) => Promise<void>,
	) {
		setInviteError("");
		setInviteBusy(slug);
		try {
			await fn(slug);
		} catch (err) {
			setInviteError(err instanceof Error ? err.message : "Invite failed");
		} finally {
			setInviteBusy("");
		}
	}
```

Add the count badge on the trigger button — replace the existing trigger `<button>` block with:

```tsx
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="relative rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)]"
			>
				{label}
				{invites.length > 0 && (
					<span className="-right-1 -top-1 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sea-ink)] px-1 text-[10px] text-white">
						{invites.length}
					</span>
				)}
			</button>
```

Inside the dropdown menu, add the pending-invites section as the first child of the `role="menu"` div (immediately before the `Personal` button):

```tsx
					{invites.length > 0 && (
						<div className="flex flex-col gap-1 border-[var(--line)] border-b pb-1.5">
							<p className="px-3 pt-1 text-muted-foreground text-xs">
								Pending invites
							</p>
							{invites.map((slug) => (
								<div
									key={slug}
									className="flex items-center justify-between gap-1 px-3 py-1"
								>
									<span className="font-mono text-sm">{slug}</span>
									<span className="flex gap-1">
										<button
											type="button"
											disabled={inviteBusy === slug}
											onClick={() => act(slug, onAccept)}
											className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1 text-xs"
										>
											Accept
										</button>
										<button
											type="button"
											disabled={inviteBusy === slug}
											onClick={() => act(slug, onDecline)}
											className="rounded-lg px-2 py-1 text-muted-foreground text-xs hover:bg-[var(--chip-bg)]"
										>
											Decline
										</button>
									</span>
								</div>
							))}
							{inviteError && (
								<p role="alert" className="px-3 text-red-600 text-xs">
									{inviteError}
								</p>
							)}
						</div>
					)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/org-switcher.test.tsx`
Expected: PASS (new tests green; existing tests still green).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/components/org-switcher.tsx src/components/org-switcher.test.tsx
git commit -m "$(cat <<'EOF'
feat: invite badge + pending-invites section in the org switcher

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire the switcher to the invite server fns

**Files:**
- Modify: `src/components/Header.tsx`

**Interfaces:**
- Consumes: `useOrgScope().invites` (Task 3), `acceptInviteFn` / `declineInviteFn` (Task 2), `OrgSwitcher`'s `invites`/`onAccept`/`onDecline` props (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Update imports**

In `src/components/Header.tsx`, import the fns:

```ts
import { acceptInviteFn, createOrgFn, declineInviteFn } from "../server/fns";
```

- [ ] **Step 2: Wire invites into `HeaderSwitcher`**

Replace `HeaderSwitcher` with:

```tsx
function HeaderSwitcher() {
	const { scope, setScope, orgs, invites } = useOrgScope();
	const router = useRouter();
	return (
		<OrgSwitcher
			scope={scope}
			orgs={orgs}
			invites={invites}
			onSelect={setScope}
			onCreate={async (name) => {
				const org = await createOrgFn({ data: name });
				router.invalidate();
				return org;
			}}
			onManage={(slug) =>
				router.navigate({ to: "/orgs/$slug/settings", params: { slug } })
			}
			onAccept={async (slug) => {
				await acceptInviteFn({ data: slug });
				setScope(slug);
				router.invalidate();
			}}
			onDecline={async (slug) => {
				await declineInviteFn({ data: slug });
				router.invalidate();
			}}
		/>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Full verify**

Run: `bun run verify`
Expected: PASS — Biome, `tsc --noEmit`, tests, and build all green.

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/Header.tsx
git commit -m "$(cat <<'EOF'
feat: accept/decline invites from the switcher; accept auto-switches scope

Closes #27.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- `fetchInvites`/`acceptInvite`/`declineInvite` (spec §1) → Task 1.
- Server fns (spec §2) → Task 2.
- Data flow root loader → context (spec §3) → Tasks 3 & 4.
- Badge + pending section + props (spec §4) → Task 5; accept auto-switch + `router.invalidate()` wiring → Task 6.
- Testing (spec §Testing): relay wrappers → Task 1; switcher badge/section/accept/decline/empty → Task 5.
- Out-of-scope items (polling, invite-before-login, optimistic UI) → not implemented, as specified.

**Placeholder scan:** none — every code step contains full code and exact commands.

**Type consistency:** `fetchInvites`/`acceptInvite`/`declineInvite` signatures identical across Tasks 1–2; `invites: string[]`, `onAccept`/`onDecline: (slug: string) => Promise<void>` identical across Tasks 3–6; `OrgScopeProvider` `invites` prop required in Task 3 and supplied in Task 4; `useOrgScope().invites` consumed in Task 6.
