import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page";
import { getSession } from "../server/fns";

// Public marketing landing at /. Authenticated visitors go straight to /apps.
export const Route = createFileRoute("/")({
	staticData: { chrome: false },
	beforeLoad: async () => {
		const session = await getSession();
		if (session) throw redirect({ to: "/apps" });
	},
	component: LandingPage,
});
