import { Settings } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { Org } from "@/server/relay";

export type OrgSwitcherProps = {
	scope: string;
	orgs: Org[];
	invites: string[];
	onSelect: (scope: string) => void;
	onCreate: (name: string) => Promise<Org>;
	onManage: (slug: string) => void;
	onAccept: (slug: string) => Promise<void>;
	onDecline: (slug: string) => Promise<void>;
};

export function OrgSwitcher({
	scope,
	orgs,
	invites,
	onSelect,
	onCreate,
	onManage,
	onAccept,
	onDecline,
}: OrgSwitcherProps) {
	const [open, setOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [inviteBusy, setInviteBusy] = useState("");
	const [inviteError, setInviteError] = useState("");

	async function act(slug: string, fn: (slug: string) => Promise<void>) {
		setInviteError("");
		setInviteBusy(slug);
		try {
			await fn(slug);
		} catch (err) {
			setInviteError(err instanceof Error ? err.message : "Invite failed");
		} finally {
			setInviteBusy("");
		}
	}

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
				className="relative rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)]"
			>
				{label}
				{invites.length > 0 && (
					<span className="-right-1 -top-1 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sea-ink)] px-1 text-[10px] text-white">
						{invites.length}
					</span>
				)}
			</button>
			{open && (
				<div
					role="menu"
					className="absolute right-0 z-50 mt-1 flex w-56 flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--header-bg)] p-1.5 shadow-lg"
				>
					{invites.length > 0 && (
						<div className="flex flex-col gap-1 border-[var(--line)] border-b pb-1.5">
							<p className="px-3 pt-1 text-muted-foreground text-xs">
								Pending invites
							</p>
							{invites.map((slug) => (
								<div
									key={slug}
									className="flex items-center justify-between gap-1 px-3 py-1"
								>
									<span className="font-mono text-sm">{slug}</span>
									<span className="flex gap-1">
										<button
											type="button"
											aria-label={`Accept ${slug}`}
											disabled={inviteBusy === slug}
											onClick={() => act(slug, onAccept)}
											className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1 text-xs"
										>
											Accept
										</button>
										<button
											type="button"
											aria-label={`Decline ${slug}`}
											disabled={inviteBusy === slug}
											onClick={() => act(slug, onDecline)}
											className="rounded-lg px-2 py-1 text-muted-foreground text-xs hover:bg-[var(--chip-bg)]"
										>
											Decline
										</button>
									</span>
								</div>
							))}
							{inviteError && (
								<p role="alert" className="px-3 text-red-600 text-xs">
									{inviteError}
								</p>
							)}
						</div>
					)}
					<button
						type="button"
						onClick={() => pick("personal")}
						className="rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--chip-bg)]"
					>
						Personal
					</button>
					{orgs.map((o) => (
						<div key={o.slug} className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => pick(o.slug)}
								className="flex flex-1 items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--chip-bg)]"
							>
								<span className="font-mono">{o.slug}</span>
								<span className="text-muted-foreground text-xs">{o.role}</span>
							</button>
							<button
								type="button"
								aria-label={`Manage ${o.slug}`}
								onClick={() => {
									onManage(o.slug);
									setOpen(false);
								}}
								className="rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-[var(--chip-bg)]"
							>
								<Settings className="h-4 w-4" />
							</button>
						</div>
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
