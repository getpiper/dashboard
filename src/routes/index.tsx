import { createFileRoute } from "@tanstack/react-router";
import { AppsHome } from "@/components/apps-home";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import { getApps } from "@/server/fns";

export const Route = createFileRoute("/")({
	loader: () => getApps(),
	component: HomePage,
	errorComponent: RelayError,
});

function HomePage() {
	const boxes = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	return <AppsHome boxes={boxes} scope={scope} username={username} />;
}
