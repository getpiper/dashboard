import { createFileRoute } from "@tanstack/react-router";
import { UiPreview } from "@/components/ui/preview";

export const Route = createFileRoute("/ui")({
	component: UiPreviewPage,
});

function UiPreviewPage() {
	return (
		<div className="terminal min-h-screen">
			<UiPreview />
		</div>
	);
}
