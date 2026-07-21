import { expect, test } from "bun:test";
import { appsTabActive, boxesTabActive, isAppDetailPath } from "./app-frame";

test("app detail lives under /boxes but is owned by the apps tab", () => {
	const path = "/boxes/a3f9-octo/apps/web";
	expect(isAppDetailPath(path)).toBe(true);
	expect(appsTabActive(path)).toBe(true);
	expect(boxesTabActive(path)).toBe(false);
});

test("boxes home and box detail stay on the boxes tab", () => {
	for (const path of ["/boxes", "/boxes/a3f9-octo"]) {
		expect(isAppDetailPath(path)).toBe(false);
		expect(boxesTabActive(path)).toBe(true);
		expect(appsTabActive(path)).toBe(false);
	}
});

test("the apps list and new-app wizard stay on the apps tab", () => {
	for (const path of ["/apps", "/apps/new"]) {
		expect(appsTabActive(path)).toBe(true);
		expect(boxesTabActive(path)).toBe(false);
	}
});
