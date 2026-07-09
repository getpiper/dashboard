import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { BoxList } from "./box-list";

test("renders one row per box with its connection status", () => {
	render(
		<BoxList
			boxes={[
				{ agent: "abc123-zoe.public.example", connected: true },
				{ agent: "def456-zoe.public.example", connected: false },
			]}
		/>,
	);
	const items = screen.getAllByRole("listitem");
	expect(items).toHaveLength(2);
	expect(items[0].textContent).toContain("abc123-zoe.public.example");
	expect(items[0].textContent).toContain("Connected");
	expect(items[1].textContent).toContain("def456-zoe.public.example");
	expect(items[1].textContent).toContain("Offline");
});

test("shows the empty state when the account has no boxes", () => {
	render(<BoxList boxes={[]} />);
	expect(screen.getByText(/no boxes yet/i)).toBeTruthy();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});
