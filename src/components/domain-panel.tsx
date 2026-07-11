import { isRedirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { DomainStatus } from "@/server/relay";

const actionBtn =
	"rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)] disabled:opacity-50";
const dangerBtn =
	"rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50";
const field = "rounded-md border border-[var(--line)] px-3 py-2 text-sm";

const CERT: Record<string, { label: string; dot: string }> = {
	issuing: { label: "Issuing…", dot: "bg-amber-500" },
	active: { label: "Active", dot: "bg-emerald-500" },
	failed: { label: "Failed", dot: "bg-red-500" },
};

// The box sends the cert expiry as an RFC3339 timestamp; show just the date.
// Fixed locale + UTC keeps it deterministic regardless of the viewer's timezone.
function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
}

export type DomainPanelProps = {
	status: DomainStatus;
	onSave: (domain: string, token: string) => Promise<void>;
	onRemove: () => Promise<void>;
	refresh: () => void;
};

export function DomainPanel({
	status,
	onSave,
	onRemove,
	refresh,
}: DomainPanelProps) {
	// Auto-poll the loader while the cert is issuing so the panel flips to
	// active/failed on its own. Mirrors app-detail's useLiveTail.
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	useEffect(() => {
		if (status.status !== "issuing") return;
		const id = setInterval(() => refreshRef.current(), 5000);
		return () => clearInterval(id);
	}, [status.status]);

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-sm">Custom domain</h2>
			{status.source === "env" ? (
				<p className="text-muted-foreground text-sm">
					<span className="font-mono">{status.domain}</span> — managed by this
					box's environment.
				</p>
			) : status.domain ? (
				<Configured status={status} onRemove={onRemove} />
			) : (
				<ConfigForm onSave={onSave} />
			)}
		</section>
	);
}

function CertPill({ status }: { status: string }) {
	const meta = CERT[status] ?? { label: "Pending", dot: "bg-gray-400" };
	return (
		<span className="flex items-center gap-2 text-muted-foreground text-sm">
			<span className={`h-2 w-2 rounded-full ${meta.dot}`} />
			{meta.label}
		</span>
	);
}

function ConfigForm({
	onSave,
}: {
	onSave: (domain: string, token: string) => Promise<void>;
}) {
	const [domain, setDomain] = useState("");
	const [token, setToken] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSave() {
		setError(null);
		setSaving(true);
		try {
			await onSave(domain.trim(), token);
			// On success the parent re-runs the loader and this form unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't save the domain.");
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<label className="flex flex-col gap-1 text-sm">
				Domain
				<input
					aria-label="Domain"
					value={domain}
					onChange={(e) => setDomain(e.target.value)}
					placeholder="shop.example.com"
					className={field}
				/>
			</label>
			<label className="flex flex-col gap-1 text-sm">
				Cloudflare DNS API token
				<input
					aria-label="DNS API token"
					type="password"
					autoComplete="off"
					value={token}
					onChange={(e) => setToken(e.target.value)}
					className={field}
				/>
			</label>
			<div>
				<button
					type="button"
					onClick={handleSave}
					disabled={saving || !domain.trim() || !token}
					className={actionBtn}
				>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</div>
	);
}

function Configured({
	status,
	onRemove,
}: {
	status: DomainStatus;
	onRemove: () => Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const [removing, setRemoving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleRemove() {
		setError(null);
		setRemoving(true);
		try {
			await onRemove();
			// On success the parent re-runs the loader and this view unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't remove the domain.");
			setRemoving(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<span className="font-mono text-sm">{status.domain}</span>
				<CertPill status={status.status} />
			</div>
			{status.status === "failed" && status.error && (
				<p className="text-red-600 text-sm">{status.error}</p>
			)}
			{status.status === "active" && status.certNotAfter && (
				<p className="text-muted-foreground text-sm">
					Certificate valid until {formatDate(status.certNotAfter)}.
				</p>
			)}
			<p className="text-muted-foreground text-sm">
				{status.dnsOk
					? "DNS is resolving to your box."
					: "DNS is not resolving to your box yet — create the records below."}
			</p>

			<div className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">DNS records</h3>
				<div className="overflow-x-auto">
					<table className="text-sm">
						<thead>
							<tr className="text-left text-muted-foreground">
								<th className="pr-4 font-medium">Type</th>
								<th className="pr-4 font-medium">Name</th>
								<th className="font-medium">Value</th>
							</tr>
						</thead>
						<tbody className="font-mono">
							{status.dnsRecords.map((r) => (
								<tr key={`${r.type}-${r.name}`}>
									<td className="pr-4">{r.type}</td>
									<td className="pr-4">{r.name}</td>
									<td>{r.value}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<div>
					<button
						type="button"
						onClick={() => setConfirming(true)}
						className={actionBtn}
					>
						Remove custom domain
					</button>
				</div>
				{confirming && (
					<div className="flex flex-col gap-2 rounded-lg border border-red-600/40 p-3">
						<p className="text-red-600 text-sm">
							This removes <span className="font-mono">{status.domain}</span>{" "}
							and its certificate. Type the domain to confirm.
						</p>
						<input
							aria-label="Confirm domain"
							value={typed}
							onChange={(e) => setTyped(e.target.value)}
							className={field}
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
								onClick={handleRemove}
								disabled={typed !== status.domain || removing}
								className={dangerBtn}
							>
								{removing ? "Removing…" : "Remove"}
							</button>
						</div>
					</div>
				)}
				{error && <p className="text-red-600 text-sm">{error}</p>}
			</div>
		</div>
	);
}
