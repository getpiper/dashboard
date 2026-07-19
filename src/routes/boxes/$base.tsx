import { createFileRoute } from "@tanstack/react-router";
import { BoxDetail } from "@/components/box-detail";
import { RelayError } from "@/components/relay-error";
import { getBox } from "@/server/fns";

export const Route = createFileRoute("/boxes/$base")({
	loader: ({ params }) => getBox({ data: params.base }),
	component: BoxPage,
	errorComponent: RelayError,
});

function BoxPage() {
	const box = Route.useLoaderData();
	return <BoxDetail box={box} />;
}
