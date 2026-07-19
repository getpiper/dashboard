import { useState } from "react";
import { HintBar } from "@/components/ui/hint-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Row } from "@/components/ui/row";
import { type DeviceStatus, StatusDot } from "@/components/ui/status-dot";
import type { AppDomainStatus, BoxAppDomains } from "@/server/relay";

function domainDeviceStatus(status: string): DeviceStatus {
	switch (status) {
		case "active":
			return "ok";
		case "pending":
		case "issuing":
			return "warn";
		case "failed":
			return "danger";
		default:
			return "idle";
	}
}

function DomainCell({ d }: { d: AppDomainStatus }) {
	return (
		<>
			<a
				href={`https://${d.domain}`}
				className="text-primary no-underline hover:underline"
			>
				{d.domain}
			</a>
			<span className="ml-auto inline-flex items-center gap-3">
				<span>{d.dnsOk ? "dns ok" : "dns pending"}</span>
				<StatusDot status={domainDeviceStatus(d.status)}>
					{d.status || "pending"}
				</StatusDot>
			</span>
		</>
	);
}

function AddDomainCell({
	base,
	app,
	onAdd,
}: {
	base: string;
	app: string;
	onAdd: (base: string, app: string, domain: string) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [domain, setDomain] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!editing) {
		return (
			<button
				type="button"
				onClick={() => setEditing(true)}
				className="text-primary hover:underline"
			>
				add domain
			</button>
		);
	}

	const submit = async () => {
		if (!domain.trim() || busy) return;
		setBusy(true);
		setError(null);
		try {
			await onAdd(base, app, domain.trim());
			setEditing(false);
			setDomain("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "couldn't add domain");
		} finally {
			setBusy(false);
		}
	};

	return (
		<span className="inline-flex items-center gap-2">
			<input
				aria-label={`domain for ${app}`}
				value={domain}
				onChange={(e) => setDomain(e.target.value)}
				placeholder="shop.example.com"
				className="rounded-[2px] border border-input bg-transparent px-2 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<button
				type="button"
				onClick={submit}
				disabled={busy}
				className="text-primary hover:underline disabled:opacity-50"
			>
				add
			</button>
			{error != null && <span className="text-status-danger">{error}</span>}
		</span>
	);
}

export function DomainsList({
	items,
	scope,
	username,
	onAdd,
}: {
	items: BoxAppDomains[];
	scope: string;
	username: string | null;
	onAdd: (base: string, app: string, domain: string) => Promise<void>;
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

	const domainCount = scoped.reduce(
		(n, { domains }) =>
			n + Object.values(domains).reduce((m, list) => m + list.length, 0),
		0,
	);

	return (
		<main className="flex flex-col gap-5 py-8">
			<PageHeader
				kicker="your endpoints"
				title="domains"
				subtitle={`${domainCount} custom domain${domainCount === 1 ? "" : "s"} · ${scoped.length} boxes`}
			/>
			<div className="flex flex-col gap-4">
				{scoped.map(({ box, domains }) => (
					<Panel key={box.base}>
						<PanelHeader className="normal-case tracking-normal">
							<span className="text-foreground">{box.base}</span>
						</PanelHeader>
						{box.apps.length === 0 ? (
							<Row>no apps served</Row>
						) : (
							box.apps.flatMap((a) => {
								const list = domains[a.name] ?? [];
								if (list.length === 0) {
									return (
										<Row key={a.name}>
											<span className="text-foreground">{a.name}</span>
											<AddDomainCell
												base={box.base}
												app={a.name}
												onAdd={onAdd}
											/>
										</Row>
									);
								}
								return list.map((d) => (
									<Row key={`${a.name}/${d.domain}`}>
										<span className="text-foreground">{a.name}</span>
										<DomainCell d={d} />
									</Row>
								));
							})
						)}
					</Panel>
				))}
			</div>
		</main>
	);
}
