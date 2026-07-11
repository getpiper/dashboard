import { isRedirect, Link } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

export function githubAppNewUrl(org: string): string {
	const trimmed = org.trim();
	return trimmed
		? `https://github.com/organizations/${encodeURIComponent(trimmed)}/settings/apps/new`
		: "https://github.com/settings/apps/new";
}

// Real DOM side-effect: POST the manifest to GitHub as a top-level navigation.
// Injectable via the submitManifest prop so tests assert the target instead.
function postManifestToGitHub(actionUrl: string, manifest: string): void {
	const form = document.createElement("form");
	form.method = "post";
	form.action = actionUrl;
	const input = document.createElement("input");
	input.type = "hidden";
	input.name = "manifest";
	input.value = manifest;
	form.appendChild(input);
	document.body.appendChild(form);
	form.submit();
}

export type CreateAndLinkInput = {
	name: string;
	repo: string;
	branch: string;
	port?: number;
};

export type ImportWizardProps = {
	base: string;
	pendingCode: string | null;
	getManifest: () => Promise<string>;
	exchange: (code: string) => Promise<void>;
	createAndLink: (input: CreateAndLinkInput) => Promise<void>;
	submitManifest?: (actionUrl: string, manifest: string) => void;
};

type Step = "connect" | "exchanging" | "create" | "push";

const inputClass = "rounded-md border border-[var(--line)] px-3 py-2 text-sm";
const primaryBtn =
	"self-start rounded-md bg-foreground px-4 py-2 text-background text-sm";
const secondaryBtn =
	"rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--chip-bg)]";

export function ImportWizard({
	base,
	pendingCode,
	getManifest,
	exchange,
	createAndLink,
	submitManifest = postManifestToGitHub,
}: ImportWizardProps) {
	const [step, setStep] = useState<Step>(
		pendingCode ? "exchanging" : "connect",
	);
	const [org, setOrg] = useState("");
	const [appName, setAppName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const exchanged = useRef(false);

	// Exchange the GitHub redirect code exactly once, then scrub it from the URL
	// so a refresh won't replay a spent code (mirrors auth-callback.tsx).
	useEffect(() => {
		if (!pendingCode || exchanged.current) return;
		exchanged.current = true;
		exchange(pendingCode)
			.then(() => {
				window.history.replaceState(null, "", `/boxes/${base}/import`);
				setStep("create");
			})
			.catch((err) => {
				if (isRedirect(err)) throw err;
				setError("Couldn't finish connecting to GitHub. Try again.");
				setStep("connect");
			});
	}, [pendingCode, exchange, base]);

	async function onConnect() {
		setError(null);
		try {
			const manifest = await getManifest();
			submitManifest(githubAppNewUrl(org), manifest);
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError("Couldn't start GitHub setup. Try again.");
		}
	}

	async function onCreate(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		const data = new FormData(e.currentTarget);
		const name = String(data.get("name") ?? "").trim();
		const repo = String(data.get("repo") ?? "").trim();
		const branch = String(data.get("branch") ?? "").trim() || "main";
		const portRaw = String(data.get("port") ?? "").trim();
		try {
			await createAndLink({
				name,
				repo,
				branch,
				port: portRaw ? Number(portRaw) : undefined,
			});
			setAppName(name);
			setStep("push");
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't create the app. Try again.");
		}
	}

	return (
		<main className="page-wrap flex flex-col gap-6 px-4 py-8">
			<div className="flex flex-col gap-1">
				<h1 className="font-mono font-semibold text-xl">New project</h1>
				<p className="text-muted-foreground text-sm">{base}</p>
			</div>
			{error && <p className="text-red-600 text-sm">{error}</p>}

			{step === "connect" && (
				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-sm">1 · Connect GitHub</h2>
					<p className="text-muted-foreground text-sm">
						Create the Piper GitHub App on your account, then install it on the
						repo you want to deploy. Already connected this box? Skip ahead.
					</p>
					<label className="flex flex-col gap-1 text-sm">
						Organization (optional)
						<input
							name="org"
							value={org}
							onChange={(e) => setOrg(e.target.value)}
							placeholder="leave blank for your personal account"
							className={inputClass}
						/>
					</label>
					<div className="flex gap-2">
						<button type="button" onClick={onConnect} className={primaryBtn}>
							Connect GitHub
						</button>
						<button
							type="button"
							onClick={() => setStep("create")}
							className={secondaryBtn}
						>
							Skip — already connected
						</button>
					</div>
					<a
						href="https://github.com/settings/installations"
						className="text-muted-foreground text-sm underline"
					>
						Manage installed GitHub Apps
					</a>
				</section>
			)}

			{step === "exchanging" && (
				<p className="text-muted-foreground text-sm">Connecting to GitHub…</p>
			)}

			{step === "create" && (
				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-sm">2 · Create &amp; link app</h2>
					<form onSubmit={onCreate} className="flex flex-col gap-3">
						<label className="flex flex-col gap-1 text-sm">
							App name
							<input name="name" required className={inputClass} />
						</label>
						<label className="flex flex-col gap-1 text-sm">
							Repository (owner/name)
							<input
								name="repo"
								required
								placeholder="getpiper/example"
								className={inputClass}
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							Branch
							<input name="branch" defaultValue="main" className={inputClass} />
						</label>
						<label className="flex flex-col gap-1 text-sm">
							Port (optional)
							<input
								name="port"
								inputMode="numeric"
								placeholder="8080"
								className={inputClass}
							/>
						</label>
						<button type="submit" className={primaryBtn}>
							Create &amp; link
						</button>
					</form>
				</section>
			)}

			{step === "push" && (
				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-sm">3 · Push &amp; go live</h2>
					<p className="text-muted-foreground text-sm">
						Push to the tracked branch to trigger the first deploy — the
						installed GitHub App's webhook builds and runs it:
					</p>
					<pre className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 text-sm">
						git push origin main
					</pre>
					<Link
						to="/boxes/$base/apps/$app"
						params={{ base, app: appName }}
						className={primaryBtn}
					>
						View app
					</Link>
				</section>
			)}
		</main>
	);
}
