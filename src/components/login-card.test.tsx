import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { LoginCard } from "./login-card";

test("login card links to the dashboard's GitHub login endpoint", () => {
	render(<LoginCard />);
	const link = screen.getByRole("link", { name: /continue with github/i });
	expect(link.getAttribute("href")).toBe("/api/auth/login");
});
