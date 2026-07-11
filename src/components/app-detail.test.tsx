import { expect, jest, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { App, Deployment } from "@/server/relay";
import { AppDetail } from "./app-detail";

const app: App = {
	name: "web",
	port: 8081,
	repo: "getpiper/example",
	branch: "main",
	createdAt: "2026-07-11T10:00:00Z",
	status: "running",
};

const dep = (over: Partial<Deployment>): Deployment => ({
	id: "dep-abc1234",
	pr: 0,
	status: "running",
	createdAt: "2026-07-11T10:00:00Z",
	...over,
});

const noop = () => {};
const emptyLogs = async () => "";
const noopAsync = async () => {};

test("renders the app header with repo and branch", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	expect(screen.getByText("web")).toBeTruthy();
	expect(screen.getByText(/getpiper\/example/)).toBeTruthy();
	expect(screen.getByText(/main/)).toBeTruthy();
});

test("shows an offline message when the app is null", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={false}
			app={null}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	expect(screen.getByText(/offline/i)).toBeTruthy();
});

test("shows a not-found message when the box is connected but the app is missing", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={null}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	expect(screen.getByText(/not found/i)).toBeTruthy();
});

test("lists deployments and distinguishes production from PR previews", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[
				dep({ id: "dep-prod0001", pr: 0, status: "running" }),
				dep({ id: "dep-prev0002", pr: 12, status: "failed" }),
			]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	expect(screen.getByText(/Production/)).toBeTruthy();
	const prLink = screen.getByRole("link", { name: /PR #12/ });
	expect(prLink.getAttribute("href")).toBe(
		"https://github.com/getpiper/example/pull/12",
	);
});

test("expanding a deployment fetches and shows its logs", async () => {
	const fetchLogs = async (id: string) => `logs for ${id}`;
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[dep({ id: "dep-abc1234", status: "failed" })]}
			fetchLogs={fetchLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /dep-abc1/ }));
	expect(await screen.findByText("logs for dep-abc1234")).toBeTruthy();
});

test("a building deployment live-tails logs and refreshes on interval", async () => {
	jest.useFakeTimers();
	let calls = 0;
	let refreshes = 0;
	const fetchLogs = async () => {
		calls++;
		return `log ${calls}`;
	};
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[dep({ id: "dep-build001", status: "building" })]}
			fetchLogs={fetchLogs}
			refresh={() => {
				refreshes++;
			}}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /dep-buil/ }));
	});
	expect(calls).toBe(1);
	await act(async () => {
		jest.advanceTimersByTime(4000);
	});
	expect(calls).toBe(3);
	expect(refreshes).toBe(2);
	jest.useRealTimers();
});

test("Stop calls onStop and shows a pending state while it runs", async () => {
	let release: () => void = () => {};
	const gate = new Promise<void>((r) => {
		release = r;
	});
	const onStop = mock(() => gate);
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={onStop}
			onDelete={noopAsync}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
	expect(onStop).toHaveBeenCalledTimes(1);
	expect(screen.getByRole("button", { name: /stopping/i })).toBeTruthy();
	await act(async () => {
		release();
		await gate;
	});
});

test("hides Stop when the app is already stopped", () => {
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={{ ...app, status: "stopped" }}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={noopAsync}
		/>,
	);
	expect(screen.queryByRole("button", { name: /^stop$/i })).toBeNull();
});

test("Delete stays disabled until the exact app name is typed, then calls onDelete", async () => {
	const onDelete = mock(async () => {});
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={onDelete}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /delete app/i }));
	const confirm = screen.getByRole("button", { name: /^delete$/i });
	expect((confirm as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm app name/i), {
		target: { value: "web" },
	});
	expect((confirm as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
	expect(onDelete).toHaveBeenCalledTimes(1);
});

test("Cancel collapses the confirm block without calling onDelete", () => {
	const onDelete = mock(async () => {});
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={onDelete}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /delete app/i }));
	fireEvent.change(screen.getByLabelText(/confirm app name/i), {
		target: { value: "web" },
	});
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(screen.queryByLabelText(/confirm app name/i)).toBeNull();
	expect(onDelete).not.toHaveBeenCalled();
});

test("a rejected onStop renders the error message", async () => {
	const onStop = async () => {
		throw new Error("boom stop");
	};
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={onStop}
			onDelete={noopAsync}
		/>,
	);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
	});
	expect(screen.getByText(/boom stop/i)).toBeTruthy();
});

test("a rejected onDelete renders the error and keeps the confirm block", async () => {
	const onDelete = async () => {
		throw new Error("boom delete");
	};
	render(
		<AppDetail
			base="abc-zoe.public.example"
			appName="web"
			connected={true}
			app={app}
			deployments={[]}
			fetchLogs={emptyLogs}
			refresh={noop}
			onStop={noopAsync}
			onDelete={onDelete}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /delete app/i }));
	fireEvent.change(screen.getByLabelText(/confirm app name/i), {
		target: { value: "web" },
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
	});
	expect(screen.getByText(/boom delete/i)).toBeTruthy();
	expect(screen.getByLabelText(/confirm app name/i)).toBeTruthy();
});
