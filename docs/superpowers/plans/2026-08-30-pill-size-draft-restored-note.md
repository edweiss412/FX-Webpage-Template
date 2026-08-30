# Pill size and draft-restored note: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the review-modal attention pill's type one size at phone widths on the four sites where it wraps inside a cap, and tell the operator, without scrolling, that a report draft came back.

**Architecture:** Two independent changes in one PR because they close two ledger rows Eric decided together. D1 is a class-swept classname change plus the browser assertions that prove it did not break the header's geometry or its 44px hit band. D2 adds one conditionally-mounted note at the top of the step-3 modal's content pane, announced through the shell's existing provider so no new live region is introduced.

**Tech Stack:** Next.js 16, React, Tailwind v4 (`@theme` tokens in `app/globals.css`), Vitest + jsdom for unit, Playwright (desktop-chromium) for real-browser geometry.

**Spec:** `docs/superpowers/specs/2026-08-30-pill-size-draft-restored-note-design.md`: canonical. Five adversarial rounds; §1.1 carries eight ratified decisions that are closed to relitigation.

## Global Constraints

- **Invariant 1 (TDD).** Every task: failing test, minimal implementation, passing test, commit. No implementation before its test.
- **Invariant 6 (commit per task).** `<type>(<scope>): <summary>`; scopes here are `crew-page`-adjacent admin UI, so use `fix(admin)`, `test(admin)`, `docs(plan)`.
- **Invariant 8 (impeccable dual gate).** Both `/impeccable critique` and `/impeccable audit` run on the diff before closeout. This is a UI arc; the gate is not optional.
- **Invariant 11.** All work in `/Users/ericweiss/FX-worktrees/p1pair`. Never the main checkout.
- **Type tokens are `@theme` names, never arbitrary values.** `--text-xs: 0.75rem` / line-height `1.4`; `--text-sm: 0.875rem` / line-height `1.45` (`app/globals.css:168-171`). `--breakpoint-sm: 640px` (`app/globals.css:318`).
- **No em dash and no apostrophe in any user-visible copy this arc adds.** Sentence case. No error code: §12.4 is not implicated, so no `pnpm gen:spec-codes` run and no `lib/messages/catalog.ts` row.
- **The responsive spelling is `text-sm sm:text-xs`,** mobile-first, matching all nine repo precedents. Ratified §1.1 R7.
- **Heavy phases run under `pnpm heavy`.** Every Playwright run in this plan is a heavy phase. Export a loopback `TEST_DATABASE_URL` and `HASH_FOR_LOG_PEPPER` before any e2e run (see the note under Task 4).
- **The four in-class sites are P1, P2, P3, W2 only.** `components/admin/wizard/Step3ReviewModal.tsx:574` and `components/admin/wizard/Step3ReviewModal.tsx:676` are out of class (§1.1 R8) and must still read `text-xs` when this arc ends.

---

## Pre-draft verification record

Run at plan time, not described for later. Negative and enumerative claims get their own search because a self-sweep is structurally blind to them. That is the lesson the spec stage ended on.

**V1: is any pill site missed? (enumerative)**

```
$ rg -l "max-sm:flex-wrap" components/
components/admin/wizard/Step3SheetCard.tsx
components/admin/wizard/Step3ReviewModal.tsx
components/admin/showpage/PublishedReviewModal.tsx
```

Three files, and the third is **not** a missed site. `components/admin/wizard/Step3SheetCard.tsx:757` is a cluster wrapper, `flex shrink-0 items-center gap-3 max-sm:w-full max-sm:flex-wrap max-sm:justify-between`: full width below `sm`, so there is no cap and no 112px budget; it wraps a View/Review button row onto a second row. The chip it holds (`components/admin/wizard/Step3SheetCard.tsx:588`, testid `wizard-step3-card-<dfid>-judgment-chip`) is `text-xs font-medium` on a **card**, not in the review-modal header the ledger row named. Out of class on surface, on cap, and on weight.

**V2: does any test already assert the pill's computed font size? (negative)**

```
$ rg -n "fontSize|font-size" tests/ | rg -i "pill|chip"
(no output)
```

None. AC-1 clause (a) is new coverage, not a duplicate.

**V3: does any e2e fixture seed a report-draft key? (negative; AC-12 rests on this)**

```
$ rg -n "fxav-report-draft" tests/
tests/admin/reportDraftStore.test.ts:42
tests/components/admin/wizard/step3ReviewSections.test.tsx:2061
```

Two hits, **neither under `tests/e2e/`**: one asserts the key builder's output, one is a jsdom component test. So AC-12's claim: no e2e fixture seeds the key: holds, and the note cannot mount in any existing geometry spec. Task 9 pins it so it stays true.

**V4: who drives `tests/e2e/_pillFocusLiveEntry.tsx`? (enumerative; Task 6 rests on this)**

```
$ rg -n "_pillFocusLiveEntry" tests/ | rg -v "^tests/e2e/_pillFocusLiveEntry.tsx"
tests/components/admin/sheetIconLinkContainment.test.ts:1088
tests/e2e/popover-clip-fit.spec.ts:49
tests/e2e/attention-pill-focus.spec.ts:58,71
tests/e2e/attention-autoopen-suppress.spec.ts:37
```

**Three real-browser suites bundle and drive it** (`popover-clip-fit`, `attention-pill-focus`, and the one under change), and `sheetIconLinkContainment.test.ts:1088` **scans its source text** and pins a count. The entry's own fence comment (`tests/e2e/_pillFocusLiveEntry.tsx:121-127`) names only two and predates `popover-clip-fit`; this census is from disk and supersedes it.

**V5: three-segment coverage today (negative, narrowed).** `tests/components/admin/showpage/publishedReviewModal.test.tsx:529-541` composes all three segments and asserts the pill's **text** in jsdom. No real-browser fixture does, and jsdom computes no layout, so no geometry exists for the three-segment case. Task 2 builds it.

## Meta-test inventory

- **Extends:** none of the registry-bearing suites change shape. `tests/components/_metaLiveRegionMounting.test.ts`'s registry value for `components/admin/wizard/Step3ReviewModal.tsx` stays at **1**: the note announces through `UndoAnnounceContext` and mounts no region of its own (spec §3.3). Task 9 asserts the value is unchanged rather than editing it.
- **Creates:** no new registry. The class-boundary guard in Task 1 is a scanning assertion inside an existing suite, not a new registry file.
- **Advisory-lock topology:** N/A: this arc touches no `pg_advisory*` path, no RPC, no DB layer at all.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `tests/e2e/_publishedReviewModalHarness.tsx` | monitoring item builder; the three-segment and degraded pages | 1 |
| `tests/e2e/published-review-modal.layout.spec.ts` | fixture-integrity premise, AC-1 geometry, AC-4 equation, AC-3 clip oracle | 1 |
| tests/styles/pillTypeClassBoundary.test.ts | AC-6: exactly the four in-class sites carry the pair, both directions | 1 |
| `components/admin/showpage/PublishedReviewModal.tsx` | P1/P2/P3 type classes; the tap-band comment's arithmetic | 1 |
| `components/admin/wizard/Step3ReviewModal.tsx` | W2's type class; mounting the note in the content-pane top slot | 1, 3 |
| `tests/e2e/_pillFocusLiveEntry.tsx` | opt-in crew-warnings setter; the stale consumer comment | 2 |
| `tests/e2e/attention-autoopen-suppress.spec.ts` | AC-2 three-segment occlusion, premise first | 2 |
| components/admin/wizard/DraftRestoredNote.tsx | the note: mount-time predicate, announcement, self-dismissal, copy | 3 |
| tests/components/admin/wizard/draftRestoredNote.test.tsx | AC-8, AC-9, AC-10, AC-13, AC-15 timing, AC-18 | 3 |
| `tests/e2e/step3-review-modal.interactions.spec.ts` | AC-8 geometry, AC-11 shift, AC-16 scrolled, AC-17 four-cell matrix | 4 |
| tests/components/admin/wizard/draftRestoredNoteTransitions.test.ts | AC-15 structural audit, AC-12 live-region contract | 5 |
| `DEFERRED.md`, `DEFERRED-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts` | graduate both rows, markers off | 5 |

---

<!-- tasks: depth=3 red-contract -->

> **This plan was EXECUTED before its final review round, and it records what happened rather than what was intended.** Two review rounds returned 17 then 20 findings, rising, and nearly every one was a defect in embedded test code that had never run; round 2's sharpest came from the reviewer executing my helper against the tree. That is the ratchet `AGENTS.md` names, whose stated close is to build the thing rather than patch the prose again. So each task below carries its real command, the red that was observed, the change that was made, the green that was observed, and the commit. Code is **referenced, not inlined**: a second copy in this document could only drift from the one that runs, and that drift is itself a finding.

### Task 1: The pill's phone type size

<!-- task: red=`pnpm vitest run tests/styles/pillTypeClassBoundary.test.ts` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1131` why=`the shipped pills were bare text-xs, so both the wrapping-pill sweep and the static-pill cases failed` ac=AC-1,AC-3,AC-4,AC-5,AC-6,AC-7 -->

**Files:** `tests/styles/pillTypeClassBoundary.test.ts` (new), `tests/e2e/_publishedReviewModalHarness.tsx`, `tests/e2e/published-review-modal.layout.spec.ts`, `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`. Shipped in `cf4ffc698`.

- [x] **Step 1: Fixtures, before anything rests on them.** `harnessMonitoringItems(count)` beside `harnessAttentionItems`, because every committed harness item is `actionable: true` and the pill partitions monitoring on `!actionable && clearingKind === "self_heal"`, so no page had ever rendered that segment. Two pages: `threeSegment` (the only page with all three segments) and `degraded` (reachable only with every count at zero, since `interactive` is tested first).
- [x] **Step 2: Prove the fixtures render what they claim.** `T-PILL-FIXTURES` asserts each of the three segments **separately**, because one combined regex passes with a segment missing. This case is a premise, not a feature test, and it passes as soon as the fixtures land.
- [x] **Step 3: The class-boundary guard, as an AST walk.** Two earlier drafts were regex recognisers and both were wrong in ways only execution showed: one stopped at the `}` inside `${HEADER_ACTION_CAP}` and saw zero wizard pills; the other walked back to the nearest `className=`, which is the decorative dot's, not the pill's. The shipped guard parses JSX with the TypeScript compiler and asks which element renders a given text and what its own className is. It therefore sees `className="..."` and `className={...}` alike, and asserts the wrapping-pill census is **exactly two** rather than merely nonzero.
- [x] **Step 4: Observed red.**

  ```
  $ pnpm vitest run tests/styles/pillTypeClassBoundary.test.ts
  Tests  2 failed | 2 passed (4)
  → "a capped, wrapping pill left at bare text-xs"
  → "Alerts unavailable pill missing the responsive pair:
     Received: 'inline-flex min-w-0 items-center gap-1.5 rounded-pill
     bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-subtle'"
  ```

  The out-of-class case passed here, which is correct: it guards a future edit.

- [x] **Step 5: Four class edits.** `text-xs` to `text-sm sm:text-xs` at `components/admin/showpage/PublishedReviewModal.tsx:1131`, `components/admin/showpage/PublishedReviewModal.tsx:1304`, `components/admin/showpage/PublishedReviewModal.tsx:1337` and `components/admin/wizard/Step3ReviewModal.tsx:599`. `Step3ReviewModal.tsx:575` and `components/admin/wizard/Step3ReviewModal.tsx:678` untouched (§1.1 R8).
- [x] **Step 6: The tap-band comment re-derived (AC-7).** Approximations kept as approximations: below `sm`, text-sm (~20px line box) + py-1 (8px) is about a 28px pill, so `-inset-y-3` gives about 52px against the 44px floor; at `sm` and up it returns to the old 24px pill and 48px band.
- [x] **Step 7: Observed green.** `Tests 4 passed (4)`.
- [x] **Step 8: The browser oracles, and two that were wrong.**

  ```
  $ pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts \
      --project=desktop-chromium -g "T-PILL-FIXTURES|T-PILL-SIZE|T-LAYOUT-TALL|T-STATIC-WRAP"
  4 passed
  $ pnpm heavy npx playwright test tests/e2e/published-review-modal.layout.spec.ts \
      --project=desktop-chromium
  55 passed          # includes T-LAYOUT and T-TAP at both viewports (AC-4, AC-5)
  ```

  **The clip oracle was measuring the wrong thing.** It used `scrollHeight > clientHeight` on an element whose `overflow` is `visible` and which carries a `before:-inset-y-3` hit band, so it reported "clipped" by exactly 12px at **every** type size, including the `text-xs` that already shipped. It now asserts the element cannot clip at all, plus per-segment containment. **The line count was counting the dot.** It counted distinct tops of child rects, and the decorative dot is vertically centred, so a one-segment pill read as two lines; it now counts distinct tops of the text's own client rects.

  `T-LAYOUT-TALL` uses this spec's own `HEADER`/`MAIN`/`FOOTER`/`GRAB` constants and `heightOf` after an earlier draft asked for a bare `main` and measured 0, and its non-vacuity premise compares the three-segment header against the one-segment header rather than a literal threshold. The sheet-mode equation includes the grab strip.

- [x] **Step 9: Mutant proof of the guard.** Five mutants, each verified to have applied before the suite was read, because a mutation that silently fails to apply reports exactly what a surviving mutant reports:

  | Mutant | Result |
  |---|---|
  | W2 wizard pill to bare `text-xs` | killed |
  | P1 interactive pill to bare `text-xs` | killed |
  | P2 "Alerts unavailable" to bare `text-xs` | killed |
  | P3 "In sync" to bare `text-xs` | killed |
  | out-of-class arm swept INTO the pair (R8's other direction) | killed |

  The first run of the P3 mutant reported a survivor and was wrong: the line index was stale because an earlier comment edit had shifted the file by three lines, so `replace()` matched nothing. Re-run with the edit asserted, it was killed like the rest.

- [x] **Step 10: The three-segment geometry, no longer unmeasured.** Spec §2.2 recorded that no fixture reached three segments. It now does: **123.98px at `text-xs`, 141.48px at `text-sm`**, a +17.5px delta matching the two-segment fixture's.

### Task 2: The occlusion load, and three specs that ran nowhere

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/attention-autoopen-suppress.spec.ts --project=desktop-chromium` red-state=authored red-target=`tests/e2e/_pillFocusLiveEntry.tsx:118` why=`the entry's overrides never set crew warnings, so the sheet-warnings segment cannot render and the new premise fails before the occlusion check` ac=AC-2,AC-2b -->

**Files:** `tests/e2e/attention-autoopen-suppress.spec.ts`, `tests/e2e/_pillFocusLiveEntry.tsx`, `playwright.config.ts`. Shipped in `5a1fc2134`.

- [x] **Step 1: A dead-spec census, because AC-2 rests on a spec running.** `attention-autoopen-suppress`, `attention-pill-focus` and `popover-clip-fit` matched no project regex and ran nowhere, so the occlusion assertion the previous arc deliberately tightened has never executed. 118 spec files exist under `tests/e2e`; 70 were discovered. All three wired into `desktop-chromium` and green.

  My first measurement of this claimed every spec listed zero tests, including ones known to run: the grep pattern was wrong and returned zero for everything. Re-measured against playwright's `--list` output before believing it.

- [x] **Step 2: Observed red on the premise.**

  ```
  $ pnpm heavy npx playwright test tests/e2e/attention-autoopen-suppress.spec.ts \
      tests/e2e/attention-pill-focus.spec.ts tests/e2e/popover-clip-fit.spec.ts \
      --project=desktop-chromium
  1 failed, 74 passed
  → "sheet-warnings segment present"
     Received string: "6 issues · 3 monitoring clearing on their own, no action needed"
  ```

  Exactly the predicted reason, and the other 74 confirm the wiring itself is sound.

- [x] **Step 3: AC-2 is unreachable for a structural reason, so AC-2b is taken.** `withCrewWarnings` makes the harness build the real section warning model, which reaches `node:crypto` through report surface ids and is **subprocess-only**; a browser-bundled entry throws and the whole modal fails to render. Probed by adding the opt-in setter and watching all seven cases fail with the panel absent. The pre-decided fallback applies: the case runs at the tallest load the entry can reach, `6 issues · 3 monitoring`, and the limit is recorded in `tests/e2e/_pillFocusLiveEntry.tsx`'s own header with its probe and a re-file trigger.
- [x] **Step 4: The premise asserts the segment is ABSENT.** Not silence about it: if the limit is ever lifted, the test says so rather than quietly continuing to under-test.
- [x] **Step 5: The entry's consumer census corrected.** Its comment named two consumers where three exist and miscategorised one. Two e2e suites bundle and drive it; `tests/components/admin/sheetIconLinkContainment.test.ts` scans its source and pins a URL literal count.
- [x] **Step 6: Observed green.** `75 passed`.

### Task 3: The "Draft restored" note

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/draftRestoredNote.test.tsx` red-state=authored red-target=`components/admin/wizard/DraftRestoredNote.tsx:1` why=`the component module does not exist, so the suite fails to resolve its import before any case runs` ac=AC-8,AC-9,AC-10,AC-12,AC-13,AC-15,AC-18 -->

**Files:** `components/admin/wizard/DraftRestoredNote.tsx` (new), `tests/components/admin/wizard/draftRestoredNote.test.tsx` (new), `components/admin/wizard/Step3ReviewModal.tsx`, `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`. Shipped in `9bdf9e523`.

- [x] **Step 1: Observed red.** `Failed to resolve import "@/components/admin/wizard/DraftRestoredNote"`.
- [x] **Step 2: A component, and that is the design.** `Step3ReviewModal` renders `ReviewModalShell`, and `AdminAnnounceProvider` lives inside that shell (`components/admin/review/ReviewModalShell.tsx:647-655`). React context does not flow from a child provider up to its parent, so a `useContext` call in the modal's own body would read the admin-layout channel rather than the dialog-local one §3.3 requires. Mounted in the shell's children slot, the provider is an ancestor. Being a component is also what makes the note testable standalone, which is what makes AC-10 structural.
- [x] **Step 3: Copy is past tense, and the assertion is not a denylist.** The operator can clear or submit inside the window, so a note claiming the draft "is waiting" would be false on screen with nothing to correct it. The test rejects **any** present-tense verb pointing at the draft, rather than three named phrasings.
- [x] **Step 4: Observed green.** `Tests 17 passed (17)`.
- [x] **Step 5: Timer hygiene, probed both ways.** No timer scheduled when there is no draft; its own timer cleared on unmount.
- [x] **Step 6: A latent defect in a neighbouring suite, surfaced by mounting the note.** `step3ReviewModal.transitions.test.tsx` cleared neither timers nor `sessionStorage` between cases. Cases in it type into the report field, which persists a draft, so later cases opened modals carrying a draft they never wrote, and its §H teardown snapshot had been absorbing whatever leaked. Measured at the failure: `AMBIENT=2 ssLen=2 note=MOUNTED` in a case that meant to have no draft at all. Both are now cleared in the file's `afterEach`, and the snapshot drains to a fixed point instead of counting exactly two frames, so it states the premise it needs rather than a frame count the next child invalidates again.

  Diagnosed by control run, not by assumption: the case passes in isolation, fails in the file, and passes again with the note unmounted.

- [x] **Step 7: Structural contracts green.** `62 files, 870 tests`, including `_metaLiveRegionMounting` with its `Step3ReviewModal.tsx` count untouched at **1** (the note announces through the provider and mounts no region of its own) and `_metaUndoAnnounceProvider`.

### Task 4: The note in a real browser

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/step3-review-modal.interactions.spec.ts --project=desktop-chromium -g "T-NOTE"` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:954` why=`no case in that spec seeds a draft key, so the note locator resolves to zero nodes until the seeding helper and the cases are authored` ac=AC-8,AC-11,AC-16,AC-17 -->

**Files:** `tests/e2e/step3-review-modal.interactions.spec.ts`.

These cases go in the interactions spec, not the layout spec: the layout spec emits only static `harness*.html` pages, while the live page and esbuild bundle exist here (`tests/e2e/step3-review-modal.interactions.spec.ts:134`), and this spec is already in CI and in `desktop-chromium`.

- [ ] **Step 1: Seed before hydration.** The note decides its state in a mount initializer, so a seed after `goto` is one it never sees: use `page.addInitScript` with the draft key, then navigate.
- [ ] **Step 2: Geometry (AC-8, DI-8, DI-9).** The note spans the pane's content width within 0.5px, has real height, and its rect sits inside the scroller's initial client rect. A sibling case with no draft asserts it does not mount at all (DI-11).
- [ ] **Step 3: The shift (AC-11, DI-10).** Bracket the note present-before and absent-after, then assert the follower rose by **the note's measured height plus the scroller's measured `gap-6`**, both read at runtime. "scrollTop unchanged" alone proves nothing: an in-flow node vanishing above the fold leaves it untouched while everything below moves, so that is asserted **as well as**, never instead of.
- [ ] **Step 4: Scrolled (AC-16).** With the pane scrolled past the note, a reference element's viewport-relative `top` is unchanged across the dismissal. The present/absent bracket is what makes this non-vacuous: an implementation whose timer is cancelled by scrolling would otherwise pass trivially.
- [ ] **Step 5: The compound matrix (AC-17), all four cells.** Expand and collapse, each from scroll-top and from scrolled. Each asserts the section's own `aria-expanded` actually changed before drawing any conclusion, and then applies the oracle its starting state demands: the shift equation from the top, the fixed-reference rule when scrolled.
- [ ] **Step 6: Run the whole interactions spec,** so a leaking `addInitScript` cannot start mounting the note in cases that never asked for one.

### Task 5: Graduation and closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the two ids added to the GRADUATED registry are still in DEFERRED.md and absent from DEFERRED-archive.md, so the archive-only assertion fails on each` ac=AC-12,AC-14 -->

**Files:** `DEFERRED.md`, `DEFERRED-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`.

- [ ] **Step 1: Add both ids to `GRADUATED`** and observe the red: each is `missing from DEFERRED-archive.md` and `still in DEFERRED.md`.
- [ ] **Step 2: Move both entries whole,** deleting the `· **Status:** IN PROGRESS · **Branch:** …` run from each meta line as you go. The marker comes off here, in the PR's last commit, because one that merges into main names a branch the merge just deleted and `tests/docs/_metaLedgerInProgress.test.ts` then reds main. One provenance line each.
- [ ] **Step 3: Ledger guards green:** `_metaDeferralLedgerGraduation`, `_metaLedgerInProgress`, `_metaLedgerMintBar`.
- [ ] **Step 4: The draft key is seeded in exactly one e2e spec (AC-12, DI-11).** An equality against the expected one-file set, not a search that filters out its own counterexample: `rg -l "fxav-report-draft" tests/e2e/` must return exactly `tests/e2e/step3-review-modal.interactions.spec.ts`.
- [ ] **Step 5: CI wiring reaches a real run (AC-14).** All four newly wired specs present in `playwright.config.ts`'s `desktop-chromium` `testMatch`, and the step3 pair in the workflow's `paths` watch and its `playwright test` invocation. If real CI reds or flakes on any of them, revert that spec's workflow entry only, keep its project wire, and record the gap as a documented limit with a re-file trigger.
- [ ] **Step 6: Full local verification.** `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, `pnpm heavy pnpm test`, and the six e2e specs this arc touches or shares a fixture with.

<!-- tasks: end -->



---

## 12. Closeout

The gate runs on the whole diff, before the whole-diff cross-model review and before this arc reports READY, with the canonical v3 setup gates (`context.mjs` context load of PRODUCT.md + DESIGN.md, then the register reference read). Findings and dispositions land in this section; P0 and P1 are fixed or explicitly deferred with a `DEFERRED.md` entry. The marker line below is filled in when both halves have run.
 Both halves run with the canonical v3 setup gates: context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read. Findings and dispositions land in this section; P0 and P1 are fixed or explicitly deferred with a `DEFERRED.md` entry.

**UI surfaces in this diff:** `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`. No `app/globals.css` `@theme` change, no `DESIGN.md` change, no new colour token, so no new contrast ratio needs pinning.

**Pre-code mechanical checklist** (run before the gate, which verifies rather than discovers): 44px tap targets including the pill's resolved hit band at the new size; no em dash and no apostrophe in the note's copy; canonical type and token classes only, no arbitrary values; `text-xs/relaxed` and `text-subtle` for secondary copy.

### Acceptance-criteria coverage map

Criteria are declared in the spec (section 5) and claimed here, per the coverage-map convention.

| AC | Task |
|---|---|
| AC-1, AC-3, AC-4, AC-5, AC-6, AC-7 | Task 1 |
| AC-2, AC-2b | Task 2 |
| AC-8 | Tasks 3, 4 |
| AC-9, AC-10, AC-13, AC-18 | Task 3 |
| AC-11, AC-16, AC-17 | Task 4 |
| AC-12, AC-14 | Task 5 |
| AC-15 | Tasks 3 (timing), 5 (structural audit) |

## Self-review record

- **Spec coverage.** Every section-5 criterion appears in the map above. Spec 2.3's four sites are Task 1; 2.5's exclusion is asserted in both directions by Task 1's fourth guard case; 3.2-3.6 are Tasks 3-5; section 4's documented limits need no task by construction.
- **Ordering.** Within every task the tests are authored and observed red before the production change, so each `red=` fails against the shipped tree and the same command passes after the edit. No task reds on scaffolding it creates itself: Task 1 builds its two fixtures in steps 1-2 and proves them with a separate premise case in step 3, then claims its red in step 6 against the production class.
- **Type consistency.** `DRAFT_RESTORED_NOTE` and `DRAFT_RESTORED_NOTE_MS` are exported once from components/admin/wizard/DraftRestoredNote.tsx in Task 3 and referenced by name afterwards. The note's testid string is identical in Tasks 3, 4 and 5. `harnessMonitoringItems` is defined and used only in Task 1. Fixture identifiers are the real exports, `STEP3_FIXTURE_DFID` and `STEP3_FIXTURE_WSID` (`tests/components/admin/wizard/_step3ReviewFixture.ts:158-159`), not invented short names.
- **Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N". Every code step carries its code.
- **RED validity.** Task 1 reds on the shipped `text-xs`; Task 2 on the entry's missing crew-warnings capability; Task 3 on an absent module; Task 4 on an absent element in the live build; Task 5 on a registry row asserting a move that has not happened. None derives from a fixture the test itself writes.
- **Anti-tautology.** Task 1's oracle is differential across the breakpoint plus a clipping check plus a single-line reference measured in the same run, and its cap clause asserts the grandparent really carries the cap class before comparing widths. Task 2 names each of the three segments separately, because one combined regex passes with a segment missing. Task 3's AC-10 case rerenders after mutating the store, so an implementation driven by the textarea's `onChange` fails. Task 4's compounds assert the section's own `aria-expanded` changed before drawing any conclusion, and bracket the note present-before and absent-after so a cancelled timer cannot pass. Task 5's AC-12 search is an equality against the expected one-file set rather than a search that filters out its own counterexample.
