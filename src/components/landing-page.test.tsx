import { expect, mock, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { LandingPage } from "./landing-page";

// LandingPage renders <Link>, which needs a router context to mount.
async function renderLanding() {
	const rootRoute = createRootRoute({ component: LandingPage });
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("renders the hero headline including the git push accent", async () => {
	await renderLanding();
	const h1 = screen.getByRole("heading", { level: 1 });
	expect(h1.textContent).toContain("Deploy to your own box");
	expect(h1.textContent).toContain("git push");
});

test("shows the openpiper install command", async () => {
	await renderLanding();
	expect(
		screen.getByText("curl -fsSL https://get.openpiper.dev/install.sh | sh"),
	).toBeTruthy();
});

test("renders the three why-piper card titles", async () => {
	await renderLanding();
	expect(screen.getByText("Zero-trust relay")).toBeTruthy();
	expect(screen.getByText("Lean by design")).toBeTruthy();
	expect(screen.getByText("Developer-first")).toBeTruthy();
});

test("renders the three how-it-works steps with numbers", async () => {
	await renderLanding();
	expect(screen.getByText("piper connect")).toBeTruthy();
	expect(
		screen.getByText("piper app link myapp --repo owner/name"),
	).toBeTruthy();
	expect(screen.getByText("step 01")).toBeTruthy();
	expect(screen.getByText("step 03")).toBeTruthy();
});

test("renders the relay diagram labels", async () => {
	await renderLanding();
	expect(screen.getByText("piper-relay · cloud")).toBeTruthy();
	expect(screen.getByText("your box · piperd")).toBeTruthy();
});

test("every sign-in link points to /login", async () => {
	await renderLanding();
	const links = screen.getAllByRole("link", { name: /sign in/i });
	expect(links.length).toBeGreaterThan(0);
	for (const link of links) {
		expect(link.getAttribute("href")).toBe("/login");
	}
});

test("docs links point to the openpiper github repo", async () => {
	await renderLanding();
	const links = screen.getAllByRole("link", { name: "docs" });
	expect(links.length).toBeGreaterThan(0);
	for (const link of links) {
		expect(link.getAttribute("href")).toBe(
			"https://github.com/openpiper/piper",
		);
	}
});

test("copy button copies the install command and flips its label", async () => {
	const writeText = mock(() => Promise.resolve());
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
	await renderLanding();
	const [copyBtn] = screen.getAllByRole("button", {
		name: "copy install command",
	});
	fireEvent.click(copyBtn);
	expect(writeText).toHaveBeenCalledWith(
		"curl -fsSL https://get.openpiper.dev/install.sh | sh",
	);
	expect(await screen.findByText("✓ copied")).toBeTruthy();
});
