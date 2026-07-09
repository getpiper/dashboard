import { createFileRoute } from "@tanstack/react-router";
import { handleSession } from "@/server/auth";

export const Route = createFileRoute("/api/auth/session")({
	server: {
		handlers: {
			POST: ({ request }) => handleSession(request),
		},
	},
});
