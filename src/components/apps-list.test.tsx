import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxWithApps } from "@/server/relay";
import { AppsList, flattenApps } from "./apps-list";

const app = (
	name: string,
	status: string,
	hostname = "",
): BoxWithApps["apps"][number] => ({
	name,
	port: 8081,
	repo: "getpiper/x",
	branch: "main",
	hostname,
	createdAt: "2026-07-11T10:00:00Z",
	status,
});

const boxes: BoxWithApps[] = [
	{
		base: "rpi-octocat",
		owner: "octocat",
		connected: true,
		apps: [app("web", "running", "web.public.example")],
	},
	{
		base: "rpi-acme",
		owner: "acme",
		connected: true,
		apps: [app("api", "stopped", "")],
	},
];

test("flattenApps flattens and scopes by owner", () => {
	expect(
		flattenApps(boxes, "personal", "octocat").map((f) => f.app.name),
	).toEqual(["web"]);
	expect(flattenApps(boxes, "acme", "octocat").map((f) => f.app.name)).toEqual([
		"api",
	]);
});

async function renderList(scope: string, username: string) {
	const root = createRootRoute({
		component: () => (
			<AppsList boxes={boxes} scope={scope} username={username} />
		),
	});
	const router = createRouter({ routeTree: root });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("lists an app with its served URL", async () => {
	await renderList("personal", "octocat");
	expect(screen.getByText("web")).toBeTruthy();
	const link = screen.getByText("web.public.example");
	expect(link.getAttribute("href")).toBe("https://web.public.example");
});

test("shows 'not deployed' for an app with no hostname", async () => {
	await renderList("acme", "octocat");
	expect(screen.getByText(/not deployed/i)).toBeTruthy();
});

test("shows the empty hint when no apps are in scope", async () => {
	await renderList("personal", "nobody");
	expect(screen.getByText(/piper deploy/i)).toBeTruthy();
});
