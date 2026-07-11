const STATUS: Record<string, { label: string; dot: string }> = {
	running: { label: "Running", dot: "bg-emerald-500" },
	building: { label: "Building", dot: "bg-amber-500" },
	failed: { label: "Failed", dot: "bg-red-500" },
	stopped: { label: "Stopped", dot: "bg-gray-400" },
};

export function StatusPill({ status }: { status: string }) {
	const meta = STATUS[status] ?? {
		label: "Never deployed",
		dot: "bg-gray-400",
	};
	return (
		<span className="flex items-center gap-2 text-sm text-muted-foreground">
			<span className={`h-2 w-2 rounded-full ${meta.dot}`} />
			{meta.label}
		</span>
	);
}
