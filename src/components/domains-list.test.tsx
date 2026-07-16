import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxDomain, DomainStatus } from "@/server/relay";
import { DomainsList } from "./domains-list";

const domain = (over: Partial<DomainStatus> = {}): DomainStatus => ({
	domain: "shop.example.com",
	dnsProvider: "cloudflare",
	dnsTokenSet: true,
	source: "api",
	status: "active",
	error: "",
	certNotAfter: null,
	dnsRecords: [],
	dnsOk: true,
	...over,
});

const app = (name: string) => ({
	name,
	port: 8081,
	repo: "r",
	branch: "main",
	hostname: "",
	createdAt: "2026-07-11T10:00:00Z",
	status: "running",
});

const items: BoxDomain[] = [
	{
		box: {
			base: "rpi-octocat",
			owner: "octocat",
			connected: true,
			apps: [app("web")],
		},
		domain: domain(),
	},
	{
		box: { base: "bare-octocat", owner: "octocat", connected: true, apps: [] },
		domain: null,
	},
];

async function renderList(scope = "personal", username = "octocat") {
	const root = createRootRoute({
		component: () => (
			<DomainsList items={items} scope={scope} username={username} />
		),
	});
	const router = createRouter({ routeTree: root });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("shows a configured box's domain and the app served under it", async () => {
	await renderList();
	expect(screen.getByText("shop.example.com")).toBeTruthy();
	expect(screen.getByText("web.shop.example.com")).toBeTruthy();
	expect(screen.getByText(/dns ok/i)).toBeTruthy();
});

test("offers 'add domain' for a box with no custom domain", async () => {
	await renderList();
	const link = screen.getByText(/add domain/i);
	expect(link.getAttribute("href")).toBe("/boxes/bare-octocat");
});

test("scopes boxes by owner", async () => {
	await renderList("acme", "octocat");
	expect(screen.queryByText("rpi-octocat")).toBeNull();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});
