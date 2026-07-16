import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Terminal command-echo hint. Wrap command words in <code> for amber emphasis.
export function HintBar({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<p className={cn("text-muted-foreground text-sm", className)}>
			<span className="text-primary">{"$ "}</span>
			{children}
		</p>
	);
}
