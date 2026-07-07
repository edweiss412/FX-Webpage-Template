# Flow 3 Correction-Loop Clarity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sheet-edit correction loop legible to a non-technical admin — a correction-loop callout co-located with flagged warnings (per-show + wizard) plus per-disposition "why held / what Approve-vs-Reject does" copy in the changes feed.

**Architecture:** One new presentational Server Component (`CorrectionLoopCallout`) mounted on the per-show Data-quality section (with an inline `ReSyncButton`) and in the wizard's `WarningsBreakdown` (copy-only; the wizard already carries `RescanSheetButton`). One pure copy-lookup helper for hold explanations rendered inside `ChangeFeedEntry`. No DB, no server actions, no state.

**Tech Stack:** Next.js 16 RSC, React 19, TypeScript, Tailwind v4, Vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-07-flow3-correction-loop-clarity.md` (Codex-approved, 3 rounds).

## Global Constraints

- **No em dashes in UI copy.** `DESIGN.md:318` — use commas, colons, semicolons, periods, parentheses; also not `--`. All new operator-visible strings comply (periods/semicolons only).
- **No raw error codes in UI** (invariant 5). All new copy is hard-coded descriptive UI copy, NOT `lib/messages` catalog codes — matches the changes-feed's existing hard-coded empty-state/truncation precedent (`ChangesFeed.tsx:8-11`). No §12.4 / `gen:spec-codes` / `catalog.ts` work.
- **UI-copy rendering:** render every new string via a JS-string expression `{CONST}` / `{helper()}`, NOT as inline JSX text — a raw `'` in JSX text trips `react/no-unescaped-entities`; in a JS string literal it does not. Straight apostrophes match the spec's exact copy inventory (§5).
- **Meta-test inventory:** NONE created or extended (spec §8). No auth boundary, no advisory lock, no admin-alert catalog row, no mutation surface.
- **Invariant 8 (impeccable dual-gate):** applies — all three surfaces are UI. Run `/impeccable critique` AND `/impeccable audit` on the diff before the whole-diff Codex review (Task 5).
- **TDD per task; commit per task** (conventional commits, `--no-verify` in this worktree). One task = one commit.

## Exact copy (single source of truth — spec §5)

| Key | String (verbatim) |
|---|---|
| callout `resync` | `Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-parse and clear this.` |
| callout `rescan` | `Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-parse and clear this.` |
| hold `email_change` | `Held for your review: this crew member's sign-in email changed in the sheet. Approve to update their sign-in address; Reject to keep the current one.` |
| hold `rename` | `Held for your review: this crew member was renamed in the sheet. Approve to apply the new name; Reject to keep the current one.` |
| hold `removal` | `Held for your review: this crew member was removed from the sheet. Approve to remove them; Reject to keep them.` |

---

## Task 1: `CorrectionLoopCallout` presentational component

**Files:**
- Create: `components/admin/CorrectionLoopCallout.tsx`
- Test: `tests/components/admin/CorrectionLoopCallout.test.tsx`

**Interfaces:**
- Produces: `export function CorrectionLoopCallout({ mode, children }: { mode: "resync" | "rescan"; children?: React.ReactNode }): React.ReactNode`. Renders a `<div data-testid="correction-loop-callout">` containing a `<p>` with the mode's exact copy (`{CORRECTION_LOOP_COPY[mode]}`) and then `children` (the affordance slot; per-show passes `<ReSyncButton>`, wizard passes nothing).
- Consumes: nothing (leaf component).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CorrectionLoopCallout } from "@/components/admin/CorrectionLoopCallout";

afterEach(cleanup);

const RESYNC = "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-parse and clear this.";
const RESCAN = "Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-parse and clear this.";

it("resync mode renders the exact re-sync copy and its affordance child", () => {
  render(
    <CorrectionLoopCallout mode="resync">
      <button data-testid="the-affordance">Re-sync from Drive</button>
    </CorrectionLoopCallout>,
  );
  const callout = screen.getByTestId("correction-loop-callout");
  expect(callout).toHaveTextContent(RESYNC);
  // affordance slot renders inside the callout
  expect(within(callout).getByTestId("the-affordance")).toBeInTheDocument();
});

it("rescan mode renders the exact re-scan copy; no affordance required", () => {
  render(<CorrectionLoopCallout mode="rescan" />);
  const callout = screen.getByTestId("correction-loop-callout");
  expect(callout).toHaveTextContent(RESCAN);
});

it("the two modes differ only in the verb (no em dash in either)", () => {
  const { rerender } = render(<CorrectionLoopCallout mode="resync" />);
  expect(screen.getByTestId("correction-loop-callout").textContent).not.toMatch(/[—]|--/);
  rerender(<CorrectionLoopCallout mode="rescan" />);
  expect(screen.getByTestId("correction-loop-callout").textContent).not.toMatch(/[—]|--/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/CorrectionLoopCallout.test.tsx`
Expected: FAIL — `Cannot find module '@/components/admin/CorrectionLoopCallout'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
/**
 * components/admin/CorrectionLoopCallout.tsx — Flow 3 (audit 3.1).
 *
 * A one-line "how to fix a flagged value" instruction co-located with the
 * flagged-warnings area. `mode` picks the verb ("re-sync" for the live per-show
 * loop / "re-scan" for the pre-publish wizard loop); `children` is the affordance
 * slot (per-show mounts <ReSyncButton>; the wizard mounts nothing because it
 * already carries <RescanSheetButton>). Copy is hard-coded UI guidance, never a
 * message-catalog code (invariant 5). Rendered via a JS-string expression so the
 * apostrophe in "We'll" does not trip react/no-unescaped-entities.
 *
 * Pure synchronous Server Component (no 'use client'): props in, markup out.
 */
import type { ReactNode } from "react";

const CORRECTION_LOOP_COPY = {
  resync: "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-parse and clear this.",
  rescan: "Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-parse and clear this.",
} as const;

export function CorrectionLoopCallout({
  mode,
  children,
}: {
  mode: "resync" | "rescan";
  children?: ReactNode;
}): ReactNode {
  return (
    <div
      data-testid="correction-loop-callout"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 text-sm text-text-subtle sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="min-w-0">{CORRECTION_LOOP_COPY[mode]}</p>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/CorrectionLoopCallout.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/CorrectionLoopCallout.tsx tests/components/admin/CorrectionLoopCallout.test.tsx
git commit --no-verify -m "feat(admin): CorrectionLoopCallout presentational component (Flow 3 / 3.1)"
```

---

## Task 2: Mount the callout on the per-show Data-quality section

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx` (Data quality `<section>`, after the header row at ~line 901, before `<BulkIgnoreControls>` at ~905)
- Test: `tests/app/admin/perShowPage.test.tsx` (append a `describe` block)

**Interfaces:**
- Consumes: `CorrectionLoopCallout` (Task 1), existing `ReSyncButton` (`data-testid="admin-resync-button"`), existing locals `activeActionable` (`page.tsx:398`), `archived` (`page.tsx:422`), `show.slug`.
- Produces: nothing consumed downstream.

**Render gate (spec §3.1):** mount **only** when `activeActionable.length > 0 && !archived`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/app/admin/perShowPage.test.tsx` (reuses the file's `actionableW` fixture shape, `state`, `renderPage`, `baseShow`, `warningFingerprint`):

```tsx
describe("per-show Data quality: correction-loop callout (Flow 3 / 3.1)", () => {
  const RESYNC =
    "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-parse and clear this.";
  const actionableW = {
    severity: "warn" as const,
    code: "UNKNOWN_FIELD",
    message: "Unrecognized venue row label: 'Storage'",
    rawSnippet: "Storage | back dock",
    sourceCell: { title: "STAGE", gid: 5, a1: "B12" },
  };

  it("renders the callout with exact copy + the re-sync affordance when there is an active warning on a non-archived show", async () => {
    state.show = { ...baseShow, published: true, archived: false };
    state.showsInternal = { show_id: "s1", parse_warnings: [actionableW] };
    await renderPage();
    const callout = screen.getByTestId("correction-loop-callout");
    expect(callout).toHaveTextContent(RESYNC);
    // the affordance is the actual re-sync control, not merely "a button"
    expect(within(callout).getByTestId("admin-resync-button")).toBeInTheDocument();
  });

  it("does NOT render the callout when only IGNORED warnings remain (re-sync would not clear them)", async () => {
    state.show = { ...baseShow, published: true, archived: false };
    state.showsInternal = { show_id: "s1", parse_warnings: [actionableW] };
    state.ignoredFingerprints = [
      warningFingerprint({ code: actionableW.code, rawSnippet: actionableW.rawSnippet })!,
    ];
    await renderPage();
    // the Data-quality section still renders (ignored subsection), but no callout
    expect(screen.getByTestId("per-show-data-quality")).toBeInTheDocument();
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
  });

  it("does NOT render the callout on an archived show even with an active warning (no second re-sync entry point on a retired show)", async () => {
    state.show = { ...baseShow, published: true, archived: true };
    state.showsInternal = { show_id: "s1", parse_warnings: [actionableW] };
    await renderPage();
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
  });

  it("does NOT render the callout when there are no warnings at all", async () => {
    state.show = { ...baseShow, published: true, archived: false };
    state.showsInternal = { show_id: "s1", parse_warnings: [] };
    await renderPage();
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/app/admin/perShowPage.test.tsx -t "correction-loop callout"`
Expected: FAIL — the first test errors on `getByTestId("correction-loop-callout")` (not yet mounted).

- [ ] **Step 3: Add the import and mount the callout**

In `app/admin/show/[slug]/page.tsx`, add the import alongside the other admin-component imports (near `ReSyncButton`/`PerShowActionableWarnings`):

```tsx
import { CorrectionLoopCallout } from "@/components/admin/CorrectionLoopCallout";
```

Then, inside the Data-quality `<section>`, immediately AFTER the header `<div className="flex items-center gap-2">…HoverHelp…</div>` (closes ~line 901) and BEFORE `<BulkIgnoreControls … />` (~line 905), insert:

```tsx
{activeActionable.length > 0 && !archived ? (
  <CorrectionLoopCallout mode="resync">
    <ReSyncButton slug={show.slug} />
  </CorrectionLoopCallout>
) : null}
```

(`ReSyncButton` and `activeActionable`/`archived` are already in scope in this file — no new imports beyond `CorrectionLoopCallout`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/app/admin/perShowPage.test.tsx -t "correction-loop callout"`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full per-show page suite (guard against regressions to the existing Data-quality tests)**

Run: `pnpm vitest run tests/app/admin/perShowPage.test.tsx`
Expected: PASS (all, including the pre-existing Data-quality / archived tests).

- [ ] **Step 6: Commit**

```bash
git add "app/admin/show/[slug]/page.tsx" tests/app/admin/perShowPage.test.tsx
git commit --no-verify -m "feat(admin): correction-loop callout on per-show data-quality section (Flow 3 / 3.1)"
```

---

## Task 3: Add the callout copy to the wizard `WarningsBreakdown`

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`WarningsBreakdown`, non-empty branch at ~line 2287, keeping the existing non-blocking note at 2288-2293)
- Test: `tests/components/admin/wizard/step3ReviewSections.test.tsx` (extend the "warnings body" describe at ~line 638)

**Interfaces:**
- Consumes: `CorrectionLoopCallout` (Task 1), existing `WarningsBreakdown({ dfid, warnings })`.
- Produces: nothing downstream.

**Constraint:** ADDITIVE — the existing note "These are informational and don't block publishing." must remain (pinned by the existing test at line 666: `expect(t).toMatch(/don.t block publishing/i)`). The callout is a NEW line; it does not mount a re-scan button (the wizard already has `RescanSheetButton`).

- [ ] **Step 1: Write the failing tests**

Extend the `describe("warnings body …")` block in `tests/components/admin/wizard/step3ReviewSections.test.tsx` (reuses `sectionData`, `renderBody`, `DFID`):

```tsx
test("renders the correction-loop callout (re-scan copy) alongside the non-blocking note when warnings exist", () => {
  const warnings: ParseWarning[] = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "Unrecognized row" },
  ];
  const d = sectionData({ warnings });
  const q = renderBody(d, "warnings");
  const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
  // callout present with the exact re-scan copy
  const callout = within(panel).getByTestId("correction-loop-callout");
  expect(callout).toHaveTextContent(
    "Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-parse and clear this.",
  );
  // the existing non-blocking reassurance is NOT lost
  expect(panel.textContent).toMatch(/don.t block publishing/i);
  // no em dash in the callout copy
  expect(callout.textContent).not.toMatch(/[—]|--/);
});

test("zero warnings → no correction-loop callout (nothing to fix)", () => {
  const d = sectionData({ warnings: [] });
  const q = renderBody(d, "warnings");
  const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
  expect(within(panel).queryByTestId("correction-loop-callout")).toBeNull();
  expect(panel.textContent).toContain("No parse warnings for this sheet.");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx -t "correction-loop callout"`
Expected: FAIL — `getByTestId("correction-loop-callout")` not found.

- [ ] **Step 3: Add the import and the callout line**

At the top of `components/admin/wizard/step3ReviewSections.tsx`, add to the imports:

```tsx
import { CorrectionLoopCallout } from "@/components/admin/CorrectionLoopCallout";
```

In `WarningsBreakdown`, in the non-empty branch (the `<>` fragment beginning at ~line 2287), insert the callout as the FIRST child, immediately before the existing non-blocking `<p data-testid={`wizard-step3-card-${dfid}-warnings-nonblocking`}>`:

```tsx
<>
  <CorrectionLoopCallout mode="rescan" />
  <p
    data-testid={`wizard-step3-card-${dfid}-warnings-nonblocking`}
    className="text-xs text-text-subtle"
  >
    These are informational and don&rsquo;t block publishing.
  </p>
  {/* …existing <ul> unchanged… */}
</>
```

(Leave the existing `<p>` and `<ul>` exactly as they are — the callout is prepended, nothing removed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx -t "correction-loop callout"`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full step3ReviewSections suite (guard the pinned non-blocking-note test)**

Run: `pnpm vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx`
Expected: PASS (all, including the existing "Non-blocking note preserved" assertion).

- [ ] **Step 6: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx
git commit --no-verify -m "feat(admin): correction-loop callout in wizard WarningsBreakdown (Flow 3 / 3.1)"
```

---

## Task 4: Per-disposition hold explanations in `ChangeFeedEntry`

**Files:**
- Modify: `components/admin/ChangeFeedEntry.tsx`
- Test: `tests/components/admin/ChangeFeedEntry.test.tsx` (append tests)

**Interfaces:**
- Consumes: existing `FeedEntry` / `Disposition` (`lib/sync/holds/types.ts:5-10`); `entry.gate.disposition` is the `Disposition` union `{ disposition: "email_change" | "rename" | "removal"; … }`.
- Produces: a module-local `holdExplanation(disposition: Disposition): string` returning the exact per-disposition copy; a `<p data-testid="change-feed-hold-explanation">` rendered only on `approve_reject` rows with a gate.

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/admin/ChangeFeedEntry.test.tsx` (reuses `base`, `now`, `noop`):

```tsx
const HOLD_COPY = {
  email_change:
    "Held for your review: this crew member's sign-in email changed in the sheet. Approve to update their sign-in address; Reject to keep the current one.",
  rename:
    "Held for your review: this crew member was renamed in the sheet. Approve to apply the new name; Reject to keep the current one.",
  removal:
    "Held for your review: this crew member was removed from the sheet. Approve to remove them; Reject to keep them.",
} as const;

const gateFor = (d: "email_change" | "rename" | "removal") => ({
  holdId: "h1",
  disposition:
    d === "removal"
      ? { disposition: "removal" as const }
      : { disposition: d, name: "Alice", email: "a@new" },
  baseModifiedTime: "2026-06-09T10:00:00Z",
});

for (const d of ["email_change", "rename", "removal"] as const) {
  it(`approve_reject ${d} row renders the exact ${d} explanation`, () => {
    render(
      <ChangeFeedEntry
        entry={{ ...base, status: "pending", action: "approve_reject", summary: "…", gate: gateFor(d) }}
        now={now}
        undoAction={noop}
        approveAction={noop}
        rejectAction={noop}
      />,
    );
    const row = screen.getByTestId("change-feed-entry-e1");
    expect(within(row).getByTestId("change-feed-hold-explanation")).toHaveTextContent(HOLD_COPY[d]);
  });
}

it("undo row renders NO hold explanation", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "applied", action: "undo", summary: "Removed Alice", changeLogId: "cl-1" }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByTestId("change-feed-hold-explanation")).toBeNull();
});

it("notification-only (none) row renders NO hold explanation", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "applied", action: "none", summary: "Section shrank" }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByTestId("change-feed-hold-explanation")).toBeNull();
});

it("approve_reject WITHOUT a gate (defensive) renders NO hold explanation", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "pending", action: "approve_reject", summary: "Email change" }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByTestId("change-feed-hold-explanation")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/ChangeFeedEntry.test.tsx -t "explanation"`
Expected: FAIL — `change-feed-hold-explanation` not found on the disposition rows.

- [ ] **Step 3: Add the helper and render the explanation**

In `components/admin/ChangeFeedEntry.tsx`, import the `Disposition` type and add a module-scope helper (above the component):

```tsx
import type { Disposition, FeedEntry } from "@/lib/sync/holds/types";

// Flow 3 (audit 3.3): hard-coded, per-disposition "why held + Approve/Reject
// consequence" copy. Descriptive absence-of-failure UI copy, NOT a catalog code
// (mirrors ChangesFeed's hard-coded empty-state/truncation rationale; invariant 5).
// No em dashes (DESIGN.md:318). Rendered via {expression}, so the apostrophes are
// safe (no react/no-unescaped-entities).
function holdExplanation(disposition: Disposition): string {
  switch (disposition.disposition) {
    case "email_change":
      return "Held for your review: this crew member's sign-in email changed in the sheet. Approve to update their sign-in address; Reject to keep the current one.";
    case "rename":
      return "Held for your review: this crew member was renamed in the sheet. Approve to apply the new name; Reject to keep the current one.";
    case "removal":
      return "Held for your review: this crew member was removed from the sheet. Approve to remove them; Reject to keep them.";
  }
}
```

Then, inside the left-column `<div className="flex min-w-0 flex-col gap-1">`, AFTER the summary `<p data-testid="change-feed-summary">…</p>` and BEFORE the `<div className="flex flex-wrap items-center gap-2">` badge/time row, insert:

```tsx
{canGate ? (
  <p data-testid="change-feed-hold-explanation" className="text-xs text-text-subtle">
    {holdExplanation(entry.gate!.disposition)}
  </p>
) : null}
```

(`canGate` is already computed at `ChangeFeedEntry.tsx:52` as `entry.action === "approve_reject" && entry.gate != null`. If the existing `import type { FeedEntry }` line is already present, extend it to also import `Disposition` rather than adding a second import.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/ChangeFeedEntry.test.tsx -t "explanation"`
Expected: PASS (6 tests: 3 dispositions + undo + none + no-gate).

- [ ] **Step 5: Run the full ChangeFeedEntry suite (guard the existing gate/undo/summary tests)**

Run: `pnpm vitest run tests/components/admin/ChangeFeedEntry.test.tsx`
Expected: PASS (all, including the pre-existing "pending MI-11 row" and "defensively renders notification-only" tests).

- [ ] **Step 6: Commit**

```bash
git add components/admin/ChangeFeedEntry.tsx tests/components/admin/ChangeFeedEntry.test.tsx
git commit --no-verify -m "feat(admin): per-disposition hold explanations in changes feed (Flow 3 / 3.3)"
```

---

## Task 5: Quality gates + impeccable dual-gate (invariant 8) + close-out prep

**Files:** none (verification-only task); if impeccable surfaces a HIGH/CRITICAL that is deferred, add a `DEFERRED.md` row.

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck` (or `pnpm exec tsc --noEmit` if that is the script) — Expected: clean. (Vitest strips types; a TS-only error would pass tests but fail CI `quality`.)

- [ ] **Step 2: Lint (canonical Tailwind + no-unescaped-entities)**

Run: `pnpm lint` — Expected: clean. Watch for `better-tailwindcss/enforce-canonical-classes` and `react/no-unescaped-entities` on the new markup.

- [ ] **Step 3: Format check**

Run: `pnpm format:check` — Expected: clean. (`--no-verify` bypassed the prettier hook; CI `quality` runs this.)

- [ ] **Step 4: Full test suite (scoped gates miss cross-file regressions)**

Run: `pnpm test` (or `pnpm vitest run`) — Expected: all pass. If a shared-chokepoint change broke unrelated tests, fix before proceeding.

- [ ] **Step 5: Impeccable dual-gate (invariant 8) — three UI surfaces touched**

Run `/impeccable critique` AND `/impeccable audit` on the diff (the callout on the per-show Data-quality section, the wizard `WarningsBreakdown`, and the changes-feed row). Both run with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight). HIGH and CRITICAL findings are fixed in-branch OR deferred via a `DEFERRED.md` entry with rationale. Record findings + dispositions for the milestone handoff. This precedes the whole-diff Codex review (Stage 4).

- [ ] **Step 6: Commit any gate fixes**

```bash
git add -A
git commit --no-verify -m "chore(admin): quality-gate + impeccable fixes for Flow 3 correction-loop clarity"
```

(Skip this commit if Steps 1-5 produced no changes.)

---

## Self-review (plan vs spec)

- **Spec §3.1 (per-show callout, gate `activeActionable.length > 0 && !archived`)** → Task 2 (mount + gate) + 4 tests (active/ignored-only/archived/zero). ✓
- **Spec §3.2 (wizard callout, copy-only, preserve non-blocking note)** → Task 3 (additive prepend + pinned-note assertion). ✓
- **Spec §4 (hold explanations, 3 dispositions, only on gate rows)** → Task 4 (helper + 6 tests). ✓
- **Spec §5 (single-source copy, verb-only diff)** → Task 1 (`CORRECTION_LOOP_COPY` const). ✓
- **Spec §6 (non-catalog)** → Global Constraints + Task 4 comment; no catalog/gen work in any task. ✓
- **Spec §7 (anti-tautology: exact copy + the re-sync action, not "a button"; per-disposition exact strings)** → Task 2 asserts `admin-resync-button` inside the callout; Task 4 asserts exact per-disposition strings. ✓
- **Spec §8 (invariant 8 dual-gate; no meta-test)** → Task 5 Step 5; no meta-test task (correctly absent). ✓
- **Layout-dimensions task?** Not required — spec §3.4 declares no fixed-dimension parent (callout is intrinsic-height flow content). ✓
- **Transition-audit task?** Not required — spec §3.5 declares a single visual state; the present/absent toggle is an instant server-rendered conditional, no `AnimatePresence`/animated ternary. ✓
- **Type consistency:** `CorrectionLoopCallout({mode, children})`, `holdExplanation(disposition)`, `CORRECTION_LOOP_COPY` — same names across Tasks 1-4. ✓
- **Placeholder scan:** every code step shows full code; no TODO/TBD. ✓
