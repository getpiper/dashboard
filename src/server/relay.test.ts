import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	acceptInvite,
	BoxOfflineError,
	createApp,
	createOrg,
	declineInvite,
	deleteApp,
	deleteOrg,
	exchangeGithub,
	fetchAllApps,
	fetchApps,
	fetchBox,
	fetchBoxes,
	fetchDeploymentLogs,
	fetchDeployments,
	fetchGithubRepos,
	fetchGithubStatus,
	fetchInvites,
	fetchOrgInvites,
	fetchOrgMembers,
	fetchOrgs,
	githubManifest,
	inviteOrgMember,
	linkApp,
	RelayAuthError,
	relayUrl,
	removeOrgMember,
	revokeOrgInvite,
	setOrgMemberRole,
	startApp,
	stopApp,
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
				{ agent: "abc123-zoe.public.example", owner: "zoe", connected: true },
				{
					agent: "def456-acme.public.example",
					owner: "acme",
					connected: false,
				},
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

test("fetchBox carries the box's owner through to BoxWithApps", async () => {
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		if (String(url).endsWith("/agents")) {
			return Response.json({
				agents: [
					{
						agent: "abc123-zoe.public.example",
						owner: "zoe",
						connected: false,
					},
				],
			});
		}
		return Response.json([]);
	}) as typeof fetch;

	const box = await fetchBox("cred-1", "abc123-zoe.public.example");
	expect(box.owner).toBe("zoe");
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
				Hostname: "7f3c9a2-zoe.public.example",
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
			hostname: "7f3c9a2-zoe.public.example",
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

test("fetchApps throws BoxOfflineError on 502", async () => {
	globalThis.fetch = (async () =>
		new Response("box unreachable", {
			status: 502,
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
		if (body === 502) return new Response("unreachable", { status: 502 });
		return Response.json(body);
	}) as typeof fetch;
}

test("fetchAllApps pairs each box with its apps and skips offline boxes", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [
				{ agent: "up-zoe.public.example", owner: "zoe", connected: true },
				{ agent: "down-zoe.public.example", owner: "zoe", connected: false },
			],
		},
		"https://relay.test/agents/up-zoe.public.example/v1/apps": [
			{
				Name: "web",
				Port: 8081,
				Repo: "r",
				Branch: "main",
				Hostname: "web-hash-zoe.public.example",
				CreatedAt: "2026-07-11T10:00:00Z",
				Status: "running",
			},
		],
	});

	const boxes = await fetchAllApps("cred-1");
	expect(boxes).toEqual([
		{
			base: "up-zoe.public.example",
			owner: "zoe",
			connected: true,
			apps: [
				{
					name: "web",
					port: 8081,
					repo: "r",
					branch: "main",
					hostname: "web-hash-zoe.public.example",
					createdAt: "2026-07-11T10:00:00Z",
					status: "running",
				},
			],
		},
		{
			base: "down-zoe.public.example",
			owner: "zoe",
			connected: false,
			apps: [],
		},
	]);
});

test("fetchAllApps treats a box that 503s mid-fan-out as offline", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [
				{ agent: "raced-zoe.public.example", owner: "zoe", connected: true },
			],
		},
		"https://relay.test/agents/raced-zoe.public.example/v1/apps": 503,
	});

	const boxes = await fetchAllApps("cred-1");
	expect(boxes).toEqual([
		{
			base: "raced-zoe.public.example",
			owner: "zoe",
			connected: false,
			apps: [],
		},
	]);
});

test("fetchAllApps treats a box that 502s mid-fan-out as offline", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [
				{ agent: "raced-zoe.public.example", owner: "zoe", connected: true },
			],
		},
		"https://relay.test/agents/raced-zoe.public.example/v1/apps": 502,
	});

	const boxes = await fetchAllApps("cred-1");
	expect(boxes).toEqual([
		{
			base: "raced-zoe.public.example",
			owner: "zoe",
			connected: false,
			apps: [],
		},
	]);
});

test("fetchBox returns one box with its apps", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [
				{ agent: "up-zoe.public.example", owner: "zoe", connected: true },
			],
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
	expect(box.owner).toBe("zoe");
	expect(box.apps.map((a) => a.name)).toEqual(["api"]);
});

test("fetchBox returns an offline box with no apps when not connected", async () => {
	routeFetch({
		"https://relay.test/agents": {
			agents: [
				{ agent: "down-zoe.public.example", owner: "zoe", connected: false },
			],
		},
	});

	const box = await fetchBox("cred-1", "down-zoe.public.example");
	expect(box).toEqual({
		base: "down-zoe.public.example",
		owner: "zoe",
		connected: false,
		apps: [],
	});
});

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

	const deps = await fetchDeployments(
		"cred-1",
		"abc-zoe.public.example",
		"web",
	);
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web/deployments",
	);
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(deps).toEqual([
		{
			id: "dep-abc123",
			pr: 0,
			status: "running",
			createdAt: "2026-07-11T10:00:00Z",
		},
		{
			id: "dep-def456",
			pr: 12,
			status: "failed",
			createdAt: "2026-07-11T09:00:00Z",
		},
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

test("githubManifest POSTs redirect_url and returns the manifest string", async () => {
	let seenUrl = "";
	let seenBody = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json({ manifest: '{"name":"piper-x"}' });
	}) as typeof fetch;

	const manifest = await githubManifest(
		"cred-1",
		"abc-zoe.public.example",
		"https://dash.test/boxes/abc-zoe.public.example/import",
	);
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/github/manifest",
	);
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(JSON.parse(seenBody)).toEqual({
		redirect_url: "https://dash.test/boxes/abc-zoe.public.example/import",
	});
	expect(manifest).toBe('{"name":"piper-x"}');
});

test("githubManifest throws RelayAuthError on 401 and BoxOfflineError on 503", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(githubManifest("bad", "b", "r")).rejects.toBeInstanceOf(
		RelayAuthError,
	);
	globalThis.fetch = (async () =>
		new Response("offline", { status: 503 })) as unknown as typeof fetch;
	expect(githubManifest("cred-1", "b", "r")).rejects.toBeInstanceOf(
		BoxOfflineError,
	);
});

test("exchangeGithub POSTs the code and resolves on 204", async () => {
	let seenUrl = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await exchangeGithub("cred-1", "abc-zoe.public.example", "code-xyz");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/github/exchange",
	);
	expect(JSON.parse(seenBody)).toEqual({ code: "code-xyz" });
});

test("exchangeGithub throws BoxOfflineError when the box fails the exchange (502)", async () => {
	globalThis.fetch = (async () =>
		new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;
	expect(
		exchangeGithub("cred-1", "abc-zoe.public.example", "code-xyz"),
	).rejects.toBeInstanceOf(BoxOfflineError);
});

test("createApp POSTs name+port and resolves on 201", async () => {
	let seenUrl = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		return new Response(null, { status: 201 });
	}) as typeof fetch;

	await createApp("cred-1", "abc-zoe.public.example", "web", 8080);
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps",
	);
	expect(JSON.parse(seenBody)).toEqual({ name: "web", port: 8080 });
});

test("createApp tolerates 409 app-exists as success", async () => {
	globalThis.fetch = (async () =>
		new Response("app exists", { status: 409 })) as unknown as typeof fetch;
	// resolves (does not throw) so the caller proceeds to link
	await createApp("cred-1", "abc-zoe.public.example", "web", 8080);
});

test("createApp surfaces the box message on 400 (reserved name)", async () => {
	globalThis.fetch = (async () =>
		new Response("name reserved", { status: 400 })) as unknown as typeof fetch;
	expect(
		createApp("cred-1", "abc-zoe.public.example", "hooks", 8080),
	).rejects.toThrow(/name reserved/);
});

test("linkApp POSTs repo+branch and resolves on 204", async () => {
	let seenUrl = "";
	let seenBody = "";
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenBody = String(init?.body);
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await linkApp(
		"cred-1",
		"abc-zoe.public.example",
		"web",
		"getpiper/example",
		"main",
	);
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web/link",
	);
	expect(JSON.parse(seenBody)).toEqual({
		repo: "getpiper/example",
		branch: "main",
	});
});

test("linkApp surfaces the box message on 404 (unknown app)", async () => {
	globalThis.fetch = (async () =>
		new Response("unknown app", { status: 404 })) as unknown as typeof fetch;
	expect(
		linkApp("cred-1", "abc-zoe.public.example", "gone", "r", "main"),
	).rejects.toThrow(/unknown app/);
});

test("linkApp includes root_dir only when a monorepo subpath is given", async () => {
	let seenBody = "";
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		seenBody = String(init?.body);
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await linkApp("cred-1", "b", "web", "getpiper/example", "main", "apps/web");
	expect(JSON.parse(seenBody)).toEqual({
		repo: "getpiper/example",
		branch: "main",
		root_dir: "apps/web",
	});

	await linkApp("cred-1", "b", "web", "getpiper/example", "main");
	expect(JSON.parse(seenBody)).toEqual({
		repo: "getpiper/example",
		branch: "main",
	});
});

test("fetchGithubStatus maps the status envelope to camelCase", async () => {
	let seenUrl = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return Response.json({
			github_app: true,
			installations: [
				{
					installation_id: "148353616",
					target_type: "org",
					target_login: "getpiper",
				},
			],
			install_url: "https://github.com/apps/piper/installations/new",
		});
	}) as typeof fetch;

	const status = await fetchGithubStatus("cred-1");
	expect(seenUrl).toBe("https://relay.test/v1/github/status");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
	expect(status).toEqual({
		githubApp: true,
		installations: [
			{
				installationId: "148353616",
				targetType: "org",
				targetLogin: "getpiper",
			},
		],
		installUrl: "https://github.com/apps/piper/installations/new",
	});
});

test("fetchGithubStatus raises RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	await expect(fetchGithubStatus("cred-1")).rejects.toBeInstanceOf(
		RelayAuthError,
	);
});

test("fetchGithubRepos maps the repos envelope to GithubRepo[]", async () => {
	let seenUrl = "";
	globalThis.fetch = (async (url: RequestInfo | URL) => {
		seenUrl = String(url);
		return Response.json({
			repos: [
				{
					full_name: "octo/api",
					visibility: "private",
					pushed_at: "2026-07-20T00:00:00Z",
				},
				{
					full_name: "octo/web",
					visibility: "public",
					pushed_at: "2026-07-19T00:00:00Z",
				},
			],
		});
	}) as typeof fetch;

	const repos = await fetchGithubRepos("cred-1", "148353616");
	expect(seenUrl).toBe(
		"https://relay.test/v1/github/repos?installation_id=148353616",
	);
	expect(repos).toEqual([
		{
			fullName: "octo/api",
			visibility: "private",
			pushedAt: "2026-07-20T00:00:00Z",
		},
		{
			fullName: "octo/web",
			visibility: "public",
			pushedAt: "2026-07-19T00:00:00Z",
		},
	]);
});

test("fetchGithubRepos raises RelayAuthError on 401", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	await expect(fetchGithubRepos("cred-1", "148353616")).rejects.toBeInstanceOf(
		RelayAuthError,
	);
});

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

test("startApp POSTs to the start path and resolves on 204", async () => {
	let seenUrl = "";
	let seenMethod = "";
	let seenAuth: string | null = null;
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenMethod = String(init?.method);
		seenAuth = new Headers(init?.headers).get("Authorization");
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	await startApp("cred-1", "abc-zoe.public.example", "web");
	expect(seenUrl).toBe(
		"https://relay.test/agents/abc-zoe.public.example/v1/apps/web/start",
	);
	expect(seenMethod).toBe("POST");
	expect<string | null>(seenAuth).toBe("Bearer cred-1");
});

test("startApp throws RelayAuthError on 401 and BoxOfflineError on 503", async () => {
	globalThis.fetch = (async () =>
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
	expect(startApp("bad", "b", "web")).rejects.toBeInstanceOf(RelayAuthError);
	globalThis.fetch = (async () =>
		new Response("offline", { status: 503 })) as unknown as typeof fetch;
	expect(startApp("cred-1", "b", "web")).rejects.toBeInstanceOf(
		BoxOfflineError,
	);
});

test("startApp surfaces the box message on 404 (unknown app)", async () => {
	globalThis.fetch = (async () =>
		new Response("unknown app", { status: 404 })) as unknown as typeof fetch;
	expect(startApp("cred-1", "b", "gone")).rejects.toThrow(/unknown app/);
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
		new Response("nope", { status: 401 })) as unknown as typeof fetch;
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
		new Response("name taken", { status: 409 })) as unknown as typeof fetch;
	await expect(createOrg("cred-1", "Acme")).rejects.toThrow("name taken");
});

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
		Response.json({ invites: [] })) as unknown as typeof fetch;
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
