import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Org } from "@/server/relay";
import { OrgScopeProvider, useOrgScope } from "./org-scope";

afterEach(() => {
	document.cookie = "piper_scope=; Path=/; Max-Age=0";
});

function Probe() {
	const { scope, setScope } = useOrgScope();
	return (
		<>
			<span data-testid="scope">{scope}</span>
			<button type="button" onClick={() => setScope("acme")}>
				pick acme
			</button>
		</>
	);
}

const orgs: Org[] = [{ slug: "acme", role: "owner" }];

test("defaults to personal scope", () => {
	render(
		<OrgScopeProvider username="zoe" orgs={orgs} invites={[]}>
			<Probe />
		</OrgScopeProvider>,
	);
	expect(screen.getByTestId("scope").textContent).toBe("personal");
});

test("setScope updates scope and persists the cookie", async () => {
	render(
		<OrgScopeProvider username="zoe" orgs={orgs} invites={[]}>
			<Probe />
		</OrgScopeProvider>,
	);
	fireEvent.click(screen.getByText("pick acme"));
	expect(screen.getByTestId("scope").textContent).toBe("acme");
	expect(document.cookie).toContain("piper_scope=acme");
});

test("a persisted org the caller no longer belongs to falls back to personal", async () => {
	document.cookie = "piper_scope=ghost; Path=/";
	render(
		<OrgScopeProvider username="zoe" orgs={orgs} invites={[]}>
			<Probe />
		</OrgScopeProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId("scope").textContent).toBe("personal"),
	);
});

test("a persisted org the caller still belongs to is restored", async () => {
	document.cookie = "piper_scope=acme; Path=/";
	render(
		<OrgScopeProvider username="zoe" orgs={orgs} invites={[]}>
			<Probe />
		</OrgScopeProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId("scope").textContent).toBe("acme"),
	);
});
