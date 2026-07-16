import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Field, Input, inputClass } from "./field";

test("Input applies inputClass and forwards native props", () => {
	render(<Input aria-label="Domain" placeholder="shop.example.com" />);
	const el = screen.getByLabelText("Domain") as HTMLInputElement;
	expect(el.className).toContain(inputClass.split(" ")[0]);
	expect(el.placeholder).toBe("shop.example.com");
});

test("Field renders its label and child control", () => {
	render(
		<Field label="Domain">
			<Input aria-label="Domain" />
		</Field>,
	);
	expect(screen.getByText("Domain")).toBeTruthy();
	expect(screen.getByLabelText("Domain")).toBeTruthy();
});
