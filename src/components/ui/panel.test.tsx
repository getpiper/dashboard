import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Panel, PanelHeader } from "./panel";

test("panel wraps children in a hairline-bordered card", () => {
	render(<Panel>content</Panel>);
	const el = screen.getByText("content");
	expect(el.className).toContain("border-border");
	expect(el.className).toContain("bg-card");
});

test("panel header renders an uppercase muted label", () => {
	render(<PanelHeader>hostname</PanelHeader>);
	const el = screen.getByText("hostname");
	expect(el.className).toContain("uppercase");
	expect(el.className).toContain("text-muted-foreground");
});

test("panel forwards native div props", () => {
	render(<Panel data-testid="p" aria-label="boxes" />);
	expect(screen.getByTestId("p").getAttribute("aria-label")).toBe("boxes");
});
