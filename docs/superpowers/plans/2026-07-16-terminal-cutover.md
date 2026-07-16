# Terminal Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coastal look app-wide with the approved terminal design system — terminal top-bar shell, dark-only, new `/apps` and `/domains` routes, every screen migrated onto terminal tokens + primitives.

**Architecture:** Promote the existing opt-in `.terminal` token block to the app's `:root` (dark-only), remove coastal entirely, build a presentational shell (`AppShell`/`Nav`) + a small set of reused primitives, add two aggregate routes, then migrate each coastal-referencing screen. Presentational primitives live in `src/components/ui/`; app glue (loaders, org-scope wiring) stays in `src/components/` and `src/routes/`.

**Tech Stack:** TanStack Start (file router), Tailwind CSS v4 (`@theme inline`, semantic tokens), class-variance-authority, bun test + Testing Library (happy-dom), Biome.

Spec: [`docs/superpowers/specs/2026-07-16-terminal-cutover-design.md`](../specs/2026-07-16-terminal-cutover-design.md).
Builds on the landed foundation (PR #39): `Button`, `StatusDot`, `Panel`/`PanelHeader`, and the `.terminal` token block in `src/styles.css`.

## Global Constraints

- **Bun only** — never npm/yarn/node. `bun test`, `bun run generate-routes`, `bun run verify`, `bun run format`.
- **TDD** — every new component/helper starts with a failing test, then the implementation. CSS/wiring changes (Task 1) that aren't unit-testable are verified by the existing suite staying green plus the grep gate.
- **Tests never live in `src/routes/`** (the file router scans it). Put testable logic in `src/components/` / `src/lib/` and keep route files thin (loader + a component call).
- **Path alias:** `@/*` → `./src/*`.
- **Primitives on tokens, not hex.** `src/components/ui/` primitives use semantic Tailwind classes (`bg-primary`, `text-muted-foreground`, `border-border`, `text-status-*`, `rounded-[2px]`). Never hardcode a brand hex.
- **Amber `#ffb454` = brand/interactive ONLY** (`--primary`). Device status uses the separate `--status-ok/warn/danger/idle` palette; amber never denotes status.
- **Radius `2px`** (`rounded-[2px]`). **No shadows** — depth is hairline borders.
- **JetBrains Mono** is the app font (dark-only; no light theme, no theme toggle).
- **`src/styles.css` is excluded from Biome** (biome.json) — match the file's existing indentation; formatting isn't enforced there.
- After adding a route file, run `bun run generate-routes` and commit the regenerated `src/routeTree.gen.ts`.
- **`bun run verify` (Biome → tsc → tests → build) must pass before any task is considered done.**
- Conventional commits ending with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

### Coastal → terminal class mapping (used by all migration tasks 7–11)

Apply this table when migrating a screen. Every left-hand token/class must be gone from `src` by Task 12.

| Coastal | Terminal replacement |
|---|---|
| `text-[var(--sea-ink)]` | `text-foreground` |
| `text-[var(--sea-ink-soft)]` | `text-muted-foreground` |
| `border-[var(--line)]`, `border-[var(--chip-line)]` | `border-border` |
| `bg-[var(--chip-bg)]` | `bg-secondary` |
| `bg-[var(--header-bg)]` | `bg-card` |
| `text-[var(--lagoon-deep)]` (app-URL links) | `text-primary` |
| `island-kicker` (class) | `text-[11px] uppercase tracking-widest text-primary` (or `PageHeader` `kicker`) |
| `page-wrap` (class) + ` px-4` | remove — `AppShell` centers content to 1080px |
| `feature-card`, `island-shell` (class) | `Panel` (`rounded-[2px] border border-border bg-card`) |
| `rounded-full` / `rounded-xl` / `rounded-2xl` / `rounded-lg` / `rounded-md` | `rounded-[2px]` |
| `shadow-[…]` (coastal shadows) | remove (flat) |
| `bg-emerald-500` / `bg-gray-400` (status dots) | `StatusDot` glyph, or `bg-status-ok` / `bg-status-idle` |
| `text-red-600` | `text-destructive` |
| `bg-red-600 … text-white` (danger button) | `bg-destructive text-destructive-foreground hover:bg-destructive/90` |
| `bg-foreground text-background` (import-wizard primary btn) | `bg-primary text-primary-foreground hover:bg-primary/90` |
| root body `font-sans` | `font-mono` |

Shared button/input constants used across the form screens migrate to:

```ts
const actionBtn =
	"rounded-[2px] border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50";
const dangerBtn =
	"rounded-[2px] bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50";
```

For text inputs, import `inputClass` from `@/components/ui/field` (Task 3) rather than re-declaring a `field`/`inputClass`/`confirmInput` const.

**Test-preservation rule for migrations:** run the screen's existing test file first; migration must keep every existing assertion green (they assert visible text/roles, not colors). Add the new assertions the task names. Never weaken an existing assertion to make a class change pass.

---

## Task 1: Token cutover + dark-only root

Promote terminal tokens to `:root`, remove coastal, wire the root document dark-only. No new unit test (CSS/wiring); verified by the suite + a grep gate.

**Files:**
- Modify: `src/styles.css`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Produces: app-wide terminal tokens on `:root` (`--background:#0b0b0d`, `--foreground:#f2f2f4`, `--card:#0e0e11`, `--primary:#ffb454`, `--primary-foreground:#0a0a0c`, `--secondary:#1a1a1e`, `--muted-foreground:#9a9aa0`, `--border:#2f2f36`, `--input:#2f2f36`, `--ring:#ffb454`, `--radius:2px`), `--font-mono` JetBrains via `@theme inline`, and the `--status-*` palette. All downstream tasks rely on these.

- [ ] **Step 1: Rewrite `src/styles.css` top-to-bottom.**

Replace the file's current contents with the following (keep the existing tab indentation style; `chart-*` and `sidebar-*` token defs are kept because `@theme inline` maps them):

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
@import 'tailwindcss';
@plugin '@tailwindcss/typography';

@import 'tw-animate-css';

:root {
  /* Status palette — device health, never the amber brand color. */
  --status-ok: #4ade80;
  --status-warn: #fb923c;
  --status-danger: #f87171;
  --status-idle: #6a6a70;

  /* Terminal semantic tokens (amber-on-dark). */
  --background: #0b0b0d;
  --foreground: #f2f2f4;
  --card: #0e0e11;
  --card-foreground: #f2f2f4;
  --popover: #0e0e11;
  --popover-foreground: #f2f2f4;
  --primary: #ffb454; /* amber — brand / interactive only */
  --primary-foreground: #0a0a0c;
  --secondary: #1a1a1e;
  --secondary-foreground: #f2f2f4;
  --muted: #1a1a1e;
  --muted-foreground: #9a9aa0;
  --accent: #1a1a1e; /* shadcn subtle hover — NOT the brand amber */
  --accent-foreground: #f2f2f4;
  --destructive: #f87171;
  --destructive-foreground: #0a0a0c;
  --border: #2f2f36;
  --input: #2f2f36;
  --ring: #ffb454;
  --radius: 2px;

  /* Kept: charts + sidebar tokens are mapped by @theme inline below. */
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: #0e0e11;
  --sidebar-foreground: #f2f2f4;
  --sidebar-primary: #ffb454;
  --sidebar-primary-foreground: #0a0a0c;
  --sidebar-accent: #1a1a1e;
  --sidebar-accent-foreground: #f2f2f4;
  --sidebar-border: #2f2f36;
  --sidebar-ring: #ffb454;
}

@theme inline {
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-status-ok: var(--status-ok);
  --color-status-warn: var(--status-warn);
  --color-status-danger: var(--status-danger);
  --color-status-idle: var(--status-idle);
  --radius-sm: calc(var(--radius) - 1px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  --radius-xl: calc(var(--radius) + 4px);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

html,
body,
#app {
  min-height: 100%;
}

body {
  margin: 0;
  color: var(--foreground);
  font-family: var(--font-mono);
  background-color: var(--background);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: var(--primary);
  text-decoration: none;
  transition: color 150ms ease;
}

a:hover {
  text-decoration: underline;
}

code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  border: 1px solid var(--border);
  background: var(--secondary);
  border-radius: 2px;
  padding: 2px 6px;
}

pre code {
  border: 0;
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
  color: inherit;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
  }
}
```

This removes: the Fraunces/Manrope `@import`, `@custom-variant dark`, all coastal brand tokens (`--sea-ink*`, `--lagoon*`, `--palm`, `--sand`, `--foam`, `--surface*`, `--line`, `--inset-glint`, `--kicker`, `--bg-base`, `--header-bg`, `--chip-*`, `--link-bg-hover`, `--hero-*`), the light shadcn `:root` values, the entire `.dark` block, the `.terminal` scope block (promoted to `:root`), the gradient `body`/`body::before`/`body::after`, and the coastal classes (`.page-wrap`, `.display-title`, `.island-shell`, `.feature-card`, `.island-kicker`, `.nav-link`, `.rise-in` + keyframes, `.site-footer`, `.prose pre`).

- [ ] **Step 2: Verify the app builds and existing tests pass.**

Run: `bun run verify`
Expected: PASS (Biome, tsc, tests, build all green). No test asserts coastal styling, so the suite stays green.

- [ ] **Step 3: Remove theme wiring from `src/routes/__root.tsx`.**

- Delete the `THEME_INIT_SCRIPT` const and the `<script dangerouslySetInnerHTML=...>` line in `<head>` (and its `biome-ignore` comment).
- Change the `<body>` className from `"font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]"` to `"font-mono antialiased [overflow-wrap:anywhere] selection:bg-primary/25"`.
- Leave `suppressHydrationWarning` on both `<html>` and `<body>`.
- (RootLayout still renders `<Header/>` here; the shell replaces it in Task 4.)

- [ ] **Step 4: Verify.**

Run: `bun run verify`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/styles.css src/routes/__root.tsx
git commit -m "feat: promote terminal tokens to :root, dark-only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Display primitives — PageHeader, Row, HintBar

Three small presentational primitives, each with a test.

**Files:**
- Create: `src/components/ui/page-header.tsx`, `src/components/ui/page-header.test.tsx`
- Create: `src/components/ui/row.tsx`, `src/components/ui/row.test.tsx`
- Create: `src/components/ui/hint-bar.tsx`, `src/components/ui/hint-bar.test.tsx`

**Interfaces:**
- Produces:
  - `PageHeader({ kicker?: ReactNode; title: string; subtitle?: ReactNode; className?: string })` — renders an optional uppercase amber kicker, an `# {title}` heading (the `# ` in muted), and an optional subtitle.
  - `Row(props: ComponentProps<"div">)` — a panel row: `flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground` with a top hairline between adjacent rows.
  - `HintBar({ children: ReactNode; className?: string })` — a `$`-prefixed muted line (amber `$`).

- [ ] **Step 1: Write the failing tests.**

`src/components/ui/page-header.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

test("renders the title with a # prefix", () => {
	render(<PageHeader title="boxes" />);
	expect(screen.getByRole("heading").textContent).toBe("# boxes");
});

test("renders kicker and subtitle when given", () => {
	render(<PageHeader kicker="your hardware" title="boxes" subtitle="4 boxes" />);
	expect(screen.getByText("your hardware")).toBeTruthy();
	expect(screen.getByText("4 boxes")).toBeTruthy();
});

test("omits kicker and subtitle when absent", () => {
	render(<PageHeader title="apps" />);
	expect(screen.queryByText("your hardware")).toBeNull();
});
```

`src/components/ui/row.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Row } from "./row";

test("renders children", () => {
	render(<Row>hello</Row>);
	expect(screen.getByText("hello")).toBeTruthy();
});

test("carries the row layout classes and merges className", () => {
	render(<Row className="extra">x</Row>);
	const el = screen.getByText("x");
	expect(el.className).toContain("items-center");
	expect(el.className).toContain("extra");
});
```

`src/components/ui/hint-bar.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HintBar } from "./hint-bar";

test("prefixes the hint with $", () => {
	render(<HintBar>run piper connect</HintBar>);
	expect(screen.getByText(/run piper connect/)).toBeTruthy();
	expect(screen.getByText("$", { exact: false }).textContent).toContain("$");
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `bun test src/components/ui/page-header.test.tsx src/components/ui/row.test.tsx src/components/ui/hint-bar.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the primitives.**

`src/components/ui/page-header.tsx`:
```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
	kicker,
	title,
	subtitle,
	className,
}: {
	kicker?: ReactNode;
	title: string;
	subtitle?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-1", className)}>
			{kicker != null && (
				<div className="text-[11px] uppercase tracking-widest text-primary">
					{kicker}
				</div>
			)}
			<h1 className="font-semibold text-xl">
				<span className="text-muted-foreground">{"# "}</span>
				{title}
			</h1>
			{subtitle != null && (
				<p className="text-muted-foreground text-sm">{subtitle}</p>
			)}
		</div>
	);
}
```

`src/components/ui/row.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// A panel row: horizontal, with a hairline divider above adjacent rows.
export function Row({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground [&+&]:border-border [&+&]:border-t",
				className,
			)}
			{...props}
		/>
	);
}
```

`src/components/ui/hint-bar.tsx`:
```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Terminal command-echo hint. Wrap command words in <code> for amber emphasis.
export function HintBar({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<p className={cn("text-muted-foreground text-sm", className)}>
			<span className="text-primary">{"$ "}</span>
			{children}
		</p>
	);
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `bun test src/components/ui/page-header.test.tsx src/components/ui/row.test.tsx src/components/ui/hint-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/ui/page-header.tsx src/components/ui/page-header.test.tsx src/components/ui/row.tsx src/components/ui/row.test.tsx src/components/ui/hint-bar.tsx src/components/ui/hint-bar.test.tsx
git commit -m "feat: add PageHeader, Row, HintBar primitives

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Form input primitive — Field, Input

**Files:**
- Create: `src/components/ui/field.tsx`, `src/components/ui/field.test.tsx`

**Interfaces:**
- Produces:
  - `inputClass: string` — the terminal input styling (`rounded-[2px] border border-input bg-transparent …`), for forms that render a bare `<input name=… />` (FormData-driven).
  - `Input(props: ComponentProps<"input">)` — an `<input>` pre-styled with `inputClass`, forwarding all native props.
  - `Field({ label: ReactNode; children: ReactNode; className? })` — a `<label>` wrapper stacking `label` above `children`.

- [ ] **Step 1: Write the failing test.**

`src/components/ui/field.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Field, Input, inputClass } from "./field";

test("Input applies inputClass and forwards native props", () => {
	render(<Input aria-label="Domain" placeholder="shop.example.com" />);
	const el = screen.getByLabelText("Domain") as HTMLInputElement;
	expect(el.className).toContain(inputClass.split(" ")[0]);
	expect(el.placeholder).toBe("shop.example.com");
});

test("Field renders its label and child control", () => {
	render(
		<Field label="Domain">
			<Input aria-label="Domain" />
		</Field>,
	);
	expect(screen.getByText("Domain")).toBeTruthy();
	expect(screen.getByLabelText("Domain")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `bun test src/components/ui/field.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.**

`src/components/ui/field.tsx`:
```tsx
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
	"rounded-[2px] border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
	return <input className={cn(inputClass, className)} {...props} />;
}

export function Field({
	label,
	children,
	className,
}: {
	label: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<label className={cn("flex flex-col gap-1 text-sm", className)}>
			{label}
			{children}
		</label>
	);
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `bun test src/components/ui/field.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/ui/field.tsx src/components/ui/field.test.tsx
git commit -m "feat: add Field/Input form primitive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: App shell + nav, wired into the root

Build the presentational `AppShell`/`Nav`, an `AppFrame` glue component that computes nav items + right-side controls from org scope, and wire it into `__root.tsx` replacing `Header`. Delete the now-unused `Header` and `ThemeToggle`.

**Files:**
- Create: `src/components/ui/app-shell.tsx`, `src/components/ui/app-shell.test.tsx`
- Create: `src/components/app-frame.tsx`
- Modify: `src/routes/__root.tsx`
- Delete: `src/components/Header.tsx`, `src/components/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `useOrgScope()` (`{ username, scope, setScope, orgs, invites }`), `OrgSwitcher`, `SessionControls`, and the org server fns (`createOrgFn`, `acceptInviteFn`, `declineInviteFn`).
- Produces:
  - `type NavItem = { label: string; to: string; params?: Record<string, string>; exact?: boolean }`.
  - `Nav({ items: NavItem[] })` — horizontal terminal tabs; the active tab (route match) is a solid amber block.
  - `AppShell({ navItems: NavItem[]; right?: ReactNode; children: ReactNode })` — sticky top bar (`pi@piper` brand + `Nav` + `right`) above a centered 1080px content container.
  - `AppFrame({ children })` — wires nav items + org/session controls from scope, renders `AppShell`.

- [ ] **Step 1: Write the failing test.**

`src/components/ui/app-shell.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { AppShell, Nav, type NavItem } from "./app-shell";

const items: NavItem[] = [
	{ label: "boxes", to: "/", exact: true },
	{ label: "apps", to: "/apps" },
];

// A minimal 2-route tree so <Nav>'s <Link>s resolve and active state is real.
async function renderAt(path: string, node: React.ReactNode) {
	const root = createRootRoute({ component: () => <>{node}<Outlet /></> });
	const index = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
	const apps = createRoute({ getParentRoute: () => root, path: "/apps", component: () => null });
	const router = createRouter({ routeTree: root.addChildren([index, apps]) });
	await router.navigate({ to: path });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("Nav renders a tab per item with correct hrefs", async () => {
	await renderAt("/", <Nav items={items} />);
	expect(screen.getByText("boxes").getAttribute("href")).toBe("/");
	expect(screen.getByText("apps").getAttribute("href")).toBe("/apps");
});

test("the active tab gets the amber block styling", async () => {
	await renderAt("/apps", <Nav items={items} />);
	expect(screen.getByText("apps").className).toContain("bg-primary");
	expect(screen.getByText("boxes").className).not.toContain("bg-primary");
});

test("AppShell renders the brand, right slot and children", async () => {
	await renderAt("/", <AppShell navItems={items} right={<span>me</span>}>body</AppShell>);
	expect(screen.getByText("piper")).toBeTruthy();
	expect(screen.getByText("me")).toBeTruthy();
	expect(screen.getByText("body")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `bun test src/components/ui/app-shell.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/components/ui/app-shell.tsx`.**

```tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type NavItem = {
	label: string;
	to: string;
	params?: Record<string, string>;
	exact?: boolean;
};

const tabBase =
	"border-border border-r px-4 py-2.5 text-sm no-underline first:border-l";
const tabInactive = `${tabBase} text-muted-foreground hover:text-foreground`;
const tabActive = `${tabBase} bg-primary text-primary-foreground font-medium`;

export function Nav({ items }: { items: NavItem[] }) {
	return (
		<nav className="flex">
			{items.map((item) => (
				<Link
					key={item.label}
					to={item.to}
					params={item.params}
					activeOptions={{ exact: item.exact ?? false }}
					activeProps={{ className: tabActive }}
					inactiveProps={{ className: tabInactive }}
				>
					{item.label}
				</Link>
			))}
		</nav>
	);
}

export function AppShell({
	navItems,
	right,
	children,
}: {
	navItems: NavItem[];
	right?: ReactNode;
	children: ReactNode;
}) {
	return (
		<>
			<header className="sticky top-0 z-50 flex items-center border-border border-b bg-card">
				<Link
					to="/"
					className="border-border border-r px-4 py-2.5 font-semibold text-foreground text-sm no-underline"
				>
					pi@<span className="text-primary">piper</span>
				</Link>
				{navItems.length > 0 && <Nav items={navItems} />}
				{right != null && (
					<div className="ml-auto flex items-center gap-2 px-3">{right}</div>
				)}
			</header>
			<div className="mx-auto w-[min(1080px,100%-2rem)]">{children}</div>
		</>
	);
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `bun test src/components/ui/app-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `src/components/app-frame.tsx`** (app glue; moves the old `HeaderSwitcher` logic here).

```tsx
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/ui/app-shell";
import { acceptInviteFn, createOrgFn, declineInviteFn } from "@/server/fns";
import { useOrgScope } from "./org-scope";
import { OrgSwitcher } from "./org-switcher";
import SessionControls from "./SessionControls";

export function AppFrame({ children }: { children: ReactNode }) {
	const { username, scope, setScope, orgs, invites } = useOrgScope();
	const router = useRouter();

	const navItems: NavItem[] = username
		? [
				{ label: "boxes", to: "/", exact: true },
				{ label: "apps", to: "/apps" },
				{ label: "domains", to: "/domains" },
				...(scope !== "personal"
					? [
							{
								label: "settings",
								to: "/orgs/$slug/settings",
								params: { slug: scope },
							} as NavItem,
						]
					: []),
			]
		: [];

	const right = username ? (
		<>
			<OrgSwitcher
				scope={scope}
				orgs={orgs}
				invites={invites}
				onSelect={setScope}
				onCreate={async (name) => {
					const org = await createOrgFn({ data: name });
					router.invalidate();
					return org;
				}}
				onManage={(slug) =>
					router.navigate({ to: "/orgs/$slug/settings", params: { slug } })
				}
				onAccept={async (slug) => {
					await acceptInviteFn({ data: slug });
					setScope(slug);
					router.invalidate();
				}}
				onDecline={async (slug) => {
					await declineInviteFn({ data: slug });
					router.invalidate();
				}}
			/>
			<SessionControls username={username} />
		</>
	) : null;

	return (
		<AppShell navItems={navItems} right={right}>
			{children}
		</AppShell>
	);
}
```

- [ ] **Step 6: Wire it into `src/routes/__root.tsx`.**

- Remove `import Header from "../components/Header";` and add `import { AppFrame } from "../components/app-frame";`.
- Replace the `RootLayout` body's `<Header … />` + `<Outlet />` with:
```tsx
		<OrgScopeProvider
			username={data?.username ?? null}
			orgs={data?.orgs ?? []}
			invites={data?.invites ?? []}
		>
			<AppFrame>
				<Outlet />
			</AppFrame>
		</OrgScopeProvider>
```

- [ ] **Step 7: Delete the orphaned files.**

```bash
git rm src/components/Header.tsx src/components/ThemeToggle.tsx
```
(Both are now unused — `Header` is replaced by `AppFrame`; `ThemeToggle` was only imported by `Header`, and the app is dark-only.)

- [ ] **Step 8: Verify.**

Run: `bun run verify`
Expected: PASS. (If tsc reports an unused import or a dangling `Header`/`ThemeToggle` reference, fix it — nothing else should reference them.)

- [ ] **Step 9: Commit.**

```bash
git add -A
git commit -m "feat: terminal app shell + nav, replace Header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: /apps route + AppsList

An aggregate apps view: flatten every box's apps (reusing `getApps()`), list each with its served URL.

**Files:**
- Create: `src/lib/app-status.ts`, `src/lib/app-status.test.ts`
- Create: `src/components/apps-list.tsx`, `src/components/apps-list.test.tsx`
- Create: `src/routes/apps.tsx`
- Modify (generated): `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `getApps()` → `BoxWithApps[]`; `useOrgScope()`; `StatusDot`, `Panel`/`PanelHeader`, `Row`, `PageHeader`, `HintBar`.
- Produces:
  - `appDeviceStatus(status: string): DeviceStatus` in `@/lib/app-status`.
  - `flattenApps(boxes, scope, username): FlatApp[]` where `FlatApp = { base: string; app: App }`.
  - `AppsList({ boxes: BoxWithApps[]; scope: string; username: string | null })`.

- [ ] **Step 1: Write the failing tests.**

`src/lib/app-status.test.ts`:
```ts
import { expect, test } from "bun:test";
import { appDeviceStatus } from "./app-status";

test("maps app status to device status", () => {
	expect(appDeviceStatus("running")).toBe("ok");
	expect(appDeviceStatus("building")).toBe("warn");
	expect(appDeviceStatus("failed")).toBe("danger");
	expect(appDeviceStatus("stopped")).toBe("idle");
	expect(appDeviceStatus("")).toBe("idle");
	expect(appDeviceStatus("weird")).toBe("idle");
});
```

`src/components/apps-list.test.tsx`:
```tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxWithApps } from "@/server/relay";
import { AppsList, flattenApps } from "./apps-list";

const app = (
	name: string,
	status: string,
	hostname = "",
): BoxWithApps["apps"][number] => ({
	name,
	port: 8081,
	repo: "getpiper/x",
	branch: "main",
	hostname,
	createdAt: "2026-07-11T10:00:00Z",
	status,
});

const boxes: BoxWithApps[] = [
	{ base: "rpi-octocat", owner: "octocat", connected: true, apps: [app("web", "running", "web.public.example")] },
	{ base: "rpi-acme", owner: "acme", connected: true, apps: [app("api", "stopped", "")] },
];

test("flattenApps flattens and scopes by owner", () => {
	expect(flattenApps(boxes, "personal", "octocat").map((f) => f.app.name)).toEqual(["web"]);
	expect(flattenApps(boxes, "acme", "octocat").map((f) => f.app.name)).toEqual(["api"]);
});

async function renderList(scope: string, username: string) {
	const root = createRootRoute({
		component: () => <AppsList boxes={boxes} scope={scope} username={username} />,
	});
	const router = createRouter({ routeTree: root });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("lists an app with its served URL", async () => {
	await renderList("personal", "octocat");
	expect(screen.getByText("web")).toBeTruthy();
	const link = screen.getByText("web.public.example");
	expect(link.getAttribute("href")).toBe("https://web.public.example");
});

test("shows 'not deployed' for an app with no hostname", async () => {
	await renderList("acme", "octocat");
	expect(screen.getByText(/not deployed/i)).toBeTruthy();
});

test("shows the empty hint when no apps are in scope", async () => {
	await renderList("personal", "nobody");
	expect(screen.getByText(/piper deploy/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `bun test src/lib/app-status.test.ts src/components/apps-list.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/lib/app-status.ts`.**

```ts
import type { DeviceStatus } from "@/components/ui/status-dot";

// Maps a relay app status to the device-status palette used by StatusDot.
export function appDeviceStatus(status: string): DeviceStatus {
	switch (status) {
		case "running":
			return "ok";
		case "building":
			return "warn";
		case "failed":
			return "danger";
		default:
			return "idle";
	}
}
```

- [ ] **Step 4: Implement `src/components/apps-list.tsx`.**

```tsx
import { Link } from "@tanstack/react-router";
import { HintBar } from "@/components/ui/hint-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";
import { appDeviceStatus } from "@/lib/app-status";
import type { App, BoxWithApps } from "@/server/relay";

export type FlatApp = { base: string; app: App };

export function flattenApps(
	boxes: BoxWithApps[],
	scope: string,
	username: string | null,
): FlatApp[] {
	return boxes
		.filter((b) =>
			scope === "personal" ? b.owner === username : b.owner === scope,
		)
		.flatMap((b) => b.apps.map((app) => ({ base: b.base, app })));
}

export function AppsList({
	boxes,
	scope,
	username,
}: {
	boxes: BoxWithApps[];
	scope: string;
	username: string | null;
}) {
	const apps = flattenApps(boxes, scope, username);
	return (
		<main className="flex flex-col gap-5 py-8">
			<PageHeader
				kicker="your software"
				title="apps"
				subtitle={`${apps.length} apps`}
			/>
			{apps.length === 0 ? (
				<HintBar>
					deploy one with <code>piper deploy</code> from a box.
				</HintBar>
			) : (
				<Panel>
					<PanelHeader>app</PanelHeader>
					{apps.map(({ base, app }) => (
						<Row key={`${base}/${app.name}`}>
							<StatusDot status={appDeviceStatus(app.status)} />
							<Link
								to="/boxes/$base/apps/$app"
								params={{ base, app: app.name }}
								className="text-foreground no-underline hover:underline"
							>
								{app.name}
							</Link>
							<span>· {base}</span>
							<span className="hidden sm:inline">
								· {app.repo}@{app.branch}
							</span>
							{app.hostname ? (
								<a
									href={`https://${app.hostname}`}
									className="ml-auto truncate text-primary no-underline hover:underline"
								>
									{app.hostname}
								</a>
							) : (
								<span className="ml-auto text-muted-foreground">
									not deployed
								</span>
							)}
						</Row>
					))}
				</Panel>
			)}
		</main>
	);
}
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `bun test src/lib/app-status.test.ts src/components/apps-list.test.tsx`
Expected: PASS.

- [ ] **Step 6: Create the route `src/routes/apps.tsx`.**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppsList } from "@/components/apps-list";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import { getApps } from "@/server/fns";

export const Route = createFileRoute("/apps")({
	loader: () => getApps(),
	component: AppsPage,
	errorComponent: RelayError,
});

function AppsPage() {
	const boxes = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	return <AppsList boxes={boxes} scope={scope} username={username} />;
}
```

- [ ] **Step 7: Regenerate the route tree.**

Run: `bun run generate-routes`
Expected: `src/routeTree.gen.ts` now includes the `/apps` route.

- [ ] **Step 8: Verify.**

Run: `bun run verify`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add src/lib/app-status.ts src/lib/app-status.test.ts src/components/apps-list.tsx src/components/apps-list.test.tsx src/routes/apps.tsx src/routeTree.gen.ts
git commit -m "feat: add /apps aggregate route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: /domains route + DomainsList

A per-box custom-domains view: each box's domain config (one `getDomain` call per online box) + the apps served under it.

**Files:**
- Modify: `src/server/relay.ts` (add `BoxDomain` type + `fetchAllDomains`)
- Modify: `src/server/fns.ts` (add `getDomainsFn`)
- Create: `src/components/domains-list.tsx`, `src/components/domains-list.test.tsx`
- Create: `src/routes/domains.tsx`
- Modify (generated): `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `fetchAllApps`, `getDomain`, `BoxOfflineError`, `RelayAuthError` (relay.ts); `getCookie`, `redirect`, `dropSessionAndRedirect` (fns.ts); `StatusDot`, `Panel`/`PanelHeader`, `Row`, `PageHeader`, `HintBar`.
- Produces:
  - `type BoxDomain = { box: BoxWithApps; domain: DomainStatus | null }` and `fetchAllDomains(credential): Promise<BoxDomain[]>` in relay.ts.
  - `getDomainsFn()` server fn → `BoxDomain[]` in fns.ts.
  - `DomainsList({ items: BoxDomain[]; scope: string; username: string | null })`.

- [ ] **Step 1: Add `fetchAllDomains` to `src/server/relay.ts`** (place after `fetchBox`, near the other box aggregate fns).

```ts
export type BoxDomain = { box: BoxWithApps; domain: DomainStatus | null };

// One custom-domain config per box (the domain is box-scoped, not per-app).
// Offline boxes can't be reached, so their domain is null.
export async function fetchAllDomains(
	credential: string,
): Promise<BoxDomain[]> {
	const boxes = await fetchAllApps(credential);
	return Promise.all(
		boxes.map(async (box) => {
			if (!box.connected) return { box, domain: null };
			try {
				return { box, domain: await getDomain(credential, box.base) };
			} catch (err) {
				if (err instanceof BoxOfflineError) return { box, domain: null };
				throw err;
			}
		}),
	);
}
```

- [ ] **Step 2: Add `getDomainsFn` to `src/server/fns.ts`** (mirror `getApps`; add `fetchAllDomains` to the existing `@/server/relay` import).

```ts
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
```

- [ ] **Step 3: Write the failing test `src/components/domains-list.test.tsx`.**

```tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { BoxDomain, DomainStatus } from "@/server/relay";
import { DomainsList } from "./domains-list";

const domain = (over: Partial<DomainStatus> = {}): DomainStatus => ({
	domain: "shop.example.com",
	dnsProvider: "cloudflare",
	dnsTokenSet: true,
	source: "api",
	status: "active",
	error: "",
	certNotAfter: null,
	dnsRecords: [],
	dnsOk: true,
	...over,
});

const app = (name: string) => ({
	name,
	port: 8081,
	repo: "r",
	branch: "main",
	hostname: "",
	createdAt: "2026-07-11T10:00:00Z",
	status: "running",
});

const items: BoxDomain[] = [
	{
		box: { base: "rpi-octocat", owner: "octocat", connected: true, apps: [app("web")] },
		domain: domain(),
	},
	{
		box: { base: "bare-octocat", owner: "octocat", connected: true, apps: [] },
		domain: null,
	},
];

async function renderList(scope = "personal", username = "octocat") {
	const root = createRootRoute({
		component: () => <DomainsList items={items} scope={scope} username={username} />,
	});
	const router = createRouter({ routeTree: root });
	await router.navigate({ to: "/" });
	// biome-ignore lint/suspicious/noExplicitAny: test router typing shortcut
	render(<RouterProvider router={router as any} />);
}

test("shows a configured box's domain and the app served under it", async () => {
	await renderList();
	expect(screen.getByText("shop.example.com")).toBeTruthy();
	expect(screen.getByText("web.shop.example.com")).toBeTruthy();
	expect(screen.getByText(/dns ok/i)).toBeTruthy();
});

test("offers 'add domain' for a box with no custom domain", async () => {
	await renderList();
	const link = screen.getByText(/add domain/i);
	expect(link.getAttribute("href")).toBe("/boxes/bare-octocat");
});

test("scopes boxes by owner", async () => {
	await renderList("acme", "octocat");
	expect(screen.queryByText("rpi-octocat")).toBeNull();
	expect(screen.getByText(/piper connect/i)).toBeTruthy();
});
```

- [ ] **Step 4: Run to verify it fails.**

Run: `bun test src/components/domains-list.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 5: Implement `src/components/domains-list.tsx`.**

```tsx
import { Link } from "@tanstack/react-router";
import { HintBar } from "@/components/ui/hint-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Row } from "@/components/ui/row";
import { type DeviceStatus, StatusDot } from "@/components/ui/status-dot";
import type { BoxDomain } from "@/server/relay";

function domainDeviceStatus(status: string): DeviceStatus {
	switch (status) {
		case "active":
			return "ok";
		case "issuing":
			return "warn";
		case "failed":
			return "danger";
		default:
			return "idle";
	}
}

export function DomainsList({
	items,
	scope,
	username,
}: {
	items: BoxDomain[];
	scope: string;
	username: string | null;
}) {
	const scoped = items.filter(({ box }) =>
		scope === "personal" ? box.owner === username : box.owner === scope,
	);

	if (scoped.length === 0) {
		return (
			<main className="flex flex-col gap-5 py-8">
				<PageHeader kicker="your endpoints" title="domains" />
				<HintBar>
					enroll a box with <code>piper connect</code> to add a domain.
				</HintBar>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-5 py-8">
			<PageHeader
				kicker="your endpoints"
				title="domains"
				subtitle={`${scoped.length} boxes`}
			/>
			<div className="flex flex-col gap-4">
				{scoped.map(({ box, domain }) => (
					<Panel key={box.base}>
						<PanelHeader className="flex items-center gap-2 normal-case tracking-normal">
							<span className="text-foreground">{box.base}</span>
							{domain?.domain ? (
								<StatusDot
									status={domainDeviceStatus(domain.status)}
									className="ml-auto"
								>
									{domain.status || "configured"}
								</StatusDot>
							) : (
								<Link
									to="/boxes/$base"
									params={{ base: box.base }}
									className="ml-auto text-primary no-underline hover:underline"
								>
									add domain
								</Link>
							)}
						</PanelHeader>
						{domain?.domain ? (
							<>
								<Row>
									<span className="text-foreground">{domain.domain}</span>
									<span className="ml-auto">
										{domain.dnsOk ? "dns ok" : "dns pending"}
									</span>
								</Row>
								{box.apps.length === 0 ? (
									<Row>no apps served</Row>
								) : (
									box.apps.map((a) => (
										<Row key={a.name}>
											<span className="text-foreground">{a.name}</span>
											<span className="ml-auto text-primary">
												{a.name}.{domain.domain}
											</span>
										</Row>
									))
								)}
							</>
						) : (
							<Row>no custom domain</Row>
						)}
					</Panel>
				))}
			</div>
		</main>
	);
}
```

- [ ] **Step 6: Run to verify it passes.**

Run: `bun test src/components/domains-list.test.tsx`
Expected: PASS.

- [ ] **Step 7: Create the route `src/routes/domains.tsx`.**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DomainsList } from "@/components/domains-list";
import { useOrgScope } from "@/components/org-scope";
import { RelayError } from "@/components/relay-error";
import { getDomainsFn } from "@/server/fns";

export const Route = createFileRoute("/domains")({
	loader: () => getDomainsFn(),
	component: DomainsPage,
	errorComponent: RelayError,
});

function DomainsPage() {
	const items = Route.useLoaderData();
	const { scope, username } = useOrgScope();
	return <DomainsList items={items} scope={scope} username={username} />;
}
```

- [ ] **Step 8: Regenerate routes and verify.**

Run: `bun run generate-routes && bun run verify`
Expected: `/domains` in the route tree; verify PASS.

- [ ] **Step 9: Commit.**

```bash
git add src/server/relay.ts src/server/fns.ts src/components/domains-list.tsx src/components/domains-list.test.tsx src/routes/domains.tsx src/routeTree.gen.ts
git commit -m "feat: add /domains per-box custom-domains route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Migrate apps-home (boxes landing)

Migrate the boxes list onto terminal tokens + primitives. Keep `StatusBadge` (migrated in Task 11) and every existing test assertion green.

**Files:**
- Modify: `src/components/apps-home.tsx`
- Test (keep green): `src/components/apps-home.test.tsx`

- [ ] **Step 1: Run the existing test to confirm the baseline.**

Run: `bun test src/components/apps-home.test.tsx`
Expected: PASS (before changes).

- [ ] **Step 2: Migrate `apps-home.tsx` per the mapping table.**

Preserve these exact strings the test asserts: the count chips `"{n} boxes · {n} online"` and `"{n} apps live"`; `"Connected"` / `"Offline"`; `"Not deployed yet"`; `"No apps deployed on this box."`; the empty-state text containing `"No boxes yet"` and `<code>piper connect</code>`; the org empty-state `<code>piper enroll --org {scope}</code>`; box names and app names.

Concretely:
- Replace the outer `<main className="page-wrap flex flex-col gap-N px-4 py-8">` with `<main className="flex flex-col gap-N py-8">` (both the empty and populated returns).
- Replace the `island-kicker` div + `<h1 … text-[var(--sea-ink)]>Boxes</h1>` with `<PageHeader kicker="your hardware" title="boxes" />`. (Import `PageHeader` from `@/components/ui/page-header`.) For the populated header keep the two count chips beside it — wrap the `PageHeader` and the chips in the existing `flex … justify-between` row.
- Count chips: swap `rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] … text-[var(--sea-ink)]` → `rounded-[2px] border border-border bg-secondary px-3 py-1 font-semibold text-sm text-foreground`.
- Each box `<section className="feature-card … rounded-2xl border border-[var(--line)] p-5">` → `Panel` with `className="flex flex-col gap-3.5 p-4"` (import `Panel` from `@/components/ui/panel`).
- Box name `Link`: `text-[var(--sea-ink)]` → `text-foreground` (keep `font-mono` or drop; both fine).
- Connected indicator: keep the dot + `"Connected"`/`"Offline"` text; swap `bg-emerald-500`/`bg-gray-400` → `bg-status-ok`/`bg-status-idle`, and `text-[var(--sea-ink)]` → `text-foreground`.
- App rows: `border-t border-[var(--line)]` → `border-border border-t`; app name `text-[var(--sea-ink)]` → `text-foreground`; the hostname `<a … text-[var(--lagoon-deep)]>` → `text-primary`; keep `StatusBadge` and `relativeTime` as-is.
- Empty state: keep the sentence and `<code>` exactly; the outer `<main>` swap above applies.

- [ ] **Step 3: Run the test to confirm it still passes.**

Run: `bun test src/components/apps-home.test.tsx`
Expected: PASS (all existing assertions green).

- [ ] **Step 4: Verify + commit.**

Run: `bun run verify`
```bash
git add src/components/apps-home.tsx
git commit -m "refactor: migrate apps-home to terminal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Migrate app-detail + box-detail

Both are box/app views sharing `StatusPill`. Apply the mapping table; keep tests green.

**Files:**
- Modify: `src/components/app-detail.tsx`, `src/components/box-detail.tsx`
- Test (keep green): `src/components/app-detail.test.tsx`, `src/components/box-detail.test.tsx`

- [ ] **Step 1: Baseline.**

Run: `bun test src/components/app-detail.test.tsx src/components/box-detail.test.tsx`
Expected: PASS.

- [ ] **Step 2: Migrate `app-detail.tsx`.**

- Replace the two module-level button consts and `confirmInput` with the shared terminal `actionBtn`/`dangerBtn` from the mapping table, and import `inputClass` from `@/components/ui/field` (use it where `confirmInput` was used).
- Outer `<main className="page-wrap … px-4 py-8">` → `<main className="flex flex-col gap-6 py-8">` (all three returns).
- `<h1 className="font-mono font-semibold text-xl">` — keep (mono is fine); it uses no coastal token.
- Hostname `<a … text-muted-foreground underline>` → `text-primary` (drop the coastal-free `underline`, rely on hover). App `repo · branch` line unchanged.
- `DeploymentRow` `<li className="rounded-lg border border-[var(--line)]">` → `rounded-[2px] border border-border`; the PR `<a … underline>` keep; the confirm box `border border-red-600/40` → `border border-destructive/40`; `text-red-600` → `text-destructive`.
- `LogPanel` `<pre … border-[var(--line)] border-t bg-[var(--chip-bg)]>` → `border-border border-t bg-secondary`.

- [ ] **Step 3: Migrate `box-detail.tsx`.**

- Outer `<main className="page-wrap … px-4 py-8">` → `<main className="flex flex-col gap-4 py-8">`.
- Connected dot `bg-emerald-500`/`bg-gray-400` → `bg-status-ok`/`bg-status-idle`.
- Owner chip `rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)]` → `rounded-[2px] border border-border bg-secondary`.
- "New project" `Link`: `rounded-lg border border-[var(--line)] … hover:bg-[var(--chip-bg)]` → `rounded-[2px] border border-border … hover:bg-secondary`.
- App list `Link`: `rounded-lg border border-[var(--line)] … hover:bg-[var(--chip-bg)]` → `rounded-[2px] border border-border … hover:bg-secondary`.
- Keep `StatusPill` (migrated in Task 11) and all text.

- [ ] **Step 4: Tests + verify + commit.**

Run: `bun test src/components/app-detail.test.tsx src/components/box-detail.test.tsx` → PASS.
Run: `bun run verify` → PASS.
```bash
git add src/components/app-detail.tsx src/components/box-detail.tsx
git commit -m "refactor: migrate app-detail and box-detail to terminal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Migrate import-wizard + org-settings

Two form-heavy screens. Adopt `Input`/`Field` and the shared button consts; keep tests green.

**Files:**
- Modify: `src/components/import-wizard.tsx`, `src/components/org-settings.tsx`
- Test (keep green): `src/components/import-wizard.test.tsx`, `src/components/org-settings.test.tsx`

- [ ] **Step 1: Baseline.**

Run: `bun test src/components/import-wizard.test.tsx src/components/org-settings.test.tsx`
Expected: PASS.

- [ ] **Step 2: Migrate `import-wizard.tsx`.**

- Remove the `inputClass`/`primaryBtn`/`secondaryBtn` module consts. Import `inputClass` and `Input` from `@/components/ui/field`.
- Replace `primaryBtn` usages with `"self-start rounded-[2px] bg-primary px-4 py-2 text-primary-foreground text-sm hover:bg-primary/90"` (used on both the `<button>` and the "View app" `<Link>`), and `secondaryBtn` with the shared `actionBtn`.
- Replace each `<input … className={inputClass}>` with `<Input … />` (keep every `name`, `required`, `defaultValue`, `placeholder`, `value/onChange`, `inputMode`). Keep the `<label className="flex flex-col gap-1 text-sm">` wrappers, or switch to `<Field label="…">` — either is fine; if using `Field`, keep the input's props identical.
- Outer `<main className="page-wrap … px-4 py-8">` → `<main className="flex flex-col gap-6 py-8">`.
- `text-red-600` → `text-destructive`.
- The command `<pre className="… rounded-md border border-[var(--line)] bg-[var(--chip-bg)]">` → `rounded-[2px] border border-border bg-secondary`.

- [ ] **Step 3: Migrate `org-settings.tsx`.**

- Replace the `actionBtn`/`dangerBtn`/`field` consts with the shared terminal `actionBtn`/`dangerBtn`; import `inputClass` from `@/components/ui/field` and use it where `field` was used (or use `<Input>`).
- Outer `<div className="page-wrap flex flex-col gap-8 py-8">` → `<div className="flex flex-col gap-8 py-8">`.
- Member table rows `border-[var(--line)] border-b` → `border-border border-b`.
- `text-red-600` (danger-zone heading, error text) → `text-destructive`.
- Keep all member/invite/danger text and `aria-label`s exactly (tests click by them).

- [ ] **Step 4: Tests + verify + commit.**

Run: `bun test src/components/import-wizard.test.tsx src/components/org-settings.test.tsx` → PASS.
Run: `bun run verify` → PASS.
```bash
git add src/components/import-wizard.tsx src/components/org-settings.tsx
git commit -m "refactor: migrate import-wizard and org-settings to terminal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Migrate domain-panel + org-switcher

**Files:**
- Modify: `src/components/domain-panel.tsx`, `src/components/org-switcher.tsx`
- Test (keep green): `src/components/domain-panel.test.tsx`, `src/components/org-switcher.test.tsx`

- [ ] **Step 1: Baseline.**

Run: `bun test src/components/domain-panel.test.tsx src/components/org-switcher.test.tsx`
Expected: PASS.

- [ ] **Step 2: Migrate `domain-panel.tsx`.**

- Replace the `actionBtn`/`dangerBtn`/`field` consts with the shared terminal `actionBtn`/`dangerBtn`; import `inputClass` from `@/components/ui/field` for the `field` usages (or `<Input>`).
- `CertPill` dots `bg-amber-500`/`bg-emerald-500`/`bg-red-500`/`bg-gray-400` → `bg-status-warn`/`bg-status-ok`/`bg-status-danger`/`bg-status-idle`.
- `text-red-600` → `text-destructive`; confirm box `border border-red-600/40` → `border border-destructive/40`.
- The DNS-records `<table>`: no coastal tokens — leave as-is (it inherits terminal text colors).
- Keep every heading/label/`aria-label` and status text (tests assert them).

- [ ] **Step 3: Migrate `org-switcher.tsx`** (12 coastal refs — the switcher trigger + dropdown).

- Trigger `<button className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] … text-[var(--sea-ink)]">` → `rounded-[2px] border border-border bg-secondary … text-foreground`.
- Invite badge `bg-[var(--sea-ink)] … text-white` → `bg-primary … text-primary-foreground`.
- Dropdown `<div role="menu" className="… rounded-xl border border-[var(--line)] bg-[var(--header-bg)] shadow-lg">` → `rounded-[2px] border border-border bg-card` (drop `shadow-lg`).
- Section divider `border-[var(--line)] border-b` → `border-border border-b`.
- All `hover:bg-[var(--chip-bg)]` → `hover:bg-secondary`; invite Accept button `border border-[var(--chip-line)] bg-[var(--chip-bg)]` → `border border-border bg-secondary`; each `rounded-lg` → `rounded-[2px]`.
- Create-org `<input className="rounded-lg border border-[var(--line)]">` → use `<Input>` or `inputClass` (`rounded-[2px] border border-input`), and the Create `<button className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)]">` → `rounded-[2px] border border-border bg-secondary`.
- `text-red-600` → `text-destructive`. Keep the `Settings` icon and all `aria-label`s / text.

- [ ] **Step 4: Tests + verify + commit.**

Run: `bun test src/components/domain-panel.test.tsx src/components/org-switcher.test.tsx` → PASS.
Run: `bun run verify` → PASS.
```bash
git add src/components/domain-panel.tsx src/components/org-switcher.tsx
git commit -m "refactor: migrate domain-panel and org-switcher to terminal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Migrate the light-touch screens

Token swaps only: `login-card`, `status-badge`, `status-pill`, `SessionControls`, `relay-error`, `auth-callback`.

**Files:**
- Modify: `src/components/login-card.tsx`, `src/components/status-badge.tsx`, `src/components/status-pill.tsx`, `src/components/SessionControls.tsx`, `src/components/relay-error.tsx`, `src/components/auth-callback.tsx`
- Test (keep green): `src/components/status-badge.test.tsx`, `src/components/login-card.test.tsx`, `src/components/auth-callback.test.tsx`, `src/components/SessionControls.test.tsx` (`status-pill.tsx` has no test — verify by eye)

- [ ] **Step 1: Baseline.**

Run: `bun test src/components/status-badge.test.tsx src/components/login-card.test.tsx src/components/auth-callback.test.tsx src/components/SessionControls.test.tsx`
Expected: PASS.

- [ ] **Step 2: Migrate.**

- **status-pill.tsx:** dots `bg-emerald-500`/`bg-amber-500`/`bg-red-500`/`bg-gray-400` → `bg-status-ok`/`bg-status-warn`/`bg-status-danger`/`bg-status-idle`. Keep labels.
- **status-badge.tsx:** replace the hex `pill`/`dot` values and the coastal `MUTED` const with terminal equivalents. Map: running → `text-status-ok` + a subtle `border-status-ok/30 bg-status-ok/10` pill and `bg-status-ok` dot; building → `status-warn`; failed → `status-danger`; stopped/fallback → `text-muted-foreground border-border bg-secondary` + `bg-status-idle` dot. Change `rounded-full` → `rounded-[2px]`. Keep the labels (`Live`/`Building`/`Failed`/`Stopped`/`Never deployed`) exactly — apps-home's test asserts `"Live"`.
- **login-card.tsx:** the GitHub `<a className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] … text-[var(--sea-ink)] … shadow-[…]">` → `rounded-[2px] border border-primary bg-transparent … text-primary` (drop the shadow). Keep the heading/subtitle text.
- **SessionControls.tsx:** log-out `<button className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)]">` → `rounded-[2px] border border-border bg-secondary`.
- **relay-error.tsx:** retry `<button className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)]">` → `rounded-[2px] border border-border bg-secondary`.
- **auth-callback.tsx:** no coastal tokens (uses `underline`, `text-muted-foreground`) — verify it renders terminal and leave unchanged if clean.

- [ ] **Step 3: Tests + verify + commit.**

Run: `bun test src/components/status-badge.test.tsx src/components/login-card.test.tsx src/components/auth-callback.test.tsx src/components/SessionControls.test.tsx` → PASS.
Run: `bun run verify` → PASS.
```bash
git add src/components/login-card.tsx src/components/status-badge.tsx src/components/status-pill.tsx src/components/SessionControls.tsx src/components/relay-error.tsx src/components/auth-callback.tsx
git commit -m "refactor: migrate light-touch screens to terminal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Cleanup + coastal grep gate

Remove the `/ui` route's now-redundant `.terminal` wrapper and prove no coastal reference survives.

**Files:**
- Modify: `src/routes/ui.tsx`

- [ ] **Step 1: Drop the `.terminal` wrapper in `src/routes/ui.tsx`.**

Since terminal tokens are now `:root`, the wrapper class is dead. Replace the component with:
```tsx
function UiPreviewPage() {
	return (
		<div className="min-h-screen">
			<UiPreview />
		</div>
	);
}
```

- [ ] **Step 2: Run the coastal grep gate.**

Run:
```bash
grep -rEn "sea-ink|lagoon|palm|--foam|--sand|--kicker|--line|chip-|header-bg|island-shell|feature-card|page-wrap|display-title|island-kicker|nav-link|rise-in|site-footer|Fraunces|Manrope|\.terminal|data-theme|ThemeToggle" src
```
Expected: **no matches.** If any appear, migrate that reference (they must trace to a screen missed in Tasks 7–11) and re-run.

- [ ] **Step 3: Full verify.**

Run: `bun run verify`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/routes/ui.tsx
git commit -m "chore: drop redundant .terminal wrapper, close coastal cutover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes / deliberate deviations from the spec

- **`Link` primitive dropped (simplicity).** The spec §6 listed a `Link` primitive. It's realized instead as the global amber `a` style (Task 1) plus inline `text-primary hover:underline` on router `<Link>`s — a component would only wrap a one-class change (YAGNI, CLAUDE.md §2). Reviewers: this is intended, not an omission.
- **Existing status components kept.** `StatusBadge` (app-status pill with labels) and `StatusPill` are migrated to terminal tokens rather than replaced by `StatusDot`, because their labels are asserted by existing tests and they carry richer copy than the glyph-only `StatusDot`. The new aggregate lists (`/apps`, `/domains`) use `StatusDot` directly.
- **Content width:** `AppShell` centers to `w-[min(1080px,100%-2rem)]` (the design's ~1080px), not the 640px demo mockup width.
