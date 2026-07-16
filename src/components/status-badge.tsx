type BadgeMeta = { label: string; dot: string; pill: string };

const MUTED = "text-muted-foreground border-border bg-secondary";

const STATUS: Record<string, BadgeMeta> = {
	running: {
		label: "Live",
		dot: "bg-status-ok",
		pill: "text-status-ok border-status-ok/30 bg-status-ok/10",
	},
	building: {
		label: "Building",
		dot: "bg-status-warn",
		pill: "text-status-warn border-status-warn/30 bg-status-warn/10",
	},
	failed: {
		label: "Failed",
		dot: "bg-status-danger",
		pill: "text-status-danger border-status-danger/30 bg-status-danger/10",
	},
	stopped: { label: "Stopped", dot: "bg-status-idle", pill: MUTED },
};

const FALLBACK: BadgeMeta = {
	label: "Never deployed",
	dot: "bg-status-idle",
	pill: MUTED,
};

export function StatusBadge({ status }: { status: string }) {
	const meta = STATUS[status] ?? FALLBACK;
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-0.5 font-semibold text-xs ${meta.pill}`}
		>
			<span className={`h-1.5 w-1.5 rounded-[2px] ${meta.dot}`} />
			{meta.label}
		</span>
	);
}
