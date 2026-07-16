import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import {
	acceptInvite,
	createApp,
	createOrg,
	declineInvite,
	deleteApp,
	deleteOrg,
	exchangeGithub,
	fetchAllApps,
	fetchAllDomains,
	fetchBox,
	fetchDeploymentLogs,
	fetchDeployments,
	fetchInvites,
	fetchOrgInvites,
	fetchOrgMembers,
	fetchOrgs,
	getDomain,
	githubManifest,
	inviteOrgMember,
	linkApp,
	RelayAuthError,
	removeDomain,
	removeOrgMember,
	revokeOrgInvite,
	setDomain,
	setOrgMemberRole,
	stopApp,
} from "./relay";

export const getSession = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) return null;
	return { username: getCookie("piper_username") ?? "" };
});

// Revoked/garbage credential: drop the dead session and re-login.
function dropSessionAndRedirect(): never {
	deleteCookie("piper_session", { path: "/" });
	deleteCookie("piper_username", { path: "/" });
	throw redirect({ to: "/login" });
}

export const getApps = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchAllApps(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) dropSessionAndRedirect();
		throw err;
	}
});

export const getDomainsFn = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchAllDomains(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) dropSessionAndRedirect();
		throw err;
	}
});

export const getBox = createServerFn()
	.validator((base: string) => base)
	.handler(async ({ data: base }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchBox(credential, base);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getDeployments = createServerFn()
	.validator((d: { base: string; app: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchDeployments(credential, data.base, data.app);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getDeploymentLogs = createServerFn()
	.validator((d: { base: string; app: string; id: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchDeploymentLogs(
				credential,
				data.base,
				data.app,
				data.id,
			);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getGithubManifest = createServerFn({ method: "POST" })
	.validator((d: { base: string; redirectUrl: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await githubManifest(credential, data.base, data.redirectUrl);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const exchangeGithubApp = createServerFn({ method: "POST" })
	.validator((d: { base: string; code: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await exchangeGithub(credential, data.base, data.code);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const createAndLinkApp = createServerFn({ method: "POST" })
	.validator(
		(d: {
			base: string;
			name: string;
			repo: string;
			branch: string;
			port?: number;
		}) => d,
	)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await createApp(credential, data.base, data.name, data.port ?? 8080);
			await linkApp(credential, data.base, data.name, data.repo, data.branch);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const stopAppFn = createServerFn({ method: "POST" })
	.validator((d: { base: string; name: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await stopApp(credential, data.base, data.name);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const deleteAppFn = createServerFn({ method: "POST" })
	.validator((d: { base: string; name: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await deleteApp(credential, data.base, data.name);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getDomainFn = createServerFn()
	.validator((base: string) => base)
	.handler(async ({ data: base }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await getDomain(credential, base);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const setDomainFn = createServerFn({ method: "POST" })
	.validator((d: { base: string; domain: string; token: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await setDomain(credential, data.base, {
				domain: data.domain,
				provider: "cloudflare",
				token: data.token,
			});
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const removeDomainFn = createServerFn({ method: "POST" })
	.validator((base: string) => base)
	.handler(async ({ data: base }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await removeDomain(credential, base);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getOrgs = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchOrgs(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) dropSessionAndRedirect();
		throw err;
	}
});

export const createOrgFn = createServerFn({ method: "POST" })
	.validator((name: string) => name)
	.handler(async ({ data: name }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await createOrg(credential, name);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getOrgMembers = createServerFn()
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchOrgMembers(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getOrgInvites = createServerFn()
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			return await fetchOrgInvites(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const inviteOrgMemberFn = createServerFn({ method: "POST" })
	.validator((d: { slug: string; githubUsername: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await inviteOrgMember(credential, data.slug, data.githubUsername);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const revokeOrgInviteFn = createServerFn({ method: "POST" })
	.validator((d: { slug: string; login: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await revokeOrgInvite(credential, data.slug, data.login);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const setOrgMemberRoleFn = createServerFn({ method: "POST" })
	.validator(
		(d: { slug: string; username: string; role: "owner" | "member" }) => d,
	)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await setOrgMemberRole(credential, data.slug, data.username, data.role);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const removeOrgMemberFn = createServerFn({ method: "POST" })
	.validator((d: { slug: string; username: string }) => d)
	.handler(async ({ data }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await removeOrgMember(credential, data.slug, data.username);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const deleteOrgFn = createServerFn({ method: "POST" })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await deleteOrg(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const getInvites = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchInvites(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) dropSessionAndRedirect();
		throw err;
	}
});

export const acceptInviteFn = createServerFn({ method: "POST" })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await acceptInvite(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});

export const declineInviteFn = createServerFn({ method: "POST" })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const credential = getCookie("piper_session");
		if (!credential) throw redirect({ to: "/login" });
		try {
			await declineInvite(credential, slug);
		} catch (err) {
			if (err instanceof RelayAuthError) dropSessionAndRedirect();
			throw err;
		}
	});
