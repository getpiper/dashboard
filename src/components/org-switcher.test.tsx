import { expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Org } from "@/server/relay";
import { OrgSwitcher } from "./org-switcher";

const orgs: Org[] = [
	{ slug: "acme", role: "owner" },
	{ slug: "widgets", role: "member" },
];
const noopCreate = async () => ({ slug: "x", role: "owner" as const });
const noopManage = () => {};

test("labels the active scope and lists Personal + orgs when open", () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={noopManage}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	expect(screen.getByRole("button", { name: /^acme/ })).toBeTruthy();
	expect(screen.getByRole("button", { name: /^widgets/ })).toBeTruthy();
});

test("selecting an org calls onSelect with its slug", () => {
	let picked = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={(s) => {
				picked = s;
			}}
			onCreate={noopCreate}
			onManage={noopManage}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /^acme/ }));
	expect(picked).toBe("acme");
});

test("the gear calls onManage with the org slug", () => {
	let managed = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={() => {}}
			onCreate={noopCreate}
			onManage={(s) => {
				managed = s;
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /manage widgets/i }));
	expect(managed).toBe("widgets");
});

test("creating an org calls onCreate then selects the new org", async () => {
	let createdWith = "";
	let picked = "";
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={(s) => {
				picked = s;
			}}
			onCreate={async (name) => {
				createdWith = name;
				return { slug: "neworg", role: "owner" };
			}}
			onManage={noopManage}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /create org/i }));
	fireEvent.change(screen.getByLabelText(/org name/i), {
		target: { value: "New Org" },
	});
	fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
	await waitFor(() => expect(picked).toBe("neworg"));
	expect(createdWith).toBe("New Org");
});

test("a failed create surfaces the error message", async () => {
	render(
		<OrgSwitcher
			scope="personal"
			orgs={orgs}
			onSelect={() => {}}
			onCreate={async () => {
				throw new Error("name taken");
			}}
			onManage={noopManage}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Personal" }));
	fireEvent.click(screen.getByRole("button", { name: /create org/i }));
	fireEvent.change(screen.getByLabelText(/org name/i), {
		target: { value: "Acme" },
	});
	fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain("name taken"),
	);
});
