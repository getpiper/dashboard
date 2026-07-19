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
		<main className="flex flex-col gap-4 py-8">
			<div className="flex items-center gap-2">
				<span
					className={`h-2 w-2 rounded-[2px] ${
						box.connected ? "bg-status-ok" : "bg-status-idle"
					}`}
				/>
				<h1 className="font-mono font-semibold text-xl">{box.base}</h1>
				<span className="rounded-[2px] border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
					{box.owner}
				</span>
				{box.connected && (
					<span className="text-muted-foreground text-sm">Connected</span>
				)}
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
								className="flex items-center justify-between rounded-[2px] border border-border px-4 py-3 hover:bg-secondary"
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
