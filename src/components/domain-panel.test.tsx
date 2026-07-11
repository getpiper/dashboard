import { expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { DomainStatus } from "@/server/relay";
import { DomainPanel } from "./domain-panel";

const baseStatus: DomainStatus = {
	domain: "",
	dnsProvider: "",
	dnsTokenSet: false,
	source: "api",
	status: "",
	error: "",
	certNotAfter: null,
	dnsRecords: [],
	dnsOk: false,
};
const makeStatus = (over: Partial<DomainStatus>): DomainStatus => ({
	...baseStatus,
	...over,
});
const configured = (over: Partial<DomainStatus>): DomainStatus =>
	makeStatus({
		domain: "shop.example.com",
		dnsProvider: "cloudflare",
		dnsTokenSet: true,
		status: "issuing",
		dnsRecords: [
			{ type: "CNAME", name: "*.shop.example.com", value: "relay.test" },
			{ type: "CNAME", name: "shop.example.com", value: "relay.test" },
		],
		...over,
	});

const noop = () => {};
const noopAsync = async () => {};

test("env-managed source renders read-only with no Save or Remove", () => {
	render(
		<DomainPanel
			status={makeStatus({ domain: "corp.example.com", source: "env" })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText("corp.example.com")).toBeTruthy();
	expect(screen.getByText(/managed by this box/i)).toBeTruthy();
	expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
	expect(
		screen.queryByRole("button", { name: /remove custom domain/i }),
	).toBeNull();
});

test("unconfigured renders the form; filling and saving calls onSave with the values", async () => {
	const onSave = mock(async (_domain: string, _token: string) => {});
	render(
		<DomainPanel
			status={makeStatus({})}
			onSave={onSave}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	fireEvent.change(screen.getByLabelText(/^domain$/i), {
		target: { value: "shop.example.com" },
	});
	fireEvent.change(screen.getByLabelText(/dns api token/i), {
		target: { value: "cf-token" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
	});
	expect(onSave).toHaveBeenCalledTimes(1);
	expect(onSave.mock.calls[0]).toEqual(["shop.example.com", "cf-token"]);
});

test("configured+issuing shows the issuing pill and the CNAME records", () => {
	render(
		<DomainPanel
			status={configured({ status: "issuing" })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getAllByText("shop.example.com").length).toBe(2);
	expect(screen.getByText(/issuing/i)).toBeTruthy();
	expect(screen.getByText("*.shop.example.com")).toBeTruthy();
	expect(screen.getAllByText("relay.test").length).toBe(2);
});

test("configured+active shows the cert expiry", () => {
	render(
		<DomainPanel
			status={configured({
				status: "active",
				certNotAfter: "2026-10-10T00:00:00Z",
			})}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/active/i)).toBeTruthy();
	expect(screen.getByText(/October 10, 2026/)).toBeTruthy();
});

test("configured+failed shows the error text", () => {
	render(
		<DomainPanel
			status={configured({ status: "failed", error: "dns challenge failed" })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText("Failed")).toBeTruthy();
	expect(screen.getByText(/dns challenge failed/i)).toBeTruthy();
});

test("dnsOk drives the resolving indicator", () => {
	const { rerender } = render(
		<DomainPanel
			status={configured({ dnsOk: false })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/not resolving to your box/i)).toBeTruthy();
	rerender(
		<DomainPanel
			status={configured({ dnsOk: true })}
			onSave={noopAsync}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	expect(screen.getByText(/dns is resolving to your box/i)).toBeTruthy();
});

test("Remove stays disabled until the exact domain is typed, then calls onRemove", async () => {
	const onRemove = mock(async () => {});
	render(
		<DomainPanel
			status={configured({ status: "active" })}
			onSave={noopAsync}
			onRemove={onRemove}
			refresh={noop}
		/>,
	);
	fireEvent.click(
		screen.getByRole("button", { name: /remove custom domain/i }),
	);
	const confirm = screen.getByRole("button", { name: /^remove$/i });
	expect((confirm as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm domain/i), {
		target: { value: "shop.example.com" },
	});
	expect((confirm as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
	expect(onRemove).toHaveBeenCalledTimes(1);
});

test("Cancel collapses the remove confirm without calling onRemove", () => {
	const onRemove = mock(async () => {});
	render(
		<DomainPanel
			status={configured({ status: "active" })}
			onSave={noopAsync}
			onRemove={onRemove}
			refresh={noop}
		/>,
	);
	fireEvent.click(
		screen.getByRole("button", { name: /remove custom domain/i }),
	);
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(screen.queryByLabelText(/confirm domain/i)).toBeNull();
	expect(onRemove).not.toHaveBeenCalled();
});

test("a rejected onSave renders the error message", async () => {
	const onSave = mock(async () => {
		throw new Error("unsupported dns provider");
	});
	render(
		<DomainPanel
			status={makeStatus({})}
			onSave={onSave}
			onRemove={noopAsync}
			refresh={noop}
		/>,
	);
	fireEvent.change(screen.getByLabelText(/^domain$/i), {
		target: { value: "shop.example.com" },
	});
	fireEvent.change(screen.getByLabelText(/dns api token/i), {
		target: { value: "cf-token" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
	});
	expect(screen.getByText(/unsupported dns provider/i)).toBeTruthy();
});
