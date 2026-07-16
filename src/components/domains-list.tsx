import { Link } from "@tanstack/react-router";
import { HintBar } from "@/components/ui/hint-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Row } from "@/components/ui/row";
import { type DeviceStatus, StatusDot } from "@/components/ui/status-dot";
import type { BoxDomain } from "@/server/relay";

function domainDeviceStatus(status: string): DeviceStatus {
	switch (status) {
		case "active":
			return "ok";
		case "issuing":
			return "warn";
		case "failed":
			return "danger";
		default:
			return "idle";
	}
}

export function DomainsList({
	items,
	scope,
	username,
}: {
	items: BoxDomain[];
	scope: string;
	username: string | null;
}) {
	const scoped = items.filter(({ box }) =>
		scope === "personal" ? box.owner === username : box.owner === scope,
	);

	if (scoped.length === 0) {
		return (
			<main className="flex flex-col gap-5 py-8">
				<PageHeader kicker="your endpoints" title="domains" />
				<HintBar>
					enroll a box with <code>piper connect</code> to add a domain.
				</HintBar>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-5 py-8">
			<PageHeader
				kicker="your endpoints"
				title="domains"
				subtitle={`${scoped.length} boxes`}
			/>
			<div className="flex flex-col gap-4">
				{scoped.map(({ box, domain }) => (
					<Panel key={box.base}>
						<PanelHeader className="flex items-center gap-2 normal-case tracking-normal">
							<span className="text-foreground">{box.base}</span>
							{domain?.domain ? (
								<StatusDot
									status={domainDeviceStatus(domain.status)}
									className="ml-auto"
								>
									{domain.status || "configured"}
								</StatusDot>
							) : (
								<Link
									to="/boxes/$base"
									params={{ base: box.base }}
									className="ml-auto text-primary no-underline hover:underline"
								>
									add domain
								</Link>
							)}
						</PanelHeader>
						{domain?.domain ? (
							<>
								<Row>
									<span className="text-foreground">{domain.domain}</span>
									<span className="ml-auto">
										{domain.dnsOk ? "dns ok" : "dns pending"}
									</span>
								</Row>
								{box.apps.length === 0 ? (
									<Row>no apps served</Row>
								) : (
									box.apps.map((a) => (
										<Row key={a.name}>
											<span className="text-foreground">{a.name}</span>
											<span className="ml-auto text-muted-foreground">
												{a.name}.{domain.domain}
											</span>
										</Row>
									))
								)}
							</>
						) : (
							<Row>no custom domain</Row>
						)}
					</Panel>
				))}
			</div>
		</main>
	);
}
