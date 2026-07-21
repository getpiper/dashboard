import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/ui/app-shell";
import { acceptInviteFn, createOrgFn, declineInviteFn } from "@/server/fns";
import { useOrgScope } from "./org-scope";
import { OrgSwitcher } from "./org-switcher";
import SessionControls from "./SessionControls";

// App detail lives at /boxes/$base/apps/$app but belongs to the apps tab, so
// it can't be matched by a plain /boxes prefix.
export function isAppDetailPath(pathname: string): boolean {
	return /^\/boxes\/[^/]+\/apps\/[^/]+/.test(pathname);
}

export function appsTabActive(pathname: string): boolean {
	return (
		pathname === "/apps" ||
		pathname.startsWith("/apps/") ||
		isAppDetailPath(pathname)
	);
}

export function boxesTabActive(pathname: string): boolean {
	return (
		(pathname === "/boxes" || pathname.startsWith("/boxes/")) &&
		!isAppDetailPath(pathname)
	);
}

export function AppFrame({ children }: { children: ReactNode }) {
	const { username, scope, setScope, orgs, invites } = useOrgScope();
	const router = useRouter();

	const navItems: NavItem[] = username
		? [
				{ label: "apps", to: "/apps", isActive: appsTabActive },
				{ label: "boxes", to: "/boxes", isActive: boxesTabActive },
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
