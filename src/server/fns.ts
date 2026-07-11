import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import {
	BoxOfflineError,
	fetchAllApps,
	fetchBox,
	fetchDeploymentLogs,
	fetchDeployments,
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
			// The box dropped between the box lookup and this fetch.
			if (err instanceof BoxOfflineError) return [];
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
