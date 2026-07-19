import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppDomainStatus, BoxAppDomains } from "@/server/relay";
import { DomainsList } from "./domains-list";

const appDomain = (over: Partial<AppDomainStatus> = {}): AppDomainStatus => ({
	domain: "api.octo.dev",
	app: "api",
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

const items: BoxAppDomains[] = [
	{
		box: {
			base: "rpi-octocat",
			owner: "octocat",
			connected: true,
			apps: [app("api"), app("web")],
		},
		domains: {
			api: [appDomain()],
			web: [],
		},
	},
	{
		box: { base: "bare-octocat", owner: "octocat", connected: true, apps: [] },
		domains: {},
	},
];

async function renderList({
	scope = "personal",
	username = "octocat",
	onAdd = async () => {},
}: {
	scope?: string;
	username?: string;
	onAdd?: (base: string, appName: string, domain: string) => Promise<void>;
} = {}) {
	const root = createRootRoute({
		component: () => (
			<DomainsList
				items={items}
				scope={scope}
				username={username}
				onAdd={onAdd}
			/>
		),
	});
	const router = createRouter({ routeTree: root });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("shows one row per app with its custom domain, dns and cert status", async () => {
	await renderList();
	expect(screen.getByText("api.octo.dev")).toBeTruthy();
	expect(screen.getByText(/dns ok/i)).toBeTruthy();
	expect(screen.getByText("active")).toBeTruthy();
});

test("counts custom domains and boxes in the subtitle", async () => {
	await renderList();
	expect(screen.getByText(/1 custom domain/i)).toBeTruthy();
	expect(screen.getByText(/2 boxes/i)).toBeTruthy();
});

test("app without a domain gets an inline add-domain flow", async () => {
	const calls: [string, string, string][] = [];
	await renderList({
		onAdd: async (base, appName, domain) => {
			calls.push([base, appName, domain]);
		},
	});
	fireEvent.click(screen.getByRole("button", { name: /add domain/i }));
	fireEvent.change(screen.getByLabelText(/domain for web/i), {
		target: { value: "shop.octo.dev" },
	});
	fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
	await waitFor(() => {
		expect(calls).toEqual([["rpi-octocat", "web", "shop.octo.dev"]]);
	});
});

test("box with no apps says so", async () => {
	await renderList();
	expect(screen.getByText(/no apps served/i)).toBeTruthy();
});

test("scopes boxes by owner", async () => {
	await renderList({ scope: "acme" });
	expect(screen.queryByText("rpi-octocat")).toBeNull();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});
