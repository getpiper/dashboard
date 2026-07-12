import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxWithApps } from "@/server/relay";
import { BoxDetail } from "./box-detail";

// BoxDetail renders <Link>, which needs a router context to mount.
async function renderInRouter(box: BoxWithApps) {
	const rootRoute = createRootRoute({
		component: () => <BoxDetail box={box} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("shows the box as connected and lists its apps with status", async () => {
	await renderInRouter({
		base: "up-zoe.public.example",
		owner: "zoe",
		connected: true,
		apps: [
			{
				name: "api",
				port: 8082,
				repo: "r",
				branch: "main",
				hostname: "api-hash-zoe.public.example",
				createdAt: "2026-07-11T11:00:00Z",
				status: "failed",
			},
		],
	});
	expect(screen.getByText("up-zoe.public.example")).toBeTruthy();
	expect(screen.getByText(/connected/i)).toBeTruthy();
	expect(screen.getByText("api")).toBeTruthy();
	expect(screen.getByText(/failed/i)).toBeTruthy();
});

test("links each app to its detail page", async () => {
	await renderInRouter({
		base: "up-zoe.public.example",
		owner: "zoe",
		connected: true,
		apps: [
			{
				name: "api",
				port: 8082,
				repo: "r",
				branch: "main",
				hostname: "api-hash-zoe.public.example",
				createdAt: "2026-07-11T11:00:00Z",
				status: "running",
			},
		],
	});
	const link = screen.getByRole("link", { name: /api/ });
	expect(link.getAttribute("href")).toBe(
		"/boxes/up-zoe.public.example/apps/api",
	);
});

test("shows an offline box with no apps", async () => {
	await renderInRouter({
		base: "down-zoe.public.example",
		owner: "zoe",
		connected: false,
		apps: [],
	});
	expect(screen.getByText(/offline/i)).toBeTruthy();
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});

test("offers a New project link to the import route", async () => {
	await renderInRouter({
		base: "up-zoe.public.example",
		owner: "zoe",
		connected: true,
		apps: [],
	});
	const link = screen.getByRole("link", { name: /new project/i });
	expect(link.getAttribute("href")).toBe("/boxes/up-zoe.public.example/import");
});

test("shows the owning org slug as a badge", async () => {
	await renderInRouter({
		base: "abc-acme",
		owner: "acme",
		connected: true,
		apps: [],
	});
	expect(screen.getByText("acme")).toBeTruthy();
});
