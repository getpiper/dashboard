import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { fetchBoxes, RelayAuthError } from "./relay";

export const getSession = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) return null;
	return { username: getCookie("piper_username") ?? "" };
});

export const getBoxes = createServerFn().handler(async () => {
	const credential = getCookie("piper_session");
	if (!credential) throw redirect({ to: "/login" });
	try {
		return await fetchBoxes(credential);
	} catch (err) {
		if (err instanceof RelayAuthError) {
			// Revoked/garbage credential: drop the dead session and re-login.
			deleteCookie("piper_session", { path: "/" });
			deleteCookie("piper_username", { path: "/" });
			throw redirect({ to: "/login" });
		}
		throw err;
	}
});
