import { isRedirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { type DeviceStatus, StatusDot } from "@/components/ui/status-dot";
import { relativeTime } from "@/lib/relative-time";
import type { App, AppDomainStatus, Deployment } from "@/server/relay";
import { StatusPill } from "./status-pill";

export type AppDetailProps = {
	appName: string;
	connected: boolean;
	app: App | null;
	deployments: Deployment[];
	domains?: AppDomainStatus[];
	fetchLogs: (id: string) => Promise<string>;
	refresh: () => void;
	onStop: () => Promise<void>;
	onStart?: () => Promise<void>;
	onDelete: () => Promise<void>;
};

function domainDeviceStatus(status: string): DeviceStatus {
	switch (status) {
		case "active":
			return "ok";
		case "pending":
		case "issuing":
			return "warn";
		case "failed":
			return "danger";
		default:
			return "idle";
	}
}

function DomainLine({ d }: { d: AppDomainStatus }) {
	// Healthy domains read clean; only surface cert/dns status when something
	// still needs attention (mirrors the apps grid / domains screens).
	const healthy = d.status === "active" && d.dnsOk;
	return (
		<div className="flex flex-wrap items-center gap-2.5 text-[13px]">
			<a href={`https://${d.domain}`} className="text-primary no-underline">
				{d.domain}
			</a>
			{!healthy && (
				<>
					<StatusDot status={domainDeviceStatus(d.status)}>
						{d.status || "pending"}
					</StatusDot>
					<span className="text-status-idle">·</span>
					<span className="text-muted-foreground">
						{d.dnsOk ? "dns ok" : "dns pending"}
					</span>
				</>
			)}
		</div>
	);
}

export function AppDetail({
	appName,
	connected,
	app,
	deployments,
	domains = [],
	fetchLogs,
	refresh,
	onStop,
	onStart = async () => {},
	onDelete,
}: AppDetailProps) {
	if (!connected) {
		return (
			<main className="flex flex-col gap-6 py-8">
				<p className="text-muted-foreground">
					This box is offline — its apps can't be reached.
				</p>
			</main>
		);
	}

	if (!app) {
		return (
			<main className="flex flex-col gap-6 py-8">
				<p className="text-muted-foreground">
					App "{appName}" not found on this box.
				</p>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-6 py-8">
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-3">
					<h1 className="font-mono font-semibold text-xl">{app.name}</h1>
					<StatusPill status={app.status} />
				</div>
				{app.hostname ? (
					<a href={`https://${app.hostname}`} className="text-primary text-sm">
						{app.hostname}
					</a>
				) : (
					<span className="text-muted-foreground text-sm">
						Not deployed yet
					</span>
				)}
				{domains.map((d) => (
					<DomainLine key={d.domain} d={d} />
				))}
				<p className="text-muted-foreground text-sm">
					{app.repo} · {app.branch}
				</p>
				<AppActions
					name={app.name}
					status={app.status}
					onStop={onStop}
					onStart={onStart}
					onDelete={onDelete}
				/>
			</div>

			<section className="flex flex-col gap-2">
				<h2 className="font-semibold text-sm">Deployments</h2>
				{deployments.length === 0 ? (
					<p className="text-muted-foreground text-sm">No deployments yet.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{deployments.map((d) => (
							<DeploymentRow
								key={d.id}
								deployment={d}
								repo={app.repo}
								fetchLogs={fetchLogs}
								refresh={refresh}
							/>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}

function AppActions({
	name,
	status,
	onStop,
	onStart,
	onDelete,
}: {
	name: string;
	status: string;
	onStop: () => Promise<void>;
	onStart: () => Promise<void>;
	onDelete: () => Promise<void>;
}) {
	const [stopping, setStopping] = useState(false);
	const [starting, setStarting] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleStop() {
		setError(null);
		setStopping(true);
		try {
			await onStop();
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't stop the app.");
		} finally {
			setStopping(false);
		}
	}

	async function handleStart() {
		setError(null);
		setStarting(true);
		try {
			await onStart();
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't start the app.");
		} finally {
			setStarting(false);
		}
	}

	async function handleDelete() {
		setError(null);
		setDeleting(true);
		try {
			await onDelete();
			// On success the parent navigates away and unmounts this component,
			// so no state reset here.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't delete the app.");
			setDeleting(false);
		}
	}

	return (
		<div className="mt-1 flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				{status === "stopped" ? (
					<Button
						type="button"
						onClick={handleStart}
						disabled={starting}
						bracketed={false}
					>
						{starting ? "Starting…" : "Start"}
					</Button>
				) : (
					<Button
						type="button"
						variant="neutral"
						onClick={handleStop}
						disabled={stopping}
						bracketed={false}
					>
						{stopping ? "Stopping…" : "Stop"}
					</Button>
				)}
				<Button
					type="button"
					variant="neutral"
					onClick={() => setConfirming(true)}
					bracketed={false}
				>
					Delete app
				</Button>
			</div>

			{confirming && (
				<div className="flex flex-col gap-2 rounded-[2px] border border-destructive/40 p-3">
					<p className="text-destructive text-sm">
						This permanently deletes <span className="font-mono">{name}</span>{" "}
						and its deployments. This can't be undone — type the app name to
						confirm.
					</p>
					<input
						aria-label="Confirm app name"
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						className={inputClass}
					/>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="neutral"
							onClick={() => {
								setConfirming(false);
								setTyped("");
							}}
							bracketed={false}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={typed !== name || deleting}
							bracketed={false}
						>
							{deleting ? "Deleting…" : "Delete"}
						</Button>
					</div>
				</div>
			)}

			{error && <p className="text-destructive text-sm">{error}</p>}
		</div>
	);
}

function DeploymentRow({
	deployment,
	repo,
	fetchLogs,
	refresh,
}: {
	deployment: Deployment;
	repo: string;
	fetchLogs: (id: string) => Promise<string>;
	refresh: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<li className="rounded-[2px] border border-border">
			{/* biome-ignore lint/a11y/useSemanticElements: a <button> can't contain
			    the interactive PR-preview <a>, so this toggle row is a
			    div[role=button] with keyboard handling. */}
			<div
				role="button"
				tabIndex={0}
				onClick={() => setOpen((o) => !o)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setOpen((o) => !o);
					}
				}}
				className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
			>
				<span className="flex items-center gap-3">
					<span className="font-mono text-sm">{deployment.id.slice(0, 8)}</span>
					{deployment.pr > 0 ? (
						<a
							href={`https://github.com/${repo}/pull/${deployment.pr}`}
							onClick={(e) => e.stopPropagation()}
							className="text-sm underline"
						>
							PR #{deployment.pr}
						</a>
					) : (
						<span className="text-muted-foreground text-sm">Production</span>
					)}
				</span>
				<span className="flex items-center gap-3">
					<StatusPill status={deployment.status} />
					<span className="text-muted-foreground text-xs">
						{relativeTime(deployment.createdAt)}
					</span>
				</span>
			</div>
			{open && (
				<LogPanel
					status={deployment.status}
					fetchLogs={() => fetchLogs(deployment.id)}
					refresh={refresh}
				/>
			)}
		</li>
	);
}

function LogPanel({
	status,
	fetchLogs,
	refresh,
}: {
	status: string;
	fetchLogs: () => Promise<string>;
	refresh: () => void;
}) {
	const logs = useLiveTail(status, fetchLogs, refresh);
	return (
		<pre className="max-h-96 overflow-auto border-border border-t bg-secondary px-4 py-3 font-mono text-xs">
			{logs || "No logs."}
		</pre>
	);
}

function useLiveTail(
	status: string,
	fetchLogs: () => Promise<string>,
	refresh: () => void,
	intervalMs = 2000,
): string {
	const [logs, setLogs] = useState("");
	const fetchRef = useRef(fetchLogs);
	fetchRef.current = fetchLogs;
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	useEffect(() => {
		let live = true;
		const load = () =>
			fetchRef.current().then((t) => {
				if (live) setLogs(t);
			});
		load();
		if (status !== "building") {
			return () => {
				live = false;
			};
		}
		const id = setInterval(() => {
			load();
			refreshRef.current();
		}, intervalMs);
		return () => {
			live = false;
			clearInterval(id);
		};
	}, [status, intervalMs]);
	return logs;
}
