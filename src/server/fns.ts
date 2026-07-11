import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import {
	createApp,
	exchangeGithub,
	fetchAllApps,
	fetchBox,
	fetchDeploymentLogs,
	fetchDeployments,
	githubManifest,
	linkApp,
	RelayAuthError,
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
