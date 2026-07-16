import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { relativeTime } from "@/lib/relative-time";
import type { BoxWithApps } from "@/server/relay";
import { StatusBadge } from "./status-badge";

export function AppsHome({
	boxes,
	username,
	scope,
}: {
	boxes: BoxWithApps[];
	username: string | null;
	scope: string;
}) {
	const scoped = boxes.filter((b) =>
		scope === "personal" ? b.owner === username : b.owner === scope,
	);

	if (scoped.length === 0) {
		return (
			<main className="flex flex-col gap-4 py-8">
				<PageHeader kicker="your hardware" title="boxes" />
				<p className="text-muted-foreground">
					{scope === "personal" ? (
						<>
							No boxes yet — run <code>piper connect</code> on your hardware to
							enroll one.
						</>
					) : (
						<>
							No boxes in this org yet — enroll one with{" "}
							<code>piper enroll --org {scope}</code>.
						</>
					)}
				</p>
			</main>
		);
	}

	const onlineCount = scoped.filter((b) => b.connected).length;
	const liveAppCount = scoped.reduce(
		(n, b) => n + b.apps.filter((a) => a.status === "running").length,
		0,
	);

	return (
		<main className="flex flex-col gap-5 py-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<PageHeader kicker="your hardware" title="boxes" />
				<div className="flex flex-wrap gap-2">
					<span className="rounded-[2px] border border-border bg-secondary px-3 py-1 font-semibold text-foreground text-sm">
						{scoped.length} boxes · {onlineCount} online
					</span>
					<span className="rounded-[2px] border border-border bg-secondary px-3 py-1 font-semibold text-foreground text-sm">
						{liveAppCount} apps live
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-3.5">
				{scoped.map((box) => (
					<Panel key={box.base} className="flex flex-col gap-3.5 p-4">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2.5">
								<Link
									to="/boxes/$base"
									params={{ base: box.base }}
									className="font-mono text-foreground text-sm no-underline hover:underline"
								>
									{box.base}
								</Link>
								{box.apps.length > 0 && (
									<span className="text-muted-foreground text-xs">
										{box.apps.length} apps
									</span>
								)}
							</div>
							<span className="flex items-center gap-2 text-foreground text-sm">
								<span
									className={`h-2 w-2 rounded-[2px] ${
										box.connected ? "bg-status-ok" : "bg-status-idle"
									}`}
								/>
								{box.connected ? "Connected" : "Offline"}
							</span>
						</div>

						{box.apps.length === 0 ? (
							<p className="border-border border-t pt-3.5 text-muted-foreground text-sm">
								No apps deployed on this box.
							</p>
						) : (
							box.apps.map((a) => (
								<div
									key={a.name}
									className="flex items-center justify-between gap-4 border-border border-t pt-3.5"
								>
									<div className="flex min-w-0 flex-col gap-0.5">
										<span className="font-semibold text-foreground text-sm">
											{a.name}
										</span>
										{a.hostname ? (
											<a
												href={`https://${a.hostname}`}
												className="truncate font-mono text-primary text-xs no-underline hover:underline"
											>
												{a.hostname}
											</a>
										) : (
											<span className="truncate font-mono text-muted-foreground text-xs">
												Not deployed yet
											</span>
										)}
									</div>
									<div className="flex flex-shrink-0 items-center gap-3.5">
										<StatusBadge status={a.status} />
										<span className="text-muted-foreground text-xs">
											{relativeTime(a.createdAt)}
										</span>
									</div>
								</div>
							))
						)}
					</Panel>
				))}
			</div>
		</main>
	);
}
