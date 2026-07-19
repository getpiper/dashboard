import { createFileRoute, useRouter } from "@tanstack/react-router";
import { DomainsList } from "@/components/domains-list";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import { addAppDomainFn, getAppDomainsFn } from "@/server/fns";

export const Route = createFileRoute("/domains")({
	loader: () => getAppDomainsFn(),
	component: DomainsPage,
	errorComponent: RelayError,
});

function DomainsPage() {
	const items = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	const router = useRouter();
	return (
		<DomainsList
			items={items}
			scope={scope}
			username={username}
			onAdd={async (base, app, domain) => {
				await addAppDomainFn({ data: { base, app, domain } });
				await router.invalidate();
			}}
		/>
	);
}
