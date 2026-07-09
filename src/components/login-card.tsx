export function LoginCard() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-6">
			<div className="flex flex-col items-center gap-2">
				<h1 className="font-semibold text-3xl">Piper Dashboard</h1>
				<p className="text-muted-foreground">
					git push → live HTTPS URL, on hardware you own.
				</p>
			</div>
			<a
				href="/api/auth/login"
				className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-5 py-2.5 text-sm font-medium text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)]"
			>
				Continue with GitHub
			</a>
		</main>
	);
}
