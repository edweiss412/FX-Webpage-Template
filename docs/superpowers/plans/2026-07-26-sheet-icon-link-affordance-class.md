# SheetIconLink Affordance Class Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared icon-only sheet-link component (components/admin/SheetIconLink.tsx (new)) consumed at all three icon-only sites (section header, published modal title, step-3 review modal title), with the DESIGN.md-conformant colour tokens, a 44×44 asymmetric hit overlay that never intersects any neighbouring content box, one aria phrasing, and sub-block tap floors removed.

**Architecture:** Pure presentational component, no state, no directive; call sites keep their null-gating and testids. All geometry real-browser verified (overlay invisible to `getBoundingClientRect` — resolved-inset rect computation + `elementFromPoint` spot checks); jsdom pins class-token sets and aria only.

**Tech Stack:** Next.js 16 / React, Tailwind v4 tokens, Playwright (standalone DB-free configs), Vitest/jsdom.

**Spec (canonical):** `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md` — **APPROVED, Codex r5** (r1: B/D containment recipe; r2: count-pinned guard + content-box targets + set-equality tokens; r3: rect-intersection mechanism; r4: red-edge wording). Its §1 items 1–11 are ratified: do not relitigate. §5 is the single source for every geometry number.

## Layout-dimensions rule disposition (project writing-plans rule)

The child.height === parent.height equality form is N/A BY DESIGN: the 44px floor rows deliberately hold a SMALLER centred child (20px anchor) — equality would be a spec violation. The rule's intent (real-browser dimensional verification of every fixed-dimension context) is carried by explicit row-band assertions at every consuming site: A rows ≥ 44 (existing matrix) and sub-rows < 44 ∧ ≥ 24 (Task 3), B title row ≥ 44 (Task 4), D title row ≥ 44 (Task 5), plus hit-tested 44×44 oracles and the §7.7 rect-intersection sets — all Playwright, never jsdom.

## Transition-audit disposition (project writing-plans rule)

Spec §6 is the inventory. The diff adds NO AnimatePresence, no new ternary-rendered visual state, no exit/initial/animate surface: link presence is instant (spec §1.9, pinned by existing comment `step3ReviewSections.tsx:978`); all interaction states are colour-only on one channel plus the focus ring. Enforcement is structural: Task 1's whole-token-set equality makes any transform/transition token beyond `transition-colors duration-fast` unrepresentable. Compound states (§6 table) need no test beyond that — one colour channel + one ring channel cannot conflict.

## Containment-guard sweep (authored AND run at plan time, per writing-plans rule)

Command: `rg -n "Open the source sheet" components/`. Current output (live tree, pre-implementation), with per-hit dispositions:

```
components/admin/wizard/Step3ReviewModal.tsx:27    (comment — reworded in Task 5)
components/admin/wizard/Step3ReviewModal.tsx:410   (site D anchor — dies in Task 5)
components/admin/wizard/Step3ReviewModal.tsx:411   (site D anchor — dies in Task 5)
components/admin/wizard/step3ReviewSections.tsx:989  (site A comment — dies in Task 2)
components/admin/wizard/step3ReviewSections.tsx:999  (site A anchor — dies in Task 2)
components/admin/wizard/step3ReviewSections.tsx:1000 (site A anchor — dies in Task 2)
components/admin/wizard/step3ReviewSections.tsx:3488 (agenda text link — RETAINED, spec §1.11)
components/admin/wizard/Step3SheetCard.tsx:152     (site C aria — RETAINED, spec §1.5)
components/admin/showpage/PublishedReviewModal.tsx:722 (site B anchor — dies in Task 4)
components/admin/showpage/PublishedReviewModal.tsx:723 (site B anchor — dies in Task 4)
```

End state = the Task 5 guard's pinned counts: SheetIconLink.tsx 2, Step3SheetCard.tsx 1, step3ReviewSections.tsx 1, all others 0.

## Companion-surface sweep (Codex plan-r1 finding 9 — enumerated up front)

Beyond the three anchors, the box→overlay change touches these companion surfaces, each assigned to a task below:

- `PublishedReviewModal.tsx:36` — `ExternalLink` import orphaned by the swap (only use is the anchor) → removed in Task 4. Same at `Step3ReviewModal.tsx:41` → Task 5.
- 44px-box companion comments: `PublishedReviewModal.tsx:9` and line 706 (Task 4); `Step3ReviewModal.tsx:26` and line 390 and the label-quoting line 27 (Task 5).
- `components/admin/showpage/ShowReviewModalSkeleton.tsx:73-83` — the WHOLE title-row block mirrors the old shape: the `size-tap-min` spacer (line 83), the row's `gap-1` (line 76 — follows B's `gap-2.5`), and the comments at lines 73-82 claiming the 44px child drives row height (false once the floor drives it). All three → Task 4, with the comment references in `tests/e2e/_skeletonParityHarness.tsx` lines 54-56 and 165-168 updated alongside.
- `components/admin/wizard/Step3ReviewModal.tsx:467-470` — dev-capture comment says its boxed `size-tap-min` control is the "same idiom as the header sheet-link", false after the swap → reworded in Task 5 (the control itself is out of scope; only the comparison claim changes).
- `tests/components/admin/showpage/publishedReviewModal.test.tsx:362` — test name + assertion say "44px … icon anchor" → reshaped in Task 4.
- `tests/e2e/_sectionHeaderCellHarness.tsx:294-315` — the harness is pinned to EXACTLY 15 matrix cells (`tests/e2e/section-header-layout.layout.spec.ts:63`); the saturated fixture is therefore an AUXILIARY emission (its own JSON key + page, like the existing `hairline` fixture), never a 16th cell → Task 2.
- `tests/e2e/_publishedReviewModalHarness.tsx` lines 336-411 and 422-449 — hardcodes `MODAL_TITLE`, emits no saturated-title page and no clean/degraded pill page → Task 4 adds a saturated-title page whose state renders the pill.

## Global Constraints

- TDD per task (invariant 1): each task lists its runnable RED command with the expected failure, and the same command green after implementation; RED/GREEN counts in commit messages. Every commit leaves the whole tree green (the RED window lives inside a task, never across commits).
- Scoped runs use `pnpm exec vitest run <paths>` and `pnpm exec playwright test --config=tests/e2e/standalone.config.ts <files>` — NEVER `pnpm test -- <paths>` (runs the whole suite).
- Conventional commits, one task per commit (invariant 6); `--no-verify`.
- UI diff ⇒ impeccable critique + audit dual-gate before cross-model review (invariant 8); Opus-owned; findings + dispositions recorded in the handoff doc §12 (Task 6).
- Tokens only (DESIGN.md §10). No transform in any interactive state (spec §3).
- Spec §5 geometry: overlay 44×44 (y: 12+20+12; x: 10+20+14); left reach 10px ≤ every consuming row gap.

## Meta-test inventory (project writing-plans rule)

No registry meta-test applies — no Supabase call boundary, sentinel text, admin alert, advisory lock, or email surface; pure presentational, no mutation surfaces (invariant 10 untouched). Structural defense CREATED (first-occurrence rule): the count-pinned phrase-containment guard (spec §7.10), Task 5. Structural tests EXTENDED: section-header matrix (sub-row heights), T2 four-component inset oracle, published-modal rider (box→hit-test), step3-modal tap coverage (new), rect-intersection sets (new), skeleton parity.

## e2e harness readiness (project writing-plans rule)

- All three e2e suites are in `tests/e2e/standalone.config.ts:84`'s allow-list; `.github/workflows/standalone-e2e.yml` runs the whole config unfiltered on every PR. No new e2e FILES ⇒ no allow-list or workflow wiring changes (new fixtures ride inside existing harness emissions).
- `section-header-layout.layout.spec.ts` boots no server: `_sectionHeaderCellHarness.tsx` renders the real tree to static markup in a tsx subprocess (HARNESS_ENV peppers at `tests/e2e/section-header-layout.layout.spec.ts:28-35`); `waitUntil: "load"` is the settled gate.
- `published-review-modal.layout.spec.ts` / `step3-review-modal.layout.spec.ts`: existing standalone members; edits extend in-file patterns. No `locator.evaluate` outlives its element (probes are single `page.evaluate` passes).
- New jsdom files ride vitest's default include.

---

### Task 1: SheetIconLink component + unit suite

**Files:**
- Create: tests/components/admin/sheetIconLink.test.tsx (new)
- Create: components/admin/SheetIconLink.tsx (new)

- [ ] **Step 1 (RED):** Write the unit suite. Assertions (expected strings and the expected token set are test-side literals, never imported from the component):
  - aria with subject / whitespace-only fallback / `.trim()` (pass `"  X  "`, expect `for X`).
  - `target="_blank"`, `rel="noopener noreferrer"`, `<a>` tag, testid passthrough.
  - Icon: svg present, `aria-hidden="true"`, `size-4`; the link's accessible name has no icon noise.
  - Whole-token-set EQUALITY (spec §7.6): rendered className token set equals exactly base ∪ ring-offset variant ∪ passed className tokens.
  - `className={null as unknown as string}` → no `null` token (the `?? ""` append, spec §3).
  - `ringOffset` variants: each emits its literal, not the other's.
  - RED command: `pnpm exec vitest run tests/components/admin/sheetIconLink.test.tsx` — expected failure: module-not-found on the component import (every test red).
- [ ] **Step 2 (GREEN):** Implement components/admin/SheetIconLink.tsx per spec §3 (props, trim/fallback aria builder, RING_OFFSET lookup with full literals, single base class literal, `?? ""` append, lucide `ExternalLink`). Same command green (expected: all tests pass).
- [ ] **Step 3:** Commit `feat(admin): shared SheetIconLink icon-only sheet-link component` (RED/GREEN counts in body).

### Task 2: Site A adoption — section header

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:978-1006` (anchor swap + comment rewrite incl. line 989)
- Modify: `tests/e2e/_sectionHeaderCellHarness.tsx` (AUXILIARY saturated-name fixture — own JSON key + page at 320/375, long name + count filling the row; the 15-cell matrix contract at `tests/e2e/section-header-layout.layout.spec.ts:63` is untouched)
- Modify: `tests/e2e/section-header-layout.layout.spec.ts` (T2 oracle reads all FOUR resolved ::before inset components — spec §7.2; comments at 874/893; rect-intersection set below `sm` {count node, heading, line-2 pill} and at `sm`+ {inline pill both orders, count/heading}; existing pill-side elementFromPoint case re-derived as paint-order spot check)
- Modify: `tests/components/a11y/newTabAnnouncementBehavior.test.tsx` lines 293 and 304 (labels gain "in Google Sheets")

- [ ] **Step 1 (RED):** Update the two expected labels; add the saturated fixture + the rect-intersection assertions (all shipped as EMPTY-intersection checks, neighbour rects asserted non-degenerate — spec §7.7; no inverted assertion).
  - RED command A: `pnpm exec vitest run tests/components/a11y/newTabAnnouncementBehavior.test.tsx` — expected failure: two label mismatches.
  - RED command B: `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts` — expected failure: the saturated count-node empty-intersection case fails on the current tree (old 12px reach overlaps the 10px-distant count by 2px); every other new intersection case passes (containment proofs, green on both trees — declared, not claimed as red edges).
- [ ] **Step 2 (GREEN):** Swap the anchor for `<SheetIconLink href={sheetHref} subjectLabel={label} testId={…unchanged…} ringOffset="bg" className="sm:order-1 sm:ml-0.5" />`; delete the superseded comment block (wrong precedent, `-inset-3` rationale, the line 989 fallback-comment) keeping the §11 instant-presence line + positioning note; update T2 oracle + comments. Both commands green.
- [ ] **Step 3:** Commit `feat(admin): section header consumes SheetIconLink (colour, overlay, phrasing)`.

### Task 3: Item 6 — sub-block tap floors become conditional

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:930-932`
- Modify: `tests/e2e/section-header-layout.layout.spec.ts` (G4/level-4 matrix expectations)

- [ ] **Step 1 (RED):** Sub-cell height expectations become `< TAP_MIN ∧ ≥ 24` (the `size-6` sub chip — a collapsed row cannot pass) at all five widths (spec §7.9). RED command: the Task 2 playwright command — expected failure: G4 cells still measure 44px.
- [ ] **Step 2 (GREEN):** Gate `min-h-tap-min` (line 932) and `sm:min-h-tap-min` (line 930) on `!sub`; guard comment ties the floor to link-bearing headers (spec §4.1). Command green.
- [ ] **Step 3:** Commit `fix(admin): sub-block section headers drop the 44px tap floor`.

### Task 4: Site B adoption — PublishedReviewModal + skeleton companions

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (line 707 row, line 714-729 anchor, comments line 9 and line 706, `ExternalLink` import line 36)
- Modify: `components/admin/showpage/ShowReviewModalSkeleton.tsx:73-83` (row: `min-h-tap-min` + `gap-2.5`; spacer: `size-5` + `mr-0.5`; comments reworded — floor drives height now)
- Modify: `tests/components/admin/showpage/showReviewModalSkeleton.test.tsx` (shape assertions: row token set carries `min-h-tap-min` and `gap-2.5`, spacer carries `size-5` and NOT `size-tap-min` — the skeleton's own RED edge)
- Modify: `tests/e2e/_publishedReviewModalHarness.tsx` (saturated-title page whose state renders the pill — `MODAL_TITLE` stays for existing pages)
- Modify: `tests/e2e/_skeletonParityHarness.tsx` lines 54-56 and 165-168 (expectations follow the skeleton change)
- Modify: `tests/e2e/published-review-modal.layout.spec.ts:610-626` (rider rewrite + new cases)
- Modify: `tests/components/admin/showpage/publishedReviewModal.test.tsx:362` (name + assertion reshaped to the overlay idiom)

- [ ] **Step 1 (RED):** Rewrite the rider: anti-inflation twin (visible rect `< TAP_MIN` on BOTH axes — spec §7.1) + hit-tested target ≥44 both axes; add title-row floor assertion (row ≥ 44); add the rect-intersection set {title box, subline, state pill `PublishedReviewModal.tsx:879-901`, close button} — every neighbour rect asserted non-degenerate (width and height > 0, spec §7.7) — + one elementFromPoint spot check, on the new saturated-title page. Add the skeleton shape assertions (`showReviewModalSkeleton.test.tsx` — red on the old spacer/row tokens).
  - RED command: `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/published-review-modal.layout.spec.ts` — expected failure: both anti-inflation axes fail on the current 44px box. (Floor + intersections are green on both trees — declared containment proofs. The floor assertion becomes load-bearing the moment the box shrinks; it is what fails if Step 2 forgets `min-h-tap-min`.)
  - jsdom RED: `pnpm exec vitest run tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/showpage/showReviewModalSkeleton.test.tsx` — expected failures: the reshaped line 362 case (overlay-idiom token set on the anchor) against the boxed markup, AND the new skeleton shape assertions against the old spacer/row tokens.
- [ ] **Step 2 (GREEN):** Swap the anchor for `<SheetIconLink href={openSheetHref} subjectLabel={displayTitle} testId={…} ringOffset="surface" className="mr-0.5" />`; row `gap-1` → `gap-2.5` + `min-h-tap-min` (spec §5.1); update comments line 9/line 706; drop `ExternalLink` from the import; skeleton placeholder + parity expectations updated together. Both commands green, plus `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/skeletonBandParity.spec.ts` green.
- [ ] **Step 3:** Commit `feat(admin): published review modal consumes SheetIconLink; skeleton follows`.

### Task 5: Site D adoption — Step3ReviewModal + containment guard + baseline

**Files:**
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (line 391 row, line 402-417 anchor, comments line 26/line 27/line 390, `ExternalLink` import line 41)
- Modify: `tests/components/admin/wizard/Step3ReviewModal.test.tsx:299-310` (token-set assertion, test renamed off "44px icon anchor")
- Modify: `tests/e2e/step3-review-modal.layout.spec.ts` (anti-inflation twin: visible rect < 44 both axes; hit-tested 44×44; row floor ≥ 44; rect-intersection set {title box, eyebrow, subline, state chip `Step3ReviewModal.tsx:443-465`, close button} — every neighbour rect non-degenerate per spec §7.7; spot check; saturated long title per `tests/e2e/step3-review-modal.layout.spec.ts:613-639` precedent)
- Modify: `tests/components/admin/review/reviewModalShell.test.tsx:347` + regenerate `tests/components/admin/review/__fixtures__/step3-header-baseline.html` (pins SITE D's header — spec §2; regen recorded in this commit)
- Create: tests/components/admin/sheetIconLinkContainment.test.ts (new) — count-pinned guard per spec §7.10

- [ ] **Step 1 (RED):** Reshape the line 310 className pin to the shared-idiom token set; add the e2e cases; land the guard.
  - RED command A: `pnpm exec vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/sheetIconLinkContainment.test.ts` — expected failures: the token-set case (boxed markup) and the guard (`Step3ReviewModal.tsx` counts 3 vs pinned 0 — B's occurrences are already gone after Task 4).
  - RED command B: `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts` — expected failure: the anti-inflation twin fails on the current 44px box (both axes measure 44). Hit-test, floor, and intersections are green on both trees (declared containment/GREEN-step proofs).
- [ ] **Step 2 (GREEN):** Swap the anchor (`className="mr-0.5"`); row `gap-1` → `gap-2.5` + `min-h-tap-min`; reword comments at lines 26/27/390 (guard counts comments — the label literal leaves line 27) and the dev-capture "same idiom" claim at lines 467-470; drop `ExternalLink` import; regenerate the byte baseline. All commands green, incl. `pnpm exec vitest run tests/components/admin/review/reviewModalShell.test.tsx`.
- [ ] **Step 3:** Commit `feat(admin): step-3 review modal consumes SheetIconLink; containment guard + baseline regen`.

### Task 6: Impeccable dual-gate (invariant 8) + handoff record

- [ ] Create docs/superpowers/plans/2026-07-26-sheet-icon-link-affordance-class-handoff.md (new) with a §12 section.
- [ ] `/impeccable critique` on the affected diff (canonical v3 setup: context.mjs PRODUCT.md + DESIGN.md → register read), then `/impeccable audit`. P0/P1 fixed or DEFERRED.md-entried; every finding + disposition recorded in handoff §12.
- [ ] If any fix commit lands, RE-RUN both gates on the final diff until a clean pass — the gate binds to the diff that ships, not the first one inspected.
- [ ] Playwright visual pass across both themes at 375/640/1280 on all three surfaces (screenshots recorded in the handoff).
- [ ] Commit `fix(admin): impeccable dual-gate repairs` (or handoff-only commit if clean).

### Task 7: Close-out

- [ ] Update root `BACKLOG.md` BL-HEADER-LINK-AFFORDANCE-CLASS entry: items 1/3/4/5/6 closed by this branch (note the fourth site + the superseded inset prescription), item-2 history intact. Commit `docs: mark BL-HEADER-LINK-AFFORDANCE-CLASS closed`.
- [ ] Full local gates, exact commands, all green before push: `pnpm test` · `pnpm exec playwright test --config=tests/e2e/standalone.config.ts` (the whole config, matching the standalone-e2e CI job) · `pnpm typecheck` · `pnpm lint` · `pnpm format:check`.
- [ ] Whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY, split-scope if the diff warrants) → APPROVE. **Re-entry rule:** any repair commit re-runs the full gate line above AND an impeccable delta pass on the changed surfaces before re-dispatch.
- [ ] Push, PR, real CI green (all required contexts REPORTED — absent ≠ pending), `gh pr merge --merge`, ff local main, verify `git rev-list --left-right --count main...origin/main` = `0  0`.
