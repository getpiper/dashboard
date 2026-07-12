import { isRedirect } from "@tanstack/react-router";
import { useState } from "react";
import type { OrgMember } from "@/server/relay";

const actionBtn =
	"rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--chip-bg)] disabled:opacity-50";
const dangerBtn =
	"rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50";
const field = "rounded-md border border-[var(--line)] px-3 py-2 text-sm";

export type OrgSettingsProps = {
	slug: string;
	role: "owner" | "member";
	username: string;
	members: OrgMember[];
	invites: string[];
	onInvite: (githubUsername: string) => Promise<void>;
	onRevokeInvite: (login: string) => Promise<void>;
	onSetRole: (username: string, role: "owner" | "member") => Promise<void>;
	onRemoveMember: (username: string) => Promise<void>;
	onLeave: () => Promise<void>;
	onDelete: () => Promise<void>;
};

export function OrgSettings({
	slug,
	role,
	username,
	members,
	invites,
	onInvite,
	onRevokeInvite,
	onSetRole,
	onRemoveMember,
	onLeave,
	onDelete,
}: OrgSettingsProps) {
	const ownerCount = members.filter((m) => m.role === "owner").length;
	return (
		<div className="page-wrap flex flex-col gap-8 py-8">
			<h1 className="font-semibold text-lg">
				<span className="font-mono">{slug}</span> settings
			</h1>
			<MembersSection
				role={role}
				username={username}
				members={members}
				ownerCount={ownerCount}
				onSetRole={onSetRole}
				onRemoveMember={onRemoveMember}
			/>
			{role === "owner" && (
				<InvitesSection
					invites={invites}
					onInvite={onInvite}
					onRevokeInvite={onRevokeInvite}
				/>
			)}
			<DangerZone
				slug={slug}
				role={role}
				soleOwner={role === "owner" && ownerCount === 1}
				onLeave={onLeave}
				onDelete={onDelete}
			/>
		</div>
	);
}

function MembersSection({
	role,
	username,
	members,
	ownerCount,
	onSetRole,
	onRemoveMember,
}: {
	role: "owner" | "member";
	username: string;
	members: OrgMember[];
	ownerCount: number;
	onSetRole: (username: string, role: "owner" | "member") => Promise<void>;
	onRemoveMember: (username: string) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function run(fn: () => Promise<void>) {
		setError(null);
		setBusy(true);
		try {
			await fn();
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Action failed.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-sm">Members</h2>
			<table className="text-sm">
				<tbody>
					{members.map((m) => {
						const isSelf = m.username === username;
						const lastOwner = m.role === "owner" && ownerCount === 1;
						return (
							<tr key={m.username} className="border-[var(--line)] border-b">
								<td className="py-2 pr-4 font-mono">
									{m.username}
									{isSelf && (
										<span className="text-muted-foreground"> (you)</span>
									)}
								</td>
								<td className="py-2 pr-4 text-muted-foreground">{m.role}</td>
								<td className="py-2 text-right">
									{role === "owner" && !isSelf && (
										<div className="flex justify-end gap-2">
											{m.role === "owner" ? (
												<button
													type="button"
													disabled={busy || lastOwner}
													onClick={() =>
														run(() => onSetRole(m.username, "member"))
													}
													className={actionBtn}
												>
													Make member
												</button>
											) : (
												<button
													type="button"
													disabled={busy}
													onClick={() =>
														run(() => onSetRole(m.username, "owner"))
													}
													className={actionBtn}
												>
													Make owner
												</button>
											)}
											<button
												type="button"
												disabled={busy || lastOwner}
												onClick={() => run(() => onRemoveMember(m.username))}
												className={actionBtn}
											>
												Remove
											</button>
										</div>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</section>
	);
}

function InvitesSection({
	invites,
	onInvite,
	onRevokeInvite,
}: {
	invites: string[];
	onInvite: (githubUsername: string) => Promise<void>;
	onRevokeInvite: (login: string) => Promise<void>;
}) {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function invite() {
		setError(null);
		setBusy(true);
		try {
			await onInvite(value.trim());
			setValue("");
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Invite failed.");
		} finally {
			setBusy(false);
		}
	}

	async function revoke(login: string) {
		setError(null);
		try {
			await onRevokeInvite(login);
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Revoke failed.");
		}
	}

	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-sm">Pending invites</h2>
			<div className="flex gap-2">
				<input
					aria-label="GitHub username"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="octocat"
					className={field}
				/>
				<button
					type="button"
					onClick={invite}
					disabled={busy || value.trim() === ""}
					className={actionBtn}
				>
					{busy ? "Inviting…" : "Invite"}
				</button>
			</div>
			{invites.length === 0 ? (
				<p className="text-muted-foreground text-sm">No pending invites.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{invites.map((login) => (
						<li
							key={login}
							className="flex items-center justify-between text-sm"
						>
							<span className="font-mono">{login}</span>
							<button
								type="button"
								onClick={() => revoke(login)}
								className={actionBtn}
							>
								Revoke
							</button>
						</li>
					))}
				</ul>
			)}
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</section>
	);
}

function DangerZone({
	slug,
	role,
	soleOwner,
	onLeave,
	onDelete,
}: {
	slug: string;
	role: "owner" | "member";
	soleOwner: boolean;
	onLeave: () => Promise<void>;
	onDelete: () => Promise<void>;
}) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-semibold text-red-600 text-sm">Danger zone</h2>
			<LeaveOrg soleOwner={soleOwner} onLeave={onLeave} />
			{role === "owner" && <DeleteOrg slug={slug} onDelete={onDelete} />}
		</section>
	);
}

function LeaveOrg({
	soleOwner,
	onLeave,
}: {
	soleOwner: boolean;
	onLeave: () => Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function leave() {
		setError(null);
		setBusy(true);
		try {
			await onLeave();
			// On success the route navigates away and this unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't leave the org.");
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			{confirming ? (
				<div className="flex items-center gap-2">
					<span className="text-sm">Leave this org?</span>
					<button
						type="button"
						onClick={() => setConfirming(false)}
						className={actionBtn}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={leave}
						disabled={busy}
						className={dangerBtn}
					>
						{busy ? "Leaving…" : "Leave"}
					</button>
				</div>
			) : (
				<div>
					<button
						type="button"
						disabled={soleOwner}
						onClick={() => setConfirming(true)}
						className={actionBtn}
					>
						Leave org
					</button>
					{soleOwner && (
						<p className="text-muted-foreground text-sm">
							You're the only owner — promote someone else first.
						</p>
					)}
				</div>
			)}
			{error && <p className="text-red-600 text-sm">{error}</p>}
		</div>
	);
}

function DeleteOrg({
	slug,
	onDelete,
}: {
	slug: string;
	onDelete: () => Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function del() {
		setError(null);
		setBusy(true);
		try {
			await onDelete();
			// On success the route navigates away and this unmounts.
		} catch (err) {
			if (isRedirect(err)) throw err;
			setError((err as Error).message || "Couldn't delete the org.");
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			{confirming ? (
				<div className="flex flex-col gap-2 rounded-lg border border-red-600/40 p-3">
					<p className="text-red-600 text-sm">
						This permanently deletes <span className="font-mono">{slug}</span>.
						Type the slug to confirm.
					</p>
					<input
						aria-label="Confirm org slug"
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
							onClick={del}
							disabled={typed !== slug || busy}
							className={dangerBtn}
						>
							{busy ? "Deleting…" : "Delete"}
						</button>
					</div>
					{error && <p className="text-red-600 text-sm">{error}</p>}
				</div>
			) : (
				<div>
					<button
						type="button"
						onClick={() => setConfirming(true)}
						className={actionBtn}
					>
						Delete org
					</button>
				</div>
			)}
		</div>
	);
}
