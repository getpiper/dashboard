import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HintBar } from "./hint-bar";

test("prefixes the hint with $", () => {
	render(<HintBar>run piper connect</HintBar>);
	expect(screen.getByText(/run piper connect/)).toBeTruthy();
	expect(screen.getByText("$", { exact: false }).textContent).toContain("$");
});
