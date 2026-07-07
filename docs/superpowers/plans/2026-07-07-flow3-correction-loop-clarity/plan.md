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
| callout `resync` | `Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.` |
| callout `rescan` | `Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-read the sheet and clear this.` |
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

const RESYNC = "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.";
const RESCAN = "Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-read the sheet and clear this.";

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

it("the two modes differ ONLY in the verb (single-source copy) and carry no em dash", () => {
  // Executable single-source invariant (spec §5): normalizing the verb must make
  // the two rendered strings identical. Two independently-authored literals would
  // fail this the moment their prefix/suffix drift.
  const { rerender } = render(<CorrectionLoopCallout mode="resync" />);
  const resyncText = screen.getByTestId("correction-loop-callout").textContent ?? "";
  rerender(<CorrectionLoopCallout mode="rescan" />);
  const rescanText = screen.getByTestId("correction-loop-callout").textContent ?? "";
  const norm = (s: string) => s.replace(/re-sync|re-scan/g, "VERB");
  expect(norm(resyncText)).toBe(norm(rescanText));
  expect(resyncText + rescanText).not.toMatch(/[—]|--/);
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
 * No 'use client' and no server-only imports (no next/headers, no DB, no server
 * action) — so it is safe to render in BOTH a Server Component tree (the per-show
 * page) AND a "use client" tree (the wizard's step3ReviewSections). A plain
 * component imported into a client module simply renders on the client; this is
 * not an RSC boundary violation. `pnpm build` (Task 5) is the gate that proves it.
 *
 * Single-source copy (spec §5): one template string parameterized by a verb map,
 * NOT two independently-authored literals. Rendered via {expression} so the
 * apostrophe in "We'll" does not trip react/no-unescaped-entities.
 */
import type { ReactNode } from "react";

const CORRECTION_LOOP_VERB = { resync: "re-sync", rescan: "re-scan" } as const;

/** The shared prefix/suffix live here once; only the verb varies by mode. */
function correctionLoopCopy(mode: "resync" | "rescan"): string {
  return `Fixed it in the sheet? Edit the cell, save, then ${CORRECTION_LOOP_VERB[mode]}. We'll re-read the sheet and clear this.`;
}

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
      <p className="min-w-0">{correctionLoopCopy(mode)}</p>
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
    "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.";
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
Expected: PASS (all, including the pre-existing Data-quality / archived tests). Note: the existing tests at lines 231-238 / 504-509 / 511-515 use `admin-resync-button` with fixtures that have NO active warnings (`showsInternal` reset to `null` in `beforeEach`), so the callout does not mount and there is exactly one `admin-resync-button` — those tests stay green unchanged.

- [ ] **Step 6: Disambiguate the existing Playwright e2e selector (duplicate-testid strict-mode guard)**

Both the footer `<ReSyncButton>` (inside `<div id="resync">`, `page.tsx:997`) and the new callout `<ReSyncButton>` expose `data-testid="admin-resync-button"`. On a seeded show that happens to carry an active, non-ignored parse warning, BOTH mount — and Playwright's strict mode fails `page.getByTestId("admin-resync-button")` when it matches two nodes. The existing e2e at `tests/e2e/admin-parse-panel.spec.ts:225` clicks the bare testid. Scope it to the footer anchor so it is deterministic regardless of the seed's warning state:

```ts
// tests/e2e/admin-parse-panel.spec.ts — was: await page.getByTestId("admin-resync-button").click();
await page.locator("#resync").getByTestId("admin-resync-button").click();
```

(The `#resync` wrapper contains ONLY the footer instance; the callout instance lives under `data-testid="correction-loop-callout"`. Unit tests need no change — see Step 5.)

- [ ] **Step 7: Commit**

```bash
git add "app/admin/show/[slug]/page.tsx" tests/app/admin/perShowPage.test.tsx tests/e2e/admin-parse-panel.spec.ts
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
    "Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-read the sheet and clear this.",
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

Append to `tests/components/admin/ChangeFeedEntry.test.tsx` (reuses `base`, `now`, `noop`). Add `import type { Disposition } from "@/lib/sync/holds/types";` to the file's imports (for the defensive unknown-disposition cast):

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

it("unknown/future disposition (schema drift) renders NO hold explanation (fail-quiet, no blank line)", () => {
  render(
    <ChangeFeedEntry
      entry={{
        ...base,
        status: "pending",
        action: "approve_reject",
        summary: "Some future hold",
        gate: {
          holdId: "h1",
          // cast an out-of-union value as would arrive from runtime DB JSON
          disposition: { disposition: "future_kind" } as unknown as Disposition,
          baseModifiedTime: "2026-06-09T10:00:00Z",
        },
      }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  // no explanation node at all (not an empty <p>) — and the raw token never leaks
  expect(within(row).queryByTestId("change-feed-hold-explanation")).toBeNull();
  expect(row.textContent).not.toContain("future_kind");
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
//
// Returns string | null and has a `default: null` — fail-quiet on schema drift
// (spec §4.3). `readShowChangeFeed` passes sync_holds.proposed_value (runtime DB
// JSON) straight into gate.disposition, so a future/unknown disposition string is
// a realistic version-skew path; it must render NO line, never a blank <p> or a
// raw disposition token.
function holdExplanation(disposition: Disposition): string | null {
  switch (disposition.disposition) {
    case "email_change":
      return "Held for your review: this crew member's sign-in email changed in the sheet. Approve to update their sign-in address; Reject to keep the current one.";
    case "rename":
      return "Held for your review: this crew member was renamed in the sheet. Approve to apply the new name; Reject to keep the current one.";
    case "removal":
      return "Held for your review: this crew member was removed from the sheet. Approve to remove them; Reject to keep them.";
    default:
      return null;
  }
}
```

Then, inside the component body compute the copy once (after `canGate` is derived at `ChangeFeedEntry.tsx:52`):

```tsx
const holdCopy = canGate ? holdExplanation(entry.gate!.disposition) : null;
```

And inside the left-column `<div className="flex min-w-0 flex-col gap-1">`, AFTER the summary `<p data-testid="change-feed-summary">…</p>` and BEFORE the `<div className="flex flex-wrap items-center gap-2">` badge/time row, insert (renders ONLY when the copy is non-null — an unknown disposition yields `null` and no node):

```tsx
{holdCopy ? (
  <p data-testid="change-feed-hold-explanation" className="text-xs text-text-subtle">
    {holdCopy}
  </p>
) : null}
```

(`canGate` is already computed at `ChangeFeedEntry.tsx:52` as `entry.action === "approve_reject" && entry.gate != null`. The file already imports `FeedEntry` from `@/lib/sync/holds/types` — extend that line to also import `Disposition` rather than adding a second import.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/ChangeFeedEntry.test.tsx -t "explanation"`
Expected: PASS (7 tests: 3 dispositions + undo + none + no-gate + unknown-disposition).

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

- [ ] **Step 5: Next production build (RSC/client-boundary gate)**

Run: `pnpm build` — Expected: build succeeds. `CorrectionLoopCallout` (no `'use client'`, no server-only imports) is imported into BOTH a Server Component (`app/admin/show/[slug]/page.tsx`) and a `"use client"` module (`components/admin/wizard/step3ReviewSections.tsx`). Vitest/jsdom does NOT exercise Next's RSC/client bundling, so this gate is the one that proves the shared component crosses that boundary cleanly. If build reports a boundary error, the component has an inadvertent server-only import — remove it (the component is pure markup and must stay client-safe). Do NOT reflexively add `'use client'` — that would force the per-show Server Component tree to ship it as client; the fix is keeping the component import-clean.

- [ ] **Step 6: Impeccable dual-gate (invariant 8) — three UI surfaces touched**

Run `/impeccable critique` AND `/impeccable audit` on the diff (the callout on the per-show Data-quality section, the wizard `WarningsBreakdown`, and the changes-feed row). Both run with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight). Record every HIGH/CRITICAL finding + its disposition for the milestone handoff. This precedes the whole-diff Codex review (Task 6).

Dispose of each HIGH/CRITICAL one of two ways — TDD is non-negotiable even for late visual/copy fixes:

- **Fix in-branch = a new TDD micro-task.** Do NOT batch fixes into a `git add -A` chore commit. For each finding requiring a code change: (1) write or update the failing test that pins the corrected behavior (e.g. an exact-copy assertion, a `data-testid` presence/absence, a scoped-DOM check), (2) run it — confirm it FAILS, (3) implement the minimal fix, (4) re-run that scoped test + `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run` (+ `pnpm build` if the change could affect bundling), (5) commit ONLY the touched files: `git add <specific files>` then `git commit --no-verify -m "fix(admin): <impeccable finding> (Flow 3)"`. One finding = one TDD commit.
- **Defer = docs-only commit.** If a finding is deferred, add a `DEFERRED.md` row with rationale and commit that file alone: `git add DEFERRED.md && git commit --no-verify -m "docs(admin): defer <finding> (Flow 3, DEFERRED.md)"`.

If critique + audit surface NO code changes and NO deferrals, this step produces no commit.

---

## Task 6: Whole-diff cross-model adversarial review (mandatory gate)

**Files:** none (review gate); any findings are triaged via deferral discipline (land-now fix / `DEFERRED.md` / `BACKLOG.md`).

This is a plan-level invariant in this repo (AGENTS.md — "Adversarial review (cross-model) is mandatory"), not optional process. Do NOT proceed to execution handoff / push until it returns APPROVE.

- [ ] **Step 1: Run the cross-model whole-diff review**

After Tasks 1-5 are committed and all local gates (typecheck / lint / format / test / build / impeccable) are green, run the Codex whole-diff adversarial review with fresh-eyes posture, REVIEWER ONLY:

```bash
CC="/Users/ericweiss/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs"
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}/sessions/${CODEX_COMPANION_SESSION_ID:-default}" \
  node "$CC" adversarial-review --wait
```

- [ ] **Step 2: Triage + fix to APPROVE**

For each finding: fix in-branch (class-sweep the shape first, then patch), OR defer via a `DEFERRED.md`/`BACKLOG.md` row with rationale. Re-run Step 1 after any fix. Iterate until the reviewer returns **APPROVE** (no round budget). Only then advance to push / CI / merge (Stage 4 of the ship pipeline).

---

## Impeccable dual-gate record (invariant 8)

Run on the diff (three UI surfaces) after Tasks 1-5. Deterministic detector: clean (`[]`, exit 0).

- **Critique (design review):** no CRITICAL. **One P1 (HIGH) — FIXED:** callout copy said "We'll re-parse and clear this" — "parse" is developer jargon (PRODUCT.md admin-voice ban) and inconsistent with the sibling Data-quality help copy ("reading this show's sheet", page.tsx:897). Changed to "We'll re-read the sheet and clear this" (both verbs). Fixed as a TDD micro-task: exact-copy tests updated first (failing), then the component template. P2 (twin `admin-resync-button` visual) — the strict-selector risk is already handled by scoping the e2e to `#resync` (Task 2 Step 6); the visual twin is ratified in spec §2 / watchpoint 4 (health vs correction context). P3 (callout body all `text-text-subtle`) — deliberate: the callout is secondary guidance; the `ReSyncButton` is the primary action. Both stand, not blocking.
- **Audit (technical):** no P0/P1 across a11y / performance / theming / responsive / anti-patterns. `text-text-subtle` on `bg-surface-sunken` ≈ 6.1:1 light / 6.9:1 dark (AA at both text-sm and text-xs). All design tokens, dark-safe, full border (not side-stripe), no nested card, no em dash. Two doc-only notes (document the sunken contrast row; text-xs is the legible floor) — no code action.

---

## Self-review (plan vs spec)

- **Spec §3.1 (per-show callout, gate `activeActionable.length > 0 && !archived`)** → Task 2 (mount + gate) + 4 tests (active/ignored-only/archived/zero). ✓
- **Spec §3.2 (wizard callout, copy-only, preserve non-blocking note)** → Task 3 (additive prepend + pinned-note assertion). ✓
- **Spec §4 (hold explanations, 3 dispositions, only on gate rows; §4.3 fail-quiet on unknown disposition)** → Task 4 (`holdExplanation` returns `string | null` with `default: null`; renders `<p>` only when non-null; 7 tests incl. the unknown-disposition schema-drift case). ✓
- **Spec §5 (single-source copy, verb-only diff)** → Task 1 (`correctionLoopCopy()` template + `CORRECTION_LOOP_VERB` map; executable verb-normalization equality test). ✓
- **Spec §6 (non-catalog)** → Global Constraints + Task 4 comment; no catalog/gen work in any task. ✓
- **Spec §7 (anti-tautology: exact copy + the re-sync action, not "a button"; per-disposition exact strings)** → Task 2 asserts `admin-resync-button` inside the callout; Task 4 asserts exact per-disposition strings. ✓
- **Spec §8 (invariant 8 dual-gate; no meta-test)** → Task 5 Step 5; no meta-test task (correctly absent). ✓
- **Layout-dimensions task?** Not required — spec §3.4 declares no fixed-dimension parent (callout is intrinsic-height flow content). ✓
- **Transition-audit task?** Not required — spec §3.5 declares a single visual state; the present/absent toggle is an instant server-rendered conditional, no `AnimatePresence`/animated ternary. ✓
- **Type consistency:** `CorrectionLoopCallout({mode, children})`, `holdExplanation(disposition)`, `CORRECTION_LOOP_COPY` — same names across Tasks 1-4. ✓
- **Placeholder scan:** every code step shows full code; no TODO/TBD. ✓
