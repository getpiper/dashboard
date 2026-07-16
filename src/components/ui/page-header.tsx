import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
	kicker,
	title,
	subtitle,
	className,
}: {
	kicker?: ReactNode;
	title: string;
	subtitle?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-1", className)}>
			{kicker != null && (
				<div className="text-[11px] uppercase tracking-widest text-primary">
					{kicker}
				</div>
			)}
			<h1 className="font-semibold text-xl">
				<span className="text-muted-foreground">{"# "}</span>
				{title}
			</h1>
			{subtitle != null && (
				<p className="text-muted-foreground text-sm">{subtitle}</p>
			)}
		</div>
	);
}
