import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoginCard() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-6">
			<div className="flex flex-col items-center gap-2">
				<h1 className="font-semibold text-3xl">Piper Dashboard</h1>
				<p className="text-muted-foreground">
					git push → live HTTPS URL, on hardware you own.
				</p>
			</div>
			<a
				href="/api/auth/login"
				className={cn(
					buttonVariants({ variant: "secondary", size: "lg" }),
					"gap-2 px-5 py-2.5 no-underline",
				)}
			>
				Continue with GitHub
			</a>
		</main>
	);
}
