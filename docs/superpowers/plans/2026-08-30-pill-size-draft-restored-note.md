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

- [x] **Step 10: The three-segment geometry, no longer unmeasured, and the first numbers superseded.** Spec §2.2 recorded that no fixture reached three segments. It now does. The first pair taken, 123.98px at `text-xs` and 141.48px at `text-sm`, are **both PRE-repair**: at that point every count phrase was a bare wrap unit breaking mid-phrase under `max-sm:flex-wrap`. The `+17.5px delta matching the two-segment fixture` read off them held only in that broken state and is withdrawn with them. Post-repair the three-segment pill measured **82.9px** -- still PRE-Decision 7, and superseded the same day: counts-only copy took the SHIPPED three-segment height to **48.297px**, recorded live by `tests/e2e/published-review-modal.layout.spec.ts` at its (e4) assertion. 82.9px is kept here, labelled, for the same reason the two figures above it are: swapping one number and leaving its neighbours makes a reader trust the survivors. Both numbers are labelled rather than one being swapped, because replacing only the `text-sm` figure would leave a reader trusting its neighbour.

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

**Files:** `tests/e2e/step3-review-modal.interactions.spec.ts`, `tests/e2e/_step3ReviewModalHarness.tsx`. Shipped in `62b057488`.

These live in the interactions spec because the layout spec emits only static `harness*.html` pages, while the live page and its esbuild bundle are built here and this spec is already in CI.

- [x] **Step 1: Seed before hydration.** The note decides its state in a mount initializer, so `page.addInitScript` with the draft key, then navigate. A seed after `goto` is one the component never sees.
- [x] **Step 2: The harness emits its wizard session id** alongside its dfid, so this spec asserts parity instead of keeping a second literal that drifts. The spec deliberately does not import the harness module, which is why the constant is mirrored and checked rather than imported.
- [x] **Step 3: Eight cases, observed red then green.** Geometry and above-the-fold (AC-8, DI-8, DI-9), the no-draft case (DI-11), the shift equation (AC-11, DI-10), the scrolled case (AC-16), and the full four-cell AC-17 matrix: expand and collapse, each from scroll-top and from scrolled.
- [x] **Step 4: Four of the eight first failed on "pane stays at the top",** which is round 1's finding 17 arriving for real: `click()` scrolls its target into view, so a reference captured before the toggle is compared across the toggle's reflow AND the auto-scroll. The toggle now happens first and the reference is captured after, with the starting scroll state established at that point.
- [x] **Step 5: The shift oracle asserts `scrollTop` unchanged AS WELL AS the measured equation,** never instead of it. Both the note height and the scroller gap are read at runtime.
- [x] **Step 6: Present-before / absent-after brackets every dismissal case,** so an implementation whose timer is cancelled by scrolling cannot pass by never leaving.
- [x] **Step 7: `33 passed`** across the whole interactions spec, so the seeding does not leak into cases that never asked for a draft.

### Task 4b: A red this branch EXPOSED, and two diagnoses that were WRONG

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/popover-clip-fit.spec.ts --project=desktop-chromium -g "MID-ENTRANCE"` red-state=live why=`the fit oracle floors the scroller's true room and then demands 0.5px agreement, so it decides on the fractional remainder alone; deterministic 3/3 at this head, green on a control run with both modal components at origin/main, and the scroller fills its room exactly on BOTH sides` ac=AC-4 -->

**Files:** `components/admin/showpage/AttentionMenu.tsx` — **currently identical to `origin/main`.** The repair committed in `ca8699574` was reverted after whole-diff review refuted its diagnosis.

**The framing this section carried for most of its life was wrong, and the measurement is what corrected it.** A deterministic red at this head with a green control at `origin/main` looked like a regression this diff causes. It is not one. The scroller fills its available room exactly at this head AND on the control; what this branch changed is the fractional remainder of that room, and the oracle could not survive it. The repair is in the oracle, and it is a strengthening. See Step 6.

Kept in full rather than rewritten into a tidy narrative, because two successive diagnoses were confidently wrong here and the record of how they were caught is worth more than a clean story.

- [x] **Step 1: Establish it is mine, not inherited.** Control run with both modal components restored to `origin/main`: passes. At this head: fails 3/3 under `--repeat-each=3`, so not flake.
- [x] **Step 2: Bisect.** Not the radius, and not the `whitespace-nowrap` (scoped to `max-sm:` after an unscoped version changed desktop too). It is the ratified type-size change itself.
- [x] **Step 3: A diagnosis that was wrong, and how it was caught.** I claimed `panel.offsetParent` is null while the panel is hidden mid-entrance, so the observer effect never observes the anchor. **False.** The pre-entrance panel is `absolute … scale-95 opacity-0` (`components/admin/showpage/AttentionMenu.tsx:644`); neither `opacity` nor `scale` removes an element from layout, and an absolutely positioned element has an `offsetParent`. It is null only for `display: none`, `position: fixed`, or a detached node. So the existing effect already resolves and observes the anchor, and the adoption branch I added was **inert**.

  The whole-diff reviewer caught it, on a brief that told it the repair was reasoned but not observed and that refuting the diagnosis would be the round's most valuable outcome. It was.

- [x] **Step 4: Reverted.** `components/admin/showpage/AttentionMenu.tsx` is byte-identical to `origin/main` again. Shipping inert code on a false rationale is worse than shipping nothing: the next reader inherits both.
- [x] **Step 5: Sweep the shape.** No component consumes pill metrics; only a `components/admin/showpage/StatusStrip.tsx:382` comment names the testid.
- [x] **Step 6: Re-diagnosed from scratch, with the probe in hand, and the second diagnosis was wrong too.** Three candidates were written down BEFORE the run, each mapped to a distinct observable, so the result could not be read to taste: never-stable meant the re-pass ordering, stable-but-unfitted meant the placement maths, and a `side` flip meant the flip decision. The instrumented series settled it in one run. `side` never left `bottom` and the geometry was flat from t=355 to t=1415, refuting the flip and the ordering candidates outright.

  What the numbers actually showed, head and control, four samples each:

  | | anchorH | scH | unfloored room | floored | verdict |
  |---|---|---|---|---|---|
  | head | 74.6 | 283.61 | 283.61 | 283 | fitted false |
  | control | 84.4 | 273.20 | 273.20 | 273 | fitted true |

  `scH` equals the unfloored room to the hundredth on BOTH sides, and `menuBottom` is 552 in both, exactly `panelBottom - gutter`. The fit is perfect either way. The oracle floored that room and then asked for agreement within 0.5px, so it decided on the fractional part alone: .20 passed, .61 failed. It passed on `origin/main` by luck, and would have failed there too for any layout landing past .5.

  **Two facts this branch had backwards.** The pill got SHORTER, 84.4 to 74.6, not taller. Bigger type, fewer lines, because the `max-sm:whitespace-nowrap` repair stopped the count phrases breaking mid-phrase. And there is no stale cap and no production regression; every earlier sentence in this plan asserting either was written from reasoning rather than measurement.

  **The repair strengthens the oracle.** A scroller at 283.0 whose room is 283.61 is a real 0.61px misfit; the floored form compares it against 283, passes it at zero error, and rejects a scroller that fills its room exactly. Unfloored, the misfit fails and the exact fit passes. Swept as a class at all three sites, the file's own comment already calling `tests/e2e/popover-clip-fit.spec.ts:371` the third copy of the arithmetic. Green 42/42 across five consecutive full-file runs (`9e0a9c9e4`).

- [x] **Step 7: The one remaining red is inherited, and measured as such.** The full-file run also surfaced `containment at 1280x800` failing once, at `menu.right` 1068.625 against `pill.right` 1084. That is the geometry the case's own comment documents as correct (`CI measured menu.right 1068.16 against pill.right 1084`), so the guard flipped rather than the layout moving. It reproduces on the CONTROL at the same rate: 1 failure in 5 full-file runs with both components at `origin/main`, against 1 in 7 at this head. Inherited flake, not this diff's. Filed as a documented limit, not repaired here.

- [x] **Step 8: A THIRD red, which is not a bug at all but two ratified decisions colliding.** Opened by CI, not by review. `published-review-modal.layout.spec.ts` T-TAP @375
failed 3/3 in CI while passing locally, which looked like a font or environment
artifact and is neither.

**What was eliminated, each by measurement rather than argument.** Both
environments render the committed Inter (`harness-font-face` proves the bytes by
fontkit advance width and passes in CI), at the same 14px and 20.3px
line-height, with `scrollbarPx` 0 on both sides. The only quantity that differed
was the pill's own width: 109.781 on darwin/arm64, 112.000 on the linux/x64
runner.

**The constraint.** The pill sits in a flex container carrying
`HEADER_ACTION_CAP`, `max-width: 160px`, ratified in
`docs/superpowers/specs/2026-08-25-review-modal-strip-dock.md` §3.0 by a sweep of
eight cap values against three loads. That cap's own comment recorded the 2-item
cluster measuring 147.73px at `text-xs`, which is 12.27px of headroom. At
`text-sm` it measures 157.781px, so this branch spends 10px of it and leaves
2.219px. The CI runner's advances are wider by exactly that, hitting 160 dead on.

**The load sweep, which is the finding.** Cluster width / pill height / headroom
vs 160, at 375, single-segment loads:

| issues | `text-xs` (main) | `text-sm` (this branch) |
|---|---|---|
| 2, 5, 9 | 149.734 / 26.797 / 10.266 | 157.797 / 30.297 / 2.203 |
| 10, 20, 99 | 157.422 / 26.797 / 2.578 | 160 / **48.297** / **0** |

**Verdict: regression by bump.** On main every single-segment pill fits one line
at every count from 2 to 99, its height never leaving 26.797px. At `text-sm` any
two-digit count wraps, on every platform, not merely in CI. T-TAP saw it only in
CI because its fixture says `"2 issues"` — a non-discriminating fixture in the
very test that guards this cap, which is the same class as the three oracles
recorded above.

**The padding trim was measured and rejected.** `px-2` and `gap-1` each buy 4px,
both together 8px. That rescues single-digit counts to 10.203px of headroom but
leaves two-digit counts at 1.219px, which is under the 2.219px platform delta
already observed on shorter copy. It would ship a per-device coin flip, so it is
not an option even though it touches neither ratified decision.

**Multi-segment loads are out of scope here.** From `2/0/3` upward the pill wraps
at 74.594px (70.594px trimmed) regardless of the cap; that is the case
`max-sm:flex-wrap` exists for, and the critique already accepted the wrapped
three-segment pill at 82.9px.

**Escalated, not repaired.** Eric decision 5B (type one size up below `sm`) and
strip-dock §3.0 (the 160px cap) cannot both hold at 375 for a show with ten or
more issues. Both are ratified, so the tie is not this arc's to break, and it
goes to the decision board with the table above. Worth carrying into that
discussion: main itself holds only 2.578px at two-digit counts, so the cap was
already tight before 5B and any option that spends headroom rather than creating
it will be fragile in the same place.

**The options, each measured**, cluster width / pill height / headroom vs 160 at
375 and `text-sm`, so the board carries numbers rather than sketches:

| option | single-segment at cap | two-segment 99 + 99 | two-segment at true `99+` cap |
|---|---|---|---|
| ship as-is | 160 / 48.297 / 0 | 160 / 74.594 / 0 | 160 / 74.594 / 0 |
| `px-2` + `gap-1` trim | 158.781 / 30.297 / 1.219 | 160 / 70.594 / 0 | 160 / 70.594 / 0 |
| counts-only copy below `sm` | 128.938 / 30.297 / **31.063** | 154.344 / **30.297** / 5.656 | 160 / 48.297 / 0 |

The trim is dead on its own numbers: 1.219px of headroom sits under the 2.219px
platform delta already observed, so it would ship a per-device coin flip. The
counts-only variant is the only one that MAKES headroom instead of spending it,
and the only one that brings the two-segment pill to a single line at all, a case
the critique had accepted as wrapped at 82.9px. It fails only when both counts
are simultaneously past 99, which is beyond the load 30 the cap's own ratifying
sweep treated as realistic.

**One measurement was discarded rather than reported.** The first attempt at the
two-segment `99+` row set only the FIRST phrase and left the second at full copy,
so it reproduced full-copy geometry and would have read as "counts-only still
wraps". Same defect as the three oracles above, measuring something adjacent to
the claim, and caught only because the number came back suspiciously identical to
the row above it.

**Also owed, and independent of the ruling:** T-TAP's fixture should exercise a
two-digit count, since a cap guard whose fixture cannot reach the cap is the
defect that let this ship to CI in the first place. Deliberately not changed
while the ruling is open, because the discriminating fixture is red under the
current design and its correct expectation depends on which option lands.

### Task 5: Graduation and closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the two ids added to the GRADUATED registry are still in DEFERRED.md and absent from DEFERRED-archive.md, so the archive-only assertion fails on each` ac=AC-12,AC-14 -->

**Files:** `DEFERRED.md`, `DEFERRED-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts`.

- [x] **Step 1: Added both ids to `GRADUATED`** and observed the red: each `missing from DEFERRED-archive.md` and `still in DEFERRED.md`.
- [x] **Step 2: Moved both entries whole,** deleting the `· **Status:** IN PROGRESS · **Branch:** …` run from each meta line as I went, because archives categorically reject in-progress entries. **The marker came off in `0e0df724c`, which is NOT this PR's last commit — three commits follow it.** Invariant 12's purpose is that the marker never reaches main, and it does not; but the invariant names the last commit specifically, so this is a deviation recorded as one rather than described as compliance. Nothing needs re-doing: the marker is off, `tests/docs/_metaLedgerInProgress.test.ts` is green, and re-adding it in order to remove it again would be theatre. One provenance line per entry: the four in-class sites and the out-of-class fence for the first, the note's placement and past-tense copy for the second.
- [x] **Step 3: Ledger guards green (`171 passed`):** `_metaDeferralLedgerGraduation`, `_metaLedgerInProgress`, `_metaLedgerMintBar`.
- [ ] **Step 4: The draft key is seeded in exactly one e2e spec (AC-12, DI-11).** An equality against the expected one-file set, not a search that filters out its own counterexample: `rg -l "fxav-report-draft" tests/e2e/` must return exactly `tests/e2e/step3-review-modal.interactions.spec.ts`.
- [ ] **Step 5: CI wiring reaches a real run (AC-14).** All four newly wired specs present in `playwright.config.ts`'s `desktop-chromium` `testMatch`, and the step3 pair in the workflow's `paths` watch and its `playwright test` invocation. If real CI reds or flakes on any of them, revert that spec's workflow entry only, keep its project wire, and record the gap as a documented limit with a re-file trigger.
- [ ] **Step 6: Full local verification.** `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, `pnpm heavy pnpm test`, and the six e2e specs this arc touches or shares a fixture with.

<!-- tasks: end -->



---

## 12. Closeout

The gate runs on the whole diff, before the whole-diff cross-model review and before this arc reports READY, with the canonical v3 setup gates (the skill's context load of PRODUCT.md and DESIGN.md, then the register reference read). Findings and dispositions land in this section; P0 and P1 are fixed or explicitly deferred with a `DEFERRED.md` entry. Both halves ran on 2026-08-30 as isolated subagents, with the canonical v3 setup gates.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=3 dispositions=recorded

**Audit — 8 items, 7 PASS.** Canonical tokens, the em-dash and apostrophe ban, the 44px band on both sides of the breakpoint (52.3px at `text-sm`, 48.8px at `text-xs`), colour tokens unchanged, mobile-first spelling, live-region contract, and the note's explicit `w-full`. One P1 and two P3.

**Audit P1 — FIXED.** `tests/styles/_metaTapTargetFloor.test.ts` was RED: the tap-target census keys the Step-3 selection checkbox by LINE NUMBER, and this branch's added lines moved it from 1003 to 1012. A merge blocker, and mine. The census comment already logged two earlier moves under `LIM-LINE-KEYED-SITEID`; this was its fourth. Re-keyed. It then recurred twice more in the same session, in `tests/styles/controlOutlineScan.ts` (two rows) and in a second hard-coded list inside `_metaControlOutlineFill.test.ts`, so the class touched three registries and five rows.

**Not from one insertion**, which this section claimed until diff review round 2 corrected it. The five rows do not share a cause and their deltas prove it: `components/admin/showpage/PublishedReviewModal.tsx:1113` moved to `components/admin/showpage/PublishedReviewModal.tsx:1116`, three lines, while in `Step3ReviewModal.tsx` two rows moved one line (`821` to `822`, `907` to `908`) and the tap-target row moved nine (`1003` to `1012`). Two files and at least three separate insertions. The real lesson is the one already filed as `LIM-LINE-KEYED-SITEID`: a line number is not an identity, so rows must be relocated from the scanner's own report rather than by applying a delta, and a single stated delta across a multi-file diff is exactly the reasoning that produces a wrong re-key.

**Critique — 0 P0, 2 P1, both FIXED.**

**Critique P1a — the three-segment pill rendered as an ellipse and painted copy outside its own fill.** Measured 110×141.48px at 375, with `--radius-pill: 999px` clamping to ~70px on a 141px box. The issues phrase and both inner segment phrases were bare wrap units, so `max-sm:flex-wrap` broke them MID-PHRASE ("2 / issues") into about six rows. Each count phrase is now one wrap unit under `max-sm:whitespace-nowrap`, and the pill takes `max-sm:rounded-md`. Measured after: **82.9px, 12px radius, three segments at 20.3px each** — a 41% reduction, matching the critique's ~83px prediction.

  The nowrap was first applied unscoped and broke `popover-clip-fit.spec.ts`; scoping it to `max-sm:` is why it is prefixed. See the open item below.

  **My own T-PILL-SIZE oracle had missed this**, which is the more useful half: it asserted every segment's rect was inside the pill's BOX, and the painted fill is clipped by the border radius, so copy outside the fill was inside the box. The case now pins one line per segment and the resolved radius at both sides of the breakpoint.

**Critique P1b — the note was the quietest element on screen, at 12px, in the PR that declares 12px too small.** `bg-surface-sunken` on the panel's `bg-bg` is 1.06:1, so the plate contributed nothing. The 5s precedent it cites (`components/admin/wizard/step3ReviewSections.tsx:1714-1725`) uses `bg-surface-raised text-sm text-text-strong`; the first draft took its timing and inverted its treatment. Now `bg-surface-raised px-3 py-2 text-sm/relaxed text-text-strong`, an already-shipped pair.

**Critique P2 — copy garden-paths, FIXED.** "in Report an issue" parses as a verb phrase first. Every "It is in..." rewrite fails the shipped AC-18 tense assertion, which the critique verified by running the regex. Now: "Report draft restored. Find it in the last section, Report an issue."

**Critique P2 — announcement collided with dialog-open, FIXED.** A polite message arriving while `role="dialog"` is being spoken is routinely dropped. Held 400ms, cleared with the dismiss timer, registered in §5.5.

**Critique P2 — three unmigrated 12px peers. Deferred, out of class, and the citation corrected.** The critique placed both under components/admin/ (as TodaySection.tsx and DriveConnectionPanel.tsx directly); neither path exists. The real files are `components/crew/sections/TodaySection.tsx:403` and `components/admin/settings/DriveConnectionPanel.tsx:203` and `components/admin/settings/DriveConnectionPanel.tsx:221`, and `spec:lint` caught me quoting the critique's paths without checking them, which is precisely the citation class this arc's own spec stage spent five rounds on. Verified: all three are `rounded-pill` chips at 12px, so they are real peers of the SHAPE.

They are still out of class, and the corrected paths make the case stronger rather than weaker. `TodaySection` is a **crew** surface, not admin at all: a different user, on a different page, with no capped header cluster. The two settings chips sit in a settings panel, not a review-modal header. §1.1 R8 fences the class to the review-modal header pill, and Eric ruled on that surface because it is the one carrying zero-scroll discovery for Doug. Sweeping three chips on two unrelated surfaces is a product decision he has not been asked.

**Critique P3 — band arithmetic true for the unwrapped pill, false at 375 when wrapped.** Recorded as a documented limit rather than fixed: the comment describes the single-segment case `T-TAP` actually probes, and the wrapped case's band is now much smaller after P1a anyway.

**Critique P3 and audit P3 — DESIGN.md §5.5 row indentation** matches its 40 siblings' generator output; cosmetic.

### The regression, and why it was caught at all

`popover-clip-fit.spec.ts`'s MID-ENTRANCE case went red on this branch: deterministic at this head, green on a control run with the components at `origin/main`. That pattern reads as a regression this diff causes, and for most of this arc it was recorded as one. It is not. Instrumenting both sides shows the scroller filling its available room to the hundredth in each (283.61 at head, 273.20 on control), with the menu's bottom landing exactly at `panelBottom - gutter` both times. The red was the spec's own oracle, which floored that room and then demanded agreement within 0.5px, leaving the verdict to the fractional remainder. `origin/main` passed it on .20 by luck. Repaired in `9e0a9c9e4` by unflooring all three copies of the arithmetic, which is a strengthening: the floored form accepts a scroller 0.61px short of its room while rejecting one that fills it exactly. The earlier repair `ca8699574`, on `AttentionMenu`, was reverted; its diagnosis was refuted.

**That spec had never executed.** It matched no project regex until this arc wired it, hours before it went red. What the discovery gap recorded as `LIM-E2E-SPEC-DISCOVERY-GAP` had been hiding is therefore not a shipping defect, as this paragraph first claimed, but a defective oracle: one that would have gone red for whoever next moved that layout past a .5 remainder, whether or not they broke anything, and that meanwhile accepted a genuinely misfitted scroller. A dark spec does not merely fail to protect, it rots, and the rot is billed to whoever wires it in. The slug was filed on a count, 118 spec files on disk against 70 discovered, which is the kind of number that reads as housekeeping. This is what it actually buys.

**The 1280 containment case that also failed is inherited, and measured as such** (`LIM-E2E-1280-CONTAINMENT-FLAKE`): 1 failure in 7 full-file runs at this head, and 1 in 7 on the control. The first failure looked like this arc's, and only running the control the same number of times showed it was not.

It also sharpens the slug's own re-file trigger. The gap did not merely hide an untested surface; it hid a surface that a *later, unrelated, ratified* change would break. A census of what is dark measures exposure, not risk, and the risk is only visible once something moves.

### Lessons this arc's own oracles taught

Two of my assertions were wrong in the same way, and both passed review before execution refuted them:

- **T-PILL-SIZE asserted every segment's rect was inside the pill's BOX.** The painted fill is clipped by the border radius, so copy painted outside the fill was still inside the box. The oracle measured a rectangle the design does not draw.
- **The tap-band comment's arithmetic** described the single-segment pill `T-TAP` actually probes, and was false for the wrapped case at 375 — an assertion about geometry that no case evaluated.

Both are the same shape as the clip oracle that read `scrollHeight` on an `overflow: visible` box and so reported "clipped" identically at the type size that already shipped. Each measured something adjacent to the claim rather than the claim. Executing them is what separated the three; reading them had not, across two review rounds.
 Both halves run with the canonical v3 setup gates: context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read. Findings and dispositions land in this section; P0 and P1 are fixed or explicitly deferred with a `DEFERRED.md` entry.

**UI surfaces in this diff:** `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, and `components/admin/wizard/DraftRestoredNote.tsx` (a new component, and an invariant-8 surface in its own right). `DESIGN.md` DOES change: two rows added to the timer register at `DESIGN.md:767-768`, `ANNOUNCE_DELAY_MS` 400 and `DRAFT_RESTORED_NOTE_MS` 5000, both naming `DraftRestoredNote.tsx`, which makes it an invariant-8 surface too. No `app/globals.css` `@theme` change and no new colour token, so no new contrast ratio needs pinning.

This inventory was wrong twice. Round 1 raised it, the correction was recorded as made, and the live tree still carried the original sentence at round 2 — the fix had been written into the narrative rather than into the list. Corrected here in the list itself.

**Pre-code mechanical checklist** (run before the gate, which verifies rather than discovers): 44px tap targets including the pill's resolved hit band at the new size; no em dash and no apostrophe in the note's copy; canonical type and token classes only, no arbitrary values; `text-xs/relaxed` and `text-subtle` for secondary copy.

### Ordering deviation: graduation landed before the diff review closed

Both ledger rows were graduated and archived while diff R2 was still open, so
every commit after that point is a graduation-then-repairs deviation from the
settled ordering. Recorded here rather than left implicit, following the
precedent set by `wizdraft`.

What landed after graduation:

- `9e0a9c9e4` — the oracle sweep, which is the actual resolution of the red that
  Task 4b spent most of its life mis-describing.
- `4d1b08054` — the corrections to the plan, the closeout and
  `LIM-E2E-SPEC-DISCOVERY-GAP`, the two new limits, and the `writing-plans.md`
  count fix.
- The `141.48px` correction below. Diff R2 has since returned BLOCKING with 4 findings, all repaired, and diff R3 BLOCKING with 4 more.

The marker-off half of invariant 12 is unaffected and stays binding: the
in-progress markers came off before the merge, and neither ledger file carries
one now.

### A stale measurement stated as the shipped geometry

`DEFERRED-archive.md:2223` and Step 10 of the plan both quoted the three-segment
pill as **123.98px at `text-xs`, 141.48px at `text-sm`**, presented as the
measurement this arc finally supplied for a geometry the row could not measure.

Both numbers are PRE-repair. The impeccable critique measured 110x141.48px at
375 and found the pill rendering as an ellipse with copy outside its fill,
because each count phrase was a bare wrap unit breaking mid-phrase under
`max-sm:flex-wrap`. The `max-sm:whitespace-nowrap` repair took it to **82.9px**, and Decision 7 then took the shipped height to **48.297px**.
Plan line 285 carries both sides, which is how this was settled from the record
rather than by another run.

Corrected by labelling BOTH numbers as pre-repair rather than swapping one. The
`text-xs` figure is pre-repair for the same reason, so replacing only the
`text-sm` number would leave a reader trusting its neighbour. The shipped
three-segment height is 82.9px, and the direction is confirmed independently by
the anchor heights measured during the MID-ENTRANCE work: 84.4px on a control
with both components at `origin/main` against 74.6px at this head. Bigger type,
shorter pill.

The `+17.5px delta matching the two-segment fixture's` claim in Step 10 held
only pre-repair and is removed with the numbers it described.

### Local full suite: WAIVED, replaced by CI

bl-orch waived the granted local full-suite run under the standing readiness
doctrine: a unit-suite rollup green on the SHIPPING head substitutes for the
local full run. The queue slot was released back to the pool rather than spent
on a run that duplicates it.

Rollup run: https://github.com/edweiss412/FX-Webpage-Template/actions/runs/33308599952

What the waiver does NOT cover, and what was run locally instead, because CI
does not reach it: the DB-free tiers this diff disturbs (`tests/docs` +
`tests/specLint` 2352, `tests/styles` 1442 including the five re-keyed
line-keyed census rows, `tests/components` + `tests/log` 6199), and the eight
affected e2e specs on `tests/e2e/standalone.config.ts` (230 passed), which the
main config's projects do not all discover.

**The waiver binds to the FINAL head.** R2's repairs moved it to `b694dabe3`,
where the required 13 went green; R3's repairs move it again, so that green is
superseded and CI must re-green at the head this arc finally reports. Any new
DB-touching test those repairs add takes a scoped local run on a then-granted
slot.

### Whole-diff R3: the third round on one axis, and what finally closed it

BLOCKING, 4 findings, all real, all repaired.

**P0 — the ring I added in R2 cannot be seen.** `border-text-faint` on
`bg-status-review` measures **1.179:1 light and 2.522:1 dark**, against a 3:1
non-text floor. So issues (filled) and warnings (filled + "ringed") were
separated by hue alone, which is the defect R1 raised and R2 was supposed to
close. Three rounds, one axis, and each of my repairs caused the next round:
R1's hollow ring collided with monitoring's ring, R2's filled-and-ringed had an
invisible ring.

The repair changed the CHANNEL rather than tuning it again. Nine candidate
tokens were measured against that fill and **none** clears 3:1 in both modes,
because `status-review` is a mid-tone amber: a dark ring clears in light mode, a
light one clears in dark. That is a property of the fill, not a gap in the
search. Geometry has no such dependency, so the three marks are now a filled
circle (issues), a filled SQUARE (warnings), and a hollow circle (monitoring).
Ratified at bl-orch's desk, on the record that mark glyphs are design-system
mechanics rather than the pill CONTENT Eric ruled in Decision 7; fenced both
directions in spec §2.3b so a later round cannot walk it back to another token.

Two guards were retired to get here, and the pattern in them is the lesson: R2's
compared `className` strings, R3's reduced classes to (filled, ringed) booleans.
Both asked "which classes are present" when the question was "can a human see
the difference". jsdom applies no stylesheet and structurally cannot answer that,
so the surviving guard is `T-MARK-GEOMETRY`, a real-browser case reading computed
`border-radius` and `background-color`. Its load-bearing assertion is that issues
and warnings share a BACKGROUND -- if anyone separates the two by colour again,
it fails even though the pill would look fine to whoever changed it.

**Class-swept, and R3 undercounted this one.** R3 wrote "this class has one
runtime instance". The wizard's judgment ring is a second: `border-text-faint`
measures 2.793:1 against `warning-bg` in dark, under the same floor, and that
ring is the mark's ONLY rendering -- below the floor it is not a quiet mark, it
is an absent one. Moved to `border-text-subtle` (6.128 / 4.717 on `warning-bg`,
6.094 / 6.941 on `surface-sunken`), keeping the hollow idiom, since that pill has
two states and fill alone separates them.

**P1 — three walkers false-green on `display: contents`.** An element with
`display: contents` generates no box, so `getBoundingClientRect()` returns zeros
and all three counts-only walkers classified it as HIDDEN and dropped its text --
which renders normally. A one-class edit from `max-sm:sr-only` to
`max-sm:contents` therefore made the noun visible while every guard still passed.
Proven in both directions rather than argued: with the mutant applied and the old
walkers, 3 passed; with the fix, 3 failed naming the defect (`Received: "99+
issues"`); mutant reverted, 165 pass. `tests/e2e/helpers/phantomGap.ts:256`
already recursed through `contents` for the same reason, so the repo had the
precedent and these three did not use it.

Swept for the fourth walker R2 had widened. It is at
`tests/e2e/published-review-modal.layout.spec.ts` in the `lines` counter, it has
NO zero-rect check, and it measures text nodes with `Range.getClientRects()` --
the robust technique. Not an instance, and recorded as checked rather than
patched to look thorough.

**P1 — the round-economy filing miscounted its own corpus**, and this one had
already been found independently minutes earlier by sweeping my own artifacts for
stale numbers. It claimed "9 findings, three per round" across three named rounds
while the `**Examined:**` line directly above it counted four. It omitted the
round it was written during. Corrected to the corpus figure and recounted after
R3 landed: 17 findings across 5 rounds.

**P1 — 82.9px was still labelled as shipped** in four places. It is the
post-`whitespace-nowrap`, PRE-Decision-7 height; counts-only took the shipped
three-segment pill to 48.297px. This is the second time a superseded pill height
outlived its measurement in this arc -- 141.48px was the first -- so the numbers
are labelled with what they describe rather than swapped.

**Found by my own sweep, not by R3: a 65-line block was duplicated verbatim in
this closeout.** Copies at 383-447 and 479-543, the ordering-deviation,
141.48px-correction and waiver subsections. Copy A split the "three unmigrated
12px peers" paragraph from its own continuation, which is how it was identified;
copy B sits correctly. R3 cited lines 420 and 516 as two separate instances of
the stale 82.9px without noticing they were the same text twice. Deleted copy A.

### Invariant-8 gate, second run (post-R3 UI change)

impeccable-gate: critique=RAN audit=RAN p0=1 p1=3 dispositions=recorded

Re-run because R3 changed a UI surface after the first gate. Both halves ran as
isolated sub-agents; the critique's two assessments were isolated from each other
per that command's contract. Method: dual-agent.

**Critique: 24/40.** Consistency scored 1 and recognition-over-recall scored 1,
both for the same reason, which is the P0 below.

**P0 — the shape channel was on the CONTAINER, not the items. FIXED.** The
leading mark describes whichever segment LEADS, so with issues AND warnings
present it was the issues circle and the warnings segment rendered as a bare
integer: below `sm` the pill read `● 3 · 2`, two amber numbers separated by
position alone. The new glyph only ever appeared in the warnings-ONLY pill. So
the distinction was closed in the rare state and open in the common one, and
nothing measured the common one. **Both assessments found this independently** —
the design review from the DOM structure, the detector assessment from the
rendered three-segment fixture ("only two marks render") — which is the strongest
signal either produced.

Fixed by giving the warnings segment its own mark, mirroring the monitoring
segment's existing pattern including its no-double-mark guard. Exactly one mark
now renders per visible segment. `T-MARK-SEGMENT` is its regression test and the
diff previously had no mixed-state case at all.

**The fix cost nothing, which took a measurement to establish.** Adding the mark
alone took the common three-segment load from ONE text row to two (38.297px to
46.594px) and turned `T-PILL-SIZE` red — a real layout move against the 160px
cap, which is the constraint counts-only exists to serve. Rather than escalate
the tradeoff, the separator was re-examined: with every segment carrying its own
mark, the middot is redundant as a VISUAL separator below `sm`, so it moves to
`max-sm:sr-only` — zero width, still in the announced string. The common load
returns to ONE row at **38.296875px, byte-identical to the pre-mark baseline**,
with every mark rendered. The 99/99/99 worst case was unchanged throughout
(112x56.59, cluster at its 160 ceiling) because it already wraps.

**P1 — the square carried no meaning. FIXED, to a triangle.** DESIGN.md's
KINDDOT-1 already settled the rule, verbatim: its minus bar was chosen "because
the minus glyph carries the 'removed' semantic that a ring would not". A square
is a difference without a meaning, and at 8px inside a pill that is itself
`max-sm:rounded-md` it reads first as a radius that failed to apply. A triangle
is the warning silhouette and its apex breaks the outline, which separates more
robustly at 8px than corner-versus-curve. Same 8px box, so nothing reflows —
KINDDOT-1's other requirement.

**P1 — my own wizard ring repair was wrong, on a premise the gate refuted.
REVERTED.** R3's ring-contrast P0 was class-swept to the wizard's judgment ring
on the belief that it sits on `warning-bg`, where `text-faint` measures 2.793:1.
It does not: that branch and the PILL's background share one predicate (`n > 0`),
so the hollow ring renders only when the plate is `surface-sunken`, a ground
where DESIGN.md section 1.2 already measures faint at 3.02:1 / 4.11:1 — clearing.
The sweep was right about the defect's shape and wrong about this being an
instance. Reverting also protects the D9 contract, since `text-subtle` at ~6.9:1
makes the QUIET pill's mark heavier.

**The two gate halves disagreed here, and the critique was right.** The audit
verified the arithmetic ("the swap is correct") without checking which ground the
element paints on. Recorded because a number can reproduce exactly and still be
about the wrong pair.

**P1 (audit) — accessible name glues below `sm`. REFUTED by probe.** The claim
was that `{n}{" "}` is a whitespace-only text run inside an `inline-flex`, which
CSS does not render, so the name would compute as `2need a look`. It is not
whitespace-only: the count and the space are CONTIGUOUS runs, so CSS wraps them
into one anonymous flex item containing `"2 "`, which is rendered. Measured name:
`"2 need a look · 1 judgment call"`. Recorded so a later reviewer does not
re-derive it.

The probe that settled it was itself wrong twice first, which is the more useful
lesson: reading `innerText` excludes the `sr-only` noun entirely so it could
never show a digit-letter boundary, and `textContent` concatenates the whitespace
node whether or not flex rendered it. Only Playwright's computed accessible name
sees what a screen reader would say. The strengthened assertion stayed.

**P2 (audit) — the note's plate is invisible. FIXED, and it is the same mistake
as the ring.** `bg-surface-raised` on the pane's `bg-bg` measures 1.044:1 light /
1.131:1 dark. The token was copied from the crew-row banner at
`components/admin/wizard/step3ReviewSections.tsx:1714-1725`, which sits inside a
crew ROW where raised lifts. Another token borrowed from a precedent without its
ground — the second instance in this arc, after the wizard ring. The audit's
suggested fill swap would not have fixed it either (`surface-sunken` vs `bg` is
1.062:1); no fill in this system separates from the ground alone. What the
nearest sibling in the SAME slot uses is a BORDER, so the note now matches it:
`rounded-md border border-border bg-surface-sunken p-tile-pad`. That closes the
audit's padding-rhythm P3 in the same edit.

**P2 (audit) — `aria-hidden` on the visible note. DECLINED, fenced.** Reversing
it would relitigate a ratified decision: the spec states the visible element is
`aria-hidden` (2026-08-30 design, §3.2 announcement section), two tests pin it
(`tests/components/admin/wizard/draftRestoredNote.test.tsx:182`,
`draftRestoredNoteTransitions.test.ts:65`), and it follows the shipped
CrewBreakdown split — an `sr-only` announcer beside an `aria-hidden` visible
banner. The audit's substantive worry, that a dropped polite message leaves no
path to the text, is what the 400ms hold exists to prevent. If that trade is
wrong it is Eric's call on a ratified design, not a gate fix.

**P3s.** DESIGN.md gained **PILLMARK-1** registering the glyph vocabulary and a
corollary recording that the hollow ring means different things on the two pills
— the critique was right that nothing wrote it down. Left alone with reasons: the
dead `gap-1` on the issues wrapper (harmless, and live on the two segments that
now carry marks); `border-[1.5px]` as an arbitrary value (four sites, a token
promotion is its own change); the `opacity-50` middot's 2.516:1 at `sm`+
(pre-existing, desktop-only, and the middot's text stays in the accessible name —
changing shipped desktop appearance this late needs a ruling, not a gate fix).

### The class-sweep unit is the decision PLUS its consequences

The sharpest lesson of this arc, and it took two rounds to reach because the
first version of it sounded complete.

After the impeccable gate, the lesson was recorded as "class-sweep applies to
decisions, not just defects": Eric ruled the pill's shape, so every pill under
that cap inherits the ruling. That is true, and acting on it is what fixed the
wizard twin's counts-only rendering.

It was still too small. Whole-diff round 1 found the twin missing the leading-dot
repair and the middot contrast floor -- both of which were not the decision, but
the decision's FOOTPRINT: repairs that existed only because Decision 7 created
the defects they fix. Applying the ruling to the twin while leaving its
consequences behind produced the same gap in a smaller shape, one file away from
its own fix, and it needed a BLOCKING round to see.

So the unit of a sweep is not the edit, and not even the decision. It is the
decision together with everything the decision made necessary. A practical test:
after applying a ruling to a second site, list every commit the FIRST site needed
because of that ruling, and check each one against the second.

### Oracle authorship, measured

Three oracles in this arc failed at write time and were caught before they could
report anything. Recorded because the pattern is the point, not the count.

- A clip test read `scrollHeight` on an `overflow: visible` box, so it failed
  identically at the type size that already shipped.
- A wizard mark test compared `backgroundColor` and PASSED against its own target
  defect -- the two states DO differ in colour, which is exactly the finding it
  existed to catch. Rewritten to compare filled/ringed booleans, so it survives
  colour being removed.
- A P0 test drove two harness flags that resolved to the SAME state, so it
  measured one state twice and its own premise passed for the wrong reason.

The shared shape: each measured something adjacent to its claim. The habit that
catches them is asking, before trusting a green, what the assertion would report
if the defect were present -- and for the third, whether the two inputs being
compared are genuinely two.

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
