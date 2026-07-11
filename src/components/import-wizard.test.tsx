import { expect, mock, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import {
	githubAppNewUrl,
	ImportWizard,
	type ImportWizardProps,
} from "./import-wizard";

const noopAsync = async () => {};

// ImportWizard renders <Link> (step 3), which needs a router context to mount.
async function renderWizard(props: Partial<ImportWizardProps> = {}) {
	const full: ImportWizardProps = {
		base: "abc-zoe.public.example",
		pendingCode: null,
		getManifest: async () => '{"name":"piper-x"}',
		exchange: noopAsync,
		createAndLink: noopAsync,
		submitManifest: () => {},
		...props,
	};
	const rootRoute = createRootRoute({
		component: () => <ImportWizard {...full} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("githubAppNewUrl uses the personal path when no org, the org path otherwise", () => {
	expect(githubAppNewUrl("")).toBe("https://github.com/settings/apps/new");
	expect(githubAppNewUrl("acme")).toBe(
		"https://github.com/organizations/acme/settings/apps/new",
	);
});

test("Skip advances from Connect to the Create step", async () => {
	await renderWizard();
	fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	expect(screen.getByRole("heading", { name: /create & link/i })).toBeTruthy();
});

test("the Create step surfaces the install-the-app guidance link", async () => {
	await renderWizard();
	fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	const link = screen.getByRole("link", {
		name: /manage installed github apps/i,
	});
	expect(link.getAttribute("href")).toBe(
		"https://github.com/settings/installations",
	);
});

test("Connect fetches the manifest and submits a form to GitHub (org variant)", async () => {
	const submitManifest = mock(() => {});
	await renderWizard({
		getManifest: async () => '{"name":"piper-x"}',
		submitManifest,
	});
	fireEvent.change(screen.getByLabelText(/organization/i), {
		target: { value: "acme" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /connect github/i }));
	});
	expect(submitManifest).toHaveBeenCalledWith(
		"https://github.com/organizations/acme/settings/apps/new",
		'{"name":"piper-x"}',
	);
});

test("a pending code runs the exchange once and lands on the Create step", async () => {
	const exchange = mock(async () => {});
	await renderWizard({ pendingCode: "code-xyz", exchange });
	await waitFor(() =>
		expect(
			screen.getByRole("heading", { name: /create & link/i }),
		).toBeTruthy(),
	);
	expect(exchange).toHaveBeenCalledTimes(1);
	expect(exchange).toHaveBeenCalledWith("code-xyz");
});

test("a failed exchange shows an inline error", async () => {
	const exchange = async () => {
		throw new Error("boom");
	};
	await renderWizard({ pendingCode: "code-xyz", exchange });
	await waitFor(() =>
		expect(screen.getByText(/couldn't finish/i)).toBeTruthy(),
	);
});

test("Create & link submits the form and advances to Push", async () => {
	const createAndLink = mock(async () => {});
	await renderWizard({ createAndLink });
	fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	fireEvent.change(screen.getByLabelText(/app name/i), {
		target: { value: "web" },
	});
	fireEvent.change(screen.getByLabelText(/repository/i), {
		target: { value: "getpiper/example" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /create & link/i }));
	});
	expect(createAndLink).toHaveBeenCalledWith({
		name: "web",
		repo: "getpiper/example",
		branch: "main",
		port: undefined,
	});
	const link = screen.getByRole("link", { name: /view app/i });
	expect(link.getAttribute("href")).toBe(
		"/boxes/abc-zoe.public.example/apps/web",
	);
});

test("a failed create shows an inline error and stays on the Create step", async () => {
	const createAndLink = async () => {
		throw new Error("name reserved");
	};
	await renderWizard({ createAndLink });
	fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	fireEvent.change(screen.getByLabelText(/app name/i), {
		target: { value: "hooks" },
	});
	fireEvent.change(screen.getByLabelText(/repository/i), {
		target: { value: "getpiper/example" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /create & link/i }));
	});
	expect(screen.getByText(/name reserved/i)).toBeTruthy();
	expect(screen.getByRole("heading", { name: /create & link/i })).toBeTruthy();
});
