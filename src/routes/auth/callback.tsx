import { createFileRoute } from "@tanstack/react-router";
import { AuthCallback } from "@/components/auth-callback";

export const Route = createFileRoute("/auth/callback")({
	component: CallbackPage,
});

function CallbackPage() {
	// Full-page navigation so all loaders re-run with the fresh session cookie.
	return <AuthCallback onDone={() => window.location.replace("/")} />;
}
