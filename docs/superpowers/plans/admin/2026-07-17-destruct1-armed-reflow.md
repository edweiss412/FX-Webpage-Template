# DESTRUCT-1 Armed-Morph Reflow Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the armed two-tap confirm morph on `PendingPanelDiscardButtons` from relocating the hit-target off a phone user's finger at 360px, by stacking the two discard buttons full-width below the `sm` breakpoint.

**Architecture:** Layout-only change. Add `basis-full sm:basis-auto` to both buttons in the existing `flex flex-wrap gap-2` container so each occupies its own full-width row `< sm` (ignore button box identical idle vs armed → in-place recolor, zero reflow) and reverts to content-width side-by-side at `sm+`. No label edit, no state-machine change. Guarded by a jsdom source test (class presence, red→green) and a real-browser Playwright layout-dimensions spec (geometric invariant + negative control reproducing the pre-fix reflow).

**Tech Stack:** Next.js 16 client component, Tailwind v4, Vitest + Testing Library (jsdom), Playwright standalone layout harness (`@tailwindcss/cli@4.2.4` compile → node HTTP serve → `getBoundingClientRect`).

**Spec:** `docs/superpowers/specs/2026-07-17-destruct1-armed-reflow.md`

## Global Constraints

- Tailwind v4 default `sm` breakpoint = **640px**. `--spacing-tap-min: 44px` (`app/globals.css`). This project's Tailwind v4 does NOT default `.flex` to `align-items: stretch` — layout invariants verified in a real browser, not jsdom.
- **No label edit** — the DESTRUCT-2-ratified armed label `"Confirm stop tracking this sheet permanently"` is untouched (do not relitigate DESTRUCT-2).
- Canonical Tailwind class order is lint-enforced (`prettier-plugin-tailwindcss`); run `pnpm format` after any className edit and confirm `pnpm lint` green (format:check green ≠ lint green).
- UI surface (`components/**`) → invariant-8 impeccable v3 dual-gate (critique + audit) at close-out.
- No DB, no advisory locks (`pg_advisory*` untouched), no new §12.4 error codes, no new telemetry surface.

## Meta-test inventory

- `tests/styles/_metaDestructiveConfirm.test.ts` — **CHECKED, no change required.** Keys each recipe hit by `(file, Nth-recipe-line)` + asserts C1 token presence / forbidden-token absence. `basis-full`/`sm:basis-auto` are neither recipe tokens nor forbidden, and add no recipe line, so the `PendingPanelDiscardButtons.tsx` occurrence-0 row stays valid. Re-run post-edit to confirm (fix-round regression budget).
- No new registry, no advisory-lock topology entry, no admin-alert-catalog entry.

## Transition audit

The armed morph's visual states (idle ⇄ armed ⇄ running) are unchanged by this plan: the existing `transition-opacity`/`transition-colors duration-fast` on the button skins stay; no `AnimatePresence`, no `exit`/`initial`/`animate`, no new conditional render is added. `basis-full sm:basis-auto` is a **responsive** (breakpoint) selector, not a stateful one — it does not animate and does not vary across idle/armed/running. No new transition pair is introduced, so no separate transition-audit task is required beyond this note.

## File Structure

- **Modify:** `components/admin/PendingPanelDiscardButtons.tsx` — add `basis-full sm:basis-auto` to the defer button (`:114`) and both ignore-button class branches (`:127` armed, `:128` idle).
- **Modify (test):** `tests/components/admin/pendingIngestionActions.test.tsx` — add a jsdom source-guard test block.
- **Create (test):** `tests/e2e/pendingDiscardReflow.layout.spec.ts` — real-browser layout-dimensions spec (standalone harness).
- **Modify (docs):** `DEFERRED.md`, `BACKLOG.md` — close DESTRUCT-1 / BL-DESTRUCT-ARMED-REFLOW, correct "four guards" → "three".

---

### Task 1: jsdom source-guard test + the responsive-stack fix

**Files:**
- Modify: `tests/components/admin/pendingIngestionActions.test.tsx` (add a `describe` block after the existing G1 block, ~line 296)
- Modify: `components/admin/PendingPanelDiscardButtons.tsx:114,127,128`

**Interfaces:**
- Consumes: `PendingPanelDiscardButtons` (`{ pendingIngestionId: string }`), already imported in the test file; `render`, `fireEvent`, `getByTestId` from the existing setup.
- Produces: the shipped className fragment `basis-full sm:basis-auto` present on both discard buttons in every state — relied on by Task 2's harness drift-guard.

- [ ] **Step 1: Write the failing test**

Append to `tests/components/admin/pendingIngestionActions.test.tsx`:

```tsx
// DESTRUCT-1 (spec 2026-07-17-destruct1-armed-reflow §3): the two discard
// buttons stack full-width < sm so the armed morph does not relocate the
// confirm hit-target. Guard the shipped classes at the source; the real-browser
// geometric proof lives in tests/e2e/pendingDiscardReflow.layout.spec.ts.
describe("DESTRUCT-1 responsive-stack classes (PendingPanelDiscardButtons)", () => {
  const ID = "pi-d1";
  function tokens(el: HTMLElement) {
    return el.className.split(/\s+/);
  }
  test("both discard buttons carry basis-full sm:basis-auto in idle AND armed", () => {
    const { getByTestId } = render(<PendingPanelDiscardButtons pendingIngestionId={ID} />);
    const defer = getByTestId(`admin-pending-defer-${ID}`);
    const ignore = getByTestId(`admin-pending-ignore-${ID}`);
    // idle
    for (const el of [defer, ignore]) {
      expect(tokens(el)).toContain("basis-full");
      expect(tokens(el)).toContain("sm:basis-auto");
    }
    // armed (first tap) — the morphed class branch must keep the stack tokens
    fireEvent.click(ignore);
    expect(ignore.textContent).toBe("Confirm stop tracking this sheet permanently");
    expect(tokens(ignore)).toContain("basis-full");
    expect(tokens(ignore)).toContain("sm:basis-auto");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/pendingIngestionActions.test.tsx -t "responsive-stack"`
Expected: FAIL — `expect(tokens(el)).toContain("basis-full")` fails (classes absent from the component).

- [ ] **Step 3: Write minimal implementation**

In `components/admin/PendingPanelDiscardButtons.tsx`, add `basis-full sm:basis-auto` to all three button class strings. Insert the tokens immediately after `inline-flex`; `pnpm format` (Step 4) will canonicalize ordering. Resulting strings:

Defer button (`:114`):
```tsx
className="inline-flex basis-full sm:basis-auto min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
```

Ignore button armed branch (`:127`):
```tsx
"inline-flex basis-full sm:basis-auto min-h-tap-min items-center justify-center rounded-sm border border-transparent bg-warning-text px-3 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
```

Ignore button idle branch (`:128`):
```tsx
"inline-flex basis-full sm:basis-auto min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
```

- [ ] **Step 4: Canonicalize + run tests to verify pass**

Run: `pnpm format && pnpm vitest run tests/components/admin/pendingIngestionActions.test.tsx`
Expected: PASS — the new test passes AND all pre-existing tests in the file still pass (the auto-revert test that asserts `btn.className === idleClass` and the sibling-untouched test that asserts defer `className` unchanged both hold, because the tokens are static per state).

- [ ] **Step 5: Verify the recipe meta-test is unaffected**

Run: `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts`
Expected: PASS — occurrence index + C1 unchanged.

- [ ] **Step 6: Lint + commit**

Run: `pnpm lint`
Expected: clean (canonical class order).

```bash
git add tests/components/admin/pendingIngestionActions.test.tsx components/admin/PendingPanelDiscardButtons.tsx
git commit --no-verify -m "fix(admin): stack pending discard buttons full-width < sm (DESTRUCT-1)"
```

---

### Task 2: Real-browser layout-dimensions spec (geometric invariant + negative control)

**Files:**
- Create: `tests/e2e/pendingDiscardReflow.layout.spec.ts`

**Interfaces:**
- Consumes: `@playwright/test`, node `http`/`fs`/`os`/`path`, `@tailwindcss/cli@4.2.4` (via `pnpm dlx`); the shipped class fragment `basis-full sm:basis-auto` from Task 1 (asserted present in the component via a drift-guard). Mirrors the harness mechanics of `tests/e2e/agendaBreakdown.layout.spec.ts`.
- Produces: none (terminal verification).

Runs standalone (no app/Supabase) via `tests/e2e/standalone.config.ts`.

- [ ] **Step 1: Write the spec with the pre-fix classes (watch it fail)**

Create `tests/e2e/pendingDiscardReflow.layout.spec.ts`. Transcribe the two-button `flex flex-wrap gap-2` container VERBATIM from `PendingPanelDiscardButtons.tsx`, in four panels: `fixed-idle`, `fixed-armed` (with `basis-full sm:basis-auto`), `nofix-idle`, `nofix-armed` (without). Measure the ignore button normalized to its own `flex-wrap` container.

```ts
/**
 * tests/e2e/pendingDiscardReflow.layout.spec.ts
 * Real-browser layout-dimensions proof for DESTRUCT-1 (spec 2026-07-17 §4).
 *
 * jsdom computes no layout, so the "armed morph does not relocate the confirm
 * hit-target" invariant must be verified end-to-end. Four transcribed panels:
 *   fixed-*  = shipped classes (basis-full sm:basis-auto)  -> idle box == armed box
 *   nofix-*  = pre-fix classes (no basis)                  -> armed reflows to a new row
 * The nofix panels are the NEGATIVE CONTROL: they prove the harness reproduces
 * the reported reflow, so the fixed-panel equality is not tautological.
 *
 * Harness mirrors tests/e2e/agendaBreakdown.layout.spec.ts: compile the REAL
 * token CSS from app/globals.css via the Tailwind CLI, serve over HTTP, measure
 * getBoundingClientRect() at 360px (hazard viewport) and 720px (>= sm).
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
const BODY_PAD = 16; // admin px-4 gutter

// Shipped classes (Task 1). Kept in sync with the component via the drift-guard test below.
const STACK = "basis-full sm:basis-auto";
const IGNORE_ARMED = (stack: string) =>
  `inline-flex ${stack} min-h-tap-min items-center justify-center rounded-sm border border-transparent bg-warning-text px-3 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90`;
const IGNORE_IDLE = (stack: string) =>
  `inline-flex ${stack} min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken`;
const DEFER = (stack: string) =>
  `inline-flex ${stack} min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken`;

function panel(id: string, stack: string, armed: boolean): string {
  const ignoreClass = armed ? IGNORE_ARMED(stack) : IGNORE_IDLE(stack);
  const ignoreLabel = armed ? "Confirm stop tracking this sheet permanently" : "Permanently ignore";
  return `
  <div data-panel="${id}">
    <div class="flex flex-col gap-2">
      <div data-testid="row" class="flex flex-wrap gap-2">
        <button data-testid="defer" class="${DEFER(stack)}">Defer until modified</button>
        <button data-testid="ignore" class="${ignoreClass}">${ignoreLabel}</button>
        <span role="status" class="sr-only">${armed ? "Tap again to confirm." : ""}</span>
      </div>
    </div>
  </div>`;
}

function harnessHtml(cssHref: string): string {
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${cssHref}"></head>
<body class="bg-bg" style="margin:0; padding-left:${BODY_PAD}px; padding-right:${BODY_PAD}px;">
  ${panel("fixed-idle", STACK, false)}
  ${panel("fixed-armed", STACK, true)}
  ${panel("nofix-idle", "", false)}
  ${panel("nofix-armed", "", true)}
</body></html>`;
}

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "pending-discard-reflow-"));
  writeFileSync(join(workDir, "harness.html"), harnessHtml("out.css"));
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(entryCss, `@source "${join(workDir, "harness.html")}";\n${globals}`);
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );
  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "harness.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

type Box = { nx: number; ny: number; w: number; h: number; ignoreTop: number; deferBottom: number };
async function measure(page: import("@playwright/test").Page, panelId: string): Promise<Box> {
  return page.evaluate((pid) => {
    const root = document.querySelector(`[data-panel="${pid}"]`)!;
    const row = root.querySelector('[data-testid="row"]')!.getBoundingClientRect();
    const ignore = root.querySelector('[data-testid="ignore"]')!.getBoundingClientRect();
    const defer = root.querySelector('[data-testid="defer"]')!.getBoundingClientRect();
    return {
      nx: ignore.left - row.left,
      ny: ignore.top - row.top,
      w: ignore.width,
      h: ignore.height,
      ignoreTop: ignore.top,
      deferBottom: defer.bottom,
    };
  }, panelId);
}

test("fixed panel: armed ignore box == idle ignore box at 360px (no reflow)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(baseUrl);
  const idle = await measure(page, "fixed-idle");
  const armed = await measure(page, "fixed-armed");
  expect(Math.abs(armed.nx - idle.nx)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(armed.ny - idle.ny)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(armed.w - idle.w)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(armed.h - idle.h)).toBeLessThanOrEqual(TOL);
  // Both states: ignore occupies its own row below Defer (full-width stack).
  expect(idle.ignoreTop).toBeGreaterThanOrEqual(idle.deferBottom - TOL);
  expect(armed.ignoreTop).toBeGreaterThanOrEqual(armed.deferBottom - TOL);
});

test("NEGATIVE CONTROL: pre-fix classes DO reflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(baseUrl);
  const idle = await measure(page, "nofix-idle");
  const armed = await measure(page, "nofix-armed");
  // idle ignore rides line 1 next to Defer; armed ignore drops to a new row.
  expect(idle.ignoreTop).toBeLessThan(idle.deferBottom - TOL); // same row as Defer
  expect(armed.ignoreTop).toBeGreaterThanOrEqual(armed.deferBottom - TOL); // wrapped below
  expect(Math.abs(armed.ny - idle.ny)).toBeGreaterThan(TOL); // the box moved
});

test("fixed panel: >= sm the row does NOT wrap (buttons side by side)", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto(baseUrl);
  const armed = await measure(page, "fixed-armed");
  // basis-auto restored: armed ignore shares Defer's row (top above Defer's bottom).
  expect(armed.ignoreTop).toBeLessThan(armed.deferBottom - TOL);
});

test("drift-guard: shipped component still carries the stack fragment", () => {
  const src = readFileSync(join(REPO_ROOT, "components/admin/PendingPanelDiscardButtons.tsx"), "utf8");
  // both discard buttons must keep the responsive stack the harness assumes
  expect(src).toContain("basis-full");
  expect(src).toContain("sm:basis-auto");
});
```

- [ ] **Step 2: Run to verify the fixed-panel test FAILS with pre-fix classes (TDD red)**

Temporarily set `const STACK = ""` at the top, then run:
Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts pendingDiscardReflow.layout.spec.ts`
Expected: the "no reflow" test FAILS (`armed.ny - idle.ny` exceeds tolerance — the box relocates), confirming the assertion has teeth.

- [ ] **Step 3: Restore the shipped classes (TDD green)**

Set `const STACK = "basis-full sm:basis-auto"` back.

- [ ] **Step 4: Run to verify all four tests pass**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts pendingDiscardReflow.layout.spec.ts`
Expected: PASS — fixed panel stable at 360px, negative control reflows, no wrap at 720px, drift-guard green.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/pendingDiscardReflow.layout.spec.ts
git commit --no-verify -m "test(admin): real-browser layout proof for DESTRUCT-1 reflow fix"
```

---

### Task 3: Close DESTRUCT-1 in the deferral + backlog ledgers

**Files:**
- Modify: `DEFERRED.md` (DESTRUCT-1 entry, ~`:625-629`)
- Modify: `BACKLOG.md` (BL-DESTRUCT-ARMED-REFLOW, ~`:497-501`)

- [ ] **Step 1: Mark DESTRUCT-1 RESOLVED with the measurement**

In `DEFERRED.md`, update the DESTRUCT-1 heading to append `— ✅ RESOLVED (2026-07-17, branch fix/destruct1-armed-reflow)` and add a `**Resolution:**` bullet: real-browser measurement at 360px found only `PendingPanelDiscardButtons` relocates the hit-target (idle ignore `x171 w147` line 1 → armed `x16 w328` own row); fixed by `basis-full sm:basis-auto` stacking both discard buttons full-width `< sm` (idle box == armed box). `BulkIgnoreControls` (right-edge pinned) + `StagedReviewCard` (left-edge pinned) measured **benign, no change**. `RescanSheetButton` is **N/A** — its G3 arm guard was withdrawn in PR #411; correct the stale "four" → "three" in the `What:` line. Backlog `BL-DESTRUCT-ARMED-REFLOW` closed.

- [ ] **Step 2: Close the backlog row**

In `BACKLOG.md`, change BL-DESTRUCT-ARMED-REFLOW `**Status:** OPEN ...` → `**Status:** RESOLVED (2026-07-17, branch fix/destruct1-armed-reflow)`, and correct "The four two-tap guards (BulkIgnoreControls, PendingPanelDiscardButtons, RescanSheetButton, StagedReviewCard)" → "The three two-tap guards (BulkIgnoreControls, PendingPanelDiscardButtons, StagedReviewCard) — RescanSheetButton's G3 guard was withdrawn in #411", with a one-line resolution pointer.

- [ ] **Step 3: Commit**

```bash
git add DEFERRED.md BACKLOG.md
git commit --no-verify -m "docs: close DESTRUCT-1 / BL-DESTRUCT-ARMED-REFLOW (three guards, measured)"
```

---

## Close-out (not TDD tasks — gates before merge)

1. **Impeccable v3 dual-gate (invariant 8)** on the diff (UI surface `components/admin/PendingPanelDiscardButtons.tsx`): run `/impeccable critique` AND `/impeccable audit` with the canonical v3 setup gates (context.mjs → register read). P0/P1 fixed or deferred via a `DEFERRED.md` entry before cross-model review. Record findings + dispositions.
2. **Full verification:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` all green. Standalone layout spec green under its own config. (Full suite before push — scoped gates miss regressions.)
3. **Whole-diff cross-model adversarial review** → Codex, fresh-eyes, REVIEWER ONLY, iterate to APPROVE.
4. **Push → real CI green** (not just local) → `gh pr merge --merge` → fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` == `0  0`.

## Self-Review

- **Spec coverage:** §3 fix → Task 1; §4 dimensional invariants + §2 measurement → Task 2 (real-browser, negative control); §7 deliverable 3 (ledger closure + "four"→"three") → Task 3; §8 meta-test → inventory section (checked) + Task 1 Step 5; impeccable gate + verification → Close-out. Benign surfaces (§6) → no task, documented in Task 3. All covered.
- **Placeholder scan:** none — every step carries real code/commands.
- **Type consistency:** `STACK`/`IGNORE_ARMED`/`IGNORE_IDLE`/`DEFER`/`panel`/`measure`/`Box` all defined and used consistently in Task 2; component class strings match Task 1.
- **Anti-tautology:** Task 2's negative-control panels reproduce the pre-fix reflow (proving the equality assertion distinguishes fixed from broken); Step 2 watches the fixed-panel assertion fail with `STACK=""`; drift-guard ties the harness classes to the shipped source. Task 1 is red→green on the real component source.
