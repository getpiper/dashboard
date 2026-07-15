import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("rounded-[2px] border border-border bg-card", className)}
			{...props}
		/>
	);
}

export function PanelHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"border-border border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}
