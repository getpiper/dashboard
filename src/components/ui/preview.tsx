import { Button } from "./button";
import { Panel, PanelHeader } from "./panel";
import { type DeviceStatus, StatusDot } from "./status-dot";

const ROWS: {
	host: string;
	status: DeviceStatus;
	label: string;
	apps: string;
}[] = [
	{ host: "rpi-garage", status: "ok", label: "online", apps: "· 3 apps" },
	{
		host: "rpi-greenhouse",
		status: "warn",
		label: "degraded",
		apps: "· 2 apps",
	},
	{ host: "rpi-shed", status: "idle", label: "offline", apps: "· 0 apps" },
];

export function UiPreview() {
	return (
		<div className="mx-auto max-w-[640px] p-6">
			<div className="mb-1 text-[11px] uppercase tracking-widest text-primary">
				your hardware
			</div>
			<h1 className="mb-4 font-semibold text-base"># boxes</h1>

			<Panel>
				<PanelHeader>hostname</PanelHeader>
				{ROWS.map((r) => (
					<div
						key={r.host}
						className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground [&+&]:border-border [&+&]:border-t"
					>
						<StatusDot status={r.status} />
						<span className="text-foreground">{r.host}</span>
						<span className="text-muted-foreground">{r.apps}</span>
						<StatusDot status={r.status} className="ml-auto">
							{r.label}
						</StatusDot>
					</div>
				))}
			</Panel>

			<div className="mt-4 flex items-center gap-3">
				<Button>enroll a box</Button>
				<Button variant="secondary">deploy app</Button>
			</div>
		</div>
	);
}
