import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
	"inline-flex items-center justify-center rounded-[2px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				primary: "bg-primary text-primary-foreground hover:bg-primary/90",
				secondary:
					"border border-primary bg-transparent text-primary hover:bg-primary/10",
				neutral: "border border-border hover:bg-secondary",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/90",
			},
			size: {
				sm: "h-7 px-2.5 text-xs",
				md: "h-8 px-3 text-sm",
				lg: "px-4 py-2 text-sm",
			},
		},
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export type ButtonProps = ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & { bracketed?: boolean };

export function Button({
	className,
	variant,
	size,
	bracketed = true,
	children,
	...props
}: ButtonProps) {
	return (
		<button
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		>
			{bracketed ? <>[&nbsp;{children}&nbsp;]</> : children}
		</button>
	);
}
