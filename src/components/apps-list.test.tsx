import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { AppDomainStatus, BoxAppDomains } from "@/server/relay";
import { AppsList, flattenApps } from "./apps-list";

const app = (
	name: string,
	status: string,
	hostname = "",
): BoxAppDomains["box"]["apps"][number] => ({
	name,
	port: 8081,
	repo: "getpiper/x",
	branch: "main",
	hostname,
	createdAt: "2026-07-11T10:00:00Z",
	status,
});

const domain = (over: Partial<AppDomainStatus> = {}): AppDomainStatus => ({
	domain: "web.octo.dev",
	app: "web",
	status: "active",
	error: "",
	certNotAfter: null,
	dnsRecords: [],
	dnsOk: true,
	...over,
});

const items: BoxAppDomains[] = [
	{
		box: {
			base: "rpi-octocat",
			owner: "octocat",
			connected: true,
			apps: [app("web", "running", "web.public.example")],
		},
		domains: { web: [domain()] },
	},
	{
		box: {
			base: "rpi-acme",
			owner: "acme",
			connected: true,
			apps: [app("api", "stopped", "")],
		},
		domains: { api: [] },
	},
];

test("flattenApps flattens and scopes by owner", () => {
	expect(
		flattenApps(items, "personal", "octocat").map((f) => f.app.name),
	).toEqual(["web"]);
	expect(flattenApps(items, "acme", "octocat").map((f) => f.app.name)).toEqual([
		"api",
	]);
});

async function renderList(scope: string, username: string) {
	const root = createRootRoute({
		component: () => (
			<AppsList items={items} scope={scope} username={username} />
		),
	});
	const router = createRouter({ routeTree: root });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("renders an app card with badge, box, repo, domain and served URL", async () => {
	await renderList("personal", "octocat");
	const name = screen.getByText("web");
	expect(name.getAttribute("href")).toBe("/boxes/rpi-octocat/apps/web");
	expect(screen.getByText("Live")).toBeTruthy();
	expect(screen.getByText("rpi-octocat")).toBeTruthy();
	expect(screen.getByText("getpiper/x@main")).toBeTruthy();
	expect(screen.getByText("web.octo.dev")).toBeTruthy();
	const host = screen.getByText("web.public.example");
	expect(host.getAttribute("href")).toBe("https://web.public.example");
});

test("shows 'not deployed' for an app with no hostname", async () => {
	await renderList("acme", "octocat");
	expect(screen.getByText(/not deployed/i)).toBeTruthy();
	expect(screen.queryByText("web.octo.dev")).toBeNull();
});

test("offers a new-app link into the wizard", async () => {
	await renderList("personal", "octocat");
	const link = screen.getByText(/new app/i);
	expect(link.getAttribute("href")).toBe("/apps/new");
});

test("shows the empty hint when no apps are in scope", async () => {
	await renderList("personal", "nobody");
	expect(screen.getByText(/piper deploy/i)).toBeTruthy();
});
