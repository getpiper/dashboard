import { expect, jest, test } from "bun:test";
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
