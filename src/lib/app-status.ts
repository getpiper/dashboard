import type { DeviceStatus } from "@/components/ui/status-dot";

// Maps a relay app status to the device-status palette used by StatusDot.
export function appDeviceStatus(status: string): DeviceStatus {
	switch (status) {
		case "running":
			return "ok";
		case "building":
			return "warn";
		case "failed":
			return "danger";
		default:
			return "idle";
	}
}
