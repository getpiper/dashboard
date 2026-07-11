import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";

test("running renders as Live", () => {
	render(<StatusBadge status="running" />);
	expect(screen.getByText("Live")).toBeTruthy();
});

test("building renders as Building", () => {
	render(<StatusBadge status="building" />);
	expect(screen.getByText("Building")).toBeTruthy();
});

test("unknown status falls back to Never deployed", () => {
	render(<StatusBadge status="" />);
	expect(screen.getByText("Never deployed")).toBeTruthy();
});
