export type Box = { agent: string; owner: string; connected: boolean };

export class RelayAuthError extends Error {}

export class BoxOfflineError extends Error {}

export type App = {
	name: string;
	port: number;
	repo: string;
	branch: string;
	// Public host the app is served on, assigned by the relay at deploy time.
	// Empty until the app's first deploy.
	hostname: string;
	createdAt: string;
	status: string;
};

type RawApp = {
	Name: string;
	Port: number;
	Repo: string;
	Branch: string;
	Hostname: string;
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
		hostname: a.Hostname,
		createdAt: a.CreatedAt,
		status: a.Status,
	}));
}

export type BoxWithApps = {
	base: string;
	owner: string;
	connected: boolean;
	apps: App[];
};

async function appsForBox(
	credential: string,
	base: string,
	owner: string,
	connected: boolean,
): Promise<BoxWithApps> {
	if (!connected) return { base, owner, connected: false, apps: [] };
	try {
		return {
			base,
			owner,
			connected: true,
			apps: await fetchApps(credential, base),
		};
	} catch (err) {
		// The box dropped between the liveness snapshot and this fetch.
		if (err instanceof BoxOfflineError) {
			return { base, owner, connected: false, apps: [] };
		}
		throw err;
	}
}

export async function fetchAllApps(credential: string): Promise<BoxWithApps[]> {
	const boxes = await fetchBoxes(credential);
	return Promise.all(
		boxes.map((box) =>
			appsForBox(credential, box.agent, box.owner, box.connected),
		),
	);
}

export async function fetchBox(
	credential: string,
	base: string,
): Promise<BoxWithApps> {
	const boxes = await fetchBoxes(credential);
	const match = boxes.find((b) => b.agent === base);
	return appsForBox(
		credential,
		base,
		match?.owner ?? "",
		match?.connected ?? false,
	);
}

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

export async function githubManifest(
	credential: string,
	base: string,
	redirectUrl: string,
): Promise<string> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/github/manifest`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ redirect_url: redirectUrl }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (!res.ok) {
		throw new Error(`relay github manifest returned ${res.status}`);
	}
	const body = (await res.json()) as { manifest: string };
	return body.manifest;
}

export async function exchangeGithub(
	credential: string,
	base: string,
	code: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/github/exchange`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ code }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	if (res.status !== 204) {
		throw new Error(`relay github exchange returned ${res.status}`);
	}
}

export async function createApp(
	credential: string,
	base: string,
	name: string,
	port: number,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name, port }),
		},
	);
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (res.status === 502 || res.status === 503) {
		throw new BoxOfflineError(`box ${base} is offline`);
	}
	// The app already exists — a safe re-run; proceed to link.
	if (res.status === 409) return;
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay create app returned ${res.status}`);
	}
}

export async function linkApp(
	credential: string,
	base: string,
	name: string,
	repo: string,
	branch: string,
): Promise<void> {
	const res = await fetch(
		`${relayUrl()}/agents/${encodeURIComponent(base)}/v1/apps/${encodeURIComponent(
			name,
		)}/link`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ repo, branch }),
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
		throw new Error(msg || `relay link returned ${res.status}`);
	}
}

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

export type Org = { slug: string; role: "owner" | "member" };

export async function fetchOrgs(credential: string): Promise<Org[]> {
	const res = await fetch(`${relayUrl()}/v1/orgs`, {
		headers: { Authorization: `Bearer ${credential}` },
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		throw new Error(`relay /v1/orgs returned ${res.status}`);
	}
	const body = (await res.json()) as { orgs: { org: string; role: string }[] };
	return body.orgs.map((o) => ({ slug: o.org, role: o.role as Org["role"] }));
}

export async function createOrg(
	credential: string,
	name: string,
): Promise<Org> {
	const res = await fetch(`${relayUrl()}/v1/orgs`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${credential}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ name }),
	});
	if (res.status === 401) {
		throw new RelayAuthError("relay rejected the session credential");
	}
	if (!res.ok) {
		const msg = (await res.text()).trim();
		throw new Error(msg || `relay create org returned ${res.status}`);
	}
	const body = (await res.json()) as { org: string; role: string };
	return { slug: body.org, role: body.role as Org["role"] };
}

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
