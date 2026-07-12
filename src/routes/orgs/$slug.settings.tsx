import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useOrgScope } from "@/components/org-scope";
import { OrgSettings } from "@/components/org-settings";
import { RelayError } from "@/components/relay-error";
import {
	deleteOrgFn,
	getOrgInvites,
	getOrgMembers,
	getSession,
	inviteOrgMemberFn,
	removeOrgMemberFn,
	revokeOrgInviteFn,
	setOrgMemberRoleFn,
} from "@/server/fns";

export const Route = createFileRoute("/orgs/$slug/settings")({
	loader: async ({ params }) => {
		const session = await getSession();
		const members = await getOrgMembers({ data: params.slug });
		const role =
			members.find((m) => m.username === session?.username)?.role ?? "member";
		const invites =
			role === "owner" ? await getOrgInvites({ data: params.slug }) : [];
		return { members, invites, role, username: session?.username ?? "" };
	},
	component: OrgSettingsPage,
	errorComponent: RelayError,
});

function OrgSettingsPage() {
	const { slug } = Route.useParams();
	const { members, invites, role, username } = Route.useLoaderData();
	const router = useRouter();
	const navigate = useNavigate();
	const { setScope } = useOrgScope();

	// Leave/delete: the caller no longer belongs to (or the org no longer
	// exists), so drop the scope back to personal and go home.
	async function exitToPersonal(act: () => Promise<unknown>) {
		await act();
		setScope("personal");
		await navigate({ to: "/" });
	}

	return (
		<OrgSettings
			slug={slug}
			role={role}
			username={username}
			members={members}
			invites={invites}
			onInvite={async (githubUsername) => {
				await inviteOrgMemberFn({ data: { slug, githubUsername } });
				router.invalidate();
			}}
			onRevokeInvite={async (login) => {
				await revokeOrgInviteFn({ data: { slug, login } });
				router.invalidate();
			}}
			onSetRole={async (memberName, nextRole) => {
				await setOrgMemberRoleFn({
					data: { slug, username: memberName, role: nextRole },
				});
				router.invalidate();
			}}
			onRemoveMember={async (memberName) => {
				await removeOrgMemberFn({ data: { slug, username: memberName } });
				router.invalidate();
			}}
			onLeave={() =>
				exitToPersonal(() => removeOrgMemberFn({ data: { slug, username } }))
			}
			onDelete={() => exitToPersonal(() => deleteOrgFn({ data: slug }))}
		/>
	);
}
