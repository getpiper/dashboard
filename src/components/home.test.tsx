import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Home } from "./home";

test("home page shows the Piper Dashboard heading", () => {
	render(<Home />);
	expect(
		screen.getByRole("heading", { name: /piper dashboard/i }),
	).toBeTruthy();
});
