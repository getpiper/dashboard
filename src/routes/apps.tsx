import { createFileRoute } from "@tanstack/react-router";
import { AppsList } from "@/components/apps-list";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import { getAppDomainsFn } from "@/server/fns";

export const Route = createFileRoute("/apps")({
	loader: () => getAppDomainsFn(),
	component: AppsPage,
	errorComponent: RelayError,
});

function AppsPage() {
	const items = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	return <AppsList items={items} scope={scope} username={username} />;
}
