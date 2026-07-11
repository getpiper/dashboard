import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	BoxOfflineError,
	fetchAllApps,
	fetchApps,
	fetchBox,
	fetchBoxes,
	RelayAuthError,
	relayUrl,
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

test("relayUrl strips a trailing slash", () => {
	process.env.PIPER_RELAY_URL = "https://relay.test/";
	expect(relayUrl()).toBe("https://relay.test");
});

test("relayUrl throws an explicit config error when unset", () => {
	delete process.env.PIPER_RELAY_URL;
	expect(() => relayUrl()).toThrow(/PIPER_RELAY_URL/);
});

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

test("fetchBoxes throws RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
	expect(fetchBoxes("bad-cred")).rejects.toBeInstanceOf(RelayAuthError);
});

test("fetchBoxes throws a plain error on other failures", async () => {
	globalThis.fetch = (async () =>
		new Response("boom", { status: 502 })) as unknown as typeof fetch;
	expect(fetchBoxes("cred-1")).rejects.toThrow(/502/);
});

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
	expect(
		fetchApps("cred-1", "abc123-zoe.public.example"),
	).rejects.toBeInstanceOf(BoxOfflineError);
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
