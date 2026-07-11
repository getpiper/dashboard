import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { BoxWithApps } from "@/server/relay";
import { StatusPill } from "./status-pill";

export function BoxDetail({
	box,
	children,
}: {
	box: BoxWithApps;
	children?: ReactNode;
}) {
	return (
		<main className="page-wrap flex flex-col gap-4 px-4 py-8">
			<div className="flex items-center gap-2">
				<span
					className={`h-2 w-2 rounded-full ${
						box.connected ? "bg-emerald-500" : "bg-gray-400"
					}`}
				/>
				<h1 className="font-mono font-semibold text-xl">{box.base}</h1>
				{box.connected && (
					<span className="text-muted-foreground text-sm">Connected</span>
				)}
				<Link
					to="/boxes/$base/import"
					params={{ base: box.base }}
					className="ml-auto rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)]"
				>
					New project
				</Link>
			</div>
			{children}
			{!box.connected ? (
				<p className="text-muted-foreground">
					This box is offline — its apps can't be reached.
				</p>
			) : box.apps.length === 0 ? (
				<p className="text-muted-foreground">No apps deployed.</p>
			) : (
				<ul className="flex flex-col gap-2">
					{box.apps.map((app) => (
						<li key={app.name}>
							<Link
								to="/boxes/$base/apps/$app"
								params={{ base: box.base, app: app.name }}
								className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3 hover:bg-[var(--chip-bg)]"
							>
								<span className="font-medium text-sm">{app.name}</span>
								<StatusPill status={app.status} />
							</Link>
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
