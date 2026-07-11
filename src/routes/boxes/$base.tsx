import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BoxDetail } from "@/components/box-detail";
import { DomainPanel } from "@/components/domain-panel";
import { RelayError } from "@/components/relay-error";
import { getBox, getDomainFn, removeDomainFn, setDomainFn } from "@/server/fns";

export const Route = createFileRoute("/boxes/$base")({
	loader: async ({ params }) => {
		const box = await getBox({ data: params.base });
		// Domain config is proxied to the box; only fetch it when the box is
		// online (an offline box would 502/503 → BoxOfflineError).
		const domain = box.connected
			? await getDomainFn({ data: params.base })
			: null;
		return { box, domain };
	},
	component: BoxPage,
	errorComponent: RelayError,
});

function BoxPage() {
	const { box, domain } = Route.useLoaderData();
	const router = useRouter();
	return (
		<BoxDetail box={box}>
			{domain && (
				<DomainPanel
					status={domain}
					onSave={async (d, token) => {
						await setDomainFn({ data: { base: box.base, domain: d, token } });
						router.invalidate();
					}}
					onRemove={async () => {
						await removeDomainFn({ data: box.base });
						router.invalidate();
					}}
					refresh={() => {
						router.invalidate();
					}}
				/>
			)}
		</BoxDetail>
	);
}
