import { createFileRoute } from "@tanstack/react-router";
import { AppsHome } from "@/components/apps-home";
import { RelayError } from "@/components/relay-error";
import { getApps } from "@/server/fns";

export const Route = createFileRoute("/")({
	loader: () => getApps(),
	component: HomePage,
	errorComponent: RelayError,
});

function HomePage() {
	const boxes = Route.useLoaderData();
	return <AppsHome boxes={boxes} />;
}
