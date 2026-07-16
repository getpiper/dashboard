import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { AppShell, Nav, type NavItem } from "./app-shell";

const items: NavItem[] = [
	{ label: "boxes", to: "/", exact: true },
	{ label: "apps", to: "/apps" },
];

// A minimal 2-route tree so <Nav>'s <Link>s resolve and active state is real.
async function renderAt(path: string, node: React.ReactNode) {
	const root = createRootRoute({
		component: () => (
			<>
				{node}
				<Outlet />
			</>
		),
	});
	const index = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => null,
	});
	const apps = createRoute({
		getParentRoute: () => root,
		path: "/apps",
		component: () => null,
	});
	const router = createRouter({ routeTree: root.addChildren([index, apps]) });
	await router.navigate({ to: path });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("Nav renders a tab per item with correct hrefs", async () => {
	await renderAt("/", <Nav items={items} />);
	expect(screen.getByText("boxes").getAttribute("href")).toBe("/");
	expect(screen.getByText("apps").getAttribute("href")).toBe("/apps");
});

test("the active tab gets the amber block styling", async () => {
	await renderAt("/apps", <Nav items={items} />);
	expect(screen.getByText("apps").className).toContain("bg-primary");
	expect(screen.getByText("boxes").className).not.toContain("bg-primary");
});

test("AppShell renders the brand, right slot and children", async () => {
	await renderAt(
		"/",
		<AppShell navItems={items} right={<span>me</span>}>
			body
		</AppShell>,
	);
	expect(screen.getByText("piper")).toBeTruthy();
	expect(screen.getByText("me")).toBeTruthy();
	expect(screen.getByText("body")).toBeTruthy();
});
