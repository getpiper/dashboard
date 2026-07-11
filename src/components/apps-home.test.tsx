import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxWithApps } from "@/server/relay";
import { AppsHome } from "./apps-home";

// AppsHome renders <Link>, which needs a router context to mount.
async function renderInRouter(boxes: BoxWithApps[]) {
	const rootRoute = createRootRoute({
		component: () => <AppsHome boxes={boxes} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("shows each connected box's apps with their status", async () => {
	await renderInRouter([
		{
			base: "up-zoe.public.example",
			connected: true,
			apps: [
				{
					name: "web",
					port: 8081,
					repo: "r",
					branch: "main",
					createdAt: "2026-07-11T10:00:00Z",
					status: "running",
				},
			],
		},
	]);
	expect(screen.getByText("web")).toBeTruthy();
	expect(screen.getByText(/running/i)).toBeTruthy();
	expect(screen.getByText("up-zoe.public.example")).toBeTruthy();
});

test("renders an offline box as unavailable, with no app rows", async () => {
	await renderInRouter([
		{ base: "down-zoe.public.example", connected: false, apps: [] },
	]);
	expect(screen.getByText("down-zoe.public.example")).toBeTruthy();
	expect(screen.getByText(/apps unavailable/i)).toBeTruthy();
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});

test("shows the empty state when the account has no boxes", async () => {
	await renderInRouter([]);
	expect(screen.getByText(/no boxes yet/i)).toBeTruthy();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});
