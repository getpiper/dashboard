import { expect, test } from "bun:test";

const css = await Bun.file(new URL("./styles.css", import.meta.url)).text();

test("terminal tokens are promoted to :root, not scoped under .terminal", () => {
	expect(css).not.toContain(".terminal");
	expect(css).toContain("#ffb454"); // amber accent (brand/interactive)
	expect(css).toContain("--radius: 2px");
});

test("status palette tokens exist and are wired to Tailwind utilities", () => {
	expect(css).toContain("--status-ok");
	expect(css).toContain("--status-warn");
	expect(css).toContain("--status-danger");
	expect(css).toContain("--status-idle");
	expect(css).toContain("--color-status-ok: var(--status-ok)");
});

test("JetBrains Mono is loaded and set as the terminal font", () => {
	expect(css).toContain("JetBrains+Mono"); // @import
	expect(css).toContain("--font-mono");
});
