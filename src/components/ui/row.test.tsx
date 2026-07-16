import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Row } from "./row";

test("renders children", () => {
	render(<Row>hello</Row>);
	expect(screen.getByText("hello")).toBeTruthy();
});

test("carries the row layout classes and merges className", () => {
	render(<Row className="extra">x</Row>);
	const el = screen.getByText("x");
	expect(el.className).toContain("items-center");
	expect(el.className).toContain("extra");
});
