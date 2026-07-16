import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/ui/app-shell";
import { acceptInviteFn, createOrgFn, declineInviteFn } from "@/server/fns";
import { useOrgScope } from "./org-scope";
import { OrgSwitcher } from "./org-switcher";
import SessionControls from "./SessionControls";

export function AppFrame({ children }: { children: ReactNode }) {
	const { username, scope, setScope, orgs, invites } = useOrgScope();
	const router = useRouter();

	const navItems: NavItem[] = username
		? [
				{ label: "boxes", to: "/", exact: true },
				{ label: "apps", to: "/apps" },
				{ label: "domains", to: "/domains" },
				...(scope !== "personal"
					? [
							{
								label: "settings",
								to: "/orgs/$slug/settings",
								params: { slug: scope },
							} as NavItem,
						]
					: []),
			]
		: [];

	const right = username ? (
		<>
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
			<SessionControls username={username} />
		</>
	) : null;

	return (
		<AppShell navItems={navItems} right={right}>
			{children}
		</AppShell>
	);
}
