import { Link } from "@tanstack/react-router";
import { HintBar } from "@/components/ui/hint-bar";
import { PageHeader } from "@/components/ui/page-header";
import { relativeTime } from "@/lib/relative-time";
import type { App, AppDomainStatus, BoxAppDomains } from "@/server/relay";
import { StatusBadge } from "./status-badge";

export type FlatApp = {
	base: string;
	boxConnected: boolean;
	app: App;
	domain: AppDomainStatus | null;
};

export function flattenApps(
	items: BoxAppDomains[],
	scope: string,
	username: string | null,
): FlatApp[] {
	return items
		.filter(({ box }) =>
			scope === "personal" ? box.owner === username : box.owner === scope,
		)
		.flatMap(({ box, domains }) =>
			box.apps.map((app) => ({
				base: box.base,
				boxConnected: box.connected,
				app,
				domain: domains[app.name]?.[0] ?? null,
			})),
		);
}

function MetaRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="w-16 flex-shrink-0 text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}

function AppCard({ base, boxConnected, app, domain }: FlatApp) {
	return (
		<div className="relative flex flex-col gap-3 rounded-[2px] border border-border bg-card p-4 hover:bg-secondary/40">
			<div className="flex items-start justify-between gap-2.5">
				<Link
					to="/boxes/$base/apps/$app"
					params={{ base, app: app.name }}
					className="truncate font-semibold text-[15px] text-foreground no-underline after:absolute after:inset-0"
				>
					{app.name}
				</Link>
				<StatusBadge status={app.status} />
			</div>
			{app.hostname ? (
				<a
					href={`https://${app.hostname}`}
					className="relative truncate text-primary text-xs no-underline hover:underline"
				>
					{app.hostname}
				</a>
			) : (
				<span className="truncate text-muted-foreground text-xs">
					not deployed
				</span>
			)}
			<div className="flex flex-col gap-1.5 border-border border-t pt-3 text-xs">
				<MetaRow label="box">
					<span
						className={`h-1.5 w-1.5 flex-shrink-0 rounded-[2px] ${
							boxConnected ? "bg-status-ok" : "bg-status-idle"
						}`}
					/>
					<span className="truncate text-foreground">{base}</span>
				</MetaRow>
				<MetaRow label="repo">
					<span className="truncate text-foreground">
						{app.repo}@{app.branch}
					</span>
				</MetaRow>
				{domain != null && (
					<MetaRow label="domain">
						<span className="truncate text-primary">{domain.domain}</span>
					</MetaRow>
				)}
				<MetaRow label="deployed">
					<span className="text-foreground">{relativeTime(app.createdAt)}</span>
				</MetaRow>
			</div>
		</div>
	);
}

export function AppsList({
	items,
	scope,
	username,
}: {
	items: BoxAppDomains[];
	scope: string;
	username: string | null;
}) {
	const apps = flattenApps(items, scope, username);
	return (
		<main className="flex flex-col gap-5 py-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<PageHeader
					kicker="your software"
					title="apps"
					subtitle={`${apps.length} apps`}
				/>
				<Link
					to="/apps/new"
					className="rounded-[2px] bg-primary px-4 py-2 font-medium text-primary-foreground text-sm no-underline hover:bg-primary/90"
				>
					+ New app
				</Link>
			</div>
			{apps.length === 0 ? (
				<HintBar>
					deploy one with <code>piper deploy</code> from a box.
				</HintBar>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
					{apps.map((f) => (
						<AppCard key={`${f.base}/${f.app.name}`} {...f} />
					))}
				</div>
			)}
		</main>
	);
}
