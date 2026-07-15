import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusDot } from "./status-dot";

test("warn status shows the triangle glyph in the warn color", () => {
	render(<StatusDot status="warn">degraded</StatusDot>);
	expect(screen.getByText("▲")).toBeTruthy();
	expect(screen.getByText("degraded").className).toContain("text-status-warn");
});

test("ok status shows a filled dot in the ok color", () => {
	render(<StatusDot status="ok">online</StatusDot>);
	expect(screen.getByText("online").className).toContain("text-status-ok");
});

test("idle status uses the hollow glyph", () => {
	render(<StatusDot status="idle">offline</StatusDot>);
	expect(screen.getByText("○")).toBeTruthy();
});

test("status never uses the amber brand color", () => {
	const { container } = render(
		<>
			<StatusDot status="ok">online</StatusDot>
			<StatusDot status="danger">error</StatusDot>
		</>,
	);
	expect(container.innerHTML).not.toContain("primary");
});

test("renders glyph-only when no label is given", () => {
	render(<StatusDot status="ok" data-testid="dot" />);
	expect(screen.getByTestId("dot").textContent).toBe("●");
});
