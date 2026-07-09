import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import SessionControls from "./SessionControls";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("renders nothing when logged out", () => {
	const { container } = render(<SessionControls username={null} />);
	expect(container.innerHTML).toBe("");
});

test("shows the username and posts to logout on click", async () => {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	render(<SessionControls username="zoe" />);
	expect(screen.getByText("zoe")).toBeTruthy();

	fireEvent.click(screen.getByRole("button", { name: /log out/i }));
	expect(calls).toHaveLength(1);
	expect(calls[0].url).toBe("/api/auth/logout");
	expect(calls[0].init?.method).toBe("POST");
});
