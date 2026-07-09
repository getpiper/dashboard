import { createFileRoute } from "@tanstack/react-router";
import { LoginCard } from "@/components/login-card";

export const Route = createFileRoute("/login")({
	component: LoginCard,
});
