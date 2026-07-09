import { useEffect, useRef, useState } from "react";

// Transient fragment handoff (see the phase-0 design doc): read the
// credential from the URL fragment exactly once, exchange it for httpOnly
// cookies via POST /api/auth/session, and scrub the fragment from history.
export function AuthCallback({ onDone }: { onDone: () => void }) {
	const ran = useRef(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (ran.current) return;
		ran.current = true;
		const params = new URLSearchParams(window.location.hash.slice(1));
		const credential = params.get("credential");
		const username = params.get("username") ?? "";
		if (!credential) {
			setFailed(true);
			return;
		}
		window.history.replaceState(null, "", window.location.pathname);
		fetch("/api/auth/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ credential, username }),
		})
			.then((res) => {
				if (res.ok) {
					onDone();
				} else {
					setFailed(true);
				}
			})
			.catch(() => setFailed(true));
	}, [onDone]);

	if (failed) {
		return (
			<main className="flex min-h-screen flex-col items-center justify-center gap-3">
				<p>Sign-in failed.</p>
				<a href="/login" className="underline">
					Back to login
				</a>
			</main>
		);
	}
	return (
		<main className="flex min-h-screen items-center justify-center">
			<p className="text-muted-foreground">Signing you in…</p>
		</main>
	);
}
