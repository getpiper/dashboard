import { createFileRoute } from "@tanstack/react-router";
import { handleLogout } from "@/server/auth";

export const Route = createFileRoute("/api/auth/logout")({
	server: {
		handlers: {
			POST: () => handleLogout(),
		},
	},
});
