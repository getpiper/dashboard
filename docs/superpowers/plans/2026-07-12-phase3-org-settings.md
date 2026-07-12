# Phase 3 slice B — org settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the org management surface — members roster with roles, invites, and destructive actions (leave/delete) — reachable from a gear on each org in the switcher, respecting the relay's owner/last-owner/has-agents guardrails.

**Architecture:** Three layers mirroring the domain slice: (1) `relay.ts` fetch wrappers that surface the server's plaintext body as `error.message`; (2) `fns.ts` `createServerFn` wrappers that inject the credential and map `RelayAuthError`; (3) a thin `/orgs/$slug/settings` route that loads members/invites and wires async callbacks to a pure `OrgSettings` component. Navigation entry is a gear on each org row in `OrgSwitcher`.

**Tech Stack:** Bun, TanStack Start/Router, React 19, Tailwind, Testing Library, Biome.

## Global Constraints

- **Bun only** — never npm/yarn/node. Test runner is `bun test`.
- **Biome formatting** — tabs for indentation; run `bun run format` before committing. Don't hand-fight the formatter.
- **Tests never live in `src/routes/`** (the file router scans it) — component tests live next to components.
- **Test-first** — every task writes a failing test before implementation, except Task 4 (glue: server fns + route), which has no unit surface and is verified by typecheck + build.
- **Conventional commits** ending with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- Relay contracts are fixed (from `getpiper/piper` `internal/relay/orgs_api.go`): members `{members:[{username,role}]}`; invites list `{invites:string[]}`; owner-only endpoints 403 for members; last-owner → 409 `an org must keep at least one owner`; already-member invite → 409 `already a member`; org-with-agents delete → 409 `org still owns agents`; 401 everywhere → `RelayAuthError`.
- `bun test` uses happy-dom (preloaded via `bunfig.toml`); import test helpers from `bun:test` and `@testing-library/react`. Path alias `@/` maps to `src/`.

---

### Task 1: Relay layer — org member/invite functions

**Files:**
- Modify: `src/server/relay.ts` (append after `createOrg`, end of file ~line 536)
- Test: `src/server/relay.test.ts` (append)

**Interfaces:**
- Consumes: `relayUrl()`, `RelayAuthError` (already in `relay.ts`).
- Produces:
  - `type OrgMember = { username: string; role: "owner" | "member" }`
  - `fetchOrgMembers(credential: string, slug: string): Promise<OrgMember[]>`
  - `fetchOrgInvites(credential: string, slug: string): Promise<string[]>`
  - `inviteOrgMember(credential: string, slug: string, githubUsername: string): Promise<void>`
  - `revokeOrgInvite(credential: string, slug: string, login: string): Promise<void>`
  - `setOrgMemberRole(credential: string, slug: string, username: string, role: "owner" | "member"): Promise<void>`
  - `removeOrgMember(credential: string, slug: string, username: string): Promise<void>`
  - `deleteOrg(credential: string, slug: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/server/relay.test.ts`. First add the new names to the existing top import from `./relay` (add `deleteOrg`, `fetchOrgInvites`, `fetchOrgMembers`, `inviteOrgMember`, `removeOrgMember`, `revokeOrgInvite`, `setOrgMemberRole`). Then append:

```ts
test("fetchOrgMembers GETs the members path and parses the envelope", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json({
			members: [
				{ username: "zoe", role: "owner" },
				{ username: "max", role: "member" },
			],
		});
	}) as typeof fetch;

	const members = await fetchOrgMembers("cred-1", "acme");
	expect(seenUrl).toBe("https://relay.test/v1/orgs/acme/members");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(members).toEqual([
		{ username: "zoe", role: "owner" },
		{ username: "max", role: "member" },
	]);
});

test("fetchOrgMembers throws RelayAuthError on 401 and the body message otherwise", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(fetchOrgMembers("bad", "acme")).rejects.toBeInstanceOf(RelayAuthError);
	globalThis.fetch = (async () =>
		new Response("no such org", { status: 404 })) as unknown as typeof fetch;
	expect(fetchOrgMembers("cred-1", "gone")).rejects.toThrow(/no such org/);
});

test("fetchOrgInvites GETs the invites path and returns the string list", async () => {
	let seenUrl = "";
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		seenUrl = String(url);
		return Response.json({ invites: ["octocat", "hubot"] });
	}) as typeof fetch;

	const invites = await fetchOrgInvites("cred-1", "acme");
	expect(seenUrl).toBe("https://relay.test/v1/orgs/acme/invites");
	expect(invites).toEqual(["octocat", "hubot"]);
});

test("inviteOrgMember POSTs github_username and surfaces the 409 message", async () => {
	let seenUrl = "";
	let seenMethod = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		seenBody = String(init?.body);
		return Response.json({ invited: "octocat" });
	}) as typeof fetch;

	await inviteOrgMember("cred-1", "acme", "octocat");
	expect(seenUrl).toBe("https://relay.test/v1/orgs/acme/invites");
	expect(seenMethod).toBe("POST");
	expect(JSON.parse(seenBody)).toEqual({ github_username: "octocat" });

	globalThis.fetch = (async () =>
		new Response("already a member", {
			status: 409,
		})) as unknown as typeof fetch;
	expect(inviteOrgMember("cred-1", "acme", "zoe")).rejects.toThrow(
		/already a member/,
	);
});

test("revokeOrgInvite DELETEs the invite path", async () => {
	let seenUrl = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		return Response.json({ revoked: "octocat" });
	}) as typeof fetch;

	await revokeOrgInvite("cred-1", "acme", "octocat");
	expect(seenUrl).toBe("https://relay.test/v1/orgs/acme/invites/octocat");
	expect(seenMethod).toBe("DELETE");
});

test("setOrgMemberRole PUTs the role and surfaces the last-owner 409", async () => {
	let seenUrl = "";
	let seenMethod = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		seenBody = String(init?.body);
		return Response.json({ username: "max", role: "owner" });
	}) as typeof fetch;

	await setOrgMemberRole("cred-1", "acme", "max", "owner");
	expect(seenUrl).toBe("https://relay.test/v1/orgs/acme/members/max");
	expect(seenMethod).toBe("PUT");
	expect(JSON.parse(seenBody)).toEqual({ role: "owner" });

	globalThis.fetch = (async () =>
		new Response("an org must keep at least one owner", {
			status: 409,
		})) as unknown as typeof fetch;
	expect(setOrgMemberRole("cred-1", "acme", "zoe", "member")).rejects.toThrow(
		/at least one owner/,
	);
});

test("removeOrgMember DELETEs the member path and surfaces the 409", async () => {
	let seenUrl = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		return Response.json({ removed: "max" });
	}) as typeof fetch;

	await removeOrgMember("cred-1", "acme", "max");
	expect(seenUrl).toBe("https://relay.test/v1/orgs/acme/members/max");
	expect(seenMethod).toBe("DELETE");

	globalThis.fetch = (async () =>
		new Response("an org must keep at least one owner", {
			status: 409,
		})) as unknown as typeof fetch;
	expect(removeOrgMember("cred-1", "acme", "zoe")).rejects.toThrow(
		/at least one owner/,
	);
});

test("deleteOrg DELETEs the org and surfaces the has-agents 409", async () => {
	let seenUrl = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		return Response.json({ deleted: "acme" });
	}) as typeof fetch;

	await deleteOrg("cred-1", "acme");
	expect(seenUrl).toBe("https://relay.test/v1/orgs/acme");
	expect(seenMethod).toBe("DELETE");

	globalThis.fetch = (async () =>
		new Response("org still owns agents", {
			status: 409,
		})) as unknown as typeof fetch;
	expect(deleteOrg("cred-1", "acme")).rejects.toThrow(/still owns agents/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — the new functions are not exported (import errors / `not a function`).

- [ ] **Step 3: Implement the relay functions**

Append to `src/server/relay.ts`:

```ts
export type OrgMember = { username: string; role: "owner" | "member" };

export async function fetchOrgMembers(
	credential: string,
	slug: string,
): Promise<OrgMember[]> {
	const res = await fetch(
		`${relayUrl()}/v1/orgs/${encodeURIComponent(slug)}/members`,
		{ headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay list members returned ${res.status}`);
	}
	const body = (await res.json()) as {
		members: { username: string; role: string }[];
	};
	return body.members.map((m) => ({
		username: m.username,
		role: m.role as OrgMember["role"],
	}));
}

export async function fetchOrgInvites(
	credential: string,
	slug: string,
): Promise<string[]> {
	const res = await fetch(
		`${relayUrl()}/v1/orgs/${encodeURIComponent(slug)}/invites`,
		{ headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay list invites returned ${res.status}`);
	}
	const body = (await res.json()) as { invites: string[] };
	return body.invites;
}

export async function inviteOrgMember(
	credential: string,
	slug: string,
	githubUsername: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/v1/orgs/${encodeURIComponent(slug)}/invites`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ github_username: githubUsername }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay invite returned ${res.status}`);
	}
}

export async function revokeOrgInvite(
	credential: string,
	slug: string,
	login: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/v1/orgs/${encodeURIComponent(slug)}/invites/${encodeURIComponent(login)}`,
		{ method: "DELETE", headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay revoke invite returned ${res.status}`);
	}
}

export async function setOrgMemberRole(
	credential: string,
	slug: string,
	username: string,
	role: "owner" | "member",
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/v1/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(username)}`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ role }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay set role returned ${res.status}`);
	}
}

export async function removeOrgMember(
	credential: string,
	slug: string,
	username: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/v1/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(username)}`,
		{ method: "DELETE", headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay remove member returned ${res.status}`);
	}
}

export async function deleteOrg(
	credential: string,
	slug: string,
): Promise<void> {
	const res = await fetch(`${relayUrl()}/v1/orgs/${encodeURIComponent(slug)}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${credential}` },
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay delete org returned ${res.status}`);
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS (all new tests green, existing tests still green).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "$(cat <<'EOF'
feat: relay layer for org members, roles, invites

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `OrgSettings` component

**Files:**
- Create: `src/components/org-settings.tsx`
- Test: `src/components/org-settings.test.tsx`

**Interfaces:**
- Consumes: `type OrgMember` from `@/server/relay` (Task 1); `isRedirect` from `@tanstack/react-router`.
- Produces:
  ```ts
  export type OrgSettingsProps = {
    slug: string;
    role: "owner" | "member";
    username: string;
    members: OrgMember[];
    invites: string[];
    onInvite: (githubUsername: string) => Promise<void>;
    onRevokeInvite: (login: string) => Promise<void>;
    onSetRole: (username: string, role: "owner" | "member") => Promise<void>;
    onRemoveMember: (username: string) => Promise<void>;
    onLeave: () => Promise<void>;
    onDelete: () => Promise<void>;
  };
  export function OrgSettings(props: OrgSettingsProps): JSX.Element;
  ```
  Copy/labels the route (Task 4) and tests depend on: promote button `Make owner`, demote button `Make member`, `Remove`, invite input aria-label `GitHub username`, invite button `Invite`, `Revoke`, `Leave org` → confirm button `Leave`, `Delete org` → confirm input aria-label `Confirm org slug` + confirm button `Delete`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/org-settings.test.tsx`:

```tsx
import { expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { OrgMember } from "@/server/relay";
import { OrgSettings, type OrgSettingsProps } from "./org-settings";

const members: OrgMember[] = [
	{ username: "zoe", role: "owner" },
	{ username: "max", role: "member" },
];

const noopAsync = async () => {};

function props(over: Partial<OrgSettingsProps> = {}): OrgSettingsProps {
	return {
		slug: "acme",
		role: "owner",
		username: "zoe",
		members,
		invites: [],
		onInvite: noopAsync,
		onRevokeInvite: noopAsync,
		onSetRole: noopAsync,
		onRemoveMember: noopAsync,
		onLeave: noopAsync,
		onDelete: noopAsync,
		...over,
	};
}

test("owner sees the roster and marks their own row", () => {
	render(<OrgSettings {...props()} />);
	expect(screen.getByText("zoe")).toBeTruthy();
	expect(screen.getByText("max")).toBeTruthy();
	expect(screen.getByText(/\(you\)/)).toBeTruthy();
});

test("owner promotes a member — onSetRole gets (username, 'owner')", async () => {
	const onSetRole = mock(async (_u: string, _r: "owner" | "member") => {});
	render(<OrgSettings {...props({ onSetRole })} />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /make owner/i }));
	});
	expect(onSetRole.mock.calls[0]).toEqual(["max", "owner"]);
});

test("owner demotes another owner — onSetRole gets (username, 'member')", async () => {
	const onSetRole = mock(async (_u: string, _r: "owner" | "member") => {});
	render(
		<OrgSettings
			{...props({
				members: [
					{ username: "zoe", role: "owner" },
					{ username: "max", role: "owner" },
				],
				onSetRole,
			})}
		/>,
	);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /make member/i }));
	});
	expect(onSetRole.mock.calls[0]).toEqual(["max", "member"]);
});

test("owner removes a member — onRemoveMember gets the username", async () => {
	const onRemoveMember = mock(async (_u: string) => {});
	render(<OrgSettings {...props({ onRemoveMember })} />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
	});
	expect(onRemoveMember.mock.calls[0]).toEqual(["max"]);
});

test("owner invites by GitHub username — onInvite gets the trimmed value", async () => {
	const onInvite = mock(async (_u: string) => {});
	render(<OrgSettings {...props({ onInvite })} />);
	fireEvent.change(screen.getByLabelText(/github username/i), {
		target: { value: " octocat " },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));
	});
	expect(onInvite.mock.calls[0]).toEqual(["octocat"]);
});

test("a rejected invite surfaces the 409 message", async () => {
	const onInvite = mock(async () => {
		throw new Error("already a member");
	});
	render(<OrgSettings {...props({ onInvite })} />);
	fireEvent.change(screen.getByLabelText(/github username/i), {
		target: { value: "zoe" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));
	});
	expect(screen.getByText(/already a member/i)).toBeTruthy();
});

test("owner revokes a pending invite — onRevokeInvite gets the login", async () => {
	const onRevokeInvite = mock(async (_l: string) => {});
	render(<OrgSettings {...props({ invites: ["octocat"], onRevokeInvite })} />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
	});
	expect(onRevokeInvite.mock.calls[0]).toEqual(["octocat"]);
});

test("member sees a read-only roster with no owner controls or invites", () => {
	render(<OrgSettings {...props({ role: "member", username: "max" })} />);
	expect(screen.queryByRole("button", { name: /make owner/i })).toBeNull();
	expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
	expect(screen.queryByLabelText(/github username/i)).toBeNull();
	expect(screen.queryByRole("button", { name: /delete org/i })).toBeNull();
	// but can leave
	expect(screen.getByRole("button", { name: /leave org/i })).toBeTruthy();
});

test("sole owner cannot leave — the button is disabled", () => {
	render(
		<OrgSettings
			{...props({ members: [{ username: "zoe", role: "owner" }] })}
		/>,
	);
	const leave = screen.getByRole("button", {
		name: /leave org/i,
	}) as HTMLButtonElement;
	expect(leave.disabled).toBe(true);
});

test("a non-sole owner can leave — onLeave fires after confirm", async () => {
	const onLeave = mock(async () => {});
	render(
		<OrgSettings
			{...props({
				members: [
					{ username: "zoe", role: "owner" },
					{ username: "max", role: "owner" },
				],
				onLeave,
			})}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /leave org/i }));
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^leave$/i }));
	});
	expect(onLeave).toHaveBeenCalledTimes(1);
});

test("delete stays disabled until the exact slug is typed, then calls onDelete", async () => {
	const onDelete = mock(async () => {});
	render(<OrgSettings {...props({ onDelete })} />);
	fireEvent.click(screen.getByRole("button", { name: /delete org/i }));
	const confirm = screen.getByRole("button", {
		name: /^delete$/i,
	}) as HTMLButtonElement;
	expect(confirm.disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm org slug/i), {
		target: { value: "acme" },
	});
	expect(confirm.disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
	expect(onDelete).toHaveBeenCalledTimes(1);
});

test("a rejected delete surfaces the has-agents 409 message", async () => {
	const onDelete = mock(async () => {
		throw new Error("org still owns agents");
	});
	render(<OrgSettings {...props({ onDelete })} />);
	fireEvent.click(screen.getByRole("button", { name: /delete org/i }));
	fireEvent.change(screen.getByLabelText(/confirm org slug/i), {
		target: { value: "acme" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
	});
	expect(screen.getByText(/still owns agents/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/org-settings.test.tsx`
Expected: FAIL — `./org-settings` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/org-settings.tsx`:

```tsx
import { isRedirect } from "@tanstack/react-router";
import { useState } from "react";
import type { OrgMember } from "@/server/relay";

const actionBtn =
	"rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)] disabled:opacity-50";
const dangerBtn =
	"rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50";
const field = "rounded-md border border-[var(--line)] px-3 py-2 text-sm";

export type OrgSettingsProps = {
	slug: string;
	role: "owner" | "member";
	username: string;
	members: OrgMember[];
	invites: string[];
	onInvite: (githubUsername: string) => Promise<void>;
	onRevokeInvite: (login: string) => Promise<void>;
	onSetRole: (username: string, role: "owner" | "member") => Promise<void>;
	onRemoveMember: (username: string) => Promise<void>;
	onLeave: () => Promise<void>;
	onDelete: () => Promise<void>;
};

export function OrgSettings({
	slug,
	role,
	username,
	members,
	invites,
	onInvite,
	onRevokeInvite,
	onSetRole,
	onRemoveMember,
	onLeave,
	onDelete,
}: OrgSettingsProps) {
	const ownerCount = members.filter((m) => m.role === "owner").length;
	return (
		<div className="page-wrap flex flex-col gap-8 py-8">
			<h1 className="font-semibold text-lg">
				<span className="font-mono">{slug}</span> settings
			</h1>
			<MembersSection
				role={role}
				username={username}
				members={members}
				ownerCount={ownerCount}
				onSetRole={onSetRole}
				onRemoveMember={onRemoveMember}
			/>
			{role === "owner" && (
				<InvitesSection
					invites={invites}
					onInvite={onInvite}
					onRevokeInvite={onRevokeInvite}
				/>
			)}
			<DangerZone
				slug={slug}
				role={role}
				soleOwner={role === "owner" && ownerCount === 1}
				onLeave={onLeave}
				onDelete={onDelete}
			/>
		</div>
	);
}

function MembersSection({
	role,
	username,
	members,
	ownerCount,
	onSetRole,
	onRemoveMember,
}: {
	role: "owner" | "member";
	username: string;
	members: OrgMember[];
	ownerCount: number;
	onSetRole: (username: string, role: "owner" | "member") => Promise<void>;
	onRemoveMember: (username: string) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function run(fn: () => Promise<void>) {
		setError(null);
		setBusy(true);
		try {
			await fn();
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Action failed.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-sm">Members</h2>
			<table className="text-sm">
				<tbody>
					{members.map((m) => {
						const isSelf = m.username === username;
						const lastOwner = m.role === "owner" && ownerCount === 1;
						return (
							<tr key={m.username} className="border-[var(--line)] border-b">
								<td className="py-2 pr-4 font-mono">
									{m.username}
									{isSelf && (
										<span className="text-muted-foreground"> (you)</span>
									)}
								</td>
								<td className="py-2 pr-4 text-muted-foreground">{m.role}</td>
								<td className="py-2 text-right">
									{role === "owner" && !isSelf && (
										<div className="flex justify-end gap-2">
											{m.role === "owner" ? (
												<button
													type="button"
													disabled={busy || lastOwner}
													onClick={() =>
														run(() => onSetRole(m.username, "member"))
													}
													className={actionBtn}
												>
													Make member
												</button>
											) : (
												<button
													type="button"
													disabled={busy}
													onClick={() =>
														run(() => onSetRole(m.username, "owner"))
													}
													className={actionBtn}
												>
													Make owner
												</button>
											)}
											<button
												type="button"
												disabled={busy || lastOwner}
												onClick={() => run(() => onRemoveMember(m.username))}
												className={actionBtn}
											>
												Remove
											</button>
										</div>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</section>
	);
}

function InvitesSection({
	invites,
	onInvite,
	onRevokeInvite,
}: {
	invites: string[];
	onInvite: (githubUsername: string) => Promise<void>;
	onRevokeInvite: (login: string) => Promise<void>;
}) {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function invite() {
		setError(null);
		setBusy(true);
		try {
			await onInvite(value.trim());
			setValue("");
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Invite failed.");
		} finally {
			setBusy(false);
		}
	}

	async function revoke(login: string) {
		setError(null);
		try {
			await onRevokeInvite(login);
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Revoke failed.");
		}
	}

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-sm">Pending invites</h2>
			<div className="flex gap-2">
				<input
					aria-label="GitHub username"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="octocat"
					className={field}
				/>
				<button
					type="button"
					onClick={invite}
					disabled={busy || value.trim() === ""}
					className={actionBtn}
				>
					{busy ? "Inviting…" : "Invite"}
				</button>
			</div>
			{invites.length === 0 ? (
				<p className="text-muted-foreground text-sm">No pending invites.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{invites.map((login) => (
						<li
							key={login}
							className="flex items-center justify-between text-sm"
						>
							<span className="font-mono">{login}</span>
							<button
								type="button"
								onClick={() => revoke(login)}
								className={actionBtn}
							>
								Revoke
							</button>
						</li>
					))}
				</ul>
			)}
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</section>
	);
}

function DangerZone({
	slug,
	role,
	soleOwner,
	onLeave,
	onDelete,
}: {
	slug: string;
	role: "owner" | "member";
	soleOwner: boolean;
	onLeave: () => Promise<void>;
	onDelete: () => Promise<void>;
}) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-red-600 text-sm">Danger zone</h2>
			<LeaveOrg soleOwner={soleOwner} onLeave={onLeave} />
			{role === "owner" && <DeleteOrg slug={slug} onDelete={onDelete} />}
		</section>
	);
}

function LeaveOrg({
	soleOwner,
	onLeave,
}: {
	soleOwner: boolean;
	onLeave: () => Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function leave() {
		setError(null);
		setBusy(true);
		try {
			await onLeave();
			// On success the route navigates away and this unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't leave the org.");
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			{confirming ? (
				<div className="flex items-center gap-2">
					<span className="text-sm">Leave this org?</span>
					<button
						type="button"
						onClick={() => setConfirming(false)}
						className={actionBtn}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={leave}
						disabled={busy}
						className={dangerBtn}
					>
						{busy ? "Leaving…" : "Leave"}
					</button>
				</div>
			) : (
				<div>
					<button
						type="button"
						disabled={soleOwner}
						onClick={() => setConfirming(true)}
						className={actionBtn}
					>
						Leave org
					</button>
					{soleOwner && (
						<p className="text-muted-foreground text-sm">
							You're the only owner — promote someone else first.
						</p>
					)}
				</div>
			)}
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</div>
	);
}

function DeleteOrg({
	slug,
	onDelete,
}: {
	slug: string;
	onDelete: () => Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function del() {
		setError(null);
		setBusy(true);
		try {
			await onDelete();
			// On success the route navigates away and this unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't delete the org.");
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			{confirming ? (
				<div className="flex flex-col gap-2 rounded-lg border border-red-600/40 p-3">
					<p className="text-red-600 text-sm">
						This permanently deletes <span className="font-mono">{slug}</span>.
						Type the slug to confirm.
					</p>
					<input
						aria-label="Confirm org slug"
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						className={field}
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
							onClick={del}
							disabled={typed !== slug || busy}
							className={dangerBtn}
						>
							{busy ? "Deleting…" : "Delete"}
						</button>
					</div>
					{error && <p className="text-red-600 text-sm">{error}</p>}
				</div>
			) : (
				<div>
					<button
						type="button"
						onClick={() => setConfirming(true)}
						className={actionBtn}
					>
						Delete org
					</button>
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/org-settings.test.tsx`
Expected: PASS (all cases green).

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/components/org-settings.tsx src/components/org-settings.test.tsx
git commit -m "$(cat <<'EOF'
feat: OrgSettings component — roster, invites, danger zone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Switcher gear entry + Header wiring

**Files:**
- Modify: `src/components/org-switcher.tsx`
- Modify: `src/components/org-switcher.test.tsx`
- Modify: `src/components/Header.tsx:32-47` (`HeaderSwitcher`)

**Interfaces:**
- Consumes: existing `OrgSwitcherProps`.
- Produces: `OrgSwitcherProps` gains `onManage: (slug: string) => void`. Each org row renders a gear button with accessible name `Manage <slug>` that calls `onManage(slug)` and closes the menu. `HeaderSwitcher` wires `onManage` to `router.navigate({ to: "/orgs/$slug/settings", params: { slug } })`.

- [ ] **Step 1: Update the test (add gear coverage; make existing selectors specific)**

The gear button's accessible name (`Manage acme`) also contains the org slug, so the existing `{ name: /acme/ }` / `{ name: /widgets/ }` selectors become ambiguous. Anchor them to the start of the pick button's name and add `onManage` to every render. Replace the whole file `src/components/org-switcher.test.tsx` with:

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
const noopManage = () => {};

test("labels the active scope and lists Personal + orgs when open", () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={noopManage}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	expect(screen.getByRole("button", { name: /^acme/ })).toBeTruthy();
	expect(screen.getByRole("button", { name: /^widgets/ })).toBeTruthy();
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
			onManage={noopManage}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /^acme/ }));
	expect(picked).toBe("acme");
});

test("the gear calls onManage with the org slug", () => {
	let managed = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={(s) => {
				managed = s;
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /manage widgets/i }));
	expect(managed).toBe("widgets");
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
			onManage={noopManage}
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
			onManage={noopManage}
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

- [ ] **Step 2: Run the test to verify the new case fails**

Run: `bun test src/components/org-switcher.test.tsx`
Expected: FAIL — `onManage` prop/gear button don't exist yet (the "gear calls onManage" test fails to find the button; type errors on the prop are also surfaced by tsc later).

- [ ] **Step 3: Implement the gear in `OrgSwitcher`**

In `src/components/org-switcher.tsx`:

Add the import at the top:
```tsx
import { Settings } from "lucide-react";
```

Extend the props type (`OrgSwitcherProps`):
```tsx
export type OrgSwitcherProps = {
	scope: string;
	orgs: Org[];
	onSelect: (scope: string) => void;
	onCreate: (name: string) => Promise<Org>;
	onManage: (slug: string) => void;
};
```

Destructure `onManage` in the component signature:
```tsx
export function OrgSwitcher({
	scope,
	orgs,
	onSelect,
	onCreate,
	onManage,
}: OrgSwitcherProps) {
```

Replace the org-row `.map(...)` block (the single `<button key={o.slug}>…</button>`) with a row that pairs the pick button with a gear:
```tsx
					{orgs.map((o) => (
						<div key={o.slug} className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => pick(o.slug)}
								className="flex flex-1 items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--chip-bg)]"
							>
								<span className="font-mono">{o.slug}</span>
								<span className="text-muted-foreground text-xs">{o.role}</span>
							</button>
							<button
								type="button"
								aria-label={`Manage ${o.slug}`}
								onClick={() => {
									onManage(o.slug);
									setOpen(false);
								}}
								className="rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-[var(--chip-bg)]"
							>
								<Settings className="h-4 w-4" />
							</button>
						</div>
					))}
```

- [ ] **Step 4: Wire `HeaderSwitcher` to navigate**

In `src/components/Header.tsx`, add `onManage` to the `<OrgSwitcher>` in `HeaderSwitcher` (it already has `router` from `useRouter()`):
```tsx
			<OrgSwitcher
				scope={scope}
				orgs={orgs}
				onSelect={setScope}
				onCreate={async (name) => {
					const org = await createOrgFn({ data: name });
					router.invalidate();
					return org;
				}}
				onManage={(slug) =>
					router.navigate({ to: "/orgs/$slug/settings", params: { slug } })
				}
			/>
```

- [ ] **Step 5: Run the switcher tests to verify they pass**

Run: `bun test src/components/org-switcher.test.tsx`
Expected: PASS (all five cases green).

- [ ] **Step 6: Format and commit**

`Header.tsx` will not typecheck standalone yet (the `/orgs/$slug/settings` route is created in Task 4, so `router.navigate` to it is not yet in the generated route tree). That's expected — the full `bun run verify` runs at the end of Task 4. Commit now:

```bash
bun run format
git add src/components/org-switcher.tsx src/components/org-switcher.test.tsx src/components/Header.tsx
git commit -m "$(cat <<'EOF'
feat: org settings gear in the switcher

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Server fns + `/orgs/$slug/settings` route (glue)

**Files:**
- Modify: `src/server/fns.ts` (append; extend the import from `./relay`)
- Create: `src/routes/orgs/$slug.settings.tsx`
- Regenerated: `src/routeTree.gen.ts` (via `bun run generate-routes` — do not hand-edit)

**Interfaces:**
- Consumes: Task 1 relay fns; Task 2 `OrgSettings`; existing `getSession`, `dropSessionAndRedirect`, `RelayError`, `useOrgScope`.
- Produces server fns:
  - `getOrgMembers({ data: slug })`, `getOrgInvites({ data: slug })`
  - `inviteOrgMemberFn({ data: { slug, githubUsername } })`
  - `revokeOrgInviteFn({ data: { slug, login } })`
  - `setOrgMemberRoleFn({ data: { slug, username, role } })`
  - `removeOrgMemberFn({ data: { slug, username } })`
  - `deleteOrgFn({ data: slug })`
- No unit test (thin glue, consistent with the other routes/fns which have none). Verified by `bun run verify`.

- [ ] **Step 1: Add the server fns**

In `src/server/fns.ts`, extend the existing import from `./relay` to also import: `deleteOrg`, `fetchOrgInvites`, `fetchOrgMembers`, `inviteOrgMember`, `removeOrgMember`, `revokeOrgInvite`, `setOrgMemberRole`. Then append:

```ts
export const getOrgMembers = createServerFn()
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchOrgMembers(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getOrgInvites = createServerFn()
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchOrgInvites(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const inviteOrgMemberFn = createServerFn({ method: "POST" })
	.validator((d: { slug: string; githubUsername: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await inviteOrgMember(credential, data.slug, data.githubUsername);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const revokeOrgInviteFn = createServerFn({ method: "POST" })
	.validator((d: { slug: string; login: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await revokeOrgInvite(credential, data.slug, data.login);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const setOrgMemberRoleFn = createServerFn({ method: "POST" })
	.validator((d: { slug: string; username: string; role: "owner" | "member" }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await setOrgMemberRole(credential, data.slug, data.username, data.role);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const removeOrgMemberFn = createServerFn({ method: "POST" })
	.validator((d: { slug: string; username: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await removeOrgMember(credential, data.slug, data.username);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const deleteOrgFn = createServerFn({ method: "POST" })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await deleteOrg(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 2: Create the route**

Create `src/routes/orgs/$slug.settings.tsx`:

```tsx
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useOrgScope } from "@/components/org-scope";
import { OrgSettings } from "@/components/org-settings";
import { RelayError } from "@/components/relay-error";
import {
	deleteOrgFn,
	getOrgInvites,
	getOrgMembers,
	getSession,
	inviteOrgMemberFn,
	removeOrgMemberFn,
	revokeOrgInviteFn,
	setOrgMemberRoleFn,
} from "@/server/fns";

export const Route = createFileRoute("/orgs/$slug/settings")({
	loader: async ({ params }) => {
		const session = await getSession();
		const members = await getOrgMembers({ data: params.slug });
		const role =
			members.find((m) => m.username === session?.username)?.role ?? "member";
		const invites =
			role === "owner" ? await getOrgInvites({ data: params.slug }) : [];
		return { members, invites, role, username: session?.username ?? "" };
	},
	component: OrgSettingsPage,
	errorComponent: RelayError,
});

function OrgSettingsPage() {
	const { slug } = Route.useParams();
	const { members, invites, role, username } = Route.useLoaderData();
	const router = useRouter();
	const navigate = useNavigate();
	const { setScope } = useOrgScope();

	// Leave/delete: the caller no longer belongs to (or the org no longer
	// exists), so drop the scope back to personal and go home.
	async function exitToPersonal(act: () => Promise<unknown>) {
		await act();
		setScope("personal");
		await navigate({ to: "/" });
	}

	return (
		<OrgSettings
			slug={slug}
			role={role}
			username={username}
			members={members}
			invites={invites}
			onInvite={async (githubUsername) => {
				await inviteOrgMemberFn({ data: { slug, githubUsername } });
				router.invalidate();
			}}
			onRevokeInvite={async (login) => {
				await revokeOrgInviteFn({ data: { slug, login } });
				router.invalidate();
			}}
			onSetRole={async (memberName, nextRole) => {
				await setOrgMemberRoleFn({
					data: { slug, username: memberName, role: nextRole },
				});
				router.invalidate();
			}}
			onRemoveMember={async (memberName) => {
				await removeOrgMemberFn({ data: { slug, username: memberName } });
				router.invalidate();
			}}
			onLeave={() =>
				exitToPersonal(() =>
					removeOrgMemberFn({ data: { slug, username } }),
				)
			}
			onDelete={() => exitToPersonal(() => deleteOrgFn({ data: slug }))}
		/>
	);
}
```

- [ ] **Step 3: Regenerate the route tree**

Run: `bun run generate-routes`
Expected: `src/routeTree.gen.ts` updated to include `/orgs/$slug/settings` (no errors).

- [ ] **Step 4: Full verify**

Run: `bun run verify`
Expected: PASS — Biome clean, `tsc --noEmit` clean (including `Header.tsx`'s `router.navigate` to the now-registered route), all tests green, `vite build` succeeds.

If Biome reports formatting, run `bun run format` and re-run `bun run verify`.

- [ ] **Step 5: Commit**

```bash
git add src/server/fns.ts src/routes/orgs/$slug.settings.tsx src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat: phase 3 slice B — org settings route + server fns

Wires the members/roles/invites surface to the relay under the account
bearer, reached from the switcher gear. Closes #26.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Manual smoke + PR

**Files:** none (verification + integration).

- [ ] **Step 1: Smoke the flow against a dev relay**

Run: `bun run dev` (needs `PIPER_RELAY_URL` pointed at a relay where you own an org). In the browser:
- Open the switcher → each org row shows a gear → click it → lands on `/orgs/<slug>/settings`.
- As an owner: invite a GitHub username (appears under Pending invites), revoke it, promote/demote another member, remove a member — each reflects after the refetch.
- Delete an org that still owns an agent → the `org still owns agents` message renders; delete an empty org → returns to `/` on Personal.
- As a member (use an org where you're not owner): roster is read-only, no invite/owner controls, Leave works.

Expected: matches issue #26 acceptance criteria. If anything misbehaves, use superpowers:systematic-debugging before patching.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin faruk/phase3-org-settings
gh pr create --base main --title "feat: phase 3 slice B — org settings: members, roles, invites" --body "$(cat <<'EOF'
Closes #26 (part of #9). The org management surface: members roster with
roles, pending invites, and destructive actions — reached from a gear on each
org in the switcher.

- Owner: invite by GitHub username, revoke, promote/demote, remove member,
  delete org (surfaces the "still owns agents" 409).
- Member: read-only roster + leave.
- Guardrails: sole owner can't leave/demote/remove (proactively disabled and
  the relay 409 is surfaced); members never see owner-only controls.

Spec: docs/superpowers/specs/2026-07-12-phase3-org-settings-design.md
Plan: docs/superpowers/plans/2026-07-12-phase3-org-settings.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens against `main`; the `verify` check runs.

---

## Self-Review

**Spec coverage:**
- Org settings page `/orgs/$slug/settings` with members + pending invites → Task 4 route + Task 2 component. ✓
- Owner invite / revoke / promote-demote / remove / delete → Task 2 controls + Task 1 relay + Task 4 fns. ✓
- Member leave + read-only roster → Task 2 (member branch, LeaveOrg). ✓
- Delete surfaces the 409 has-agents message → Task 2 delete test + `msg`-surfacing relay fn (Task 1). ✓
- Last-owner guardrail (disable + surface 409) → Task 2 (`soleOwner`, `lastOwner`) + relay `msg`. ✓
- Navigation entry (gear per org) → Task 3. ✓
- Relay contracts (members/invites shapes, owner-only, 401 → RelayAuthError) → Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code and test step contains full content. ✓

**Type consistency:** `OrgMember`, `OrgSettingsProps`, and the fn signatures used in Task 4 match those defined in Tasks 1–2 (`onSetRole(username, role)`, `onRemoveMember(username)`, `onInvite(githubUsername)`, `deleteOrgFn({ data: slug })` string validator, others object validators). The switcher gains `onManage(slug)` in Task 3, consumed by Header. ✓

**Note on task ordering:** `Header.tsx` (Task 3) references the route created in Task 4, so it only fully typechecks after Task 4's route-tree regen — called out in Task 3 Step 6 and verified by `bun run verify` in Task 4.
