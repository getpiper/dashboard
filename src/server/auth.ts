const COOKIE_ATTRS = "HttpOnly; Secure; SameSite=Lax; Path=/";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function handleLogin(request: Request, relayBase: string): Response {
	const origin = new URL(request.url).origin;
	const params = new URLSearchParams({
		redirect_uri: `${origin}/auth/callback`,
	});
	return Response.redirect(`${relayBase}/v1/login/web?${params}`, 302);
}

export async function handleSession(request: Request): Promise<Response> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response("invalid JSON body", { status: 400 });
	}
	const { credential, username } = (body ?? {}) as {
		credential?: unknown;
		username?: unknown;
	};
	if (typeof credential !== "string" || credential === "") {
		return new Response("missing credential", { status: 400 });
	}
	const name = typeof username === "string" ? username : "";
	const response = new Response(null, { status: 204 });
	response.headers.append(
		"Set-Cookie",
		`piper_session=${encodeURIComponent(credential)}; ${COOKIE_ATTRS}; Max-Age=${SESSION_MAX_AGE}`,
	);
	response.headers.append(
		"Set-Cookie",
		`piper_username=${encodeURIComponent(name)}; ${COOKIE_ATTRS}; Max-Age=${SESSION_MAX_AGE}`,
	);
	return response;
}

export function handleLogout(): Response {
	const response = new Response(null, { status: 204 });
	response.headers.append(
		"Set-Cookie",
		`piper_session=; ${COOKIE_ATTRS}; Max-Age=0`,
	);
	response.headers.append(
		"Set-Cookie",
		`piper_username=; ${COOKIE_ATTRS}; Max-Age=0`,
	);
	return response;
}
