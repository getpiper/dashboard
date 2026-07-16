import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import Header from "../components/Header";
import { OrgScopeProvider } from "../components/org-scope";
import { getInvites, getOrgs, getSession } from "../server/fns";

import appCss from "../styles.css?url";

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
	return (
		<OrgScopeProvider
			username={data?.username ?? null}
			orgs={data?.orgs ?? []}
			invites={data?.invites ?? []}
		>
			<Header username={data?.username ?? null} />
			<Outlet />
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
