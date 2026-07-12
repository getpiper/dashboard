import { Link, useRouter } from "@tanstack/react-router";
import { acceptInviteFn, createOrgFn, declineInviteFn } from "../server/fns";
import { useOrgScope } from "./org-scope";
import { OrgSwitcher } from "./org-switcher";
import SessionControls from "./SessionControls";
import ThemeToggle from "./ThemeToggle";

export default function Header({ username }: { username: string | null }) {
	return (
		<header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
			<nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
				<h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
					<Link
						to="/"
						className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
					>
						<span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
						Piper
					</Link>
				</h2>

				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					{username && <HeaderSwitcher />}
					<SessionControls username={username} />
					<ThemeToggle />
				</div>
			</nav>
		</header>
	);
}

function HeaderSwitcher() {
	const { scope, setScope, orgs, invites } = useOrgScope();
	const router = useRouter();
	return (
		<OrgSwitcher
			scope={scope}
			orgs={orgs}
			invites={invites}
			onSelect={setScope}
			onCreate={async (name) => {
				const org = await createOrgFn({ data: name });
				router.invalidate();
				return org;
			}}
			onManage={(slug) =>
				router.navigate({ to: "/orgs/$slug/settings", params: { slug } })
			}
			onAccept={async (slug) => {
				await acceptInviteFn({ data: slug });
				setScope(slug);
				router.invalidate();
			}}
			onDecline={async (slug) => {
				await declineInviteFn({ data: slug });
				router.invalidate();
			}}
		/>
	);
}
