import type { Box } from "@/server/relay";

export function BoxList({ boxes }: { boxes: Box[] }) {
	return (
		<main className="page-wrap flex flex-col gap-4 px-4 py-8">
			<h1 className="font-semibold text-2xl">Boxes</h1>
			{boxes.length === 0 ? (
				<p className="text-muted-foreground">
					No boxes yet — run <code>piper connect</code> on your hardware to
					enroll one.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{boxes.map((box) => (
						<li
							key={box.agent}
							className="flex items-center justify-between rounded-lg border border-[var(--line)] px-4 py-3"
						>
							<span className="font-mono text-sm">{box.agent}</span>
							{box.connected ? (
								<span className="flex items-center gap-2 text-sm">
									<span className="h-2 w-2 rounded-full bg-emerald-500" />
									Connected
								</span>
							) : (
								<span className="flex items-center gap-2 text-sm text-muted-foreground">
									<span className="h-2 w-2 rounded-full bg-gray-400" />
									Offline
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
