# Share-Hub Popover Focus-Treatment Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the ShareHub popover's keyboard-focus rings to the ratified two-tier recipe and graduate DEFERRED entry `SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE`.

**Architecture:** Class-string-only diff across four control components, contract-pinned by extending the existing `tests/components/admin/showpage/shareHub.test.tsx` suite (no new test files, so no `testMatch`/workflow wiring changes). Spec: `docs/superpowers/specs/2026-07-23-sharehub-focus-pass.md` (canonical; §2 defines the tiers).

**Tech Stack:** React + Tailwind v4 class utilities, Vitest + Testing Library (jsdom), existing `expectClasses` helper (`tests/components/admin/showpage/_rowAssertions.ts:56`).

## Global Constraints

- Two-tier rule (spec §2): tier 1 = `focus-visible:ring-2 focus-visible:ring-focus-ring`, NO offset; tier 2 (armed destructive confirms only) = tier 1 + `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
- Zero bare `ring-offset-2` (offset without explicit color) in touched files (spec AC-2).
- No DOM, copy, color-token, spacing, or behavior changes. Focus rings stay `--duration-instant` (no animation).
- Commit per task, conventional commits (invariant 6). Autonomous runs: EVERY task closes by advancing `<worktree>/.claude/ship-state.json` (`stage` = the next task's id, `tasksRemaining` shrunk, `next` = the next concrete action) in the same turn as the task's commit — the hourly nudge and Stop gate read this file, and a stale marker resumes the wrong action. TDD per task (invariant 1): EVERY change — including gate fixes and review-round repairs — lands failing-test-first wherever a test can express it; prose/docs repairs are exempt.
- UI files touched: impeccable dual-gate (critique + audit) required before whole-diff review (invariant 8).
- Meta-test inventory (spec §7): none applies — no Supabase boundary, no sentinel text, no admin-alert code, no advisory lock, no email path, no mutation surface.
- Advisory-lock topology: N/A — no `pg_advisory*` surface touched.

---

### Task 0: Worktree setup (invariant 11)

- [ ] **Step 1:** `git worktree add -b feat/sharehub-focus-pass ../FX-worktrees/sharehub-focus-pass origin/main` (verified starting revision: `8e70ab0e4`; see Step 4 for drift handling).
- [ ] **Step 2:** In the worktree: `pnpm install`, then `pnpm worktree:link-env` (symlinks `.env.local` from the main checkout), then `pnpm preflight` — must print `env ✓  local DB ✓`; stop and fix env on any failure.
- [ ] **Step 3 (autonomous runs only):** Register the hourly off-minute nudge cron (AGENTS.md autonomous-ship gate) and write `<worktree>/.claude/ship-state.json` (`{branch, stage, tasksRemaining, next, blockedOn, cronJobId}`). Task 4's marker-update + CronDelete steps operate on exactly these; an interactive run skips this step AND Task 4's marker/CronDelete steps.
- [ ] **Step 4:** Revision check: this plan's names/lines/fixtures were live-verified at `8e70ab0e4`. If `git rev-parse origin/main` differs, re-run the pre-draft verification greps (spec §1 table cites) before editing; any drift is a plan-update, not an improvisation.

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

(The complete describe block is inlined below — single source, no sketch.)

The COMPLETE two-tier describe block for `shareHub.test.tsx` (append after the closing `});` of the "row wrappers are inert" describe):

```tsx
describe("ShareHub — two-tier focus contract (spec 2026-07-23-sharehub-focus-pass §2)", () => {
  const TIER1_RING = ["focus-visible:ring-2", "focus-visible:ring-focus-ring"] as const;
  const OFFSET_PAIR = [
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-surface",
  ] as const;
  // SET EQUALITY over every focus-visible ring-family token (ring width, ring
  // color, offset width, offset color — variant prefixes included). Forbid
  // lists cannot close this class: a lookahead forbid lets
  // `sm:focus-visible:ring-offset-2` coexist with the ratified pair, and no
  // forbid stops a competing `focus-visible:ring-4` or a second ring color
  // from overriding the treatment while every positive assertion stays green.
  const ringTokens = (el: Element) =>
    (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((t) => t.includes("focus-visible:ring"))
      .sort();
  const expectTier1 = (el: Element) => {
    expect(ringTokens(el)).toEqual([...TIER1_RING].sort());
  };
  const expectTier2 = (el: Element) => {
    expect(ringTokens(el)).toEqual([...TIER1_RING, ...OFFSET_PAIR].sort());
  };

  it("tier 1: reset row + reset cancel carry exactly the plain ring set", () => {
    renderHub();
    fireEvent.click(primary());
    const row = screen.getByTestId("picker-reset-all-button");
    expectTier1(row);
    fireEvent.click(row);
    expectTier1(screen.getByTestId("picker-reset-cancel-button"));
  });

  it("tier 2: reset armed confirm carries exactly ring set + offset pair", () => {
    renderHub();
    fireEvent.click(primary());
    fireEvent.click(screen.getByTestId("picker-reset-all-button"));
    expectTier2(screen.getByTestId("picker-reset-confirm-button"));
  });

  it("tier 2: rotate armed confirm exact; its row and cancel stay tier 1", () => {
    renderHub({ published: true });
    fireEvent.click(primary());
    const row = screen.getByTestId("admin-rotate-share-token-button");
    expectTier1(row);
    fireEvent.click(row);
    expectTier2(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    expectTier1(screen.getByTestId("admin-rotate-share-token-cancel-button"));
  });

  it("tier 2: archive armed confirm exact; its row and cancel stay tier 1", () => {
    renderHub();
    fireEvent.click(primary());
    const row = screen.getByTestId("archive-show-button");
    expectTier1(row);
    fireEvent.click(row);
    expectTier2(screen.getByTestId("archive-show-confirm-button"));
    expectTier1(screen.getByTestId("archive-show-cancel-button"));
  });

  it("tier 1 inventory: primary, kebab, mailto row and copy button carry exactly the plain ring set", () => {
    // Set equality: losing the base ring token (unfocusable-looking control),
    // gaining a bare offset (white halo), or a competing ring width/color all
    // fail the same assertion.
    renderHub({ published: true });
    fireEvent.click(primary());
    for (const el of [
      primary(),
      kebab(),
      screen.getByTestId("admin-current-share-link-email-button"),
      screen.getByTestId("admin-current-share-link-copy-button"),
    ]) {
      expectTier1(el);
    }
  });

  it("tier 1: unarchive is a single-tap non-destructive action - exact plain ring set (dark-halo regression)", () => {
    renderHub({ archived: true });
    fireEvent.click(kebab());
    expectTier1(screen.getByTestId(`unarchive-show-button-${SHOW_ID}`));
  });
});
```

And append to `tests/components/admin/ArchiveShowButton.test.tsx` (inside the existing file, after the last describe — those non-row branches have no live render site, so the popover suite cannot cover the four non-row edits):

```tsx
describe("ArchiveShowButton — two-tier focus contract on the non-row variants (spec 2026-07-23-sharehub-focus-pass §3.1 items 6-7)", () => {
  // These branches have no live render site (the hub popover uses the row
  // variant), so the popover suite cannot see them. Without these assertions
  // the four non-row class edits could be silently omitted — or the bare
  // `ring-offset-2` white-halo defect could return — with every other gate
  // green. SET EQUALITY over the focus-visible ring-family token set: forbid
  // lists cannot stop variant-prefixed offset riders or a competing ring
  // width/color from overriding the ratified treatment.
  const TIER1_RING = ["focus-visible:ring-2", "focus-visible:ring-focus-ring"] as const;
  const OFFSET_PAIR = [
    "focus-visible:ring-offset-2",
    "focus-visible:ring-offset-surface",
  ] as const;
  const ringTokens = (el: Element) =>
    (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((t) => t.includes("focus-visible:ring"))
      .sort();
  const expectTier = (el: Element, tier: 1 | 2) => {
    const expected = tier === 2 ? [...TIER1_RING, ...OFFSET_PAIR] : [...TIER1_RING];
    expect(ringTokens(el)).toEqual(expected.sort());
  };

  for (const compact of [false, true]) {
    const label = compact ? "compact" : "full";
    it(`${label} variant: arming trigger is tier 1; armed confirm is tier 2`, () => {
      const action = vi.fn(async () => ({ ok: true }) as const);
      const { getByTestId } = render(
        compact ? (
          <ArchiveShowButton archiveAction={action} compact />
        ) : (
          <ArchiveShowButton archiveAction={action} />
        ),
      );
      const trigger = getByTestId("archive-show-button");
      expectTier(trigger, 1);
      fireEvent.click(trigger);
      expectTier(getByTestId("archive-show-confirm-button"), 2);
    });
  }
});
```

Concrete failure modes (the oracle is `ringTokens(el)` SET EQUALITY, not `expectClasses` forbids — only the rewritten reset-row guard still goes through `expectClasses`): a tier-1 control failing means it lost a base ring token, gained any offset token (bare-offset white halo included), or gained a competing ring width/color; a tier-2 control failing means the pair is incomplete OR any extra ring-family token (variant-prefixed riders like `sm:focus-visible:ring-offset-2` included) rode along. Diagnostics print the full sorted token-set diff.

- [ ] **Step 3: Run the suite to verify the new assertions FAIL against current code**

Run: `pnpm vitest run tests/components/admin/showpage/shareHub.test.tsx tests/components/admin/ArchiveShowButton.test.tsx`
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

Run: `pnpm vitest run tests/components/admin/showpage/shareHub.test.tsx tests/components/admin/ArchiveShowButton.test.tsx`
Expected: PASS (both files), `$?` = 0 and no `Errors` summary line (vitest exits 1 on uncaught errors even with all tests passing).

- [ ] **Step 6: Bare-offset sweep of the touched files (AC-2)**

Run: `rg -oP 'focus-visible:ring-offset-2(?!\s+focus-visible:ring-offset-surface)' "app/admin/show/[slug]/PickerResetControl.tsx" "app/admin/show/[slug]/RotateShareTokenButton.tsx" components/admin/ArchiveShowButton.tsx components/admin/UnarchiveShowButton.tsx || echo CLEAN`
Expected: `CLEAN`. Token-anchored: a match means an offset token NOT immediately followed by its surface companion — catching end-of-string bare offsets (`…ring-offset-2"`) and multiple tokens per line, which a line-level `grep -v` misses. (Assumes the codebase's invariant ordering `ring-offset-2` then `ring-offset-surface`; the exact-pair test negatives are the authoritative guard.)

- [ ] **Step 7: Commit**

```bash
git add tests/components/admin/showpage/shareHub.test.tsx tests/components/admin/ArchiveShowButton.test.tsx "app/admin/show/[slug]/PickerResetControl.tsx" "app/admin/show/[slug]/RotateShareTokenButton.tsx" components/admin/ArchiveShowButton.tsx components/admin/UnarchiveShowButton.tsx
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

Run all three, each must hit:
- `rg -n "SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE graduated" DEFERRED.md` — exactly 1 hit, on the `Last reconciled:` line (the reconciliation note).
- `rg -c "^### SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE" DEFERRED.md || true` — 0 (the entry block itself is gone).
- `sed -n '/^## Share hub focus pass (2026-07-23)/,/^## /p' DEFERRED-archive.md | rg -c '^- \*\*\[P[123]\]'` — MUST print exactly `3`: the three disposition bullets ([P1] caret anchor, [P2] focus-ring, [P3] caret shadow) inside that section and no other.

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

Run `/impeccable critique` and `/impeccable audit` on the diff (canonical v3 setup gates: `context.mjs` context load → register reference read). P0/P1 findings fixed in-branch or DEFERRED.md-entried. Record findings + dispositions DURABLY in §12 of `docs/superpowers/plans/2026-07-23-sharehub-focus-pass/handoff.md` (create if absent) and commit it BEFORE dispatching whole-diff review (invariant 8's handoff-doc requirement); the PR body cites that section.

- [ ] **Step 3: Commit any gate fixes**

One commit per fix class, conventional format (`fix(admin): …` / `test(admin): …`).

- [ ] **Step 4: Revalidate after any gate fix (loop until clean)**

If Step 2/3 changed ANY file: re-run the affected test suites AND the full Step 1 gate set, then re-run `/impeccable critique` + `/impeccable audit` scoped to the post-fix diff. Loop Steps 2-4 until a pass produces zero new P0/P1 and zero code mutations. Only then proceed to Task 4.

### Task 4: Whole-diff review + ship

- [ ] **Step 1: Whole-diff Codex review** via `codex-guard review` (fresh-eyes brief; REVIEWER ONLY; verdict marker; do-not-relitigate list from spec §1.1). Iterate to APPROVE; class-sweep before patching any finding. EVERY repair made during this iteration re-enters the Task 3 revalidation loop (affected suites + full local gates + critique/audit re-run when the repair touches UI files) and updates the handoff §12 record, BEFORE the next review round or push. No mutation may reach Step 2 without a post-mutation clean pass.
- [ ] **Step 2: Push + PR** (`git push -u origin feat/sharehub-focus-pass`; `gh pr create`), PR body cites spec + review outcomes.
- [ ] **Step 3: Real CI green** (`gh pr checks --watch` with PR number; confirm `mergeStateStatus` CLEAN).
- [ ] **Step 4: `gh pr merge --merge`**, then in the MAIN checkout: `git pull --ff-only` and verify `git rev-list --left-right --count main...origin/main` == `0  0`. Update ship-state marker to `done`, CronDelete nudge job.

## Self-review notes

- Spec coverage: §3.1 items 1-7 → Task 1 Step 4 (items 1-7 mapped 1:1); §3.2 → Task 1 Steps 1-2; §3.3 → Task 2; §4 ACs → Task 1 Step 6 (AC-2), Task 3 (AC-3), Task 2 (AC-4), Task 1 tests (AC-1).
- No placeholders; all test code complete and typechecks under strict tsconfig (no index access, no narrowing hazards; `as const` arrays spread into `readonly string[]` params).
- Names verified against live code: every testid, helper, and line number grep-confirmed at branch point `8e70ab0e4` (transcript in session).
- e2e harness: N/A — no new Playwright surface; jsdom class assertions are the correct oracle for class-string contracts (visual verification belongs to the impeccable gate).
