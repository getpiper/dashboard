export default function SessionControls({
	username,
}: {
	username: string | null;
}) {
	if (!username) return null;
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-muted-foreground">{username}</span>
			<button
				type="button"
				onClick={logout}
				className="rounded-[2px] border border-border bg-secondary px-3 py-1.5 text-sm"
			>
				Log out
			</button>
		</div>
	);
}

function logout() {
	fetch("/api/auth/logout", { method: "POST" }).then(() => {
		// Full-page navigation so all loaders drop the dead session.
		window.location.href = "/login";
	});
}
