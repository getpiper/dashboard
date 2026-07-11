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

const app = (name: string, status: string): BoxWithApps["apps"][number] => ({
	name,
	port: 8081,
	repo: "r",
	branch: "main",
	createdAt: "2026-07-11T10:00:00Z",
	status,
});

test("shows each connected box's apps with a Live badge", async () => {
	await renderInRouter([
		{ base: "7f3c9a2-octocat", connected: true, apps: [app("web", "running")] },
	]);
	expect(screen.getByText("web")).toBeTruthy();
	expect(screen.getByText("Live")).toBeTruthy();
	expect(screen.getByText("7f3c9a2-octocat")).toBeTruthy();
});

test("summarises box and live-app counts", async () => {
	await renderInRouter([
		{ base: "a-octocat", connected: true, apps: [app("web", "running")] },
		{ base: "b-octocat", connected: false, apps: [] },
	]);
	expect(screen.getByText("2 boxes · 1 online")).toBeTruthy();
	expect(screen.getByText("1 apps live")).toBeTruthy();
});

test("renders each app's public URL as a link", async () => {
	await renderInRouter([
		{
			base: "7f3c9a2-octocat",
			connected: true,
			apps: [app("blog", "running")],
		},
	]);
	const link = screen.getByText("blog-7f3c9a2-octocat.public.getpiper.co");
	expect(link.getAttribute("href")).toBe(
		"https://blog-7f3c9a2-octocat.public.getpiper.co",
	);
});

test("renders an offline box with no app rows", async () => {
	await renderInRouter([{ base: "down-octocat", connected: false, apps: [] }]);
	expect(screen.getByText("down-octocat")).toBeTruthy();
	expect(screen.getByText("Offline")).toBeTruthy();
	expect(screen.getByText(/no apps deployed on this box/i)).toBeTruthy();
});

test("shows the empty state when the account has no boxes", async () => {
	await renderInRouter([]);
	expect(screen.getByText(/no boxes yet/i)).toBeTruthy();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});
