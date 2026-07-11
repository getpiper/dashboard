import { Link } from "@tanstack/react-router";
import type { BoxWithApps } from "@/server/relay";
import { StatusPill } from "./status-pill";

export function AppsHome({ boxes }: { boxes: BoxWithApps[] }) {
	if (boxes.length === 0) {
		return (
			<main className="page-wrap flex flex-col gap-4 px-4 py-8">
				<h1 className="font-semibold text-2xl">Apps</h1>
				<p className="text-muted-foreground">
					No boxes yet — run <code>piper connect</code> on your hardware to
					enroll one.
				</p>
			</main>
		);
	}
	return (
		<main className="page-wrap flex flex-col gap-6 px-4 py-8">
			<h1 className="font-semibold text-2xl">Apps</h1>
			{boxes.map((box) => (
				<section key={box.base} className="flex flex-col gap-2">
					<header className="flex items-center gap-2">
						<span
							className={`h-2 w-2 rounded-full ${
								box.connected ? "bg-emerald-500" : "bg-gray-400"
							}`}
						/>
						<Link
							to="/boxes/$base"
							params={{ base: box.base }}
							className="font-mono text-sm text-muted-foreground hover:underline"
						>
							{box.base}
						</Link>
					</header>
					{!box.connected ? (
						<p className="pl-4 text-muted-foreground text-sm">
							offline — apps unavailable
						</p>
					) : box.apps.length === 0 ? (
						<p className="pl-4 text-muted-foreground text-sm">
							No apps deployed
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{box.apps.map((app) => (
								<li
									key={app.name}
									className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3"
								>
									<span className="font-medium text-sm">{app.name}</span>
									<StatusPill status={app.status} />
								</li>
							))}
						</ul>
					)}
				</section>
			))}
		</main>
	);
}
