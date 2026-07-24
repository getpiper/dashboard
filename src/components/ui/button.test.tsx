import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "./button";

test("renders a bracketed label by default", () => {
	render(<Button>Deploy</Button>);
	const btn = screen.getByRole("button");
	expect(btn.textContent?.replace(/ /g, " ")).toContain("[ Deploy ]");
});

test("bracketed can be turned off", () => {
	render(<Button bracketed={false}>Plain</Button>);
	expect(screen.getByRole("button").textContent).toBe("Plain");
});

test("primary variant uses the amber fill tokens", () => {
	render(<Button>x</Button>);
	const cls = screen.getByRole("button").className;
	expect(cls).toContain("bg-primary");
	expect(cls).toContain("text-primary-foreground");
});

test("secondary variant uses the amber outline tokens", () => {
	render(
		<Button variant="secondary" bracketed={false}>
			x
		</Button>,
	);
	const cls = screen.getByRole("button").className;
	expect(cls).toContain("border-primary");
	expect(cls).toContain("text-primary");
});

test("neutral variant uses the border + secondary-hover tokens", () => {
	render(
		<Button variant="neutral" bracketed={false}>
			x
		</Button>,
	);
	const cls = screen.getByRole("button").className;
	expect(cls).toContain("border-border");
	expect(cls).toContain("hover:bg-secondary");
});

test("destructive variant uses the destructive fill tokens", () => {
	render(
		<Button variant="destructive" bracketed={false}>
			x
		</Button>,
	);
	const cls = screen.getByRole("button").className;
	expect(cls).toContain("bg-destructive");
	expect(cls).toContain("text-destructive-foreground");
});

test("lg size uses the roomier CTA padding", () => {
	render(
		<Button size="lg" bracketed={false}>
			x
		</Button>,
	);
	const cls = screen.getByRole("button").className;
	expect(cls).toContain("px-4");
	expect(cls).toContain("py-2");
});

test("buttonVariants returns the same classes for use on non-button elements", () => {
	const cls = buttonVariants({ variant: "primary", size: "lg" });
	expect(cls).toContain("bg-primary");
	expect(cls).toContain("px-4");
});

test("forwards native button props", () => {
	render(
		<Button type="submit" disabled>
			x
		</Button>,
	);
	const btn = screen.getByRole("button") as HTMLButtonElement;
	expect(btn.type).toBe("submit");
	expect(btn.disabled).toBe(true);
});
