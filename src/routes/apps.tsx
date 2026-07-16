import { createFileRoute } from "@tanstack/react-router";
import { AppsList } from "@/components/apps-list";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import { getApps } from "@/server/fns";

export const Route = createFileRoute("/apps")({
	loader: () => getApps(),
	component: AppsPage,
	errorComponent: RelayError,
});

function AppsPage() {
	const boxes = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	return <AppsList boxes={boxes} scope={scope} username={username} />;
}
