import { Link } from "@tanstack/react-router";
import { HintBar } from "@/components/ui/hint-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";
import { appDeviceStatus } from "@/lib/app-status";
import type { App, BoxWithApps } from "@/server/relay";

export type FlatApp = { base: string; app: App };

export function flattenApps(
	boxes: BoxWithApps[],
	scope: string,
	username: string | null,
): FlatApp[] {
	return boxes
		.filter((b) =>
			scope === "personal" ? b.owner === username : b.owner === scope,
		)
		.flatMap((b) => b.apps.map((app) => ({ base: b.base, app })));
}

export function AppsList({
	boxes,
	scope,
	username,
}: {
	boxes: BoxWithApps[];
	scope: string;
	username: string | null;
}) {
	const apps = flattenApps(boxes, scope, username);
	return (
		<main className="flex flex-col gap-5 py-8">
			<PageHeader
				kicker="your software"
				title="apps"
				subtitle={`${apps.length} apps`}
			/>
			{apps.length === 0 ? (
				<HintBar>
					deploy one with <code>piper deploy</code> from a box.
				</HintBar>
			) : (
				<Panel>
					<PanelHeader>app</PanelHeader>
					{apps.map(({ base, app }) => (
						<Row key={`${base}/${app.name}`}>
							<StatusDot status={appDeviceStatus(app.status)} />
							<Link
								to="/boxes/$base/apps/$app"
								params={{ base, app: app.name }}
								className="text-foreground no-underline hover:underline"
							>
								{app.name}
							</Link>
							<span>· {base}</span>
							<span className="hidden sm:inline">
								· {app.repo}@{app.branch}
							</span>
							{app.hostname ? (
								<a
									href={`https://${app.hostname}`}
									className="ml-auto truncate text-primary no-underline hover:underline"
								>
									{app.hostname}
								</a>
							) : (
								<span className="ml-auto text-muted-foreground">
									not deployed
								</span>
							)}
						</Row>
					))}
				</Panel>
			)}
		</main>
	);
}
