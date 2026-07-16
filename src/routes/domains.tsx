import { createFileRoute } from "@tanstack/react-router";
import { DomainsList } from "@/components/domains-list";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import { getDomainsFn } from "@/server/fns";

export const Route = createFileRoute("/domains")({
	loader: () => getDomainsFn(),
	component: DomainsPage,
	errorComponent: RelayError,
});

function DomainsPage() {
	const items = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	return <DomainsList items={items} scope={scope} username={username} />;
}
