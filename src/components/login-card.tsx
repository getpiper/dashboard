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
				className="inline-flex items-center gap-2 rounded-[2px] border border-primary bg-transparent px-5 py-2.5 text-sm font-medium text-primary no-underline"
			>
				Continue with GitHub
			</a>
		</main>
	);
}
