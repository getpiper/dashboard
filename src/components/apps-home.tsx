import { Link } from "@tanstack/react-router";
import { relativeTime } from "@/lib/relative-time";
import type { BoxWithApps } from "@/server/relay";
import { StatusBadge } from "./status-badge";

// TODO(https://github.com/getpiper/piper/issues/137): the relay assigns each app's real public hostname at deploy
// time (<app-hash>-<username>.public.getpiper.co) and does not return it in
// /v1/apps. This mock stands in until the apps API exposes the real host.
function mockAppUrl(app: string, base: string): string {
	return `${app}-${base}.public.getpiper.co`;
}

export function AppsHome({ boxes }: { boxes: BoxWithApps[] }) {
	if (boxes.length === 0) {
		return (
			<main className="page-wrap flex flex-col gap-4 px-4 py-8">
				<div className="island-kicker">Your hardware</div>
				<h1 className="font-semibold text-2xl text-[var(--sea-ink)]">Boxes</h1>
				<p className="text-muted-foreground">
					No boxes yet — run <code>piper connect</code> on your hardware to
					enroll one.
				</p>
			</main>
		);
	}

	const onlineCount = boxes.filter((b) => b.connected).length;
	const liveAppCount = boxes.reduce(
		(n, b) => n + b.apps.filter((a) => a.status === "running").length,
		0,
	);

	return (
		<main className="page-wrap flex flex-col gap-5 px-4 py-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<div className="island-kicker">Your hardware</div>
					<h1 className="mt-1.5 font-semibold text-2xl text-[var(--sea-ink)]">
						Boxes
					</h1>
				</div>
				<div className="flex flex-wrap gap-2">
					<span className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 font-semibold text-sm text-[var(--sea-ink)]">
						{boxes.length} boxes · {onlineCount} online
					</span>
					<span className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 font-semibold text-sm text-[var(--sea-ink)]">
						{liveAppCount} apps live
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-3.5">
				{boxes.map((box) => (
					<section
						key={box.base}
						className="feature-card flex flex-col gap-3.5 rounded-2xl border border-[var(--line)] p-5"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2.5">
								<Link
									to="/boxes/$base"
									params={{ base: box.base }}
									className="font-mono text-sm text-[var(--sea-ink)] no-underline hover:underline"
								>
									{box.base}
								</Link>
								{box.apps.length > 0 && (
									<span className="text-muted-foreground text-xs">
										{box.apps.length} apps
									</span>
								)}
							</div>
							<span className="flex items-center gap-2 text-sm text-[var(--sea-ink)]">
								<span
									className={`h-2 w-2 rounded-full ${
										box.connected ? "bg-emerald-500" : "bg-gray-400"
									}`}
								/>
								{box.connected ? "Connected" : "Offline"}
							</span>
						</div>

						{box.apps.length === 0 ? (
							<p className="border-t border-[var(--line)] pt-3.5 text-muted-foreground text-sm">
								No apps deployed on this box.
							</p>
						) : (
							box.apps.map((a) => (
								<div
									key={a.name}
									className="flex items-center justify-between gap-4 border-t border-[var(--line)] pt-3.5"
								>
									<div className="flex min-w-0 flex-col gap-0.5">
										<span className="font-semibold text-sm text-[var(--sea-ink)]">
											{a.name}
										</span>
										<a
											href={`https://${mockAppUrl(a.name, box.base)}`}
											className="truncate font-mono text-[var(--lagoon-deep)] text-xs no-underline hover:underline"
										>
											{mockAppUrl(a.name, box.base)}
										</a>
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
					</section>
				))}
			</div>
		</main>
	);
}
