import { createFileRoute, isRedirect, useRouter } from "@tanstack/react-router";
import { AppDetail } from "@/components/app-detail";
import { RelayError } from "@/components/relay-error";
import { getBox, getDeploymentLogs, getDeployments } from "@/server/fns";

export const Route = createFileRoute("/boxes/$base_/apps/$app")({
	loader: async ({ params }) => {
		const box = await getBox({ data: params.base });
		const app = box.connected
			? (box.apps.find((a) => a.name === params.app) ?? null)
			: null;
		const deployments = app
			? await getDeployments({ data: { base: params.base, app: params.app } })
			: [];
		return { box, app, deployments };
	},
	component: AppDetailPage,
	errorComponent: RelayError,
});

function AppDetailPage() {
	const { base, app: appName } = Route.useParams();
	const { box, app, deployments } = Route.useLoaderData();
	const router = useRouter();
	return (
		<AppDetail
			appName={appName}
			connected={box.connected}
			app={app}
			deployments={deployments}
			fetchLogs={async (id) => {
				try {
					return await getDeploymentLogs({
						data: { base, app: appName, id },
					});
				} catch (err) {
					if (isRedirect(err)) throw err;
					return "Couldn't load logs.";
				}
			}}
			refresh={() => {
				router.invalidate();
			}}
		/>
	);
}
