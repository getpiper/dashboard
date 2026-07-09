import { afterEach, beforeEach, expect, test } from "bun:test";
import { fetchBoxes, RelayAuthError, relayUrl } from "./relay";

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

test("fetchBoxes calls GET {relay}/agents with the bearer credential", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json([
			{ agent: "abc123-zoe.public.example", connected: true },
			{ agent: "def456-zoe.public.example", connected: false },
		]);
	}) as typeof fetch;

	const boxes = await fetchBoxes("cred-1");
	expect(seenUrl).toBe("https://relay.test/agents");
	expect(seenAuth).toBe("Bearer cred-1");
	expect(boxes).toEqual([
		{ agent: "abc123-zoe.public.example", connected: true },
		{ agent: "def456-zoe.public.example", connected: false },
	]);
});

test("fetchBoxes throws RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("unauthorized", { status: 401 })) as typeof fetch;
	expect(fetchBoxes("bad-cred")).rejects.toBeInstanceOf(RelayAuthError);
});

test("fetchBoxes throws a plain error on other failures", async () => {
	globalThis.fetch = (async () =>
		new Response("boom", { status: 502 })) as typeof fetch;
	expect(fetchBoxes("cred-1")).rejects.toThrow(/502/);
});
