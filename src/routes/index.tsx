import { createFileRoute, redirect } from "@tanstack/react-router";

// Apps are the landing screen (Vercel-like); boxes live under /boxes.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/apps" });
	},
});
