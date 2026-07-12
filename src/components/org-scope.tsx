import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import type { Org } from "@/server/relay";

type OrgScope = {
	scope: string;
	setScope: (s: string) => void;
	orgs: Org[];
	username: string | null;
};

const Ctx = createContext<OrgScope | null>(null);

function readScopeCookie(): string {
	if (typeof document === "undefined") return "personal";
	const m = document.cookie.match(/(?:^|;\s*)piper_scope=([^;]*)/);
	return m ? decodeURIComponent(m[1]) : "personal";
}

export function OrgScopeProvider({
	username,
	orgs,
	children,
}: {
	username: string | null;
	orgs: Org[];
	children: ReactNode;
}) {
	// Start at "personal" so server and first client render match; a mount
	// effect then restores a valid persisted scope (avoids hydration mismatch).
	const [scope, setScopeState] = useState("personal");

	useEffect(() => {
		const persisted = readScopeCookie();
		if (persisted === "personal") return;
		if (orgs.some((o) => o.slug === persisted)) setScopeState(persisted);
		else setScopeState("personal");
	}, [orgs]);

	const setScope = (next: string) => {
		document.cookie = `piper_scope=${encodeURIComponent(next)}; Path=/; SameSite=Lax`;
		setScopeState(next);
	};

	return (
		<Ctx.Provider value={{ scope, setScope, orgs, username }}>
			{children}
		</Ctx.Provider>
	);
}

export function useOrgScope(): OrgScope {
	const v = useContext(Ctx);
	if (!v) throw new Error("useOrgScope must be used within OrgScopeProvider");
	return v;
}
