# Share-Hub Popover Focus-Treatment Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the ShareHub popover's keyboard-focus rings to the ratified two-tier recipe and graduate DEFERRED entry `SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE`.

**Architecture:** Class-string-only diff across four control components, contract-pinned by extending the existing `tests/components/admin/showpage/shareHub.test.tsx` suite (no new test files, so no `testMatch`/workflow wiring changes). Spec: `docs/superpowers/specs/2026-07-23-sharehub-focus-pass.md` (canonical; §2 defines the tiers).

**Tech Stack:** React + Tailwind v4 class utilities, Vitest + Testing Library (jsdom), existing `expectClasses` helper (`tests/components/admin/showpage/_rowAssertions.ts:56`).

## Global Constraints

- Two-tier rule (spec §2): tier 1 = `focus-visible:ring-2 focus-visible:ring-focus-ring`, NO offset; tier 2 (armed destructive confirms only) = tier 1 + `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
- Zero bare `ring-offset-2` (offset without explicit color) in touched files (spec AC-2).
- No DOM, copy, color-token, spacing, or behavior changes. Focus rings stay `--duration-instant` (no animation).
- Commit per task, conventional commits (invariant 6).
- UI files touched: impeccable dual-gate (critique + audit) required before whole-diff review (invariant 8).
- Meta-test inventory (spec §7): none applies — no Supabase boundary, no sentinel text, no admin-alert code, no advisory lock, no email path, no mutation surface.
- Advisory-lock topology: N/A — no `pg_advisory*` surface touched.

---

### Task 1: Two-tier focus contract (tests first, then class edits)

**Files:**
- Modify: `tests/components/admin/showpage/shareHub.test.tsx` (rewrite the test at :485-505; append a new describe block after the "row wrappers are inert" describe)
- Modify: `app/admin/show/[slug]/PickerResetControl.tsx:250,276`
- Modify: `app/admin/show/[slug]/RotateShareTokenButton.tsx:336`
- Modify: `components/admin/ArchiveShowButton.tsx:321,322,396,398,399`
- Modify: `tests/components/admin/ArchiveShowButton.test.tsx` (append non-row two-tier describe block)
- Modify: `components/admin/UnarchiveShowButton.tsx:72`

**Interfaces:**
- Consumes: `renderHub`, `primary()`, `kebab()`, `SHOW_ID`, `ROW_TOKENS`, `expectClasses`, `NO_BORDER`, `NO_REST_BACKGROUND` — all already defined in the test file / `_rowAssertions.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite the reset-row guard test (`shareHub.test.tsx:485-505`)**

Replace the test titled `"reset idle state is ONE menu row, contributes no heading, keeps its ring offset"` with:

```tsx
  it("reset idle state is ONE menu row, contributes no heading, tier-1 focus (no offset)", () => {
    renderHub();
    fireEvent.click(primary());

    const reset = screen.getByTestId("picker-reset-all-button");
    expect(reset.tagName).toBe("BUTTON");
    expectClasses(reset, {
      exactly: [
        ...ROW_TOKENS,
        "disabled:cursor-not-allowed",
        "disabled:opacity-60",
        "disabled:hover:bg-transparent",
      ],
      // Tier 1 (spec 2026-07-23-sharehub-focus-pass §2): the offset pair that
      // used to ride on this row is now reserved for armed destructive
      // confirms. A reappearing `focus-visible:ring-offset-*` here is the pass
      // reverting.
      forbids: [NO_BORDER, NO_REST_BACKGROUND, /^focus-visible:ring-offset-/],
    });

    expectRowText(reset, popover(), {
      label: "Reset everyone's pick",
      description: "Make everyone pick their name again on their next visit.",
    });
```

(Keep the remainder of the original test body after the `expectRowText` call unchanged.)

- [ ] **Step 2: Append the two-tier contract describe block**

Add after the closing `});` of the `describe("ShareHub — the row wrappers are inert (spec §7.0)")` block:

```tsx
describe("ShareHub — two-tier focus contract (spec 2026-07-23-sharehub-focus-pass §2)", () => {
  const TIER1 = ["focus-visible:ring-2", "focus-visible:ring-focus-ring"] as const;
  const OFFSET_PAIR = [
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-surface",
  ] as const;
  // Any focus-visible offset token. Catches BOTH failure modes: tier 1
  // regaining an offset, and a future bare `ring-offset-2` (white-halo bug)
  // sneaking in without its color companion on a tier-1 control.
  const ANY_OFFSET = /^focus-visible:ring-offset-/;

  it("tier 1: reset row + reset cancel carry the plain ring and NO offset", () => {
    renderHub();
    fireEvent.click(primary());
    const row = screen.getByTestId("picker-reset-all-button");
    expectClasses(row, { has: TIER1, forbids: [ANY_OFFSET] });
    fireEvent.click(row);
    expectClasses(screen.getByTestId("picker-reset-cancel-button"), {
      has: TIER1,
      forbids: [ANY_OFFSET],
    });
  });

  it("tier 2: reset armed confirm carries the FULL offset pair", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.click(screen.getByTestId("picker-reset-all-button"));
    expectClasses(screen.getByTestId("picker-reset-confirm-button"), {
      has: [...TIER1, ...OFFSET_PAIR],
    });
  });

  it("tier 2: rotate armed confirm carries the FULL offset pair; its row and cancel stay tier 1", () => {
    renderHub({ published: true });
    fireEvent.click(primary());
    const row = screen.getByTestId("admin-rotate-share-token-button");
    expectClasses(row, { has: TIER1, forbids: [ANY_OFFSET] });
    fireEvent.click(row);
    expectClasses(screen.getByTestId("admin-rotate-share-token-confirm-button"), {
      has: [...TIER1, ...OFFSET_PAIR],
    });
    expectClasses(screen.getByTestId("admin-rotate-share-token-cancel-button"), {
      has: TIER1,
      forbids: [ANY_OFFSET],
    });
  });

  it("tier 2: archive armed confirm carries the FULL offset pair; its row and cancel stay tier 1", () => {
    renderHub();
    fireEvent.click(primary());
    const row = screen.getByTestId("archive-show-button");
    expectClasses(row, { has: TIER1, forbids: [ANY_OFFSET] });
    fireEvent.click(row);
    expectClasses(screen.getByTestId("archive-show-confirm-button"), {
      has: [...TIER1, ...OFFSET_PAIR],
    });
    expectClasses(screen.getByTestId("archive-show-cancel-button"), {
      has: TIER1,
      forbids: [ANY_OFFSET],
    });
  });

  it("tier 1: unarchive is a single-tap non-destructive action - plain ring, no offset (dark-halo regression)", () => {
    renderHub({ archived: true });
    fireEvent.click(kebab());
    expectClasses(screen.getByTestId(`unarchive-show-button-${SHOW_ID}`), {
      has: TIER1,
      forbids: [ANY_OFFSET],
    });
  });
});
```

Additionally append to the SAME two-tier describe block a tier-1 inventory test (primary, kebab, mailto row, copy button — positive base-ring tokens AND negative no-offset), and append to `tests/components/admin/ArchiveShowButton.test.tsx` a "two-tier focus contract on the non-row variants" describe rendering the full and compact variants directly (trigger tier 1, armed confirm tier 2, both variants) — those branches have no live render site, so the popover suite cannot cover the four non-row edits. (Both blocks are in the working tree; see the committed test file for the exact code.)

Concrete failure modes: each tier-1 assertion fails if the pass is reverted or a bare offset reappears (white halo); each tier-2 `has` fails if the offset pair is dropped OR ships bare (`ring-offset-2` without `ring-offset-surface` — the exact dark-mode defect). `has`+`exactly` go through `expectClasses` token sets, so `sm:focus-visible:ring-offset-2` variants cannot ride along unnoticed on the `exactly` path, and substring matches cannot fake a token.

- [ ] **Step 3: Run the suite to verify the new assertions FAIL against current code**

Run: `pnpm vitest run tests/components/admin/showpage/shareHub.test.tsx`
Expected: FAIL — at minimum: rewritten reset-row test (row still has the offset pair), rotate armed confirm (`missing token focus-visible:ring-offset-2`), archive armed confirm (same), unarchive (`forbidden token focus-visible:ring-offset-2`). Reset armed confirm + reset cancel tier assertions: confirm passes (already tier 2), cancel FAILS (still has pair).

- [ ] **Step 4: Apply the class edits**

1. `app/admin/show/[slug]/PickerResetControl.tsx:276` (reset row): delete `focus-visible:ring-offset-2 focus-visible:ring-offset-surface ` from the className.
2. `app/admin/show/[slug]/PickerResetControl.tsx:250` (reset cancel): delete the same pair.
3. `app/admin/show/[slug]/RotateShareTokenButton.tsx:336` (rotate armed confirm): insert `focus-visible:ring-offset-2 focus-visible:ring-offset-surface ` immediately after `focus-visible:ring-focus-ring `.
4. `components/admin/ArchiveShowButton.tsx:396` (archive armed confirm, row variant): insert the pair the same way.
5. `components/admin/ArchiveShowButton.tsx:321`, `:322` (non-row ARMING triggers, currently unreachable): delete the trailing bare `focus-visible:ring-offset-2` (tier 1 by role; dark-halo fix).
5b. `components/admin/ArchiveShowButton.tsx:398`, `:399` (non-row ARMED CONFIRMS, currently unreachable): append `focus-visible:ring-offset-surface` immediately after each existing `focus-visible:ring-offset-2` (tier 2 by role).
6. `components/admin/UnarchiveShowButton.tsx:72`: delete `focus-visible:ring-offset-2 ` (bare, no color companion).

- [ ] **Step 5: Run the suite to verify green**

Run: `pnpm vitest run tests/components/admin/showpage/shareHub.test.tsx`
Expected: PASS, `$?` = 0 and no `Errors` summary line (vitest exits 1 on uncaught errors even with all tests passing).

- [ ] **Step 6: Bare-offset sweep of the touched files (AC-2)**

Run: `rg -n 'ring-offset-2(?!\S)' app/admin/show/\[slug\]/PickerResetControl.tsx app/admin/show/\[slug\]/RotateShareTokenButton.tsx components/admin/ArchiveShowButton.tsx components/admin/UnarchiveShowButton.tsx -P | grep -v 'ring-offset-surface' || echo CLEAN`
Expected: `CLEAN` (every remaining `ring-offset-2` line also carries `ring-offset-surface`).

- [ ] **Step 7: Commit**

```bash
git add tests/components/admin/showpage/shareHub.test.tsx "app/admin/show/[slug]/PickerResetControl.tsx" "app/admin/show/[slug]/RotateShareTokenButton.tsx" components/admin/ArchiveShowButton.tsx components/admin/UnarchiveShowButton.tsx
git commit -m "feat(admin): two-tier focus rings in the share-hub popover"
```

### Task 2: Graduate the DEFERRED entry

**Files:**
- Modify: `DEFERRED.md` (remove the `SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE` block at :27-55; update the "Last reconciled" line at :7)
- Modify: `DEFERRED-archive.md` (append under the Share hub section)

**Interfaces:** none.

- [ ] **Step 1: Move the entry**

In `DEFERRED.md`: delete the whole `### SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE` section; prepend to the `Last reconciled:` line's parenthetical: `2026-07-23: SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE graduated to the archive — P2 focus-ring inconsistency resolved by feat/sharehub-focus-pass (two-tier recipe, spec 2026-07-23-sharehub-focus-pass §2); P3 caret shadow ratified no-shadow.` and update the leading `Last reconciled:` date to 2026-07-23.

In `DEFERRED-archive.md`, append to the Share hub section the original three bullets plus final dispositions:
- P1 caret anchor: RESOLVED (`fix/sharehub-caret-anchor`, commit `cdf3a1012`).
- P2 focus-ring inconsistency: RESOLVED by the two-tier pass (rows/cancels/triggers plain; armed destructive confirms `ring-offset-2 ring-offset-surface`); supersedes fidelity-fixes spec §4.1's verbatim retention per its own un-defer trigger.
- P3 caret `shadow-popover`: RATIFIED no-shadow (rotated-diamond smudge; HoverHelp border-triangle caret precedent, `components/admin/HoverHelp.tsx:622`).

- [ ] **Step 2: Verify + commit**

Run: `rg -c "SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE" DEFERRED.md DEFERRED-archive.md`
Expected: `DEFERRED.md` 1 (the Last-reconciled note only) or 0; `DEFERRED-archive.md` ≥ 1.

```bash
git add DEFERRED.md DEFERRED-archive.md
git commit -m "docs: graduate SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE to the archive"
```

### Task 3: Local gates + impeccable dual-gate

**Files:** none created; gates over the diff.

- [ ] **Step 1: Full local gates**

Run, each must pass (`$?` = 0, no `Errors` line):
```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] **Step 2: Impeccable dual-gate (invariant 8)**

Run `/impeccable critique` and `/impeccable audit` on the diff (canonical v3 setup gates: `context.mjs` context load → register reference read). P0/P1 findings fixed in-branch or DEFERRED.md-entried; record findings + dispositions for the PR body / close-out.

- [ ] **Step 3: Commit any gate fixes**

One commit per fix class, conventional format (`fix(admin): …` / `test(admin): …`).

### Task 4: Whole-diff review + ship

- [ ] **Step 1: Whole-diff Codex review** via `codex-guard review` (fresh-eyes brief; REVIEWER ONLY; verdict marker; do-not-relitigate list from spec §1.1). Iterate to APPROVE; class-sweep before patching any finding.
- [ ] **Step 2: Push + PR** (`git push -u origin feat/sharehub-focus-pass`; `gh pr create`), PR body cites spec + review outcomes.
- [ ] **Step 3: Real CI green** (`gh pr checks --watch` with PR number; confirm `mergeStateStatus` CLEAN).
- [ ] **Step 4: `gh pr merge --merge`**, then in the MAIN checkout: `git pull --ff-only` and verify `git rev-list --left-right --count main...origin/main` == `0  0`. Update ship-state marker to `done`, CronDelete nudge job.

## Self-review notes

- Spec coverage: §3.1 items 1-7 → Task 1 Step 4 (items 1-7 mapped 1:1); §3.2 → Task 1 Steps 1-2; §3.3 → Task 2; §4 ACs → Task 1 Step 6 (AC-2), Task 3 (AC-3), Task 2 (AC-4), Task 1 tests (AC-1).
- No placeholders; all test code complete and typechecks under strict tsconfig (no index access, no narrowing hazards; `as const` arrays spread into `readonly string[]` params).
- Names verified against live code: every testid, helper, and line number grep-confirmed at branch point `8e70ab0e4` (transcript in session).
- e2e harness: N/A — no new Playwright surface; jsdom class assertions are the correct oracle for class-string contracts (visual verification belongs to the impeccable gate).
