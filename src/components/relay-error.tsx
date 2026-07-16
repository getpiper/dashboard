import { useRouter } from "@tanstack/react-router";

// Relay unreachable / 5xx: the session may be fine, so keep cookies and retry.
export function RelayError() {
	const router = useRouter();
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-3">
			<p>Couldn't reach the relay.</p>
			<button
				type="button"
				onClick={() => router.invalidate()}
				className="rounded-[2px] border border-border bg-secondary px-4 py-2 text-sm"
			>
				Retry
			</button>
		</main>
	);
}
