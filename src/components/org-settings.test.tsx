import { expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { OrgMember } from "@/server/relay";
import { OrgSettings, type OrgSettingsProps } from "./org-settings";

const members: OrgMember[] = [
	{ username: "zoe", role: "owner" },
	{ username: "max", role: "member" },
];

const noopAsync = async () => {};

function props(over: Partial<OrgSettingsProps> = {}): OrgSettingsProps {
	return {
		slug: "acme",
		role: "owner",
		username: "zoe",
		members,
		invites: [],
		onInvite: noopAsync,
		onRevokeInvite: noopAsync,
		onSetRole: noopAsync,
		onRemoveMember: noopAsync,
		onLeave: noopAsync,
		onDelete: noopAsync,
		...over,
	};
}

test("owner sees the roster and marks their own row", () => {
	render(<OrgSettings {...props()} />);
	expect(screen.getByText("zoe")).toBeTruthy();
	expect(screen.getByText("max")).toBeTruthy();
	expect(screen.getByText(/\(you\)/)).toBeTruthy();
});

test("owner promotes a member — onSetRole gets (username, 'owner')", async () => {
	const onSetRole = mock(async (_u: string, _r: "owner" | "member") => {});
	render(<OrgSettings {...props({ onSetRole })} />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /make owner/i }));
	});
	expect(onSetRole.mock.calls[0]).toEqual(["max", "owner"]);
});

test("owner demotes another owner — onSetRole gets (username, 'member')", async () => {
	const onSetRole = mock(async (_u: string, _r: "owner" | "member") => {});
	render(
		<OrgSettings
			{...props({
				members: [
					{ username: "zoe", role: "owner" },
					{ username: "max", role: "owner" },
				],
				onSetRole,
			})}
		/>,
	);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /make member/i }));
	});
	expect(onSetRole.mock.calls[0]).toEqual(["max", "member"]);
});

test("owner removes a member — onRemoveMember gets the username", async () => {
	const onRemoveMember = mock(async (_u: string) => {});
	render(<OrgSettings {...props({ onRemoveMember })} />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
	});
	expect(onRemoveMember.mock.calls[0]).toEqual(["max"]);
});

test("owner invites by GitHub username — onInvite gets the trimmed value", async () => {
	const onInvite = mock(async (_u: string) => {});
	render(<OrgSettings {...props({ onInvite })} />);
	fireEvent.change(screen.getByLabelText(/github username/i), {
		target: { value: " octocat " },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));
	});
	expect(onInvite.mock.calls[0]).toEqual(["octocat"]);
});

test("a rejected invite surfaces the 409 message", async () => {
	const onInvite = mock(async () => {
		throw new Error("already a member");
	});
	render(<OrgSettings {...props({ onInvite })} />);
	fireEvent.change(screen.getByLabelText(/github username/i), {
		target: { value: "zoe" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^invite$/i }));
	});
	expect(screen.getByText(/already a member/i)).toBeTruthy();
});

test("owner revokes a pending invite — onRevokeInvite gets the login", async () => {
	const onRevokeInvite = mock(async (_l: string) => {});
	render(<OrgSettings {...props({ invites: ["octocat"], onRevokeInvite })} />);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
	});
	expect(onRevokeInvite.mock.calls[0]).toEqual(["octocat"]);
});

test("member sees a read-only roster with no owner controls or invites", () => {
	render(<OrgSettings {...props({ role: "member", username: "max" })} />);
	expect(screen.queryByRole("button", { name: /make owner/i })).toBeNull();
	expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
	expect(screen.queryByLabelText(/github username/i)).toBeNull();
	expect(screen.queryByRole("button", { name: /delete org/i })).toBeNull();
	// but can leave
	expect(screen.getByRole("button", { name: /leave org/i })).toBeTruthy();
});

test("sole owner cannot leave — the button is disabled", () => {
	render(
		<OrgSettings
			{...props({ members: [{ username: "zoe", role: "owner" }] })}
		/>,
	);
	const leave = screen.getByRole("button", {
		name: /leave org/i,
	}) as HTMLButtonElement;
	expect(leave.disabled).toBe(true);
});

test("a non-sole owner can leave — onLeave fires after confirm", async () => {
	const onLeave = mock(async () => {});
	render(
		<OrgSettings
			{...props({
				members: [
					{ username: "zoe", role: "owner" },
					{ username: "max", role: "owner" },
				],
				onLeave,
			})}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /leave org/i }));
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^leave$/i }));
	});
	expect(onLeave).toHaveBeenCalledTimes(1);
});

test("delete stays disabled until the exact slug is typed, then calls onDelete", async () => {
	const onDelete = mock(async () => {});
	render(<OrgSettings {...props({ onDelete })} />);
	fireEvent.click(screen.getByRole("button", { name: /delete org/i }));
	const confirm = screen.getByRole("button", {
		name: /^delete$/i,
	}) as HTMLButtonElement;
	expect(confirm.disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm org slug/i), {
		target: { value: "acme" },
	});
	expect(confirm.disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
	expect(onDelete).toHaveBeenCalledTimes(1);
});

test("a rejected delete surfaces the has-agents 409 message", async () => {
	const onDelete = mock(async () => {
		throw new Error("org still owns agents");
	});
	render(<OrgSettings {...props({ onDelete })} />);
	fireEvent.click(screen.getByRole("button", { name: /delete org/i }));
	fireEvent.change(screen.getByLabelText(/confirm org slug/i), {
		target: { value: "acme" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
	});
	expect(screen.getByText(/still owns agents/i)).toBeTruthy();
});
