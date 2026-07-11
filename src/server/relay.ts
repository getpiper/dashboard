export type Box = { agent: string; connected: boolean };

export class RelayAuthError extends Error {}

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
