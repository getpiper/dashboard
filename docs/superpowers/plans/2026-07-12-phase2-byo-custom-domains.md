# Phase 2 slice C — BYO custom domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach a bring-your-own custom domain to a box from the box-detail page — configure it, see the DNS records to create, watch cert issuance, and remove it — without touching the CLI.

**Architecture:** Three fetch wrappers in `src/server/relay.ts` hit the box's shipped domain-config API through the relay proxy (`GET`/`PUT`/`DELETE /agents/{base}/v1/domain`), wrapped by session-guarded server fns in `src/server/fns.ts`. A new decoupled `DomainPanel` component (injected async props, testable with fakes) renders one of three states — env-managed / unconfigured form / configured status — and auto-polls the loader while the cert is issuing. The `$base` route fetches domain status alongside the box and wires the handlers.

**Tech Stack:** Bun, TanStack Start (`createServerFn`, file router), React, Tailwind, Testing Library, `bun test`, Biome.

## Global Constraints

- **Bun only** — never npm/yarn/node. Run tests with `bun test`, format with `bun run format`, full gate with `bun run verify`.
- **Test-first** — every task writes a failing test before implementation.
- **Tests never live in `src/routes/`** (the file router scans it). Server/component tests sit next to their source (`*.test.ts`, `*.test.tsx`).
- **The box emits snake_case JSON** for domain status (unlike the `App` list's capitalized keys); map snake_case → camelCase.
- **Cloudflare is the only supported DNS provider** — sent as the fixed wire value `"cloudflare"`; never a user-chosen dropdown.
- **Match existing idiom** — mirror the `stopApp`/`deleteApp` wrapper style, the `stopAppFn`/`deleteAppFn` fn style, and the `AppActions` component style (shared `actionBtn`/`dangerBtn` classes, `isRedirect` re-throw, inline type-the-name confirm). Biome enforces formatting.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Domain server layer (`relay.ts`)

**Files:**
- Modify: `src/server/relay.ts` (append after `deleteApp`, end of file)
- Test: `src/server/relay.test.ts` (append new tests; extend the import on lines 2-18)

**Interfaces:**
- Consumes: existing `relayUrl()`, `RelayAuthError`, `BoxOfflineError` from the same module.
- Produces:
  - `type DnsRecord = { type: string; name: string; value: string }`
  - `type DomainStatus = { domain: string; dnsProvider: string; dnsTokenSet: boolean; source: "api" | "env"; status: "" | "issuing" | "active" | "failed"; error: string; certNotAfter: string | null; dnsRecords: DnsRecord[]; dnsOk: boolean }`
  - `getDomain(credential: string, base: string): Promise<DomainStatus>`
  - `setDomain(credential: string, base: string, config: { domain: string; provider: string; token: string }): Promise<DomainStatus>`
  - `removeDomain(credential: string, base: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add `getDomain`, `setDomain`, `removeDomain` to the existing import block at the top of `src/server/relay.test.ts` (keep it alphabetical-ish, matching the file's loose ordering), then append these tests at the end of the file:

```ts
test("getDomain GETs {relay}/agents/{base}/v1/domain and maps snake_case", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json({
			domain: "shop.example.com",
			dns_provider: "cloudflare",
			dns_token_set: true,
			source: "api",
			status: "issuing",
			error: "",
			cert_not_after: null,
			dns_records: [
				{ type: "CNAME", name: "*.shop.example.com", value: "relay.test" },
				{ type: "CNAME", name: "shop.example.com", value: "relay.test" },
			],
			dns_ok: false,
		});
	}) as typeof fetch;

	const status = await getDomain("cred-1", "abc-zoe.public.example");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/domain",
	);
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(status).toEqual({
		domain: "shop.example.com",
		dnsProvider: "cloudflare",
		dnsTokenSet: true,
		source: "api",
		status: "issuing",
		error: "",
		certNotAfter: null,
		dnsRecords: [
			{ type: "CNAME", name: "*.shop.example.com", value: "relay.test" },
			{ type: "CNAME", name: "shop.example.com", value: "relay.test" },
		],
		dnsOk: false,
	});
});

test("getDomain throws RelayAuthError on 401 and BoxOfflineError on 503", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(getDomain("bad", "b")).rejects.toBeInstanceOf(RelayAuthError);
	globalThis.fetch = (async () =>
		new Response("offline", { status: 503 })) as unknown as typeof fetch;
	expect(getDomain("cred-1", "b")).rejects.toBeInstanceOf(BoxOfflineError);
});

test("setDomain PUTs domain+dns_provider+dns_token and maps the returned status", async () => {
	let seenUrl = "";
	let seenMethod = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		seenBody = String(init?.body);
		return Response.json({
			domain: "shop.example.com",
			dns_provider: "cloudflare",
			dns_token_set: true,
			source: "api",
			status: "issuing",
			error: "",
			dns_records: [],
			dns_ok: false,
		});
	}) as typeof fetch;

	const status = await setDomain("cred-1", "abc-zoe.public.example", {
		domain: "shop.example.com",
		provider: "cloudflare",
		token: "cf-token-xyz",
	});
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/domain",
	);
	expect(seenMethod).toBe("PUT");
	expect(JSON.parse(seenBody)).toEqual({
		domain: "shop.example.com",
		dns_provider: "cloudflare",
		dns_token: "cf-token-xyz",
	});
	expect(status.status).toBe("issuing");
	expect(status.certNotAfter).toBe(null);
});

test("setDomain surfaces the box message on 400 (unsupported provider)", async () => {
	globalThis.fetch = (async () =>
		new Response("unsupported dns provider", {
			status: 400,
		})) as unknown as typeof fetch;
	expect(
		setDomain("cred-1", "b", {
			domain: "shop.example.com",
			provider: "route53",
			token: "t",
		}),
	).rejects.toThrow(/unsupported dns provider/);
});

test("removeDomain DELETEs the domain path and resolves on 204", async () => {
	let seenUrl = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await removeDomain("cred-1", "abc-zoe.public.example");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/domain",
	);
	expect(seenMethod).toBe("DELETE");
});

test("removeDomain throws RelayAuthError on 401 and BoxOfflineError on 502", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(removeDomain("bad", "b")).rejects.toBeInstanceOf(RelayAuthError);
	globalThis.fetch = (async () =>
		new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;
	expect(removeDomain("cred-1", "b")).rejects.toBeInstanceOf(BoxOfflineError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/server/relay.test.ts`
Expected: FAIL — `getDomain`/`setDomain`/`removeDomain` are not exported (import error / "not a function").

- [ ] **Step 3: Implement the wrappers**

Append to the end of `src/server/relay.ts`:

```ts
export type DnsRecord = { type: string; name: string; value: string };

export type DomainStatus = {
	domain: string;
	dnsProvider: string;
	dnsTokenSet: boolean;
	source: "api" | "env";
	status: "" | "issuing" | "active" | "failed";
	error: string;
	certNotAfter: string | null;
	dnsRecords: DnsRecord[];
	dnsOk: boolean;
};

type RawDomainStatus = {
	domain: string;
	dns_provider: string;
	dns_token_set: boolean;
	source: "api" | "env";
	status: "" | "issuing" | "active" | "failed";
	error: string;
	cert_not_after?: string | null;
	dns_records: DnsRecord[];
	dns_ok: boolean;
};

function toDomainStatus(raw: RawDomainStatus): DomainStatus {
	return {
		domain: raw.domain,
		dnsProvider: raw.dns_provider,
		dnsTokenSet: raw.dns_token_set,
		source: raw.source,
		status: raw.status,
		error: raw.error,
		certNotAfter: raw.cert_not_after ?? null,
		dnsRecords: (raw.dns_records ?? []).map((r) => ({
			type: r.type,
			name: r.name,
			value: r.value,
		})),
		dnsOk: raw.dns_ok,
	};
}

export async function getDomain(
	credential: string,
	base: string,
): Promise<DomainStatus> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/domain`,
		{ headers: { Authorization: `Bearer ${credential}` } },
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay get domain returned ${res.status}`);
	}
	return toDomainStatus((await res.json()) as RawDomainStatus);
}

export async function setDomain(
	credential: string,
	base: string,
	config: { domain: string; provider: string; token: string },
): Promise<DomainStatus> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/domain`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				domain: config.domain,
				dns_provider: config.provider,
				dns_token: config.token,
			}),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay set domain returned ${res.status}`);
	}
	return toDomainStatus((await res.json()) as RawDomainStatus);
}

export async function removeDomain(
	credential: string,
	base: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/domain`,
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
		throw new Error(msg || `relay remove domain returned ${res.status}`);
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/server/relay.test.ts`
Expected: PASS (all existing + 6 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/relay.ts src/server/relay.test.ts
git commit -m "$(cat <<'EOF'
feat: relay wrappers for BYO domain get/set/remove

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `DomainPanel` component

**Files:**
- Create: `src/components/domain-panel.tsx`
- Test: `src/components/domain-panel.test.tsx`

**Interfaces:**
- Consumes: `DomainStatus` from `@/server/relay` (Task 1).
- Produces:
  - `type DomainPanelProps = { status: DomainStatus; onSave: (domain: string, token: string) => Promise<void>; onRemove: () => Promise<void>; refresh: () => void }`
  - `DomainPanel(props: DomainPanelProps)` — a `<section>` (not a `<main>`), so it drops into the box page between header and apps list. Renders env-managed / unconfigured-form / configured-status per `status`. Auto-polls `refresh` every 5s while `status.status === "issuing"`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/domain-panel.test.tsx`:

```tsx
import { expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { DomainStatus } from "@/server/relay";
import { DomainPanel } from "./domain-panel";

const baseStatus: DomainStatus = {
	domain: "",
	dnsProvider: "",
	dnsTokenSet: false,
	source: "api",
	status: "",
	error: "",
	certNotAfter: null,
	dnsRecords: [],
	dnsOk: false,
};
const makeStatus = (over: Partial<DomainStatus>): DomainStatus => ({
	...baseStatus,
	...over,
});
const configured = (over: Partial<DomainStatus>): DomainStatus =>
	makeStatus({
		domain: "shop.example.com",
		dnsProvider: "cloudflare",
		dnsTokenSet: true,
		status: "issuing",
		dnsRecords: [
			{ type: "CNAME", name: "*.shop.example.com", value: "relay.test" },
			{ type: "CNAME", name: "shop.example.com", value: "relay.test" },
		],
		...over,
	});

const noop = () => {};
const noopAsync = async () => {};

test("env-managed source renders read-only with no Save or Remove", () => {
	render(
		<DomainPanel
			status={makeStatus({ domain: "corp.example.com", source: "env" })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText("corp.example.com")).toBeTruthy();
	expect(screen.getByText(/managed by this box/i)).toBeTruthy();
	expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
	expect(
		screen.queryByRole("button", { name: /remove custom domain/i }),
	).toBeNull();
});

test("unconfigured renders the form; filling and saving calls onSave with the values", async () => {
	const onSave = mock(async () => {});
	render(
		<DomainPanel
			status={makeStatus({})}
			onSave={onSave}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	fireEvent.change(screen.getByLabelText(/^domain$/i), {
		target: { value: "shop.example.com" },
	});
	fireEvent.change(screen.getByLabelText(/dns api token/i), {
		target: { value: "cf-token" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
	});
	expect(onSave).toHaveBeenCalledTimes(1);
	expect(onSave.mock.calls[0]).toEqual(["shop.example.com", "cf-token"]);
});

test("configured+issuing shows the issuing pill and the CNAME records", () => {
	render(
		<DomainPanel
			status={configured({ status: "issuing" })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText("shop.example.com")).toBeTruthy();
	expect(screen.getByText(/issuing/i)).toBeTruthy();
	expect(screen.getByText("*.shop.example.com")).toBeTruthy();
	expect(screen.getAllByText("relay.test").length).toBe(2);
});

test("configured+active shows the cert expiry", () => {
	render(
		<DomainPanel
			status={configured({
				status: "active",
				certNotAfter: "2026-10-10T00:00:00Z",
			})}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/active/i)).toBeTruthy();
	expect(screen.getByText(/2026-10-10/)).toBeTruthy();
});

test("configured+failed shows the error text", () => {
	render(
		<DomainPanel
			status={configured({ status: "failed", error: "dns challenge failed" })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/failed/i)).toBeTruthy();
	expect(screen.getByText(/dns challenge failed/i)).toBeTruthy();
});

test("dnsOk drives the resolving indicator", () => {
	const { rerender } = render(
		<DomainPanel
			status={configured({ dnsOk: false })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/not resolving to your box/i)).toBeTruthy();
	rerender(
		<DomainPanel
			status={configured({ dnsOk: true })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/dns is resolving to your box/i)).toBeTruthy();
});

test("Remove stays disabled until the exact domain is typed, then calls onRemove", async () => {
	const onRemove = mock(async () => {});
	render(
		<DomainPanel
			status={configured({ status: "active" })}
			onSave={noopAsync}
			onRemove={onRemove}
			refresh={noop}
		/>,
	);
	fireEvent.click(
		screen.getByRole("button", { name: /remove custom domain/i }),
	);
	const confirm = screen.getByRole("button", { name: /^remove$/i });
	expect((confirm as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm domain/i), {
		target: { value: "shop.example.com" },
	});
	expect((confirm as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
	expect(onRemove).toHaveBeenCalledTimes(1);
});

test("Cancel collapses the remove confirm without calling onRemove", () => {
	const onRemove = mock(async () => {});
	render(
		<DomainPanel
			status={configured({ status: "active" })}
			onSave={noopAsync}
			onRemove={onRemove}
			refresh={noop}
		/>,
	);
	fireEvent.click(
		screen.getByRole("button", { name: /remove custom domain/i }),
	);
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(screen.queryByLabelText(/confirm domain/i)).toBeNull();
	expect(onRemove).not.toHaveBeenCalled();
});

test("a rejected onSave renders the error message", async () => {
	const onSave = mock(async () => {
		throw new Error("unsupported dns provider");
	});
	render(
		<DomainPanel
			status={makeStatus({})}
			onSave={onSave}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	fireEvent.change(screen.getByLabelText(/^domain$/i), {
		target: { value: "shop.example.com" },
	});
	fireEvent.change(screen.getByLabelText(/dns api token/i), {
		target: { value: "cf-token" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
	});
	expect(screen.getByText(/unsupported dns provider/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/domain-panel.test.tsx`
Expected: FAIL — `./domain-panel` module / `DomainPanel` export does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/domain-panel.tsx`:

```tsx
import { isRedirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { DomainStatus } from "@/server/relay";

const actionBtn =
	"rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)] disabled:opacity-50";
const dangerBtn =
	"rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50";
const field = "rounded-md border border-[var(--line)] px-3 py-2 text-sm";

const CERT: Record<string, { label: string; dot: string }> = {
	issuing: { label: "Issuing…", dot: "bg-amber-500" },
	active: { label: "Active", dot: "bg-emerald-500" },
	failed: { label: "Failed", dot: "bg-red-500" },
};

export type DomainPanelProps = {
	status: DomainStatus;
	onSave: (domain: string, token: string) => Promise<void>;
	onRemove: () => Promise<void>;
	refresh: () => void;
};

export function DomainPanel({
	status,
	onSave,
	onRemove,
	refresh,
}: DomainPanelProps) {
	// Auto-poll the loader while the cert is issuing so the panel flips to
	// active/failed on its own. Mirrors app-detail's useLiveTail.
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	useEffect(() => {
		if (status.status !== "issuing") return;
		const id = setInterval(() => refreshRef.current(), 5000);
		return () => clearInterval(id);
	}, [status.status]);

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-sm">Custom domain</h2>
			{status.source === "env" ? (
				<p className="text-muted-foreground text-sm">
					<span className="font-mono">{status.domain}</span> — managed by this
					box's environment.
				</p>
			) : status.domain ? (
				<Configured status={status} onRemove={onRemove} />
			) : (
				<ConfigForm onSave={onSave} />
			)}
		</section>
	);
}

function CertPill({ status }: { status: string }) {
	const meta = CERT[status] ?? { label: "Pending", dot: "bg-gray-400" };
	return (
		<span className="flex items-center gap-2 text-muted-foreground text-sm">
			<span className={`h-2 w-2 rounded-full ${meta.dot}`} />
			{meta.label}
		</span>
	);
}

function ConfigForm({
	onSave,
}: {
	onSave: (domain: string, token: string) => Promise<void>;
}) {
	const [domain, setDomain] = useState("");
	const [token, setToken] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSave() {
		setError(null);
		setSaving(true);
		try {
			await onSave(domain.trim(), token);
			// On success the parent re-runs the loader and this form unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't save the domain.");
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<label className="flex flex-col gap-1 text-sm">
				Domain
				<input
					aria-label="Domain"
					value={domain}
					onChange={(e) => setDomain(e.target.value)}
					placeholder="shop.example.com"
					className={field}
				/>
			</label>
			<label className="flex flex-col gap-1 text-sm">
				Cloudflare DNS API token
				<input
					aria-label="DNS API token"
					type="password"
					value={token}
					onChange={(e) => setToken(e.target.value)}
					className={field}
				/>
			</label>
			<div>
				<button
					type="button"
					onClick={handleSave}
					disabled={saving || !domain.trim() || !token}
					className={actionBtn}
				>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</div>
	);
}

function Configured({
	status,
	onRemove,
}: {
	status: DomainStatus;
	onRemove: () => Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const [removing, setRemoving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleRemove() {
		setError(null);
		setRemoving(true);
		try {
			await onRemove();
			// On success the parent re-runs the loader and this view unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't remove the domain.");
			setRemoving(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<span className="font-mono text-sm">{status.domain}</span>
				<CertPill status={status.status} />
			</div>
			{status.status === "failed" && status.error && (
				<p className="text-red-600 text-sm">{status.error}</p>
			)}
			{status.status === "active" && status.certNotAfter && (
				<p className="text-muted-foreground text-sm">
					Certificate valid until {status.certNotAfter}.
				</p>
			)}
			<p className="text-muted-foreground text-sm">
				{status.dnsOk
					? "DNS is resolving to your box."
					: "DNS is not resolving to your box yet — create the records below."}
			</p>

			<div className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">DNS records</h3>
				<div className="overflow-x-auto">
					<table className="text-sm">
						<thead>
							<tr className="text-left text-muted-foreground">
								<th className="pr-4 font-medium">Type</th>
								<th className="pr-4 font-medium">Name</th>
								<th className="font-medium">Value</th>
							</tr>
						</thead>
						<tbody className="font-mono">
							{status.dnsRecords.map((r) => (
								<tr key={`${r.type}-${r.name}`}>
									<td className="pr-4">{r.type}</td>
									<td className="pr-4">{r.name}</td>
									<td>{r.value}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<div>
					<button
						type="button"
						onClick={() => setConfirming(true)}
						className={actionBtn}
					>
						Remove custom domain
					</button>
				</div>
				{confirming && (
					<div className="flex flex-col gap-2 rounded-lg border border-red-600/40 p-3">
						<p className="text-red-600 text-sm">
							This removes{" "}
							<span className="font-mono">{status.domain}</span> and its
							certificate. Type the domain to confirm.
						</p>
						<input
							aria-label="Confirm domain"
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
								onClick={handleRemove}
								disabled={typed !== status.domain || removing}
								className={dangerBtn}
							>
								{removing ? "Removing…" : "Remove"}
							</button>
						</div>
					</div>
				)}
				{error && <p className="text-red-600 text-sm">{error}</p>}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/domain-panel.test.tsx`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/domain-panel.tsx src/components/domain-panel.test.tsx
git commit -m "$(cat <<'EOF'
feat: DomainPanel — configure, status, and remove a BYO domain

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Server fns + wire the panel into the box page

**Files:**
- Modify: `src/server/fns.ts` (extend the relay import on lines 4-16; append three fns after `deleteAppFn`)
- Modify: `src/components/box-detail.tsx` (add an optional `children` slot)
- Modify: `src/routes/boxes/$base.tsx` (loader fetches domain; render `DomainPanel`)

**Interfaces:**
- Consumes: `getDomain`, `setDomain`, `removeDomain`, `DomainStatus` (Task 1); `DomainPanel` (Task 2); existing `getBox`, `getCookie`, `redirect`, `dropSessionAndRedirect`, `RelayAuthError`.
- Produces:
  - `getDomainFn` — `createServerFn()` validator `(base: string) => base`, returns `DomainStatus`.
  - `setDomainFn` — `createServerFn({ method: "POST" })` validator `(d: { base: string; domain: string; token: string }) => d`, returns `DomainStatus`.
  - `removeDomainFn` — `createServerFn({ method: "POST" })` validator `(base: string) => base`.
  - `BoxDetail` gains `children?: ReactNode`, rendered between the header and the apps list.

There is no separate fn/route unit test (this repo does not unit-test server fns or file routes — the file router scans `src/routes/`). This task is verified by the full `bun run verify` gate (Biome + `tsc --noEmit` + tests + build) plus the existing `box-detail.test.tsx` staying green.

- [ ] **Step 1: Add the `children` slot to `BoxDetail`**

In `src/components/box-detail.tsx`, add the React type import at the top (below the existing imports):

```tsx
import type { ReactNode } from "react";
```

Change the signature and render the slot. Replace:

```tsx
export function BoxDetail({ box }: { box: BoxWithApps }) {
	return (
		<main className="page-wrap flex flex-col gap-4 px-4 py-8">
			<div className="flex items-center gap-2">
```

with:

```tsx
export function BoxDetail({
	box,
	children,
}: {
	box: BoxWithApps;
	children?: ReactNode;
}) {
	return (
		<main className="page-wrap flex flex-col gap-4 px-4 py-8">
			<div className="flex items-center gap-2">
```

Then insert `{children}` immediately after the closing `</div>` of that header block (the `<div className="flex items-center gap-2">…</div>`) and before the `{!box.connected ? (` conditional:

```tsx
			</div>
			{children}
			{!box.connected ? (
```

- [ ] **Step 2: Add the server fns**

In `src/server/fns.ts`, extend the import from `./relay` (lines 4-16) to add `getDomain`, `removeDomain`, `setDomain` alongside the existing names. Then append after `deleteAppFn`:

```ts
export const getDomainFn = createServerFn()
	.validator((base: string) => base)
	.handler(async ({ data: base }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await getDomain(credential, base);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const setDomainFn = createServerFn({ method: "POST" })
	.validator((d: { base: string; domain: string; token: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await setDomain(credential, data.base, {
				domain: data.domain,
				provider: "cloudflare",
				token: data.token,
			});
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const removeDomainFn = createServerFn({ method: "POST" })
	.validator((base: string) => base)
	.handler(async ({ data: base }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await removeDomain(credential, base);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
```

- [ ] **Step 3: Wire the route**

Replace the entire contents of `src/routes/boxes/$base.tsx` with:

```tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BoxDetail } from "@/components/box-detail";
import { DomainPanel } from "@/components/domain-panel";
import { RelayError } from "@/components/relay-error";
import { getBox, getDomainFn, removeDomainFn, setDomainFn } from "@/server/fns";

export const Route = createFileRoute("/boxes/$base")({
	loader: async ({ params }) => {
		const box = await getBox({ data: params.base });
		// Domain config is proxied to the box; only fetch it when the box is
		// online (an offline box would 502/503 → BoxOfflineError).
		const domain = box.connected
			? await getDomainFn({ data: params.base })
			: null;
		return { box, domain };
	},
	component: BoxPage,
	errorComponent: RelayError,
});

function BoxPage() {
	const { box, domain } = Route.useLoaderData();
	const router = useRouter();
	return (
		<BoxDetail box={box}>
			{domain && (
				<DomainPanel
					status={domain}
					onSave={async (d, token) => {
						await setDomainFn({ data: { base: box.base, domain: d, token } });
						router.invalidate();
					}}
					onRemove={async () => {
						await removeDomainFn({ data: box.base });
						router.invalidate();
					}}
					refresh={() => {
						router.invalidate();
					}}
				/>
			)}
		</BoxDetail>
	);
}
```

- [ ] **Step 4: Run the full verify gate**

Run: `bun run verify`
Expected: PASS — Biome clean, `tsc --noEmit` clean, all tests pass (existing `box-detail.test.tsx` still green with the optional `children`), build succeeds.

If Biome reports formatting, run `bun run format` and re-run `bun run verify`.

- [ ] **Step 5: Manually verify the flow (optional but recommended)**

Run: `bun run dev`, open a connected box at `/boxes/<base>`. Confirm: the Custom domain panel shows the config form; entering a domain + a Cloudflare token and saving flips it to an "Issuing…" status with the two CNAME records and the "not resolving yet" note; the panel auto-refreshes; "Remove custom domain" requires typing the exact domain. (Requires a real relay-connected box; skip if unavailable and rely on the tests.)

- [ ] **Step 6: Commit**

```bash
git add src/server/fns.ts src/components/box-detail.tsx src/routes/boxes/$base.tsx
git commit -m "$(cat <<'EOF'
feat: wire BYO domain panel into the box page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- "BYO domain configured end-to-end from the dashboard" → Task 1 `setDomain` + Task 2 `ConfigForm` + Task 3 `setDomainFn`/route. ✓
- "DNS records shown clearly" → Task 2 `Configured` records table, fed by `dnsRecords`. ✓
- "Cert-issuance status visible, reflects the box's state" → Task 2 `CertPill` (issuing/active/failed) + `dnsOk` indicator + auto-poll while issuing. ✓
- Three status states (env / unconfigured / configured) → Task 2 branch. ✓
- Remove domain (decided in-scope) → Task 1 `removeDomain`, Task 2 remove confirm, Task 3 `removeDomainFn`. ✓
- Cloudflare-only, fixed provider → Task 3 `setDomainFn` hard-codes `"cloudflare"`; form shows no dropdown. ✓
- Box-scoped, lives on box-detail page → Task 3 route + `BoxDetail` children slot. ✓
- Auth/offline handling mirrors module conventions → Task 1 wrappers, Task 3 fns. ✓
- Offline box doesn't break the page → Task 3 loader gates domain fetch on `box.connected`. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code and test step shows complete code. ✓

**Type consistency:** `DomainStatus`/`DnsRecord` field names (`dnsProvider`, `dnsTokenSet`, `certNotAfter`, `dnsRecords`, `dnsOk`) are identical across Task 1 (definition), Task 2 (consumption), Task 3 (fn return). `setDomain` config shape `{ domain, provider, token }` matches the `setDomainFn` call. `DomainPanelProps` (`status`, `onSave(domain, token)`, `onRemove`, `refresh`) matches the route wiring in Task 3. `getDomainFn`/`setDomainFn`/`removeDomainFn` names consistent between Task 3 definition and route import. ✓
