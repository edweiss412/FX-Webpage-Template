# Warning Surface Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three trims in `docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md`: the published Parse warnings panel lists info-severity only, the correction-loop sentence moves into the per-warning help popover, and info-severity alerts stop reaching the modal's attention surface.

**Architecture:** One new pure helper (`visibleWarningRows`), two new fields on an existing React context, one widened registry function signature, one new optional prop on a leaf component, one new optional parameter on a pure derivation, and copy changes. No new component, no new route, no DB, no migration.

**Tech Stack:** Next 16, React 19, vitest 4.1.5 + jsdom + @testing-library/react, Tailwind v4.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md`. Mechanism sections APPROVE'd at review R5a; the test-plan vector is closed by the AGENTS.md three-round cap with its limits stated in spec §12.1. Do NOT reopen those limits during implementation.
- Commit per task, `--no-verify`, conventional commits. Scopes: `admin` for component and lib changes, `test(admin)` for test-only tasks.
- UI diff (files under `components/`), so invariant 8's impeccable dual gate applies. Task 12.
- No DB, no migrations, no `pg_advisory*`, no Supabase client call sites, no new `§12.4` code, no new mutation surface. Invariants 2, 9, 10 are N/A and this is declared rather than assumed.
- Strict tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Every snippet below was typechecked against it before this plan was dispatched; note the object-spread idiom for optional props rather than `key: undefined`.
- **Meta-test inventory** (spec §11): CREATES the set-driven exclusion guard, the published no-loss guard, and the bell inclusion guard. EXTENDS `tests/admin/roleFlagsNoticeReclassify.test.ts`. Touches no other registry.
- **Test wiring:** none needed. `BASE_INCLUDE` in `vitest.projects.ts:34` is `tests/**/*.test.ts(x)`, so every new file is collected automatically. `tests/admin/` and `tests/components/` are SERIAL dirs, which is correct for these (jsdom, no DB). No `testMatch` entry, no workflow path filter, no CI change.
- **Layout-dimensions task:** N/A, declared. Spec §6 establishes there is no fixed-dimension parent and no new parent-child dimension relationship; every touched element is a block-flow child of a content-height panel. No `getBoundingClientRect` assertion is warranted.
- **Transition-audit task:** REQUIRED (spec §7 carries a Transition Inventory). Task 10.
- **Fix-round regression budget:** when a review round patches a surface for a class, the next round's preparation re-greps that class across the surface, confirms the relevant meta-test still passes, and notes both in the round closure.

## Baseline verification (RUN, not described)

Run at plan-authoring time against the unmodified worktree at base `222c25bd7`:

```
npx vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx \
  tests/components/admin/wizard/warningsBreakdownControls.test.tsx \
  tests/components/admin/showpage/sectionWarningControls.test.tsx \
  tests/components/step3SheetCard.test.tsx tests/admin/attentionItems.test.ts \
  tests/admin/roleFlagsNoticeReclassify.test.ts tests/adminAlerts/audience.test.ts
```

Result: `Test Files 7 passed (7) / Tests 161 passed (161)`. Any failure in these files after a task is caused by that task.

Existing assertions that this change intentionally invalidates, each with its disposition:

| Location | Asserts today | Disposition |
| --- | --- | --- |
| `tests/components/admin/showpage/sectionWarningControls.test.tsx:424` | the correction-loop callout renders inside the PUBLISHED warnings section | Task 6 updates it to assert absence. |
| `tests/components/admin/wizard/warningsBreakdownControls.test.tsx:432` | the non-blocking line renders | staged-mode mount, unaffected. Verify it still passes; do not edit. |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx:699` and `tests/components/admin/wizard/step3ReviewSections.test.tsx:713` | callout present / absent by mode | staged-mode mounts, unaffected. Verify; do not edit. |
| `tests/components/admin/showpage/overviewSection.test.tsx:95` and `tests/components/admin/showpage/overviewSection.test.tsx:112` | the callout is NOT in Overview | stays true. Verify; do not edit. |

---

### Task 1: No-loss guard, written against unmodified code

The published surface's claim that every warn-severity warning already renders as an actionable card is the precondition for the entire trim. This task proves it BEFORE anything is trimmed, so a later failure means the trim broke it rather than that it was never true.

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/components/admin/showpage/publishedWarningNoLoss.test.tsx`

**Interfaces:**
- Consumes: `ShowReviewSurface`, `step3Sections`, `buildSectionWarningModel`, `buildSectionWarningExtras`, `buildPublishedSectionData` (the composition established by `tests/components/admin/showpage/sectionWarningControls.test.tsx:35-41`).
- Produces: the shared published fixture, exported for Tasks 4, 5, 6, 9, 11.

- [ ] **Step 1: Build the shared fixture module**
Per spec §12, the fixture carries 3 info rows with distinct titles; 2 active warn rows mapped to two DIFFERENT sections, one `UNKNOWN_ROLE_TOKEN` (recognize-role in scope) and one use-raw-eligible structural code; 2 active warn rows routing to the fallback `warnings` bucket; 1 ignored warn row mapped to a section; 1 ignored warn row in the bucket. Asymmetric counts by construction.

- [ ] **Step 2: Write the failing assertions**
Assert against the composed published mount:
  - the body-plus-extras identity union equals the input set, using `stableWarningKeys` read from each rendered row root;
  - no identity appears twice;
  - each identity appears under the section id `warningsBySection` routes it to;
  - each appears in its correct `active` / `ignored` partition;
  - each active warn row carries a Report/Ignore control that is enabled and has an accessible name.

  This must PASS on unmodified code. If it fails, stop: the spec's central premise is wrong and the whole change needs re-scoping. Record the failure in the plan and escalate.

- [ ] **Step 3: Commit** `test(admin): pin published warning no-loss before the trim`

**Anti-tautology:** the failure mode this catches is a fallback container that renders every warning in one place, which a union-and-uniqueness assertion alone tolerates. Placement and partition are what exclude it (spec §12 test 1, closing R3b finding 1).

---

### Task 2: Staged card baseline snapshot

Recorded against unmodified code so it is a genuine before-baseline, per spec §12 test 8a. A snapshot recorded after the implementation would bless whatever the implementation did.

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/components/admin/stagedCardBaseline.test.tsx`

- [ ] **Step 1: Render every card `StagedReviewCard` produces for the shared fixture and record an inline snapshot of each.** Not one card: R4b finding 3 correctly noted a single snapshot lets another card change freely.
- [ ] **Step 2: Confirm it passes on unmodified code and commit** `test(admin): baseline staged warning-card markup before the trim`

**Anti-tautology:** this is the only assertion in the plan that can detect an unintended change to staged markup, which every other staged assertion is too narrow to see.

---

### Task 3: The `visibleWarningRows` predicate

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `lib/admin/visibleWarningRows.ts`
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/admin/visibleWarningRows.test.ts`

**Interfaces:**
- Produces: `visibleWarningRows(warnings, routedWarningsRenderElsewhere)`, consumed by the panel body (Task 5) and the rail count (Task 4). One predicate, two readers, per spec §3.2.

```ts
import type { ParseWarning } from "@/lib/parser/types";

/** The rows the Parse warnings panel renders. When the routed warn rows are
 *  rendered elsewhere (published: as section extras), they are dropped here so
 *  the panel does not duplicate them. Spec 2026-07-20-warning-surface-trim §3.2. */
export function visibleWarningRows(
  warnings: readonly ParseWarning[],
  routedWarningsRenderElsewhere: boolean,
): readonly ParseWarning[] {
  if (!routedWarningsRenderElsewhere) return warnings;
  return warnings.filter((w) => w.severity !== "warn");
}
```

- [ ] **Step 1: Write the failing test** covering: gate false returns the input unchanged (same identities, same order); gate true drops every warn row and keeps every non-warn row; empty input returns empty under both gates.
- [ ] **Step 2: Implement, run, commit** `feat(admin): visibleWarningRows predicate for the warnings panel`

**Anti-tautology:** derive expectations from a fixture with asymmetric severity counts so a filter that keeps the wrong arm cannot produce a right-looking cardinality.

---

### Task 4: Gate derivation, context threading, rail count

**Files:**
- Modify: `components/admin/review/ShowReviewSurface.tsx` (derive the gate; thread it and `routedWarnings` into the chrome context at `components/admin/review/ShowReviewSurface.tsx:909`; pass opts at the rail-count call at `components/admin/review/ShowReviewSurface.tsx:795`)
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`Step3SectionChrome` type at `components/admin/wizard/step3ReviewSections.tsx:431`; `railCount` type at `components/admin/wizard/step3ReviewSections.tsx:3099`; the `warnings` row's `railCount` at `components/admin/wizard/step3ReviewSections.tsx:3859`)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (derive and pass `routedWarnings` alongside `renderSectionExtras` at `components/admin/showpage/PublishedReviewModal.tsx:737`)

**Interfaces:**
- Produces: `routedWarnings?: { here: number; elsewhere: number }` on `ShowReviewSurfaceProps` and on `Step3SectionChrome`; `routedWarningsRenderElsewhere: boolean` on `Step3SectionChrome`; widened `railCount`.

```ts
// ShowReviewSurface: the gate is the conjunction, per spec §3.2 (R2a finding 1).
const routedWarningsRenderElsewhere =
  routedWarnings !== undefined && renderSectionExtras !== undefined;
```

```ts
// step3ReviewSections: widened signature. Every existing row ignores opts.
railCount: ((d: SectionData, opts: { routedWarningsRenderElsewhere: boolean }) => number) | null;
```

- [ ] **Step 1: Write the failing rail-count test** (spec §12 test 4). Published expected value is the fixture's info-row count; staged expected is the fixture's total. BOTH computed from the fixture definition in the test body, NOT by calling `visibleWarningRows`, or the production predicate becomes its own oracle. Then, separately, assert each equals its mode's rendered row count.
- [ ] **Step 2: Widen the `railCount` type and update all 17 rows.** Sixteen ignore the second parameter; only the `warnings` row at `components/admin/wizard/step3ReviewSections.tsx:3859` reads it, returning `visibleWarningRows(d.warnings, opts.routedWarningsRenderElsewhere).length`.
- [ ] **Step 3: Add the two context fields and derive the gate in the surface.**
- [ ] **Step 4: Derive `routedWarnings` in `PublishedReviewModal`** from the `bySection` model: `here` is `bySection.warnings?.active.length ?? 0`; `elsewhere` is the sum of `active.length` over every other section id.
- [ ] **Step 5: Run, commit** `feat(admin): derive the routed-warnings gate and thread it to both readers`

**Anti-tautology:** the failure this catches is the two readers agreeing on a shared wrong filter, which the second assertion alone would tolerate. The fixture-derived oracle is what excludes it.

---

### Task 5: The panel body filter and the four empty states

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`WarningsBreakdown` at `components/admin/wizard/step3ReviewSections.tsx:2395`; the empty branch at `components/admin/wizard/step3ReviewSections.tsx:2458`)
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/components/admin/showpage/publishedWarningsPanel.test.tsx`

- [ ] **Step 1: Write the failing body test** (spec §12 tests 2 and 9), carrying all three extraction modes: identity equality against the fixture's 3 info identities; the body's row-ELEMENT count equals 3; and a `textContent` scan of the body container finding none of the warn rows' catalog titles, raw codes, or messages.
- [ ] **Step 2: Write the failing empty-state tests** (spec §12 test 5), one fixture per state, five fixtures for four states because Clean has two meanings:
  - (a) List with `here > 0` AND rows elsewhere: the list renders, NEITHER line testid is present;
  - (b) Silent: the body container's `childNodes` is empty while the extras below are non-empty;
  - (c) Elsewhere: the line's `textContent` equals `Nothing else to note here. The warnings that need a look are in their own sections.` exactly;
  - (d) Clean with zero warnings and (e) Clean with warnings that are ALL ignored: the line equals `Nothing needs a look on this sheet.` exactly.
  For (c), (d), (e): the element is a `<p>` carrying `text-sm text-text-subtle`, with no `hidden` attribute, no inline `display:none`, no hiding class, and no ancestor inside the panel carrying any of those.
- [ ] **Step 3: Implement** the `visibleWarningRows` call in the body and the four-row branch reading `routedWarnings` from context. The staged path keeps its existing binary branch and its `No parse warnings for this sheet.` copy verbatim.
- [ ] **Step 4: Run, confirm Task 1 and Task 2 still pass, commit** `feat(admin): published warnings panel lists info rows only`

**Anti-tautology:** an ignored row counted as active is the specific defect fixture (e) exists to catch; a correct testid rendering wrong copy is what the exact-text assertion catches; a visually hidden line is what the attribute and style assertions catch.

---

### Task 6: Retire the published guidance

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`CorrectionLoopCallout` mount at `components/admin/wizard/step3ReviewSections.tsx:2470`; non-blocking line at `components/admin/wizard/step3ReviewSections.tsx:2472`)
- Modify: `tests/components/admin/showpage/sectionWarningControls.test.tsx:424` (invert the callout assertion)

- [ ] **Step 1: Write the failing absence test** (spec §12 test 7). Assert the published mount's rendered text contains neither the loop sentence nor the non-blocking sentence, both as FROZEN literals written in the test, anywhere in the modal. Scope the loop-sentence assertion to exclude popover bodies, where Task 7 deliberately puts it. Absence is asserted by rendered text, never by testid, because a survivor with a renamed testid is still visible to the operator.
- [ ] **Step 2: Gate both mounts on the gate being false.**
- [ ] **Step 3: Update `sectionWarningControls.test.tsx:424`** from presence to absence, and note the disposition in the commit body.
- [ ] **Step 4: Run, commit** `feat(admin): retire the published panel-level warning guidance`

---

### Task 7: The loop sentence moves into the card popover

**Files:**
- Modify: `components/admin/CorrectionLoopCallout.tsx` (export `correctionLoopCopy`, currently module-private at `components/admin/CorrectionLoopCallout.tsx:26`)
- Modify: `components/admin/PerShowActionableWarnings.tsx` (new optional `followUpCopy`; compose at `components/admin/PerShowActionableWarnings.tsx:172`)
- Modify: `components/admin/showpage/sectionWarningExtras.tsx` (pass it at both mounts, `components/admin/showpage/sectionWarningExtras.tsx:101` and `components/admin/showpage/sectionWarningExtras.tsx:146`)
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/components/admin/warningCardFollowUp.test.tsx`

```ts
// PerShowActionableWarnings: normalize both inputs by ONE rule, per spec §4.3.
const pick = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
const popoverBody = [pick(context), pick(followUpCopy)].filter((s): s is string => s !== null);
```

- [ ] **Step 1: Write the failing composition tests** (spec §12 test 6):
  - (a) for EVERY member of `WARNING_CARD_COPY_CODES`, a published card's popover text equals that code's `triggerContext` followed by the loop sentence, in that order, exactly. Iterating all 40 is what excludes an implementation that appends the follow-up only where sampled;
  - (b) staged mount: popover equals `triggerContext` alone;
  - (c) uncataloged code with follow-up: a trigger renders carrying the follow-up alone;
  - (d) neither input: no trigger;
  - (e) normalization table, per input independently: `undefined`, `null`, `""`, a space run, a tab, and a newline all behave as ABSENT; U+00A0 behaves as PRESENT, because `String.prototype.trim` does not strip it. Pin the real behavior, not an assumed one;
  - (f) the published popover's follow-up substring equals the staged callout's rendered text, which catches a duplicate assembled from concatenated fragments in a way a source scan for a literal cannot.
- [ ] **Step 2: Export `correctionLoopCopy`, add the prop, compose, and wire the extras factory** with `correctionLoopCopy("resync")`. `StagedReviewCard.tsx:521` passes nothing and is not edited.
- [ ] **Step 3: Add the source-scan guard** that `StagedReviewCard`'s mount passes no `followUpCopy` (spec §12 test 8c).
- [ ] **Step 4: Run, confirm Task 2's baseline snapshot still passes unchanged, commit** `feat(admin): move the correction-loop sentence into the warning card popover`

**Anti-tautology:** Task 2's snapshot passing unchanged is the assertion that proves staged cards gained nothing; the absence of one exact sentence would not.

---

### Task 8: Info-severity alerts leave the attention surface

**Files:**
- Modify: `lib/admin/attentionItems.ts` (`deriveAttentionItems` at `lib/admin/attentionItems.ts:303`, beside the `PICKER_EPOCH_RESET` clause at `lib/admin/attentionItems.ts:316`)
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/admin/attentionExclusionSet.test.ts`
- Modify: `tests/admin/roleFlagsNoticeReclassify.test.ts:18-21` (add the behavioral assertion)

```ts
export function deriveAttentionItems(args: {
  alerts: AttentionAlertInput[];
  feed: { entries: FeedEntry[] } | null;
  slug: string;
  /** Test seam (spec §5). Production callers pass nothing. */
  excludedCodes?: readonly string[];
}): AttentionItem[] {
  const excluded = new Set(args.excludedCodes ?? DOUG_EXCLUDED_CODES);
  // ... existing hold derivation unchanged ...
  const alertItems = args.alerts
    .filter((row) => row.code !== "PICKER_EPOCH_RESET" && !excluded.has(row.code))
    .map((row) => toAlertItem(row, args.slug));
  // ... existing ordering unchanged ...
}
```

- [ ] **Step 1: Write the failing tests** (spec §12 tests 11 and 12):
  - (a) call `deriveAttentionItems` twice with TWO DIFFERENT synthetic exclusion sets, each holding a different arbitrary routed code, asserting each call drops exactly its own set's member and retains the other's. Two disjoint sets cannot be absorbed into a hand-list;
  - (b) with the default set, every `ATTENTION_ROUTES` code that is neither a `DOUG_EXCLUDED_CODES` member nor `PICKER_EPOCH_RESET` SURVIVES derivation;
  - (c) the live-set loop: one synthetic row per `DOUG_EXCLUDED_CODES` member, asserting an empty result;
  - (d) explicit rows for `ROLE_FLAGS_NOTICE`, `SHOW_FIRST_PUBLISHED`, `SHOW_UNPUBLISHED`, `LIVE_ROW_CONFLICT`: first two absent, last two present.
- [ ] **Step 2: Implement the filter and the seam.**
- [ ] **Step 3: Extend `roleFlagsNoticeReclassify.test.ts`** with the behavioral assertion, so it proves the exclusion rather than proving the set contains a string.
- [ ] **Step 4: Run, confirm `tests/admin/_metaAttentionRoutes.test.ts` still passes** (no route row is deleted, so set-equality holds), **commit** `feat(admin): exclude info-severity alerts from the show modal attention surface`

**Anti-tautology:** (b) is what catches an over-broad filter dropping routes it should keep; (a) is what distinguishes set-driven code from a two-member slice, which neither a source scan nor a live-set loop can do today.

---

### Task 9: Bell inclusion through the rendered panel

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/components/admin/bellRetainsCutCodes.test.tsx`

- [ ] **Step 1: Render `BellPanel` against a mocked feed response** carrying `SHOW_FIRST_PUBLISHED` and `ROLE_FLAGS_NOTICE`, and assert both appear as BELL ENTRIES, located by the entry element's own testid or role and asserted one per code. Text presence anywhere in the panel is insufficient: the panel could echo a title in non-entry markup while filtering the real entry.
- [ ] **Step 2: Add the source-scan guard** that neither `components/admin/BellPanel.tsx` nor `app/api/admin/alerts/bell/feed/route.ts` nor its transitive builder imports `deriveAttentionItems` or `DOUG_EXCLUDED_CODES`. Verified absent at plan time; the guard keeps it that way.
- [ ] **Step 3: Run, commit** `test(admin): pin bell inclusion of the codes cut from the modal`

---

### Task 10: Compound transition and transition audit

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/components/admin/showpage/warningsPanelTransitions.test.tsx`

- [ ] **Step 1: Enumerate every `AnimatePresence`, ternary render, and conditional block** in the touched surfaces and assert each has appropriate `exit` / `initial` / `animate` props or is deliberately instant. Spec §7's inventory, verbatim:

| Pair | Treatment |
| --- | --- |
| List to Silent | instant, no animation needed |
| List to Elsewhere | instant, no animation needed |
| List to Clean | instant, no animation needed |
| Silent to Elsewhere | instant, no animation needed |
| Silent to Clean | instant, no animation needed |
| Elsewhere to Clean | instant, no animation needed |

  Reverse directions: the body-empty trio reverses by un-ignoring a WARN row; the three pairs involving List reverse by un-ignoring an INFO row.

- [ ] **Step 2: Write the compound-transition test** (spec §12 test 10). With the section's `Ignored (N)` disclosure open and the body in Silent, capture the `<details>` DOM node reference, ignore the last active warn row, then assert: the body renders the Clean line, the disclosure's count incremented, it is still open, and the CAPTURED NODE is the same object still in the document. Node identity is the only assertion that excludes a remount; a replacement `<details open>` passes every state assertion.
- [ ] **Step 3: Run, commit** `test(admin): transition audit and compound disclosure transition`

**Anti-tautology:** the failure this catches is a membership change remounting the extras subtree and collapsing an open disclosure mid-interaction, which no state-only assertion can see.

---

### Task 11: Impeccable dual gate

- [ ] **Step 1: Run `/impeccable critique` on the diff**, with the canonical v3 setup gates: the skill's context load (PRODUCT.md + DESIGN.md), then the register reference read.
- [ ] **Step 2: Run `/impeccable audit` on the same diff.**
- [ ] **Step 3: Fix every P0 and P1, or defer explicitly via a `DEFERRED.md` entry.** Record findings and dispositions in this plan's close-out section.
- [ ] **Step 4: Pre-empt the mechanical invariants BEFORE the gate rather than discovering them in it:** em-dash ban in user-visible copy, apostrophe literals, 44px tap targets, canonical type and token classes (`text-xs/relaxed`, `text-subtle`). The two authored sentences in spec §3.4 already comply by construction.

---

### Task 12: Full verification

- [ ] **Step 1: `pnpm typecheck`** (vitest strips types; a green suite is not a green build).
- [ ] **Step 2: `pnpm lint`** (canonical Tailwind class ordering).
- [ ] **Step 3: `pnpm format:check`** (`--no-verify` bypassed prettier on every commit).
- [ ] **Step 4: `pnpm test`** in full, not scoped. A components-only run skips `tests/styles` and `tests/help`, which carry the token-disposition and UI-label crosswalk registries.
- [ ] **Step 5: Confirm the four baseline files from the plan preamble still pass**, and that Task 1's no-loss guard and Task 2's snapshot are both green.
- [ ] **Step 6: Whole-diff cross-model review to APPROVE**, dispatched as tight-scope splits per surface rather than a single whole-diff brief.
- [ ] **Step 7: Push, real CI green, `gh pr merge --merge`, fast-forward local main and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.**
