import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { AppFrame } from "../components/app-frame";
import { OrgScopeProvider } from "../components/org-scope";
import { getInvites, getOrgs, getSession } from "../server/fns";

import appCss from "../styles.css?url";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		// When false, RootLayout renders the route full-bleed without the app shell.
		chrome?: boolean;
	}
}

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Piper Dashboard",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	loader: async () => {
		const session = await getSession();
		if (!session) return null;
		const [orgs, invites] = await Promise.all([getOrgs(), getInvites()]);
		return { ...session, orgs, invites };
	},
	component: RootLayout,
	shellComponent: RootDocument,
});

function RootLayout() {
	const data = Route.useLoaderData();
	const chromeless = useRouterState({
		select: (s) => s.matches.some((m) => m.staticData.chrome === false),
	});
	return (
		<OrgScopeProvider
			username={data?.username ?? null}
			orgs={data?.orgs ?? []}
			invites={data?.invites ?? []}
		>
			{chromeless ? (
				<Outlet />
			) : (
				<AppFrame>
					<Outlet />
				</AppFrame>
			)}
		</OrgScopeProvider>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body
				className="font-mono antialiased [overflow-wrap:anywhere] selection:bg-primary/25"
				suppressHydrationWarning
			>
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
