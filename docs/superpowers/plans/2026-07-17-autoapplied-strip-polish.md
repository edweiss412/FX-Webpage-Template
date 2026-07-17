# Auto-applied-strip polish batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four deferred auto-applied-strip polish items — a shared height-morph disclosure primitive (COLLAPSE-2), a collapsed-header kind hint (COLLAPSE-1), singleton card-flatten (REDESIGN-2), and an SR all-success status (DESTRUCT-3).

**Architecture:** Introduce `components/admin/CollapsePanel.tsx` (a CSS-grid `0fr↔1fr` height-morph whose region grid-item carries `id`/`role`/`label`/`inert`), and adopt it in the three cited in-flow disclosures (`RecentAutoAppliedStrip` `GroupSection`, `IgnoredSheetsDisclosure`, `AddAdminDisclosure`). The remaining three items are strip-local edits to `RecentAutoAppliedStrip.tsx`.

**Tech Stack:** Next.js 16 (RSC), React 19 (boolean `inert`), Tailwind v4, TypeScript strict + `exactOptionalPropertyTypes`, Vitest + Testing Library (jsdom), Playwright (real-browser morph).

**Spec:** `docs/superpowers/specs/2026-07-17-autoapplied-strip-polish.md`

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → passing test → commit.
- **No raw error codes in UI** (invariant 5): unknown `changeKind` → neutral fallback dot/label, never the raw enum.
- **UI quality gate** (invariant 8): impeccable v3 critique + audit on the diff at Stage 4; P0/P1 fixed or DEFERRED-logged. UI-only batch.
- **Conventional commits**: `feat(admin):` / `test(admin):` / `refactor(admin):`.
- **Meta-test inventory**: none created/extended (declared in spec §6 — presentational-only, no data/auth/DB/telemetry surface).
- **Motion tokens**: `--duration-normal` (220ms) for the morph; reduced-motion collapses tokens to 0ms (`app/globals.css:400-410`) + `motion-reduce:transition-none`.
- **exactOptionalPropertyTypes**: optional props (`flatten?`, `defaultExpanded?`) — omit or pass a value, never explicit `undefined`.

---

### Task 1: CollapsePanel primitive

**Files:**
- Create: `components/admin/CollapsePanel.tsx`
- Test: `tests/components/admin/CollapsePanel.test.tsx`

**Interfaces:**
- Produces: `CollapsePanel({ open: boolean; id: string; label: string; children: ReactNode })` — outer `grid` morph track; inner `overflow-hidden` grid-item carries `id`, `data-testid={id}`, `role="region"`, `aria-label={label}`, `inert` when `!open`.

- [ ] **Step 1: Write the failing test** (`tests/components/admin/CollapsePanel.test.tsx`)

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CollapsePanel } from "@/components/admin/CollapsePanel";

afterEach(cleanup);

it("open: region grid-item is present, labeled, not inert; track is 1fr", () => {
  render(
    <CollapsePanel open id="p1" label="Panel one">
      <div data-testid="child">body</div>
    </CollapsePanel>,
  );
  const region = screen.getByTestId("p1");
  expect(region).toHaveAttribute("role", "region");
  expect(region).toHaveAttribute("aria-label", "Panel one");
  expect(region).not.toHaveAttribute("inert");
  expect(region.parentElement?.className).toContain("grid-rows-[1fr]");
  expect(screen.getByTestId("child")).toBeInTheDocument();
});

it("closed: children still mounted, region is inert; track is 0fr", () => {
  render(
    <CollapsePanel open={false} id="p2" label="Panel two">
      <div data-testid="child2">body</div>
    </CollapsePanel>,
  );
  const region = screen.getByTestId("p2");
  expect(region).toHaveAttribute("inert");
  expect(region.parentElement?.className).toContain("grid-rows-[0fr]");
  // always-mounted: child present even when closed
  expect(screen.getByTestId("child2")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-wt-autoapplied-polish && pnpm vitest run tests/components/admin/CollapsePanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** (`components/admin/CollapsePanel.tsx`)

```tsx
"use client";
import { type ReactNode } from "react";

/**
 * Shared height-morph disclosure body. The outer grid is the morph TRACK
 * (grid-template-rows 0fr↔1fr over --duration-normal); the inner overflow-hidden
 * element IS the labeled region (always mounted, `inert` when closed so its
 * subtree leaves the tab order + AT tree). Consumers keep their own trigger
 * <button> and point aria-controls at `id`. Reduced motion collapses the token
 * to 0ms (globals.css) and motion-reduce:transition-none removes the property.
 */
export function CollapsePanel({
  open,
  id,
  label,
  children,
}: {
  open: boolean;
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-normal ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div
        id={id}
        data-testid={id}
        role="region"
        aria-label={label}
        className="overflow-hidden"
        inert={open ? undefined : true}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/CollapsePanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/CollapsePanel.tsx tests/components/admin/CollapsePanel.test.tsx
git commit --no-verify -m "feat(admin): CollapsePanel height-morph disclosure primitive"
```

---

### Task 2: Adopt CollapsePanel in RecentAutoAppliedStrip GroupSection

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (`:26` import; `:292` aria-controls; `:321-410` panel body)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (flip collapsed-state assertions `:96-101`)

**Interfaces:**
- Consumes: `CollapsePanel` from Task 1.

- [ ] **Step 1: Update the failing test** — replace the collapsed-state block (`:95-101`, "collapses every group by default…"):

```tsx
it("collapses every group by default (dashboard): panel present-but-inert, count shown", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const toggle = screen.getByTestId(`auto-applied-toggle-${FIN_ID}`);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // aria-controls is now unconditional (region always mounted)
  expect(toggle).toHaveAttribute("aria-controls", `auto-applied-panel-${FIN_ID}`);
  expect(screen.getByTestId(`auto-applied-count-${FIN_ID}`)).toHaveTextContent("3");
  // panel region is always mounted but inert while collapsed
  const region = screen.getByTestId(`auto-applied-panel-${FIN_ID}`);
  expect(region).toHaveAttribute("inert");
  // rows are present in the DOM (inside the inert region), not unmounted
  expect(screen.getByTestId("auto-applied-row-r1")).toBeInTheDocument();
});
```

Add an expanded-state assertion (new `it`):

```tsx
it("expanding a group clears inert on its panel region", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  fireEvent.click(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`));
  const region = screen.getByTestId(`auto-applied-panel-${FIN_ID}`);
  expect(region).not.toHaveAttribute("inert");
  expect(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)).toHaveAttribute("aria-expanded", "true");
});
```

- [ ] **Step 2: Run — expect FAIL** (`aria-controls` conditional; panel unmounted when collapsed).

Run: `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx -t "collapses every group"`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `RecentAutoAppliedStrip.tsx`:

Import: `import { CollapsePanel } from "@/components/admin/CollapsePanel";`

Trigger aria-controls (`:292`): `aria-controls={open ? panelId : undefined}` → `aria-controls={panelId}`.

Replace the panel body (`:321-410`) `{open ? (<div id={panelId} data-testid={panelId} role="region" aria-label={…}>…</div>) : null}` with:

```tsx
<CollapsePanel open={open} id={panelId} label={`Auto-applied changes for ${group.showName}`}>
  {/* bulk-actions row, confirm sub-panel, bulk-undo outcome block, rows <ul> —
      MOVED VERBATIM out of the removed hand-rolled region div, order unchanged */}
</CollapsePanel>
```

(Remove the old `<div id={panelId} data-testid={panelId} role="region" aria-label={…}>` wrapper; its four children now sit directly inside `CollapsePanel`. `panelId` id/testid/role/label are subsumed by CollapsePanel.)

- [ ] **Step 4: Run — expect PASS** (this test + the full strip file).

Run: `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx`
Expected: PASS. (Confirm confirm-panel / bulk-alert `toBeNull` assertions at `:386,:433-473,:522,:550` still pass — those gate on `confirming`/`failed`, unaffected by the mount change. If any assumed collapse-unmount, fix to `not.toBeVisible()` / inert-scoped `within`.)

- [ ] **Step 5: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "refactor(admin): adopt CollapsePanel in auto-applied strip GroupSection"
```

---

### Task 3: Adopt CollapsePanel in IgnoredSheetsDisclosure

**Files:**
- Modify: `components/admin/IgnoredSheetsDisclosure.tsx` (`:24` import, `:63` aria-controls, `:97-106` panel)
- Test: `tests/components/admin/IgnoredSheetsDisclosure.test.tsx` (flip `:42-43`, `:87`)

- [ ] **Step 1: Update the failing tests** — the closed-state assertions at `:42-43` (`ignored-sheets-panel` / `ignored-sheets-list` `not.toBeInTheDocument`) and `:87` become present-but-inert:

```tsx
// closed: panel region present but inert (was: not in the document)
const region = screen.getByTestId("ignored-sheets-panel");
expect(region).toHaveAttribute("inert");
expect(screen.getByTestId("ignored-sheets-list")).toBeInTheDocument();
```
And keep `:79` `aria-controls` assertion (now unconditional — already `"ignored-sheets-panel"`).

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm vitest run tests/components/admin/IgnoredSheetsDisclosure.test.tsx`
Expected: FAIL (panel not mounted when closed).

- [ ] **Step 3: Implement** — import `CollapsePanel`; trigger `aria-controls={open ? "ignored-sheets-panel" : undefined}` (`:63`) → `aria-controls="ignored-sheets-panel"`; replace `{open ? (<div id="ignored-sheets-panel" data-testid="ignored-sheets-panel" role="region" aria-label="Ignored sheets list">{children}</div>) : null}` with:

```tsx
<CollapsePanel open={open} id="ignored-sheets-panel" label="Ignored sheets list">
  {children}
</CollapsePanel>
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add components/admin/IgnoredSheetsDisclosure.tsx tests/components/admin/IgnoredSheetsDisclosure.test.tsx
git commit --no-verify -m "refactor(admin): adopt CollapsePanel in IgnoredSheetsDisclosure"
```

---

### Task 4: Adopt CollapsePanel in AddAdminDisclosure

**Files:**
- Modify: `components/admin/settings/AddAdminDisclosure.tsx` (`:17` import, `:64-68` panel)
- Test: `tests/components/admin/settings/AdministratorsSection.test.tsx` (flip `:91`)

- [ ] **Step 1: Update the failing test** — `:91` (`mock-add-admin-form` `not.toBeInTheDocument` when closed) → present-but-inert:

```tsx
// closed: form present but its region is inert (was: not in the document)
const region = screen.getByTestId("admin-settings-add-admin");
expect(region).toHaveAttribute("inert");
expect(screen.getByTestId("mock-add-admin-form")).toBeInTheDocument();
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `pnpm vitest run tests/components/admin/settings/AdministratorsSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** — import `CollapsePanel`; replace `{open ? (<div id="admin-settings-add-admin" className="flex flex-col gap-3"><AddAdminForm /></div>) : null}` (`:64-68`) with:

```tsx
<CollapsePanel open={open} id="admin-settings-add-admin" label="Add administrator form">
  <div className="flex flex-col gap-3 pt-3">
    <AddAdminForm />
  </div>
</CollapsePanel>
```

(`AddAdminTrigger` `aria-controls="admin-settings-add-admin"` at `:29` already unconditional — target now genuinely always exists.)

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add components/admin/settings/AddAdminDisclosure.tsx tests/components/admin/settings/AdministratorsSection.test.tsx
git commit --no-verify -m "refactor(admin): adopt CollapsePanel in AddAdminDisclosure"
```

---

### Task 5: Collapsed-header kind hint (COLLAPSE-1)

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (new `KindDotCluster`; render in header between showName `:308-310` and count `:311-317`)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("collapsed header shows a kind-dot cluster: one dot per distinct kind, labeled, removed-first", () => {
  // FIN group has crew_added + crew_renamed + field_changed (3 distinct kinds)
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  // aria-label names each kind (data source = group.rows, not per-row pills)
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Renamed"));
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Added"));
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Field"));
  // one dot per distinct kind (3), no +N (≤4)
  expect(cluster.querySelectorAll("span[aria-hidden='true']").length).toBe(3);
  // header flex invariant: dots between the flex-1 show-name and shrink-0 count;
  // cluster + count are shrink-0 (no 320px overflow)
  expect(cluster.className).toContain("shrink-0");
  const count = screen.getByTestId(`auto-applied-count-${FIN_ID}`);
  // DOM order: cluster precedes the count badge within the toggle
  expect(cluster.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("kind-dot cluster with an unknown kind → single fallback dot, label 'Change', raw enum absent", () => {
  const data: RecentAutoApplied = {
    kind: "ok", renderedCount: 1, overflowCount: 0, rosterShiftByShow: {},
    groups: [{
      showId: "s", slug: "s", showName: "Show", acceptableIds: ["x"], undoableIds: [],
      rows: [{ id: "x", changeKind: "weird_new_kind", summary: "?", occurredAt: "2026-07-07T00:00:00Z", undoable: false, diff: { kind: "none" } }],
    }],
  };
  render(<RecentAutoAppliedStrip data={data} actions={noopActions()} />);
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Change"));
  expect(cluster.textContent ?? "").not.toContain("weird_new_kind");
});
```

- [ ] **Step 2: Run — expect FAIL** (`auto-applied-kind-dots` not found).

- [ ] **Step 3: Implement** — add above `GroupSection` (reuses `KIND_PILL`/`FALLBACK_PILL` `:55-87`):

```tsx
const KIND_ORDER: string[] = ["crew_removed", "crew_renamed", "crew_added", "field_changed", "crew_email_changed"];
const MAX_DOTS = 4;

function KindDotCluster({ rows }: { rows: AutoAppliedRow[] }) {
  const present = KIND_ORDER.filter((k) => rows.some((r) => r.changeKind === k));
  const hasUnknown = rows.some((r) => !KIND_ORDER.includes(r.changeKind));
  const kinds = hasUnknown ? [...present, "__fallback__"] : present;
  if (kinds.length === 0) return null;
  const shown = kinds.slice(0, MAX_DOTS);
  const overflow = kinds.length - shown.length;
  const labelFor = (k: string) => KIND_PILL[k]?.label ?? FALLBACK_PILL.label;
  return (
    <span
      data-testid="auto-applied-kind-dots"
      className="flex shrink-0 items-center gap-1"
      aria-label={`Change kinds: ${kinds.map(labelFor).join(", ")}`}
    >
      {shown.map((k) => (
        <span key={k} aria-hidden="true" className={`size-2 rounded-full ${KIND_PILL[k]?.dot ?? FALLBACK_PILL.dot}`} />
      ))}
      {overflow > 0 ? (
        <span aria-hidden="true" className="text-xs font-semibold text-text-subtle">+{overflow}</span>
      ) : null}
    </span>
  );
}
```

Render in the header between the show-name span and the count badge:

```tsx
<span className="min-w-0 flex-1 wrap-break-word …">{group.showName}</span>
<KindDotCluster rows={group.rows} />
<span data-testid={`auto-applied-count-${group.showId}`} …>{group.rows.length}</span>
```

- [ ] **Step 4: Run — expect PASS.** Anti-tautology check: the cluster's `aria-label` derives from `group.rows`, asserted independently of the per-row pills (which live in the panel, not the header).

- [ ] **Step 5: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "feat(admin): collapsed-header kind-dot cluster on auto-applied groups"
```

---

### Task 6: Singleton flatten (REDESIGN-2)

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (`StripRow` `:140-181`; call site `:404-407`)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`

- [ ] **Step 1: Write the failing test** — RIA group is a 1-row group (singleton); FIN is 3-row:

```tsx
it("singleton group flattens the inner row card; multi-row keeps per-row cards", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  // RIA = one row (r4) → flattened (no border card chrome)
  expect(screen.getByTestId("auto-applied-row-r4").className).not.toContain("border");
  // FIN = three rows → each keeps its card border
  expect(screen.getByTestId("auto-applied-row-r1").className).toContain("border");
});
```

- [ ] **Step 2: Run — expect FAIL** (r4 currently carries `border`).

- [ ] **Step 3: Implement** — add `flatten` to `StripRow`:

```tsx
function StripRow({ row, group, actions, flatten = false }: {
  row: AutoAppliedRow; group: AutoAppliedGroup; actions: RecentAutoAppliedStripActions; flatten?: boolean;
}) {
  // …
  <li
    data-testid={`auto-applied-row-${row.id}`}
    className={flatten ? "flex flex-col gap-2" : "flex flex-col gap-2 rounded-md border border-border bg-surface p-3"}
  >
```

Call site (`:404-407`):

```tsx
const flatten = group.rows.length === 1;
// …
{group.rows.map((row) => (
  <StripRow key={row.id} row={row} group={group} actions={actions} flatten={flatten} />
))}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "feat(admin): flatten singleton auto-applied group card-in-card"
```

---

### Task 7: SR all-success bulk-undo status (DESTRUCT-3)

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (`confirmUndoAll` `:265`; outcome block `:393-402`)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`

- [ ] **Step 1: Write the failing test** (mirror the existing bulk-undo test setup — expand FIN, open Undo-all confirm, confirm-go with a resolving action):

```tsx
it("all-success bulk undo announces an sr-only status; no failure alert", async () => {
  const actions = { ...noopActions(), undoFromDashboardAction: vi.fn().mockResolvedValue({ ok: true }) };
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  fireEvent.click(screen.getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  await act(async () => {
    fireEvent.click(screen.getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  });
  const status = await screen.findByTestId(`auto-applied-bulk-undo-success-${FIN_ID}`);
  expect(status).toHaveAttribute("role", "status");
  expect(status.className).toContain("sr-only");
  expect(status).toHaveTextContent("Undid all 2 changes");
  expect(screen.queryByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeNull();
});

it("partial-failure bulk undo shows the failure alert, no success status (precedence)", async () => {
  const undo = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={{ ...noopActions(), undoFromDashboardAction: undo }} defaultExpanded />);
  fireEvent.click(screen.getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  await act(async () => {
    fireEvent.click(screen.getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  });
  expect(await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeInTheDocument();
  expect(screen.queryByTestId(`auto-applied-bulk-undo-success-${FIN_ID}`)).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL** (success testid never rendered; code sets `null` on success).

- [ ] **Step 3: Implement** — `confirmUndoAll` (`:265`): `setBulkUndoOutcome(failed > 0 ? { failed, total } : null)` → `setBulkUndoOutcome({ failed, total })`. Replace the outcome block (`:393-402`), keeping its DOM position (after the `confirming` block, before the `<ul>`):

```tsx
{bulkUndoOutcome && bulkUndoOutcome.failed > 0 ? (
  <p role="alert" data-testid={`auto-applied-bulk-undo-alert-${group.showId}`}
     className="border-b border-border bg-warning-bg p-tile-pad text-sm text-warning-text">
    Couldn&apos;t undo {bulkUndoOutcome.failed} of {bulkUndoOutcome.total} changes. The ones that failed stay in this list.
  </p>
) : bulkUndoOutcome && bulkUndoOutcome.total > 0 ? (
  <p role="status" data-testid={`auto-applied-bulk-undo-success-${group.showId}`} className="sr-only">
    Undid all {bulkUndoOutcome.total} {bulkUndoOutcome.total === 1 ? "change" : "changes"}.
  </p>
) : null}
```

- [ ] **Step 4: Run — expect PASS.** Concrete failure mode caught: the current success branch writes `null`; these assert the branch flipped and precedence holds.

- [ ] **Step 5: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "feat(admin): sr-only status on all-success bulk undo (DESTRUCT-3)"
```

---

### Task 8: Real-browser morph assertion

**Files:**
- Create: `tests/e2e/collapsePanelMorph.spec.ts` (Playwright) OR a standalone esbuild+Playwright harness per the committed real-browser harness pattern (`reference_standalone_realbrowser_layout_harness`).

**Interfaces:** mounts a `CollapsePanel` consumer (simplest: a minimal harness page rendering `CollapsePanel` with a toggle button), asserts region height at settled state.

- [ ] **Step 1: Write the failing test** — mount a page with a `CollapsePanel` (id `morph-probe`) toggled by a button; assert:

```ts
// Deterministic: reduced-motion collapses --duration-normal to 0ms (globals.css)
// so the toggle is instantaneous — no mid-transition sampling / flake.
await page.emulateMedia({ reducedMotion: "reduce" });
// … navigate to the probe page …
const region = page.getByTestId("morph-probe"); // the overflow-hidden role=region grid-item
expect(await region.evaluate((el) => el.getBoundingClientRect().height)).toBe(0); // closed
await page.getByTestId("morph-toggle").click();
expect(await region.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0); // open, instant
```

- [ ] **Step 2: Run — expect FAIL** (harness/spec absent).

- [ ] **Step 3: Implement** the harness page + spec (follow the committed real-browser harness: tsx static markup, pinned esbuild bundle, `data-testid` probes).

- [ ] **Step 4: Run — expect PASS.** (Env-bound e2e: excluded from `pnpm test`; run explicitly. Confirm it is not referenced by removed-testid grep gates.)

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/collapsePanelMorph.spec.ts <harness files>
git commit --no-verify -m "test(admin): real-browser CollapsePanel height-morph assertion"
```

---

### Task 9: Transition-audit

**Files:**
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (or a dedicated `collapsePanelTransitions.test.tsx`).

**Body — spec §1.5 Transition Inventory.** Assert:

- [ ] **Step 1:** `CollapsePanel` outer track carries `transition-[grid-template-rows]` + `duration-normal` + `motion-reduce:transition-none` (the animated pair is not instant).
- [ ] **Step 2:** enumerate the strip's conditional blocks — confirm sub-panel (instant, deliberate), bulk failure alert (instant), bulk success status (instant, sr-only), chevron rotate (`duration-fast`). Each asserted present with its documented treatment.
- [ ] **Step 3:** compound case — collapse a group while its confirm sub-panel is open: the confirm markup remains mounted (state persists) inside the now-inert region; assert `getByTestId(auto-applied-undo-all-confirm-*)` is still in the DOM after collapsing, and the region is `inert`.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5: Commit**

```bash
git add tests/components/admin/*.tsx
git commit --no-verify -m "test(admin): CollapsePanel transition-audit + compound collapse-while-confirm"
```

---

## Post-implementation pipeline (Stage 4–5)

Not TDD tasks — the autonomous-ship close-out.

- [ ] **Full local gate:** `pnpm vitest run` (full suite), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. All green. (Full suite, not scoped — scoped gates miss cross-file regressions; `RecentAutoAppliedStrip` + the two disclosures fan out to source-scanning meta-tests — run everything.)
- [ ] **Grep the source-scanning registries:** `grep -rln 'RecentAutoAppliedStrip\|IgnoredSheetsDisclosure\|AddAdminDisclosure\|CollapsePanel' tests/` and run any hit (forensic-code scanners, help-affordance matrices, bg-accent inventory, transition audits) to catch fails-by-default meta-tests a rebuild trips.
- [ ] **Impeccable dual-gate (invariant 8):** `context.mjs` context load (PRODUCT.md + DESIGN.md) → register read (`product.md`) → `/impeccable critique` AND `/impeccable audit` on the UI diff (`RecentAutoAppliedStrip`, `IgnoredSheetsDisclosure`, `AddAdminDisclosure`, `CollapsePanel`). P0/P1 fixed in-branch or DEFERRED-logged. Findings + dispositions → handoff/DEFERRED.
- [ ] **Whole-diff Codex cross-model review** to APPROVE (inline-all-no-tools; grounding-guarded).
- [ ] **Screenshots-drift regen:** dashboard + `needs-attention-mobile` captured webps drift (collapsed-header dots, flatter singleton). Dispatch `screenshots-regen.yml` on the branch; expect BLOCKED-with-only-Vercel after the bot commit → re-author (`git commit --amend --reset-author`) + `git push --force-with-lease` to wake required checks.
- [ ] **Push → real CI green** (all required checks CLEAN, `mergeStateStatus` CLEAN) → `gh pr merge --merge` → fast-forward local `main` → verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] **DEFERRED.md:** mark COLLAPSE-1, COLLAPSE-2, REDESIGN-2, DESTRUCT-3 RESOLVED; log any new impeccable P2/P3.
- [ ] **Memory:** update `project_mobile_autoapplied_parity_pr409` links / new project record for this PR.

## Self-Review

- **Spec coverage:** §1→Tasks 1-4; §2→Task 5; §3→Task 6; §4→Task 7; §6.6 morph→Task 8; §1.5/§6.7 transitions→Task 9. All covered.
- **Placeholder scan:** none (Task 8 harness detail references the committed pattern by name).
- **Type consistency:** `CollapsePanel({open,id,label,children})`, `KIND_ORDER: string[]`, `StripRow.flatten?` consistent across tasks.
