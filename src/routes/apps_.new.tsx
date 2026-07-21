import { createFileRoute } from "@tanstack/react-router";
import { ImportWizard } from "@/components/import-wizard";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import {
	createAndLinkApp,
	exchangeGithubApp,
	getApps,
	getGithubManifest,
	getGithubRepos,
	getGithubStatus,
} from "@/server/fns";

export const Route = createFileRoute("/apps_/new")({
	validateSearch: (
		search: Record<string, unknown>,
	): { code?: string; box?: string } => ({
		code: typeof search.code === "string" ? search.code : undefined,
		box: typeof search.box === "string" ? search.box : undefined,
	}),
	loader: async () => {
		const [boxes, status] = await Promise.all([getApps(), getGithubStatus()]);
		return { boxes, status };
	},
	component: NewAppPage,
	errorComponent: RelayError,
});

function NewAppPage() {
	const { boxes, status } = Route.useLoaderData();
	const { code, box } = Route.useSearch();
	const { scope, username } = useOrgScope();
	const scoped = boxes
		.filter((b) =>
			scope === "personal" ? b.owner === username : b.owner === scope,
		)
		.map((b) => ({ base: b.base, connected: b.connected }));
	return (
		<ImportWizard
			boxes={scoped}
			initialBase={box ?? null}
			pendingCode={code ?? null}
			status={status}
			getRepos={() => getGithubRepos()}
			getManifest={(base) =>
				getGithubManifest({
					data: {
						base,
						redirectUrl: `${window.location.origin}/apps/new?box=${encodeURIComponent(base)}`,
					},
				})
			}
			exchange={(base, c) => exchangeGithubApp({ data: { base, code: c } })}
			createAndLink={(base, input) =>
				createAndLinkApp({ data: { base, ...input } })
			}
		/>
	);
}
