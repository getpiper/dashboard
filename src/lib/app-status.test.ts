import { expect, test } from "bun:test";
import { appDeviceStatus } from "./app-status";

test("maps app status to device status", () => {
	expect(appDeviceStatus("running")).toBe("ok");
	expect(appDeviceStatus("building")).toBe("warn");
	expect(appDeviceStatus("failed")).toBe("danger");
	expect(appDeviceStatus("stopped")).toBe("idle");
	expect(appDeviceStatus("")).toBe("idle");
	expect(appDeviceStatus("weird")).toBe("idle");
});
