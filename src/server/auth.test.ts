import { expect, test } from "bun:test";
import { handleLogin, handleLogout, handleSession } from "./auth";

test("handleLogin 302s to the relay web login with the callback as redirect_uri", () => {
	const request = new Request("http://localhost:3000/api/auth/login");
	const res = handleLogin(request, "https://relay.test");
	expect(res.status).toBe(302);
	expect(res.headers.get("Location")).toBe(
		"https://relay.test/v1/login/web?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback",
	);
});

test("handleSession sets httpOnly session + username cookies", async () => {
	const request = new Request("http://localhost:3000/api/auth/session", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ credential: "cred-1", username: "zoe" }),
	});
	const res = await handleSession(request);
	expect(res.status).toBe(204);
	const cookies = res.headers.getSetCookie();
	expect(cookies).toHaveLength(2);
	expect(cookies[0]).toBe(
		"piper_session=cred-1; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000",
	);
	expect(cookies[1]).toBe(
		"piper_username=zoe; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000",
	);
});

test("handleSession URL-encodes cookie values", async () => {
	const request = new Request("http://localhost:3000/api/auth/session", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ credential: "a;b c", username: "z" }),
	});
	const res = await handleSession(request);
	expect(res.headers.getSetCookie()[0]).toContain("piper_session=a%3Bb%20c;");
});

test("handleSession rejects a missing credential with 400", async () => {
	const request = new Request("http://localhost:3000/api/auth/session", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "zoe" }),
	});
	const res = await handleSession(request);
	expect(res.status).toBe(400);
});

test("handleSession rejects a non-JSON body with 400", async () => {
	const request = new Request("http://localhost:3000/api/auth/session", {
		method: "POST",
		body: "not json",
	});
	const res = await handleSession(request);
	expect(res.status).toBe(400);
});

test("handleLogout expires both cookies", () => {
	const res = handleLogout();
	expect(res.status).toBe(204);
	const cookies = res.headers.getSetCookie();
	expect(cookies).toEqual([
		"piper_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
		"piper_username=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
	]);
});
