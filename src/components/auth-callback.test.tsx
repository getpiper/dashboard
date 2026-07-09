import { afterEach, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthCallback } from "./auth-callback";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	window.history.replaceState(null, "", "/");
});

test("posts the fragment credential, scrubs the hash, and signals done", async () => {
	window.history.replaceState(
		null,
		"",
		"/auth/callback#credential=cred-1&username=zoe",
	);
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return new Response(null, { status: 204 });
	}) as unknown as typeof fetch;
	const onDone = mock(() => {});

	render(<AuthCallback onDone={onDone} />);

	await waitFor(() => expect(onDone).toHaveBeenCalled());
	expect(calls).toHaveLength(1);
	expect(calls[0].url).toBe("/api/auth/session");
	expect(JSON.parse(String(calls[0].init?.body))).toEqual({
		credential: "cred-1",
		username: "zoe",
	});
	expect(window.location.hash).toBe("");
});

test("shows an error with a login link when the fragment is missing", async () => {
	window.history.replaceState(null, "", "/auth/callback");
	const fetchMock = mock(async () => new Response(null, { status: 204 }));
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	const onDone = mock(() => {});

	render(<AuthCallback onDone={onDone} />);

	const link = await screen.findByRole("link", { name: /back to login/i });
	expect(link.getAttribute("href")).toBe("/login");
	expect(fetchMock).not.toHaveBeenCalled();
	expect(onDone).not.toHaveBeenCalled();
});

test("shows the error state when the session POST fails", async () => {
	window.history.replaceState(
		null,
		"",
		"/auth/callback#credential=cred-1&username=zoe",
	);
	globalThis.fetch = (async () =>
		new Response("nope", { status: 400 })) as unknown as typeof fetch;
	const onDone = mock(() => {});

	render(<AuthCallback onDone={onDone} />);

	await screen.findByRole("link", { name: /back to login/i });
	expect(onDone).not.toHaveBeenCalled();
});
