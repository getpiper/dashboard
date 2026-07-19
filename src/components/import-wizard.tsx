import { isRedirect, Link } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

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

export type WizardBox = { base: string; connected: boolean };

export type ImportWizardProps = {
	boxes: WizardBox[];
	// Box preselected by the URL (survives the GitHub redirect round-trip).
	initialBase: string | null;
	pendingCode: string | null;
	getManifest: (base: string) => Promise<string>;
	exchange: (base: string, code: string) => Promise<void>;
	createAndLink: (base: string, input: CreateAndLinkInput) => Promise<void>;
	submitManifest?: (actionUrl: string, manifest: string) => void;
};

type Step = "connect" | "exchanging" | "create" | "push";

const STEPS: { key: Exclude<Step, "exchanging">; label: string }[] = [
	{ key: "connect", label: "Connect GitHub" },
	{ key: "create", label: "Create app" },
	{ key: "push", label: "Deploy" },
];

const primaryBtn =
	"self-start rounded-[2px] bg-primary px-4 py-2 text-primary-foreground text-sm hover:bg-primary/90";
const actionBtn =
	"rounded-[2px] border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50";

function stepIndex(step: Step): number {
	if (step === "exchanging") return 0;
	return STEPS.findIndex((s) => s.key === step);
}

function Stepper({
	step,
	onGo,
}: {
	step: Step;
	onGo: (step: Exclude<Step, "exchanging">) => void;
}) {
	const cur = stepIndex(step);
	return (
		<div className="flex items-center gap-3">
			{STEPS.map((s, i) => {
				const done = i < cur;
				const active = i === cur;
				return (
					<span key={s.key} className="contents">
						<button
							type="button"
							onClick={() => onGo(s.key)}
							className="flex items-center gap-2"
						>
							<span
								className={`inline-flex h-6 w-6 items-center justify-center rounded-[2px] border font-semibold text-xs ${
									done
										? "border-primary bg-primary text-primary-foreground"
										: active
											? "border-primary text-primary"
											: "border-border text-muted-foreground"
								}`}
							>
								{done ? "✓" : i + 1}
							</span>
							<span
								className={`text-[13px] ${
									done || active ? "text-foreground" : "text-muted-foreground"
								} ${active ? "font-semibold" : ""}`}
							>
								{s.label}
							</span>
						</button>
						{i < STEPS.length - 1 && (
							<span
								className={`h-px w-8 flex-none ${
									i < cur ? "bg-primary" : "bg-border"
								}`}
							/>
						)}
					</span>
				);
			})}
		</div>
	);
}

function BoxPicker({
	boxes,
	base,
	onPick,
}: {
	boxes: WizardBox[];
	base: string;
	onPick: (base: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected = boxes.find((b) => b.base === base);
	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="inline-flex items-center gap-2 rounded-[2px] border border-border bg-secondary px-2.5 py-1 text-[13px] text-foreground"
			>
				<span
					className={`h-2 w-2 flex-none rounded-[2px] ${
						selected?.connected ? "bg-status-ok" : "bg-status-idle"
					}`}
				/>
				{base || "no boxes"}
				<span className="text-[10px] text-muted-foreground">▼</span>
			</button>
			{open && (
				<div className="absolute left-0 z-50 mt-1 flex w-60 flex-col rounded-[2px] border border-border bg-card p-1">
					{boxes.map((b) => (
						<button
							key={b.base}
							type="button"
							onClick={() => {
								onPick(b.base);
								setOpen(false);
							}}
							className="flex items-center gap-2 rounded-[2px] px-2.5 py-2 text-left text-[13px] hover:bg-secondary"
						>
							<span
								className={`h-2 w-2 flex-none rounded-[2px] ${
									b.connected ? "bg-status-ok" : "bg-status-idle"
								}`}
							/>
							<span className="flex-1 truncate">{b.base}</span>
							<span className="text-[11px] text-status-idle">
								{b.connected ? "connected" : "offline"}
							</span>
							<span className="w-2.5 text-primary">
								{b.base === base ? "✓" : ""}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export function ImportWizard({
	boxes,
	initialBase,
	pendingCode,
	getManifest,
	exchange,
	createAndLink,
	submitManifest = postManifestToGitHub,
}: ImportWizardProps) {
	const [base, setBase] = useState(() => {
		if (initialBase && boxes.some((b) => b.base === initialBase)) {
			return initialBase;
		}
		return (boxes.find((b) => b.connected) ?? boxes[0])?.base ?? "";
	});
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
		exchange(base, pendingCode)
			.then(() => {
				window.history.replaceState(
					null,
					"",
					`/apps/new?box=${encodeURIComponent(base)}`,
				);
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
			const manifest = await getManifest(base);
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
			await createAndLink(base, {
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
		<main className="flex max-w-[640px] flex-col gap-6 py-8">
			<div className="flex flex-col gap-1.5">
				<PageHeader kicker="deploy" title="new app" />
				<div className="flex items-center gap-2 text-[13px] text-muted-foreground">
					deploying to
					<BoxPicker boxes={boxes} base={base} onPick={setBase} />
				</div>
			</div>

			<Stepper step={step} onGo={setStep} />

			{error && <p className="text-destructive text-sm">{error}</p>}

			{step === "connect" && (
				<Panel className="flex flex-col gap-4 p-5">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-sm">Connect GitHub</h2>
						<p className="text-muted-foreground text-sm">
							Create the Piper GitHub App on your account, then install it on
							the repo you want to deploy. Already connected this box? Skip
							ahead.
						</p>
					</div>
					<Field label="Organization (optional)">
						<Input
							name="org"
							value={org}
							onChange={(e) => setOrg(e.target.value)}
							placeholder="leave blank for your personal account"
						/>
					</Field>
					<div className="flex items-center gap-2">
						<button type="button" onClick={onConnect} className={primaryBtn}>
							Connect GitHub
						</button>
						<button
							type="button"
							onClick={() => setStep("create")}
							className={actionBtn}
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
				</Panel>
			)}

			{step === "exchanging" && (
				<p className="text-muted-foreground text-sm">Connecting to GitHub…</p>
			)}

			{step === "create" && (
				<Panel className="flex flex-col gap-4 p-5">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-sm">Create app</h2>
						<p className="text-muted-foreground text-sm">
							Make sure the Piper GitHub App is installed on the repo you want
							to deploy — without it, pushing won't trigger a build.{" "}
							<a
								href="https://github.com/settings/installations"
								className="text-muted-foreground underline"
							>
								Manage installed GitHub Apps
							</a>
						</p>
					</div>
					<form onSubmit={onCreate} className="flex flex-col gap-3.5">
						<Field label="App name">
							<Input name="name" required placeholder="my-app" />
						</Field>
						<Field label="Repository (owner/name)">
							<Input name="repo" required placeholder="getpiper/example" />
						</Field>
						<div className="grid grid-cols-2 gap-3.5">
							<Field label="Branch">
								<Input name="branch" defaultValue="main" />
							</Field>
							<Field label="Port (optional)">
								<Input name="port" inputMode="numeric" placeholder="8080" />
							</Field>
						</div>
						<button type="submit" className={primaryBtn}>
							Create &amp; link
						</button>
					</form>
				</Panel>
			)}

			{step === "push" && (
				<Panel className="flex flex-col gap-4 p-5">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-sm">Deploy</h2>
						<p className="text-muted-foreground text-sm">
							Push to the tracked branch to trigger the first deploy — the
							installed GitHub App's webhook builds and runs it:
						</p>
					</div>
					<pre className="overflow-x-auto rounded-[2px] border border-border bg-secondary px-3.5 py-3 text-sm">
						<span className="text-primary">$ </span>git push origin main
					</pre>
					<Link
						to="/boxes/$base/apps/$app"
						params={{ base, app: appName }}
						className={primaryBtn}
					>
						View app →
					</Link>
				</Panel>
			)}
		</main>
	);
}
