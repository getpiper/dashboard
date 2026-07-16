import { Settings } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Input } from "@/components/ui/field";
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
				className="relative rounded-[2px] border border-border bg-secondary px-3 py-1.5 text-sm text-foreground"
			>
				{label}
				{invites.length > 0 && (
					<span className="-right-1 -top-1 absolute flex h-4 min-w-4 items-center justify-center rounded-[2px] bg-primary px-1 text-[10px] text-primary-foreground">
						{invites.length}
					</span>
				)}
			</button>
			{open && (
				<div
					role="menu"
					className="absolute right-0 z-50 mt-1 flex w-56 flex-col gap-1 rounded-[2px] border border-border bg-card p-1.5"
				>
					{invites.length > 0 && (
						<div className="flex flex-col gap-1 border-border border-b pb-1.5">
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
											className="rounded-[2px] border border-border bg-secondary px-2 py-1 text-xs"
										>
											Accept
										</button>
										<button
											type="button"
											aria-label={`Decline ${slug}`}
											disabled={inviteBusy === slug}
											onClick={() => act(slug, onDecline)}
											className="rounded-[2px] px-2 py-1 text-muted-foreground text-xs hover:bg-secondary"
										>
											Decline
										</button>
									</span>
								</div>
							))}
							{inviteError && (
								<p role="alert" className="px-3 text-destructive text-xs">
									{inviteError}
								</p>
							)}
						</div>
					)}
					<button
						type="button"
						onClick={() => pick("personal")}
						className="rounded-[2px] px-3 py-1.5 text-left text-sm hover:bg-secondary"
					>
						Personal
					</button>
					{orgs.map((o) => (
						<div key={o.slug} className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => pick(o.slug)}
								className="flex flex-1 items-center justify-between rounded-[2px] px-3 py-1.5 text-left text-sm hover:bg-secondary"
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
								className="rounded-[2px] px-2 py-1.5 text-muted-foreground hover:bg-secondary"
							>
								<Settings className="h-4 w-4" />
							</button>
						</div>
					))}
					{creating ? (
						<form onSubmit={submit} className="flex flex-col gap-1.5 p-1.5">
							<Input
								aria-label="Org name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Org name"
								className="px-2 py-1"
							/>
							<button
								type="submit"
								disabled={busy || name.trim() === ""}
								className="rounded-[2px] border border-border bg-secondary px-3 py-1 text-sm"
							>
								Create
							</button>
							{error && (
								<p role="alert" className="text-destructive text-xs">
									{error}
								</p>
							)}
						</form>
					) : (
						<button
							type="button"
							onClick={() => setCreating(true)}
							className="rounded-[2px] px-3 py-1.5 text-left text-muted-foreground text-sm hover:bg-secondary"
						>
							Create org…
						</button>
					)}
				</div>
			)}
		</div>
	);
}
