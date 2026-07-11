import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { fetchAllApps, fetchBox, RelayAuthError } from "./relay";

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
