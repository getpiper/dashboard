import { type FormEvent, useState } from "react";
import type { Org } from "@/server/relay";

export type OrgSwitcherProps = {
	scope: string;
	orgs: Org[];
	onSelect: (scope: string) => void;
	onCreate: (name: string) => Promise<Org>;
};

export function OrgSwitcher({
	scope,
	orgs,
	onSelect,
	onCreate,
}: OrgSwitcherProps) {
	const [open, setOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	const label = scope === "personal" ? "Personal" : scope;

	function pick(s: string) {
		onSelect(s);
		setOpen(false);
		setCreating(false);
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		setError("");
		setBusy(true);
		try {
			const org = await onCreate(name.trim());
			setName("");
			setCreating(false);
			setOpen(false);
			onSelect(org.slug);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Create failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)]"
			>
				{label}
			</button>
			{open && (
				<div
					role="menu"
					className="absolute right-0 z-50 mt-1 flex w-56 flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--header-bg)] p-1.5 shadow-lg"
				>
					<button
						type="button"
						onClick={() => pick("personal")}
						className="rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--chip-bg)]"
					>
						Personal
					</button>
					{orgs.map((o) => (
						<button
							key={o.slug}
							type="button"
							onClick={() => pick(o.slug)}
							className="flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--chip-bg)]"
						>
							<span className="font-mono">{o.slug}</span>
							<span className="text-muted-foreground text-xs">{o.role}</span>
						</button>
					))}
					{creating ? (
						<form onSubmit={submit} className="flex flex-col gap-1.5 p-1.5">
							<input
								aria-label="Org name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Org name"
								className="rounded-lg border border-[var(--line)] px-2 py-1 text-sm"
							/>
							<button
								type="submit"
								disabled={busy || name.trim() === ""}
								className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-sm"
							>
								Create
							</button>
							{error && (
								<p role="alert" className="text-red-600 text-xs">
									{error}
								</p>
							)}
						</form>
					) : (
						<button
							type="button"
							onClick={() => setCreating(true)}
							className="rounded-lg px-3 py-1.5 text-left text-muted-foreground text-sm hover:bg-[var(--chip-bg)]"
						>
							Create org…
						</button>
					)}
				</div>
			)}
		</div>
	);
}
