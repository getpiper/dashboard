type BadgeMeta = { label: string; dot: string; pill: string };

// Colours are semantic and constant across light/dark, matching the mockup.
const MUTED =
	"text-[var(--sea-ink-soft)] bg-[var(--chip-bg)] border-[var(--chip-line)]";

const STATUS: Record<string, BadgeMeta> = {
	running: {
		label: "Live",
		dot: "bg-[#10b981]",
		pill: "text-[#0b7a5b] bg-[rgba(16,185,129,0.13)] border-[rgba(16,185,129,0.28)]",
	},
	building: {
		label: "Building",
		dot: "bg-[#f59e0b]",
		pill: "text-[#a15c07] bg-[rgba(245,158,11,0.14)] border-[rgba(245,158,11,0.3)]",
	},
	failed: {
		label: "Failed",
		dot: "bg-[#e5484d]",
		pill: "text-[#b42318] bg-[rgba(229,72,77,0.13)] border-[rgba(229,72,77,0.3)]",
	},
	stopped: { label: "Stopped", dot: "bg-gray-400", pill: MUTED },
};

const FALLBACK: BadgeMeta = {
	label: "Never deployed",
	dot: "bg-gray-400",
	pill: MUTED,
};

export function StatusBadge({ status }: { status: string }) {
	const meta = STATUS[status] ?? FALLBACK;
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold text-xs ${meta.pill}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
			{meta.label}
		</span>
	);
}
