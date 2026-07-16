import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// A panel row: horizontal, with a hairline divider above adjacent rows.
export function Row({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground [&+&]:border-border [&+&]:border-t",
				className,
			)}
			{...props}
		/>
	);
}
