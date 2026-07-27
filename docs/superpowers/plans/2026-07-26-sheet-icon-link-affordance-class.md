# SheetIconLink Affordance Class Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared icon-only sheet-link component (components/admin/SheetIconLink.tsx (new)) consumed at all three icon-only sites (section header, published modal title, step-3 review modal title), with the DESIGN.md-conformant colour tokens, a 44×44 asymmetric hit overlay that never bleeds onto the heading, one aria phrasing, and sub-block tap floors removed.

**Architecture:** Pure presentational component, no state, no directive; call sites keep their null-gating and testids. All geometry real-browser verified (overlay invisible to `getBoundingClientRect` — `elementFromPoint` oracle); jsdom pins class strings and aria only.

**Tech Stack:** Next.js 16 / React, Tailwind v4 tokens, Playwright (standalone DB-free configs), Vitest/jsdom.

**Spec (canonical):** `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md` — **APPROVED, Codex r5** (r1: B/D containment recipe; r2: count-pinned guard + content-box probes + set-equality tokens; r3: rect-intersection mechanism; r4: red-edge wording). Its §1 items 1–11 are ratified: do not relitigate. §5 is the single source for every geometry number.

## Layout-dimensions rule disposition (project writing-plans rule)

The mandatory child.height === parent.height equality form is N/A here BY DESIGN: the 44px floor rows deliberately hold a SMALLER centred child (20px anchor) — equality would be a spec violation, not a proof. The rule's intent (real-browser dimensional verification of every fixed-dimension parent) is carried by: the floor assertions (row ≥ 44 / sub-row < 44 ∧ ≥ 24), the hit-tested 44×44 oracles, and the §7.7 rect-intersection containment set — all Playwright, never jsdom.

## Transition-audit disposition (project writing-plans rule)

Spec §6 is the inventory. The diff adds NO AnimatePresence, no new ternary-rendered visual state, no exit/initial/animate surface: link presence is instant (spec §1.9, pinned by existing comment `step3ReviewSections.tsx:978`); all interaction states are colour-only on one channel plus the focus ring. The enforcement is structural, not a checklist pass: Task 1's whole-token-set equality makes any transform/transition token beyond `transition-colors duration-fast` unrepresentable. Compound states (§6 table) need no test beyond that — one colour channel + one ring channel cannot conflict.

## Containment-guard sweep (authored AND run at plan time, per writing-plans rule)

Command: `rg -n "Open the source sheet" components/`. Current output (live tree, pre-implementation):

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

End state = guard's pinned counts: SheetIconLink.tsx 2, Step3SheetCard.tsx 1, step3ReviewSections.tsx 1, all others 0.

## Global Constraints

- TDD per task (invariant 1): new assertions run RED before implementation; RED/GREEN counts in commit messages.
- Conventional commits, one task per commit (invariant 6); `--no-verify`.
- UI diff ⇒ impeccable critique + audit dual-gate before cross-model review (invariant 8); Opus-owned.
- Tokens only (DESIGN.md §10): `before:-inset-y-3 before:-left-2.5 before:-right-3.5` — standard scale, no px literals.
- No transform in any interactive state (spec §3): colour-only hover/active.
- Spec §5 geometry: overlay 44×44 (y: 12+20+12; x: 10+20+14); left reach 10px ≤ every consuming row gap (`gap-2.5`).

## Meta-test inventory (project writing-plans rule)

No registry meta-test applies — no Supabase call boundary, sentinel text, admin alert, advisory lock, or email surface; pure presentational, no mutation surfaces (invariant 10 untouched). Structural defense CREATED instead (first-occurrence rule): the count-pinned phrase-containment guard (spec §7.10 — SheetIconLink.tsx 2, Step3SheetCard.tsx 1, step3ReviewSections.tsx 1, all others 0), so a future inline sheet anchor (the drift that created this class) fails CI even inside an allowlisted file. Structural tests EXTENDED: section-header 15-cell matrix (sub-row heights), T2 tap oracle comments, published-modal rider (box→hit-test), step3-modal tap coverage (new), bleed probes (new).

## e2e harness readiness (project writing-plans rule)

- All three e2e suites (`section-header-layout.layout`, `published-review-modal.layout`, `step3-review-modal.layout`) already sit in `tests/e2e/standalone.config.ts:84`'s allow-list; `.github/workflows/standalone-e2e.yml` runs the whole config unfiltered on every PR. No new e2e files ⇒ no allow-list or workflow wiring changes.
- `section-header-layout.layout.spec.ts` boots no server: `_sectionHeaderCellHarness.tsx` renders the real tree to static markup in a tsx subprocess (HARNESS_ENV peppers supplied at `tests/e2e/section-header-layout.layout.spec.ts:28-35`), served from a local static server; `waitUntil: "load"` is the settled gate (static markup, no hydration).
- `published-review-modal.layout.spec.ts` / `step3-review-modal.layout.spec.ts`: existing standalone-config members with their own established harnesses; edits extend in-file patterns only. No `locator.evaluate` outlives its element (probes are single `page.evaluate` passes).
- New jsdom files are picked up by vitest's default include (same tree as existing `tests/components/**` suites).

---

### Task 1: SheetIconLink component + unit suite + containment guard

**Files:**
- Create: tests/components/admin/sheetIconLink.test.tsx (new)
- Create: tests/components/admin/sheetIconLinkContainment.test.ts (new) (phrase-containment guard)
- Create: components/admin/SheetIconLink.tsx (new)

- [ ] **Step 1 (RED):** Write the unit suite. Assertions (expected strings written as literals in the test — never imported from the component):
  - aria-label with subject: `Open the source sheet for Rooms & scope in Google Sheets (opens in a new tab)`; whitespace-only subject → `Open the source sheet in Google Sheets (opens in a new tab)`; subject is `.trim()`ed (pass `"  X  "`, expect `for X`).
  - `target="_blank"`, `rel="noopener noreferrer"`, `<a>` tag, testid passthrough.
  - Icon: `svg` present, `aria-hidden="true"`, class contains `size-4`; accessible name of the link contains NO icon noise.
  - Class string: **whole-token-set EQUALITY** (spec §7.6): `className.split(/\s+/)` token set equals exactly the expected literal set (base ∪ ring-offset variant ∪ passed className tokens), expected set written as a literal in the test. Kills text-text-subtle, any transform spelling under any variant stack, and silent class additions, all by construction.
  - Component appends `className ?? ""` (spec §3): a test passes `className={null as unknown as string}` and asserts no `null` token appears.
  - `ringOffset="bg"` → token `focus-visible:ring-offset-bg` present, `focus-visible:ring-offset-surface` absent; `"surface"` → inverse.
  - `className="sm:order-1 sm:ml-0.5"` → both tokens appended; omitted → absent.
  - Failure mode caught: a colour/idiom/phrasing regression at the shared source, or a lookup-map row typo'd into an incomplete Tailwind literal.
- [ ] **Step 2 (RED):** Containment guard: walk `components/**/*.tsx` (filesystem walk, not a named file list), assert the literal `Open the source sheet` appears ONLY in components/admin/SheetIconLink.tsx (new). Failure mode caught: the next author re-inlining a sheet anchor instead of consuming the component (the exact drift that created BL-HEADER-LINK-AFFORDANCE-CLASS). Guard is red right now (three inline sites carry the phrase) — it goes green when Tasks 2/4/5 land; mark it `.todo`/skip-gated? NO — order the suite so the guard lands in this task but its expectation is asserted against the END state; run it, record RED, and let Tasks 2/4/5 turn it green (the task-boundary commit for Task 1 carries it red-tolerated? Invariant 1 forbids committing red). Resolution: the guard file lands in **Task 5** (last adoption) instead; this task's commit carries only the component + its green unit suite. (Kept here as a step so the guard's design is reviewed with the component.)
- [ ] **Step 3 (GREEN):** Implement components/admin/SheetIconLink.tsx (new) per spec §3: props type, trim/fallback aria builder, RING_OFFSET lookup (`satisfies Record<"bg" | "surface", string>`, full literals per branch), single base class literal, `ExternalLink` from lucide-react. Unit suite green.
- [ ] **Step 4:** Commit `feat(admin): shared SheetIconLink icon-only sheet-link component`.

### Task 2: Site A adoption — section header (phrasing + colour + overlay + comment)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:978-1006`
- Modify: `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:287-304`
- Modify: `tests/e2e/section-header-layout.layout.spec.ts` (T2 oracle reads all FOUR resolved ::before inset components — spec §7.2; comments at 874/893; new name-side bleed probe)

- [ ] **Step 1 (RED):** Update `newTabAnnouncementBehavior` expected labels to the "in Google Sheets" phrasing (both subject and fallback cases) — red against current markup.
- [ ] **Step 2 (RED):** Bleed assertions per spec §7.7 (RECT INTERSECTION — overlay rect = anchor rect + four resolved insets, vs each neighbour rect, empty; neighbour rects asserted non-degenerate): add a SATURATED-NAME cell to `_sectionHeaderCellHarness.tsx` (long name + count filling the row at 320/375); neighbour set below sm = {count node, heading, line-2 pill}; sm+ = {inline pill both orders, count/heading}. RED edge: the saturated count-node intersection asserted NON-empty against the current 12px reach (inverted red-run assertion). Existing pill-side elementFromPoint case retained as paint-order spot check, re-derived for 10px reach.
- [ ] **Step 3 (GREEN):** Swap site A's inline anchor for `<SheetIconLink href={sheetHref} subjectLabel={label} testId={…unchanged…} ringOffset="bg" className="sm:order-1 sm:ml-0.5" />`; delete the superseded comment block (wrong precedent, `-inset-3` rationale) keeping the §11 instant-presence line + positioning note; update T2 comments; regenerate the byte-baseline fixture (deliberate, recorded in the commit body).
- [ ] **Step 4:** Full section-header e2e suite + a11y suite green. Commit `feat(admin): section header consumes SheetIconLink (colour, overlay, phrasing)`.

### Task 3: Item 6 — sub-block tap floors become conditional

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:930-932`
- Modify: `tests/e2e/section-header-layout.layout.spec.ts` (G4/level-4 matrix expectations)

- [ ] **Step 1 (RED):** Matrix expectations for sub cells (G4-clean and any level-4 row): header line height < `TAP_MIN` AND ≥ 24 (the sub icon chip `size-6` — a collapsed row cannot pass) at all five widths (spec §7.9). Red against the unconditional floors.- [ ] **Step 2 (GREEN):** `min-h-tap-min` (line 932) and `sm:min-h-tap-min` (line 930) gated on `!sub`; guard comment ties the floor to link-bearing headers (spec §4.1).
- [ ] **Step 3:** Commit `fix(admin): sub-block section headers drop the 44px tap floor`.

### Task 4: Site B adoption — PublishedReviewModal

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx:707-729`
- Modify: `tests/e2e/published-review-modal.layout.spec.ts:610-626` (rider rewrite + bleed probe)

- [ ] **Step 1 (RED):** Rewrite the sheetlink rider from box-rect (`getBoundingClientRect ≥ 44`) to the hit-test oracle (overlay-derived width/height ≥ 44, mirroring `section-header-layout.layout.spec.ts:883-938`), and add the title-side bleed probe (`titleBox.right - 1` never resolves to the link). Box-rect form asserted on the NEW markup is red (20px box), so the rewrite is the red step run against the new component locally via a temporary local swap? NO — simpler true-TDD order: land the new assertions first; the hit-test oracle is green on OLD markup too (44px box passes hit tests), but the bleed probe and a NEW `visible box stays 20px` assertion (`rect.width < TAP_MIN`, the anti-inflation twin of `tests/e2e/published-review-modal.layout.spec.ts:615`) are red on old markup. Use those as the red edge.
- [ ] **Step 2 (GREEN):** Swap the inline anchor for `<SheetIconLink href={openSheetHref} subjectLabel={displayTitle} testId={...} ringOffset="surface" className="mr-0.5" />`; title row `gap-1` → `gap-2.5` + `min-h-tap-min` (spec §1.10/§5.1 containment: floor holds the 12px vertical reach; mr-0.5 + shell gap-3 = 14px to actions cluster). Add floor + rect-intersection bleed assertions per spec §7.7 with a SATURATED long title — neighbour set {title box, subline, state pill (`PublishedReviewModal.tsx:879-901`), close button}, plus one elementFromPoint spot check. Unit labels (`publishedReviewModal.test.tsx`) already canonical — suite stays green; run it to prove no regression.
- [ ] **Step 3:** Commit `feat(admin): published review modal consumes SheetIconLink`.

### Task 5: Site D adoption — Step3ReviewModal + containment guard lands

**Files:**
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:392-417`
- Modify: `tests/components/admin/wizard/Step3ReviewModal.test.tsx:299-310`
- Modify: `tests/e2e/step3-review-modal.layout.spec.ts` (tap-target + bleed coverage, new)
- Modify: `tests/components/admin/review/reviewModalShell.test.tsx:347` + regenerate `tests/components/admin/review/__fixtures__/step3-header-baseline.html` (pins site D's header — spec §2)
- Create: tests/components/admin/sheetIconLinkContainment.test.ts (new) (from Task 1 Step 2 design)

- [ ] **Step 1 (RED):** Update the `size-tap-min` className pin (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:310`) to the shared-idiom token-set equality; rename the test ("44px icon anchor" → overlay wording). Add step3-modal e2e tap-target (hit-tested 44×44) + rect-intersection bleed assertions (neighbour set {title box, eyebrow, subline, state chip `Step3ReviewModal.tsx:443-465`, close button}, saturated long title per `tests/e2e/step3-review-modal.layout.spec.ts:613-639` precedent, one elementFromPoint spot check). Containment guard lands here — count-pinned set-equality per spec §7.10 (SheetIconLink=2, Step3SheetCard=1, step3ReviewSections=1, others=0); red until Step 2.
- [ ] **Step 2 (GREEN):** Swap the inline anchor (`className="mr-0.5"`); `gap-1` → `gap-2.5` + `min-h-tap-min` (spec §5.1); reword the label-quoting comment at `Step3ReviewModal.tsx:27` (spec §4.3 — guard counts comments); regenerate the byte baseline (`step3-header-baseline.html` pins SITE D's header — spec §2/§7.3, regen recorded in this commit). All suites + containment guard green.
- [ ] **Step 3:** Commit `feat(admin): step-3 review modal consumes SheetIconLink; containment guard`.

### Task 6: Impeccable dual-gate (invariant 8)

- [ ] `/impeccable critique` on the affected diff (canonical v3 setup: context.mjs PRODUCT.md + DESIGN.md → register read), then `/impeccable audit`. P0/P1 fixed or DEFERRED.md-entried. Findings + dispositions recorded for the PR body.
- [ ] Playwright visual pass across both themes at 375/640/1280 on all three surfaces (screenshots for the record).
- [ ] Commit any fixes as `fix(admin): impeccable dual-gate repairs` (or no commit if clean).

## Anti-tautology register (per-test failure modes; project writing-plans rule)

- Token set-equality (T1): catches a colour/idiom/motion regression at the source, a lookup-map literal typo, or any smuggled utility. Cannot pass by accident — the expected set is a test-side literal.
- Containment guard (T5): catches a re-inlined sheet anchor anywhere under components/, including inside allowlisted files (count bump).
- Rect-intersection set (T2/T4/T5): catches any overlay reach change that touches a neighbour, at any alignment — the red run on the pre-fix tree (count-node case fails by the 2px overlap) proves detection; non-degenerate-rect preconditions stop unrendered neighbours green-washing.
- Anti-inflation twin (T4): catches the tempting regression of restoring a 44px visible box to satisfy the hit assertion.
- Sub-row band (T3): `< 44 ∧ ≥ 24` catches both a surviving floor and a collapsed row.
- Aria phrasing (T2): expected strings are literals; derived from the props fed in, never read back from the component.

### Task 7: Close-out

- [ ] Update root `BACKLOG.md` BL-HEADER-LINK-AFFORDANCE-CLASS entry: items 1/3/4/5/6 closed by this branch (note the fourth site + the superseded inset prescription), leave item-2 history intact. Commit `docs: mark BL-HEADER-LINK-AFFORDANCE-CLASS closed`.
- [ ] Full local gates: `pnpm test` (full suite), typecheck (vitest AND playwright tsconfigs), `pnpm lint`, `pnpm format:check`.
- [ ] Whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY, split-scope if needed) → APPROVE.
- [ ] Push, PR, real CI green, `gh pr merge --merge`, ff local main, verify `0  0`.
