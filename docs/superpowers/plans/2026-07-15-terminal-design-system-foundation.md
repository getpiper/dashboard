# Terminal Design-System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the terminal/amber-on-dark design tokens and the first `src/components/ui/` primitives (Button, StatusDot, Panel), previewable at `/ui`, without touching any existing screen.

**Architecture:** Add a `.terminal` scope class to `src/styles.css` that remaps the existing shadcn semantic tokens (`--primary`, `--background`, `--border`, `--radius`, …) to the terminal palette and switches the font to JetBrains Mono, plus global status-color tokens. Because the remap is scoped to `.terminal`, the current coastal app renders unchanged; the new primitives and the `/ui` preview opt in by living inside a `.terminal` container. Full app cutover (applying `.terminal` at the root, migrating the 16 feature screens, deleting the coastal palette) is a deliberate follow-up plan.

**Tech Stack:** TanStack Start, Tailwind CSS v4 (`@theme inline`), class-variance-authority, `cn()` (`src/lib/utils.ts`), lucide-react, bun test + Testing Library (happy-dom preloaded via `bunfig.toml`).

## Global Constraints

- Bun only — never npm/yarn/node. Dev: `bun run dev`; tests: `bun test`; full gate: `bun run verify`.
- Test-first (TDD): every task writes a failing test before implementation.
- Tests never live in `src/routes/` (the file router scans it). Component/unit tests sit beside their source as `*.test.ts(x)`.
- Path alias: `@/*` and `#/*` both map to `./src/*`.
- Primitives live in `src/components/ui/` and are built on design tokens — never hardcoded brand hex.
- Amber (`#ffb454`) denotes brand/interactive ONLY; device status uses the separate green/orange/red/gray palette and never amber.
- Radius is `2px` (sharp). Font is JetBrains Mono everywhere within `.terminal`.
- Run `bun run format` (Biome) before committing; `bun run verify` must pass (Biome → tsc → tests → build).
- Design source of truth: `docs/superpowers/specs/2026-07-15-design-philosophy-design.md`.

---

### Task 1: Terminal token & font foundation in `src/styles.css`

**Files:**
- Modify: `src/styles.css` (add font import, status tokens, `@theme` status mappings, and a `.terminal` scope block; do NOT remove the coastal tokens/classes)
- Test: `src/styles.test.ts` (create)

**Interfaces:**
- Produces: a `.terminal` CSS scope in which `bg-primary`/`text-primary-foreground` = amber-on-near-black, `border-border` = `#2f2f36`, `--radius` = `2px`, and the base font is JetBrains Mono; plus Tailwind color utilities `text-status-ok`, `text-status-warn`, `text-status-danger`, `text-status-idle` (available globally).

- [ ] **Step 1: Write the failing test**

Create `src/styles.test.ts`:

```ts
import { expect, test } from "bun:test";

const css = await Bun.file(new URL("./styles.css", import.meta.url)).text();

test("terminal scope defines the amber-on-dark palette", () => {
	expect(css).toContain(".terminal");
	expect(css).toContain("#ffb454"); // amber accent (brand/interactive)
	expect(css).toContain("--radius: 2px");
});

test("status palette tokens exist and are wired to Tailwind utilities", () => {
	expect(css).toContain("--status-ok");
	expect(css).toContain("--status-warn");
	expect(css).toContain("--status-danger");
	expect(css).toContain("--status-idle");
	expect(css).toContain("--color-status-ok: var(--status-ok)");
});

test("JetBrains Mono is loaded and set as the terminal font", () => {
	expect(css).toContain("JetBrains+Mono"); // @import
	expect(css).toContain("--font-mono");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/styles.test.ts`
Expected: FAIL — assertions on `.terminal`, `--status-ok`, `JetBrains+Mono` not found.

- [ ] **Step 3: Add the font import and status tokens**

At the top of `src/styles.css`, immediately AFTER the existing Fraunces/Manrope `@import url(...)` line (line 1), add a new line:

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

Inside the existing `:root { ... }` block (after the existing coastal tokens, before the closing `}`), add the constant status palette and the mono font stack:

```css
  /* Terminal design system — status palette (constant across light/dark) */
  --status-ok: #4ade80;
  --status-warn: #fb923c;
  --status-danger: #f87171;
  --status-idle: #6a6a70;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

- [ ] **Step 4: Add the `@theme inline` status color mappings**

Inside the existing `@theme inline { ... }` block (after the `--color-chart-*` lines), add:

```css
  --color-status-ok: var(--status-ok);
  --color-status-warn: var(--status-warn);
  --color-status-danger: var(--status-danger);
  --color-status-idle: var(--status-idle);
```

- [ ] **Step 5: Add the `.terminal` scope block**

After the `@theme inline { ... }` block closes (after line 158), add:

```css
/*
 * Terminal design system scope. Remaps shadcn semantic tokens to the
 * amber-on-dark terminal palette. Opt in by adding class="terminal" to a
 * container; the rest of the app (coastal) is unaffected until cutover.
 * Spec: docs/superpowers/specs/2026-07-15-design-philosophy-design.md
 */
.terminal {
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

	background-color: var(--background);
	color: var(--foreground);
	font-family: var(--font-mono);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test src/styles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify the build still compiles**

Run: `bun run format && bun run verify`
Expected: Biome clean, `tsc` clean, all tests pass, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/styles.css src/styles.test.ts
git commit -m "feat: add terminal design-system token scope and status palette

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `Button` primitive

**Files:**
- Create: `src/components/ui/button.tsx`
- Test: `src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; shadcn tokens from Task 1 (`bg-primary`, `text-primary-foreground`, `border-primary`, `ring-ring`).
- Produces: `Button` React component and `ButtonProps` type. Props: standard `<button>` props plus `variant?: "primary" | "secondary"` (default `"primary"`), `size?: "sm" | "md"` (default `"md"`), `bracketed?: boolean` (default `true`). When `bracketed`, the visible/accessible label is wrapped as `[ children ]`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/button.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

test("renders a bracketed label by default", () => {
	render(<Button>Deploy</Button>);
	const btn = screen.getByRole("button");
	expect(btn.textContent?.replace(/ /g, " ")).toContain("[ Deploy ]");
});

test("bracketed can be turned off", () => {
	render(<Button bracketed={false}>Plain</Button>);
	expect(screen.getByRole("button").textContent).toBe("Plain");
});

test("primary variant uses the amber fill tokens", () => {
	render(<Button>x</Button>);
	const cls = screen.getByRole("button").className;
	expect(cls).toContain("bg-primary");
	expect(cls).toContain("text-primary-foreground");
});

test("secondary variant uses the amber outline tokens", () => {
	render(
		<Button variant="secondary" bracketed={false}>
			x
		</Button>,
	);
	const cls = screen.getByRole("button").className;
	expect(cls).toContain("border-primary");
	expect(cls).toContain("text-primary");
});

test("forwards native button props", () => {
	render(
		<Button type="submit" disabled>
			x
		</Button>,
	);
	const btn = screen.getByRole("button") as HTMLButtonElement;
	expect(btn.type).toBe("submit");
	expect(btn.disabled).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/ui/button.test.tsx`
Expected: FAIL with module-not-found for `./button`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/button.tsx`:

```tsx
import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center rounded-[2px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				primary: "bg-primary text-primary-foreground hover:bg-primary/90",
				secondary:
					"border border-primary bg-transparent text-primary hover:bg-primary/10",
			},
			size: {
				sm: "h-7 px-2.5 text-xs",
				md: "h-8 px-3 text-sm",
			},
		},
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export type ButtonProps = ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & { bracketed?: boolean };

export function Button({
	className,
	variant,
	size,
	bracketed = true,
	children,
	...props
}: ButtonProps) {
	return (
		<button
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		>
			{bracketed ? <>[&nbsp;{children}&nbsp;]</> : children}
		</button>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/ui/button.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "feat: add terminal Button primitive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `StatusDot` primitive (device-status palette)

**Files:**
- Create: `src/components/ui/status-dot.tsx`
- Test: `src/components/ui/status-dot.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; status utilities from Task 1 (`text-status-ok|warn|danger|idle`).
- Produces: `StatusDot` component and `DeviceStatus` type (`"ok" | "warn" | "danger" | "idle"`). Props: `status: DeviceStatus`, optional `children` (label), plus native `<span>` props. Renders an `aria-hidden` status glyph (`●` ok, `▲` warn, `●` danger, `○` idle) colored by the matching status token, and, when `children` is present, the label in the same color.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/status-dot.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusDot } from "./status-dot";

test("warn status shows the triangle glyph in the warn color", () => {
	render(<StatusDot status="warn">degraded</StatusDot>);
	expect(screen.getByText("▲")).toBeTruthy();
	expect(screen.getByText("degraded").className).toContain("text-status-warn");
});

test("ok status shows a filled dot in the ok color", () => {
	render(<StatusDot status="ok">online</StatusDot>);
	expect(screen.getByText("online").className).toContain("text-status-ok");
});

test("idle status uses the hollow glyph", () => {
	render(<StatusDot status="idle">offline</StatusDot>);
	expect(screen.getByText("○")).toBeTruthy();
});

test("status never uses the amber brand color", () => {
	const { container } = render(
		<>
			<StatusDot status="ok">online</StatusDot>
			<StatusDot status="danger">error</StatusDot>
		</>,
	);
	expect(container.innerHTML).not.toContain("primary");
});

test("renders glyph-only when no label is given", () => {
	render(<StatusDot status="ok" data-testid="dot" />);
	expect(screen.getByTestId("dot").textContent).toBe("●");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/ui/status-dot.test.tsx`
Expected: FAIL with module-not-found for `./status-dot`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/status-dot.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type DeviceStatus = "ok" | "warn" | "danger" | "idle";

const STATUS: Record<DeviceStatus, { glyph: string; color: string }> = {
	ok: { glyph: "●", color: "text-status-ok" },
	warn: { glyph: "▲", color: "text-status-warn" },
	danger: { glyph: "●", color: "text-status-danger" },
	idle: { glyph: "○", color: "text-status-idle" },
};

export function StatusDot({
	status,
	className,
	children,
	...props
}: ComponentProps<"span"> & { status: DeviceStatus }) {
	const meta = STATUS[status];
	return (
		<span className={cn("inline-flex items-center gap-1.5", className)} {...props}>
			<span aria-hidden className={cn("text-[10px] leading-none", meta.color)}>
				{meta.glyph}
			</span>
			{children != null ? (
				<span className={cn("text-xs", meta.color)}>{children}</span>
			) : null}
		</span>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/ui/status-dot.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/ui/status-dot.tsx src/components/ui/status-dot.test.tsx
git commit -m "feat: add StatusDot primitive with device-status palette

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `Panel` primitive

**Files:**
- Create: `src/components/ui/panel.tsx`
- Test: `src/components/ui/panel.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; tokens from Task 1 (`border-border`, `bg-card`, `text-muted-foreground`).
- Produces: `Panel` and `PanelHeader` components (both accept native `<div>` props). `Panel` is a hairline-bordered, 2px-radius container on the card surface. `PanelHeader` is an uppercase, muted, bottom-bordered header row.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/panel.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Panel, PanelHeader } from "./panel";

test("panel wraps children in a hairline-bordered card", () => {
	render(<Panel>content</Panel>);
	const el = screen.getByText("content");
	expect(el.className).toContain("border-border");
	expect(el.className).toContain("bg-card");
});

test("panel header renders an uppercase muted label", () => {
	render(<PanelHeader>hostname</PanelHeader>);
	const el = screen.getByText("hostname");
	expect(el.className).toContain("uppercase");
	expect(el.className).toContain("text-muted-foreground");
});

test("panel forwards native div props", () => {
	render(<Panel data-testid="p" aria-label="boxes" />);
	expect(screen.getByTestId("p").getAttribute("aria-label")).toBe("boxes");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/ui/panel.test.tsx`
Expected: FAIL with module-not-found for `./panel`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/panel.tsx`:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("rounded-[2px] border border-border bg-card", className)}
			{...props}
		/>
	);
}

export function PanelHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"border-border border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/ui/panel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/components/ui/panel.tsx src/components/ui/panel.test.tsx
git commit -m "feat: add Panel primitive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `/ui` preview page (integration proof)

**Files:**
- Create: `src/components/ui/preview.tsx` (the showcase, testable)
- Create: `src/routes/ui.tsx` (thin route that renders the showcase inside a `.terminal` container)
- Test: `src/components/ui/preview.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 2), `StatusDot` + `DeviceStatus` (Task 3), `Panel` + `PanelHeader` (Task 4).
- Produces: `UiPreview` component that renders one of each primitive in a representative "boxes" layout; a `/ui` route mounting it inside `<div className="terminal">` so the amber-on-dark tokens apply.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/preview.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UiPreview } from "./preview";

test("previews each primitive together", () => {
	render(<UiPreview />);
	// Button (bracketed)
	expect(
		screen.getByRole("button", { name: /enroll a box/i }),
	).toBeTruthy();
	// StatusDot labels
	expect(screen.getByText("online")).toBeTruthy();
	expect(screen.getByText("degraded")).toBeTruthy();
	expect(screen.getByText("offline")).toBeTruthy();
	// Panel header
	expect(screen.getByText("hostname")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/ui/preview.test.tsx`
Expected: FAIL with module-not-found for `./preview`.

- [ ] **Step 3: Write the showcase component**

Create `src/components/ui/preview.tsx`:

```tsx
import { Button } from "./button";
import { Panel, PanelHeader } from "./panel";
import { type DeviceStatus, StatusDot } from "./status-dot";

const ROWS: { host: string; status: DeviceStatus; label: string; apps: string }[] =
	[
		{ host: "rpi-garage", status: "ok", label: "online", apps: "· 3 apps" },
		{ host: "rpi-greenhouse", status: "warn", label: "degraded", apps: "· 2 apps" },
		{ host: "rpi-shed", status: "idle", label: "offline", apps: "· 0 apps" },
	];

export function UiPreview() {
	return (
		<div className="mx-auto max-w-[640px] p-6">
			<div className="mb-1 text-[11px] uppercase tracking-widest text-primary">
				your hardware
			</div>
			<h1 className="mb-4 font-semibold text-base"># boxes</h1>

			<Panel>
				<PanelHeader>hostname</PanelHeader>
				{ROWS.map((r) => (
					<div
						key={r.host}
						className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground [&+&]:border-border [&+&]:border-t"
					>
						<StatusDot status={r.status} />
						<span className="text-foreground">{r.host}</span>
						<span className="text-muted-foreground">{r.apps}</span>
						<StatusDot status={r.status} className="ml-auto">
							{r.label}
						</StatusDot>
					</div>
				))}
			</Panel>

			<div className="mt-4 flex items-center gap-3">
				<Button>enroll a box</Button>
				<Button variant="secondary">deploy app</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/ui/preview.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Add the `/ui` route**

Create `src/routes/ui.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { UiPreview } from "@/components/ui/preview";

export const Route = createFileRoute("/ui")({
	component: UiPreviewPage,
});

function UiPreviewPage() {
	return (
		<div className="terminal min-h-screen">
			<UiPreview />
		</div>
	);
}
```

- [ ] **Step 6: Regenerate the route tree and verify**

Run: `bun run generate-routes && bun run format && bun run verify`
Expected: route tree regenerates (adds `/ui`), Biome clean, `tsc` clean, all tests pass, build succeeds.

- [ ] **Step 7: Visually confirm the preview**

Run: `bun run dev`, open `http://localhost:3000/ui`.
Expected: a dark, amber-accented, monospace "boxes" panel — amber `[ enroll a box ]` / outlined `[ deploy app ]` buttons, green/orange/gray status dots + labels, hairline panel with an uppercase `hostname` header. Confirm it matches the approved mockup.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/preview.tsx src/components/ui/preview.test.tsx src/routes/ui.tsx src/routeTree.gen.ts
git commit -m "feat: add /ui preview page for terminal primitives

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of done & follow-ups

**Done when:** all five tasks' tests pass, `bun run verify` is green, and `/ui`
renders the approved terminal look with the three primitives.

**Explicit follow-ups (separate plan — the app-wide cutover):**
- Apply `.terminal` at the app root and default the theme to dark-first.
- Migrate the ~16 feature screens in `src/components/` onto the tokens and
  primitives (including rebuilding `status-badge.tsx` on `StatusDot`).
- Remove the coastal palette (`--sea-ink`, `--lagoon`, `--palm`, `--foam`, glass
  `--surface`, `.island-*`, `.page-wrap`, `.nav-link`) and the Fraunces/Manrope
  font import once no screen references them.
- Resolve the deferred layout/IA questions from the spec §7 (wide-screen
  strategy, org placement, apps-vs-boxes landing route).
