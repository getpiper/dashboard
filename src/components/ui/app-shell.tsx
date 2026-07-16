import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type NavItem = {
	label: string;
	to: string;
	params?: Record<string, string>;
	exact?: boolean;
};

const tabBase =
	"border-border border-r px-4 py-2.5 text-sm no-underline first:border-l";
const tabInactive = `${tabBase} text-muted-foreground hover:text-foreground`;
const tabActive = `${tabBase} bg-primary text-primary-foreground font-medium`;

export function Nav({ items }: { items: NavItem[] }) {
	return (
		<nav className="flex">
			{items.map((item) => (
				<Link
					key={item.label}
					to={item.to}
					params={item.params}
					activeOptions={{ exact: item.exact ?? false }}
					activeProps={{ className: tabActive }}
					inactiveProps={{ className: tabInactive }}
				>
					{item.label}
				</Link>
			))}
		</nav>
	);
}

export function AppShell({
	navItems,
	right,
	children,
}: {
	navItems: NavItem[];
	right?: ReactNode;
	children: ReactNode;
}) {
	return (
		<>
			<header className="sticky top-0 z-50 flex items-center border-border border-b bg-card">
				<Link
					to="/"
					className="border-border border-r px-4 py-2.5 font-semibold text-foreground text-sm no-underline"
				>
					pi@<span className="text-primary">piper</span>
				</Link>
				{navItems.length > 0 && <Nav items={navItems} />}
				{right != null && (
					<div className="ml-auto flex items-center gap-2 px-3">{right}</div>
				)}
			</header>
			<div className="mx-auto w-[min(1080px,100%-2rem)]">{children}</div>
		</>
	);
}
