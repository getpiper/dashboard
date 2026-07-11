import { createFileRoute } from "@tanstack/react-router";
import { ImportWizard } from "@/components/import-wizard";
import { RelayError } from "@/components/relay-error";
import {
	createAndLinkApp,
	exchangeGithubApp,
	getGithubManifest,
} from "@/server/fns";

export const Route = createFileRoute("/boxes/$base_/import")({
	validateSearch: (search: Record<string, unknown>): { code?: string } => ({
		code: typeof search.code === "string" ? search.code : undefined,
	}),
	component: ImportPage,
	errorComponent: RelayError,
});

function ImportPage() {
	const { base } = Route.useParams();
	const { code } = Route.useSearch();
	return (
		<ImportWizard
			base={base}
			pendingCode={code ?? null}
			getManifest={() =>
				getGithubManifest({
					data: {
						base,
						redirectUrl: `${window.location.origin}/boxes/${base}/import`,
					},
				})
			}
			exchange={(c) => exchangeGithubApp({ data: { base, code: c } })}
			createAndLink={(input) => createAndLinkApp({ data: { base, ...input } })}
		/>
	);
}
