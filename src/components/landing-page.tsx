import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

const INSTALL_CMD = "curl -fsSL https://get.openpiper.dev/install.sh | sh";
const GITHUB_URL = "https://github.com/openpiper/piper";

const whyCards = [
	{
		glyph: "◈",
		title: "Zero-trust relay",
		body: "The relay only ever sees ciphertext — L4 SNI passthrough, TLS terminates on your box. Route through a relay you don’t own, safely.",
	},
	{
		glyph: "▰",
		title: "Lean by design",
		body: "SQLite for state, embedded Caddy for TLS, one lightweight daemon. No Kubernetes, no sprawl — light enough to run on a Pi, happy on anything bigger.",
	},
	{
		glyph: "▶",
		title: "Developer-first",
		body: "A scriptable CLI and a full-screen TUI, Dockerfile-based builds, and git-push deploys. On the box itself, no login needed.",
	},
];

const steps = [
	{
		n: "01",
		cmd: "piper connect",
		body: "Enroll your box on the public relay (or your own). One outbound tunnel, no ports opened.",
	},
	{
		n: "02",
		cmd: "piper app link myapp --repo owner/name",
		body: "Link a repo through your own per-user GitHub App — the private key never leaves your box.",
	},
	{
		n: "03",
		cmd: "git push",
		body: "Builds the Dockerfile, health-checks the container, and publishes it live at https://myapp.your-domain.",
	},
];

function useCopyToClipboard(resetMs = 1500) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const copy = useCallback(
		(text: string) => {
			navigator.clipboard?.writeText(text).catch(() => {});
			setCopied(true);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), resetMs);
		},
		[resetMs],
	);
	useEffect(() => () => clearTimeout(timer.current), []);
	return [copied, copy] as const;
}

function CopyInstallButton({
	variant,
	size,
}: {
	variant: "neutral" | "primary";
	size: "sm" | "lg";
}) {
	const [copied, copy] = useCopyToClipboard();
	return (
		<Button
			type="button"
			variant={variant}
			size={size}
			bracketed={false}
			onClick={() => copy(INSTALL_CMD)}
		>
			{copied ? "✓ copied" : "copy install command"}
		</Button>
	);
}

function Header() {
	return (
		<header className="sticky top-0 z-50 flex items-center border-b border-border bg-card">
			<a
				href="#top"
				className="border-r border-border px-[18px] py-3 font-semibold text-foreground"
			>
				pi@<span className="text-primary">piper</span>
			</a>
			<nav className="flex gap-[22px] px-[22px] text-[13px]">
				<a className="text-muted-foreground" href="#why">
					why piper
				</a>
				<a className="text-muted-foreground" href="#how">
					how it works
				</a>
				<a
					className="text-muted-foreground"
					href={GITHUB_URL}
					target="_blank"
					rel="noreferrer"
				>
					docs
				</a>
			</nav>
			<div className="ml-auto flex items-center gap-3 px-4">
				<a
					className="text-[13px] text-muted-foreground"
					href={GITHUB_URL}
					target="_blank"
					rel="noreferrer"
				>
					github ↗
				</a>
				<Link
					to="/login"
					className={buttonVariants({ variant: "secondary", size: "sm" })}
				>
					[ sign in ]
				</Link>
			</div>
		</header>
	);
}

function Hero() {
	return (
		<div className="bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(255,180,84,0.09),transparent_60%)] pt-[88px] pb-[60px] text-center">
			<div className="mb-[26px] inline-flex items-center gap-2 rounded-full border border-border px-[14px] py-[5px] text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
				<span className="h-1.5 w-1.5 rounded-full bg-status-ok" /> the paas that
				runs on hardware you own
			</div>
			<h1 className="mx-auto max-w-[860px] text-[52px] font-bold leading-[1.1] tracking-[-0.015em] text-balance">
				Deploy to your own box
				<br />
				with one <span className="text-primary">git push</span>.
			</h1>
			<p className="mx-auto mt-6 max-w-[600px] text-base leading-[1.6] text-muted-foreground text-pretty">
				Open-source, developer-first, zero-trust. Piper turns any box you own
				into a real deploy target with a public HTTPS URL — a cloud VM, an old
				laptop, a home server, even a Raspberry Pi behind CGNAT — without
				exposing your network to anyone, including the relay.
			</p>
			<div className="mt-[34px] flex justify-center">
				<div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-[2px] border border-border bg-card px-[14px] py-[11px] text-[13.5px]">
					<span className="text-primary">$</span>
					<span>{INSTALL_CMD}</span>
					<CopyInstallButton variant="neutral" size="sm" />
				</div>
			</div>
			<div className="mt-4 flex justify-center gap-5 text-[13px] text-muted-foreground">
				<a href={GITHUB_URL} target="_blank" rel="noreferrer">
					read the docs →
				</a>
				<span className="text-border">|</span>
				<a href={GITHUB_URL} target="_blank" rel="noreferrer">
					★ star on github
				</a>
			</div>
		</div>
	);
}

function WhySection() {
	return (
		<div id="why" className="py-16">
			<div className="mb-9 text-center">
				<div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-primary">
					why piper
				</div>
				<h2 className="text-[26px] font-semibold">
					Self-hosting without the tradeoffs
				</h2>
			</div>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[18px]">
				{whyCards.map((c) => (
					<div
						key={c.title}
						className="rounded-[2px] border border-border bg-card p-6 text-center"
					>
						<div className="mb-[14px] text-[20px] text-primary">{c.glyph}</div>
						<div className="mb-[10px] text-[15px] font-semibold">{c.title}</div>
						<p className="text-[13px] leading-[1.6] text-muted-foreground text-pretty">
							{c.body}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

function RelaySection() {
	return (
		<div className="py-16">
			<div className="mb-9 text-center">
				<div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-primary">
					the relay
				</div>
				<h2 className="text-[26px] font-semibold">
					Public traffic, private network
				</h2>
				<p className="mx-auto mt-[14px] max-w-[600px] text-sm leading-[1.6] text-muted-foreground text-pretty">
					TLS terminates on your box; the relay splices ciphertext by SNI over
					an outbound tunnel — so it works behind CGNAT and never sees
					plaintext.
				</p>
			</div>
			<div className="flex flex-wrap items-stretch justify-center text-left">
				<div className="min-w-[220px] flex-1 rounded-[2px] border border-border bg-card p-[18px]">
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-status-idle">
						visitors & cli
					</div>
					<div className="text-[13px] text-foreground">https://app.you.dev</div>
				</div>
				<div className="flex min-w-[78px] flex-col items-center justify-center p-3 text-[12px] text-foreground">
					HTTPS →
				</div>
				<div className="min-w-[220px] flex-[1.15] rounded-[2px] border border-primary bg-primary/[0.07] p-[18px]">
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-primary">
						piper-relay · cloud
					</div>
					<div className="text-[13px] text-foreground">
						SNI passthrough — ciphertext only
					</div>
				</div>
				<div className="flex min-w-[78px] flex-col items-center justify-center p-3 text-center text-[11px] text-foreground">
					← tunnel
					<span className="mt-[3px] text-status-idle">(CGNAT)</span>
				</div>
				<div className="min-w-[220px] flex-[1.15] rounded-[2px] border border-border bg-card p-[18px]">
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-status-ok">
						your box · piperd
					</div>
					<div className="text-[13px] text-foreground">
						Docker · Caddy · TLS ends here
					</div>
				</div>
			</div>
		</div>
	);
}

function HowSection() {
	return (
		<div id="how" className="py-16">
			<div className="mb-9 text-center">
				<div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-primary">
					how it works
				</div>
				<h2 className="text-[26px] font-semibold">
					Three commands to a live URL
				</h2>
			</div>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[18px]">
				{steps.map((s) => (
					<div
						key={s.n}
						className="rounded-[2px] border border-border bg-card p-[22px]"
					>
						<div className="mb-3 text-[12px] text-status-idle">step {s.n}</div>
						<div className="mb-[10px] text-[13.5px] text-foreground">
							<span className="text-primary">$ </span>
							{s.cmd}
						</div>
						<p className="text-[13px] leading-[1.6] text-muted-foreground text-pretty">
							{s.body}
						</p>
					</div>
				))}
			</div>
			<div className="mt-11 border-t border-border pt-[34px] text-center">
				<p className="mx-auto mb-[18px] text-sm text-muted-foreground text-pretty">
					Every push builds your Dockerfile, health-checks it, and serves it at
					your domain.
				</p>
				<CopyInstallButton variant="primary" size="lg" />
			</div>
		</div>
	);
}

function Footer() {
	return (
		<footer className="border-t border-border bg-card">
			<div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 p-6 text-[12px] text-status-idle">
				<span className="font-semibold text-foreground">
					pi@<span className="text-primary">piper</span>
				</span>
				<span>Apache-2.0 · runs on a Pi · openpiper/piper</span>
				<span className="ml-auto flex gap-[18px]">
					<a
						className="text-muted-foreground"
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
					>
						github
					</a>
					<a
						className="text-muted-foreground"
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
					>
						docs
					</a>
					<Link className="text-muted-foreground" to="/login">
						sign in
					</Link>
				</span>
			</div>
		</footer>
	);
}

export function LandingPage() {
	return (
		<div className="min-h-screen bg-background">
			<Header />
			<div id="top" className="mx-auto max-w-[1080px] px-6">
				<Hero />
				<div className="border-t border-border" />
				<WhySection />
				<div className="border-t border-border" />
				<RelaySection />
				<div className="border-t border-border" />
				<HowSection />
			</div>
			<Footer />
		</div>
	);
}
