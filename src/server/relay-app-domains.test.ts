import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	addAppDomain,
	BoxOfflineError,
	fetchAllAppDomains,
	fetchAppDomains,
	RelayAuthError,
	removeAppDomain,
} from "./relay";

const originalFetch = globalThis.fetch;
const originalEnv = process.env.PIPER_RELAY_URL;

beforeEach(() => {
	process.env.PIPER_RELAY_URL = "https://relay.test";
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalEnv === undefined) {
		delete process.env.PIPER_RELAY_URL;
	} else {
		process.env.PIPER_RELAY_URL = originalEnv;
	}
});

const rawDomain = {
	domain: "api.octo.dev",
	app: "api",
	status: "active",
	error: "",
	cert_not_after: "2026-10-01T00:00:00Z",
	dns_records: [{ type: "CNAME", name: "api.octo.dev", value: "relay.test" }],
	dns_ok: true,
};

test("fetchAppDomains calls GET .../apps/{app}/domains and maps snake_case", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json([rawDomain]);
	}) as typeof fetch;

	const domains = await fetchAppDomains("cred-1", "abc-zoe", "api");
	expect(seenUrl).toBe("https://relay.test/agents/abc-zoe/v1/apps/api/domains");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(domains).toEqual([
		{
			domain: "api.octo.dev",
			app: "api",
			status: "active",
			error: "",
			certNotAfter: "2026-10-01T00:00:00Z",
			dnsRecords: [
				{ type: "CNAME", name: "api.octo.dev", value: "relay.test" },
			],
			dnsOk: true,
		},
	]);
});

test("fetchAppDomains maps 401 to RelayAuthError and 502 to BoxOfflineError", async () => {
	globalThis.fetch = (async () =>
		new Response("", { status: 401 })) as unknown as typeof fetch;
	expect(fetchAppDomains("cred", "b", "a")).rejects.toBeInstanceOf(
		RelayAuthError,
	);

	globalThis.fetch = (async () =>
		new Response("", { status: 502 })) as unknown as typeof fetch;
	expect(fetchAppDomains("cred", "b", "a")).rejects.toBeInstanceOf(
		BoxOfflineError,
	);
});

test("addAppDomain POSTs the domain and returns the created status", async () => {
	let seenUrl = "";
	let seenBody = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = init?.method ?? "";
		seenBody = String(init?.body);
		return Response.json({ ...rawDomain, status: "pending" }, { status: 201 });
	}) as typeof fetch;

	const created = await addAppDomain(
		"cred-1",
		"abc-zoe",
		"api",
		"api.octo.dev",
	);
	expect(seenUrl).toBe("https://relay.test/agents/abc-zoe/v1/apps/api/domains");
	expect(seenMethod).toBe("POST");
	expect(JSON.parse(seenBody)).toEqual({ domain: "api.octo.dev" });
	expect(created.status).toBe("pending");
});

test("addAppDomain surfaces the relay's conflict message on 409", async () => {
	globalThis.fetch = (async () =>
		new Response("domain already in use", {
			status: 409,
		})) as unknown as typeof fetch;
	expect(addAppDomain("cred", "b", "a", "x.dev")).rejects.toThrow(
		"domain already in use",
	);
});

test("removeAppDomain DELETEs the domain and accepts 204", async () => {
	let seenUrl = "";
	let seenMethod = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = init?.method ?? "";
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await removeAppDomain("cred-1", "abc-zoe", "api", "api.octo.dev");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe/v1/apps/api/domains/api.octo.dev",
	);
	expect(seenMethod).toBe("DELETE");
});

test("fetchAllAppDomains composes boxes → apps → per-app domains", async () => {
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		const u = String(url);
		if (u.endsWith("/agents")) {
			return Response.json({
				agents: [
					{ agent: "abc-zoe", owner: "zoe", connected: true },
					{ agent: "off-zoe", owner: "zoe", connected: false },
				],
			});
		}
		if (u.endsWith("/abc-zoe/v1/apps")) {
			return Response.json([
				{
					Name: "api",
					Port: 8080,
					Repo: "zoe/api",
					Branch: "main",
					Hostname: "h1.example",
					CreatedAt: "2026-07-01T00:00:00Z",
					Status: "running",
				},
				{
					Name: "web",
					Port: 8080,
					Repo: "zoe/web",
					Branch: "main",
					Hostname: "",
					CreatedAt: "2026-07-02T00:00:00Z",
					Status: "stopped",
				},
			]);
		}
		if (u.endsWith("/apps/api/domains")) return Response.json([rawDomain]);
		if (u.endsWith("/apps/web/domains")) return Response.json([]);
		throw new Error(`unexpected fetch ${u}`);
	}) as typeof fetch;

	const all = await fetchAllAppDomains("cred-1");
	expect(all).toHaveLength(2);
	expect(all[0]?.box.base).toBe("abc-zoe");
	expect(all[0]?.domains.api).toHaveLength(1);
	expect(all[0]?.domains.api?.[0]?.domain).toBe("api.octo.dev");
	expect(all[0]?.domains.web).toEqual([]);
	// Offline box: no apps, no domains — but still listed.
	expect(all[1]?.box.base).toBe("off-zoe");
	expect(all[1]?.box.connected).toBe(false);
	expect(all[1]?.domains).toEqual({});
});
