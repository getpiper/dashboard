const STATUS: Record<string, { label: string; dot: string }> = {
	running: { label: "Running", dot: "bg-status-ok" },
	building: { label: "Building", dot: "bg-status-warn" },
	failed: { label: "Failed", dot: "bg-status-danger" },
	stopped: { label: "Stopped", dot: "bg-status-idle" },
};

export function StatusPill({ status }: { status: string }) {
	const meta = STATUS[status] ?? {
		label: "Never deployed",
		dot: "bg-status-idle",
	};
	return (
		<span className="flex items-center gap-2 text-sm text-muted-foreground">
			<span className={`h-2 w-2 rounded-[2px] ${meta.dot}`} />
			{meta.label}
		</span>
	);
}
