import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UiPreview } from "./preview";

test("previews each primitive together", () => {
	render(<UiPreview />);
	// Button (bracketed)
	expect(screen.getByRole("button", { name: /enroll a box/i })).toBeTruthy();
	// StatusDot labels
	expect(screen.getByText("online")).toBeTruthy();
	expect(screen.getByText("degraded")).toBeTruthy();
	expect(screen.getByText("offline")).toBeTruthy();
	// Panel header
	expect(screen.getByText("hostname")).toBeTruthy();
});
