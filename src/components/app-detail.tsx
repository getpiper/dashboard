import { isRedirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/lib/relative-time";
import type { App, Deployment } from "@/server/relay";
import { StatusPill } from "./status-pill";

const actionBtn =
	"rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)] disabled:opacity-50";
const dangerBtn =
	"rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50";
const confirmInput = "rounded-md border border-[var(--line)] px-3 py-2 text-sm";

export type AppDetailProps = {
	appName: string;
	connected: boolean;
	app: App | null;
	deployments: Deployment[];
	fetchLogs: (id: string) => Promise<string>;
	refresh: () => void;
	onStop: () => Promise<void>;
	onDelete: () => Promise<void>;
};

export function AppDetail({
	appName,
	connected,
	app,
	deployments,
	fetchLogs,
	refresh,
	onStop,
	onDelete,
}: AppDetailProps) {
	if (!connected) {
		return (
			<main className="page-wrap flex flex-col gap-4 px-4 py-8">
				<p className="text-muted-foreground">
					This box is offline — its apps can't be reached.
				</p>
			</main>
		);
	}

	if (!app) {
		return (
			<main className="page-wrap flex flex-col gap-4 px-4 py-8">
				<p className="text-muted-foreground">
					App "{appName}" not found on this box.
				</p>
			</main>
		);
	}

	return (
		<main className="page-wrap flex flex-col gap-6 px-4 py-8">
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center gap-3">
					<h1 className="font-mono font-semibold text-xl">{app.name}</h1>
					<StatusPill status={app.status} />
				</div>
				{app.hostname ? (
					<a
						href={`https://${app.hostname}`}
						className="text-muted-foreground text-sm underline"
					>
						{app.hostname}
					</a>
				) : (
					<span className="text-muted-foreground text-sm">
						Not deployed yet
					</span>
				)}
				<p className="text-muted-foreground text-sm">
					{app.repo} · {app.branch}
				</p>
				<AppActions
					name={app.name}
					status={app.status}
					onStop={onStop}
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
	onDelete,
}: {
	name: string;
	status: string;
	onStop: () => Promise<void>;
	onDelete: () => Promise<void>;
}) {
	const [stopping, setStopping] = useState(false);
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
				{status !== "stopped" && (
					<button
						type="button"
						onClick={handleStop}
						disabled={stopping}
						className={actionBtn}
					>
						{stopping ? "Stopping…" : "Stop"}
					</button>
				)}
				<button
					type="button"
					onClick={() => setConfirming(true)}
					className={actionBtn}
				>
					Delete app
				</button>
			</div>

			{confirming && (
				<div className="flex flex-col gap-2 rounded-lg border border-red-600/40 p-3">
					<p className="text-red-600 text-sm">
						This permanently deletes <span className="font-mono">{name}</span>{" "}
						and its deployments. This can't be undone — type the app name to
						confirm.
					</p>
					<input
						aria-label="Confirm app name"
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						className={confirmInput}
					/>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => {
								setConfirming(false);
								setTyped("");
							}}
							className={actionBtn}
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleDelete}
							disabled={typed !== name || deleting}
							className={dangerBtn}
						>
							{deleting ? "Deleting…" : "Delete"}
						</button>
					</div>
				</div>
			)}

			{error && <p className="text-red-600 text-sm">{error}</p>}
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
		<li className="rounded-lg border border-[var(--line)]">
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
		<pre className="max-h-96 overflow-auto border-[var(--line)] border-t bg-[var(--chip-bg)] px-4 py-3 font-mono text-xs">
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
