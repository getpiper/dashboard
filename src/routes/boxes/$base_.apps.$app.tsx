import { createFileRoute, isRedirect, useRouter } from "@tanstack/react-router";
import { AppDetail } from "@/components/app-detail";
import { RelayError } from "@/components/relay-error";
import {
	deleteAppFn,
	getAppDomains,
	getBox,
	getDeploymentLogs,
	getDeployments,
	startAppFn,
	stopAppFn,
} from "@/server/fns";

export const Route = createFileRoute("/boxes/$base_/apps/$app")({
	loader: async ({ params }) => {
		const box = await getBox({ data: params.base });
		const app = box.connected
			? (box.apps.find((a) => a.name === params.app) ?? null)
			: null;
		const [deployments, domains] = app
			? await Promise.all([
					getDeployments({ data: { base: params.base, app: params.app } }),
					getAppDomains({ data: { base: params.base, app: params.app } }),
				])
			: [[], []];
		return { box, app, deployments, domains };
	},
	component: AppDetailPage,
	errorComponent: RelayError,
});

function AppDetailPage() {
	const { base, app: appName } = Route.useParams();
	const { box, app, deployments, domains } = Route.useLoaderData();
	const router = useRouter();
	return (
		<AppDetail
			appName={appName}
			connected={box.connected}
			app={app}
			deployments={deployments}
			domains={domains}
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
			onStop={async () => {
				await stopAppFn({ data: { base, name: appName } });
				router.invalidate();
			}}
			onStart={async () => {
				await startAppFn({ data: { base, name: appName } });
				router.invalidate();
			}}
			onDelete={async () => {
				await deleteAppFn({ data: { base, name: appName } });
				await router.navigate({ to: "/boxes/$base", params: { base } });
			}}
		/>
	);
}
