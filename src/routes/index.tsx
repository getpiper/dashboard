import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BoxList } from "@/components/box-list";
import { getBoxes } from "@/server/fns";

export const Route = createFileRoute("/")({
	loader: () => getBoxes(),
	component: HomePage,
	errorComponent: RelayError,
});

function HomePage() {
	const boxes = Route.useLoaderData();
	return <BoxList boxes={boxes} />;
}

// Relay unreachable / 5xx: the session may be fine, so keep cookies and retry.
function RelayError() {
	const router = useRouter();
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-3">
			<p>Couldn't reach the relay.</p>
			<button
				type="button"
				onClick={() => router.invalidate()}
				className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm"
			>
				Retry
			</button>
		</main>
	);
}
