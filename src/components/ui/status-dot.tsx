import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type DeviceStatus = "ok" | "warn" | "danger" | "idle";

const STATUS: Record<DeviceStatus, { glyph: string; color: string }> = {
	ok: { glyph: "●", color: "text-status-ok" },
	warn: { glyph: "▲", color: "text-status-warn" },
	danger: { glyph: "●", color: "text-status-danger" },
	idle: { glyph: "○", color: "text-status-idle" },
};

export function StatusDot({
	status,
	className,
	children,
	...props
}: ComponentProps<"span"> & { status: DeviceStatus }) {
	const meta = STATUS[status];
	return (
		<span
			className={cn("inline-flex items-center gap-1.5", className)}
			{...props}
		>
			<span aria-hidden className={cn("text-[10px] leading-none", meta.color)}>
				{meta.glyph}
			</span>
			{children != null ? (
				<span className={cn("text-xs", meta.color)}>{children}</span>
			) : null}
		</span>
	);
}
