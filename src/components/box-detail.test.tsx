import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { BoxDetail } from "./box-detail";

test("shows the box as connected and lists its apps with status", () => {
	render(
		<BoxDetail
			box={{
				base: "up-zoe.public.example",
				connected: true,
				apps: [
					{
						name: "api",
						port: 8082,
						repo: "r",
						branch: "main",
						createdAt: "2026-07-11T11:00:00Z",
						status: "failed",
					},
				],
			}}
		/>,
	);
	expect(screen.getByText("up-zoe.public.example")).toBeTruthy();
	expect(screen.getByText(/connected/i)).toBeTruthy();
	expect(screen.getByText("api")).toBeTruthy();
	expect(screen.getByText(/failed/i)).toBeTruthy();
});

test("shows an offline box with no apps", () => {
	render(
		<BoxDetail
			box={{ base: "down-zoe.public.example", connected: false, apps: [] }}
		/>,
	);
	expect(screen.getByText(/offline/i)).toBeTruthy();
	expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});
