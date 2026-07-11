import { expect, test } from "bun:test";
import { relativeTime } from "./relative-time";

const now = new Date("2026-07-11T12:00:00Z");

test("under a minute reads 'just now'", () => {
	expect(relativeTime("2026-07-11T11:59:30Z", now)).toBe("just now");
});

test("minutes ago", () => {
	expect(relativeTime("2026-07-11T11:45:00Z", now)).toBe("15m ago");
});

test("hours ago", () => {
	expect(relativeTime("2026-07-11T10:00:00Z", now)).toBe("2h ago");
});

test("days ago", () => {
	expect(relativeTime("2026-07-09T12:00:00Z", now)).toBe("2d ago");
});
