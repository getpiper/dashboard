import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
	"rounded-[2px] border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
	return <input className={cn(inputClass, className)} {...props} />;
}

export function Field({
	label,
	children,
	className,
}: {
	label: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		// biome-ignore lint: children are form controls with aria-label
		<label className={cn("flex flex-col gap-1 text-sm", className)}>
			{label}
			{children}
		</label>
	);
}
