import { createFileRoute } from "@tanstack/react-router";
import { handleLogin } from "@/server/auth";
import { relayUrl } from "@/server/relay";

export const Route = createFileRoute("/api/auth/login")({
	server: {
		handlers: {
			GET: ({ request }) => handleLogin(request, relayUrl()),
		},
	},
});
