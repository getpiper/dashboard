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
async function renderInRouter(
	boxes: BoxWithApps[],
	scope = "personal",
	username = "octocat",
) {
	const rootRoute = createRootRoute({
		component: () => (
			<AppsHome boxes={boxes} scope={scope} username={username} />
		),
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

const app = (
	name: string,
	status: string,
	hostname = `${name}-hash.public.example`,
): BoxWithApps["apps"][number] => ({
	name,
	port: 8081,
	repo: "r",
	branch: "main",
	hostname,
	createdAt: "2026-07-11T10:00:00Z",
	status,
});

test("shows each connected box's apps with a Live badge", async () => {
	await renderInRouter([
		{
			base: "7f3c9a2-octocat",
			owner: "octocat",
			connected: true,
			apps: [app("web", "running")],
		},
	]);
	expect(screen.getByText("web")).toBeTruthy();
	expect(screen.getByText("Live")).toBeTruthy();
	expect(screen.getByText("7f3c9a2-octocat")).toBeTruthy();
});

test("summarises box and live-app counts", async () => {
	await renderInRouter([
		{
			base: "a-octocat",
			owner: "octocat",
			connected: true,
			apps: [app("web", "running")],
		},
		{ base: "b-octocat", owner: "octocat", connected: false, apps: [] },
	]);
	expect(screen.getByText("2 boxes · 1 online")).toBeTruthy();
	expect(screen.getByText("1 apps live")).toBeTruthy();
});

test("renders each app's relay-assigned URL as a link", async () => {
	await renderInRouter([
		{
			base: "7f3c9a2-octocat",
			owner: "octocat",
			connected: true,
			apps: [app("blog", "running", "7f3c9a2-octocat.public.getpiper.co")],
		},
	]);
	const link = screen.getByText("7f3c9a2-octocat.public.getpiper.co");
	expect(link.getAttribute("href")).toBe(
		"https://7f3c9a2-octocat.public.getpiper.co",
	);
});

test("shows 'Not deployed yet' for an app with no hostname", async () => {
	await renderInRouter([
		{
			base: "7f3c9a2-octocat",
			owner: "octocat",
			connected: true,
			apps: [app("blog", "stopped", "")],
		},
	]);
	expect(screen.getByText(/not deployed yet/i)).toBeTruthy();
});

test("renders an offline box with no app rows", async () => {
	await renderInRouter([
		{ base: "down-octocat", owner: "octocat", connected: false, apps: [] },
	]);
	expect(screen.getByText("down-octocat")).toBeTruthy();
	expect(screen.getByText("Offline")).toBeTruthy();
	expect(screen.getByText(/no apps deployed on this box/i)).toBeTruthy();
});

test("shows the empty state when the account has no boxes", async () => {
	await renderInRouter([]);
	expect(screen.getByText(/no boxes yet/i)).toBeTruthy();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});

test("personal scope hides org-owned boxes", async () => {
	await renderInRouter(
		[
			{ base: "mine-octocat", owner: "octocat", connected: true, apps: [] },
			{ base: "theirs-acme", owner: "acme", connected: true, apps: [] },
		],
		"personal",
		"octocat",
	);
	expect(screen.getByText("mine-octocat")).toBeTruthy();
	expect(screen.queryByText("theirs-acme")).toBeNull();
	expect(screen.getByText("1 boxes · 1 online")).toBeTruthy();
});

test("an org scope shows only that org's boxes", async () => {
	await renderInRouter(
		[
			{ base: "mine-octocat", owner: "octocat", connected: true, apps: [] },
			{ base: "theirs-acme", owner: "acme", connected: false, apps: [] },
		],
		"acme",
		"octocat",
	);
	expect(screen.queryByText("mine-octocat")).toBeNull();
	expect(screen.getByText("theirs-acme")).toBeTruthy();
});

test("an empty org scope shows the enroll hint", async () => {
	await renderInRouter(
		[{ base: "mine-octocat", owner: "octocat", connected: true, apps: [] }],
		"acme",
		"octocat",
	);
	expect(screen.getByText(/piper enroll --org acme/)).toBeTruthy();
});
