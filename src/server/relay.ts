export type Box = { agent: string; connected: boolean };

export class RelayAuthError extends Error {}

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

export function relayUrl(): string {
	const url = process.env.PIPER_RELAY_URL;
	if (!url) {
		throw new Error(
			"PIPER_RELAY_URL is not set — point it at the relay control API (the same URL `piper login --relay` takes)",
		);
	}
	return url.replace(/\/$/, "");
}

export async function fetchBoxes(credential: string): Promise<Box[]> {
	const res = await fetch(`${relayUrl()}/agents`, {
		headers: { Authorization: `Bearer ${credential}` },
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		throw new Error(`relay /agents returned ${res.status}`);
	}
	const body = (await res.json()) as { agents: Box[] };
	return body.agents;
}

export async function fetchApps(
	credential: string,
	base: string,
): Promise<App[]> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps`,
		{
			headers: { Authorization: `Bearer ${credential}` },
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
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

export async function fetchAllApps(credential: string): Promise<BoxWithApps[]> {
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
