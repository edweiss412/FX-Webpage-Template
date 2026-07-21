# Warning surface trim (published show modal) — design

**Date:** 2026-07-20
**Status:** Draft for autonomous ship. R1 repaired (11 findings + 1 self-finding).
**Supersedes:** nothing. Narrows three existing render decisions; adds no component, no route, no table.

---

## 1. Summary

Three independent trims to what the show modal shows an operator, all of the same shape: a surface renders something a second time, or renders something that is not a problem.

1. **The published Parse warnings panel lists warn-severity warnings that already render as actionable cards inside their own sections.** The flat copy carries no controls, so the duplicate is also the powerless one. After this change the published panel lists info-severity warnings only.
2. **`CorrectionLoopCallout` states the post-edit loop once, at the bottom of that panel**, which the trim can empty. The sentence moves into the per-warning `?` popover on the published surface, so it exists per warning instead of per panel.
3. **Two info-severity alert codes reach the modal's attention surface** despite an existing, spec-ratified exclusion set that no production code reads. Wiring that set in removes them.

No DB change, no migration, no advisory-lock path, no new route, no catalog edit.

## 1.1 Resolved scope — do not relitigate

Each decision below is ratified. Verify the citation; do not re-derive.

- **The panel keeps the name "Parse warnings"** (`components/admin/wizard/step3ReviewSections.tsx:3855`). A published-only rename was considered and rejected: it splits the rail label between staged and published for a panel whose identity is unchanged. (User decision, 2026-07-20.)
- **The gate is DERIVED from the presence of `renderSectionExtras`, not passed as a boolean and not inferred from `mode`.** See §3.2. R1 finding 4 and self-finding S1 both established that a hand-passed prop cannot reach the two readers at all; the derived form is also the safer one.
- **The card origin discriminator ("from the sheet" / "from the app") is CUT from this spec.** It was scoped, then dropped once change 3 established that nearly every alert remaining in the modal traces to the operator's sheet or Drive, which makes an origin label a distinction without a difference. (User decision, 2026-07-20.)
- **`SHOW_UNPUBLISHED` and `LIVE_ROW_CONFLICT` stay in the modal.** `SHOW_UNPUBLISHED` carries no `severity`, so `DOUG_EXCLUDED_CODES` does not cover it, and pulling it in would mean a catalog severity change with its own cascade through `lib/messages/adminSurface.ts`. `LIVE_ROW_CONFLICT` describes a genuinely broken state. (User decision, 2026-07-20.)
- **Change 3 removes codes from the modal only.** The `admin_alerts` row, the bell entry, and the audit trail are untouched. The bell reads `dougFacing` through its own `rowCopy` (`components/admin/BellPanel.tsx:125`), never through `deriveAttentionItems`, so a filter in the latter cannot reach it. This mirrors the existing `PICKER_EPOCH_RESET` cut (`lib/admin/attentionItems.ts:316`) exactly.
- **`ATTENTION_ROUTES` rows are NOT deleted for the cut codes.** `tests/admin/_metaAttentionRoutes.test.ts:14` requires the route keys to be set-equal to `ADMIN_ALERTS_CODES`. The cut lives in the derivation filter so the rows can stay, again mirroring `PICKER_EPOCH_RESET` (`lib/admin/attentionItems.ts:311-314` states this rule in prose).
- **Every staged surface is byte-identical after this change**, including `StagedReviewCard`'s cards. Every behavior below is published-only, enforced by caller, not by a mode branch inside a leaf. See §4.1.
- **The unmapped-warn ordering wart is accepted, not fixed.** After the trim, `warnings`-bucket extras still render below the panel body inside the same panel (`components/admin/review/ShowReviewSurface.tsx:975` invokes extras after `s.render(data)`). Reordering extras above the body is a separate change to a shared surface used by both mounts. Out of scope. **The panel's own copy must nevertheless stay true in that state** (R1 finding 2); §3.4 is written to that constraint rather than assuming the wart away.
- **No new user-visible error code.** Nothing here adds a `§12.4` row, so no `pnpm gen:spec-codes` run and no `lib/messages/catalog.ts` edit is required.

## 2. Problem

### 2.1 The duplicate list

`warningsBySection` (`lib/admin/step3SectionStatus.ts:84`) routes warnings to sections. Two properties decide everything downstream:

- it drops info-severity entirely (`lib/admin/step3SectionStatus.ts:90`);
- every warn-severity warning lands in a bucket, its mapped section when that section renders, else the `warnings` bucket (`lib/admin/step3SectionStatus.ts:92`).

`buildSectionWarningModel` (`lib/admin/sectionWarningModel.ts:71`) turns that map into the per-section record, and `PublishedReviewModal` hands the resulting `renderSectionExtras` to the surface (`components/admin/showpage/PublishedReviewModal.tsx:252` and `components/admin/showpage/PublishedReviewModal.tsx:737`), which invokes it under every rendered section (`components/admin/review/ShowReviewSurface.tsx:975`).

So on the published surface every warn-severity warning already renders as an actionable card, with Report/Ignore, use-raw, recognize-role, per-code bulk ignore, and the `Ignored (N)` disclosure. The Parse warnings panel then renders the same warning again through `WarningsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:2395`, mounted at `components/admin/wizard/step3ReviewSections.tsx:3865`), read-only: its per-warning controls are gated on `wizardSessionId && dfid`, and no published source carries a wizard session.

**That claim is load-bearing and is treated as a hypothesis to be proven, not an axiom** (R1 finding 1). It rests on a chain with four links: `warningsBySection` assigns every warn row to a bucket; `buildSectionWarningModel` preserves every bucket entry through the active/ignored partition (`lib/admin/sectionWarningModel.ts:86`); the extras factory renders both partitions (`components/admin/showpage/sectionWarningExtras.tsx:96` for active, `components/admin/showpage/sectionWarningExtras.tsx:146` for ignored); and the surface invokes the factory for every rendered section id. §12 test 1 proves the composed chain end to end by identity, not by assumption, and is the gate on the whole change.

Three consequences of the duplication:

1. A warning fixed or ignored in its section still sits in the list below, which reads as the fix not taking.
2. The more final-looking surface is the powerless one.
3. `railCount: (s) => s.warnings.length` (`components/admin/wizard/step3ReviewSections.tsx:3859`) counts rows the operator already passed higher up the page, so the number overstates the remaining work.

The `warnings` bucket makes case 1 sharpest: an unmapped warn warning renders read-only in the panel body and actionable in the extras directly beneath it, inside one panel.

The `§E3` `SectionFlagCallout` preview is already staged-only for exactly this reason, and `components/admin/review/ShowReviewSurface.tsx:924-928` states the rule in prose: in published mode the per-section extras list IS the warning surface, so the preview would be a duplicate affordance. That gate was never extended to `WarningsBreakdown`.

### 2.2 The stranded loop sentence

`CorrectionLoopCallout` renders inside the non-empty branch of the panel (`components/admin/wizard/step3ReviewSections.tsx:2470`) and states, once per surface: `Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.` (`components/admin/CorrectionLoopCallout.tsx:27`).

All 40 `WARNING_CARD_COPY_CODES` already carry per-code inline guidance naming the concrete correction (verified by dumping `helpfulContext` for the full set; for example `DATE_ORDER_SUGGESTS_DMY` ends "Rewrite the dates unambiguously, like 'June 24'"). What the cards do NOT say is what happens after the edit. That is the one thing this sentence adds, and after the trim its host panel can be empty while sections are full of warnings.

The alternative of moving it next to `ReSyncButton` in `StatusStrip` was rejected: it would then be read before the operator has seen anything needing correction.

### 2.3 The zombie exclusion set

`DOUG_EXCLUDED_CODES` (`lib/adminAlerts/audience.ts:34`) is defined as info-severity codes union health codes, and its doc comment says it is the set "excluded from Doug's amber surfaces (banner + bell count)". It is ratified by `docs/superpowers/specs/alerts/2026-07-04-alert-audience-split.md` §3, and `tests/admin/roleFlagsNoticeReclassify.test.ts:18-21` asserts `ROLE_FLAGS_NOTICE` "stays out of Doug's amber banner via the info-severity arm of `DOUG_EXCLUDED_CODES`".

It has zero production consumers. Only two test files import it. The amber banner it governed was `PerShowAlertSection`, which the attention surface replaced, and the exclusion silently stopped applying.

`fetchPerShowAlerts` filters `HEALTH_CODES` only (`lib/adminAlerts/fetchPerShowAlerts.ts:103-104`), so the info-severity arm never runs. Two info-severity codes carry `ATTENTION_ROUTES` rows and therefore reach the modal today: `ROLE_FLAGS_NOTICE` (`lib/admin/attentionItems.ts:99`, routes to `crew`) and `SHOW_FIRST_PUBLISHED` (`lib/admin/attentionItems.ts:121`, routes to `overview`). Both are `resolution: "manual"`, so each demands a Resolve click to clear a notice reporting that an operator action succeeded.

## 3. Change 1: the published panel lists info-severity only

### 3.1 Behavior

| Surface | Panel body before | Panel body after |
| --- | --- | --- |
| Wizard (staged) | all warnings, both severities, with controls | unchanged |
| Published modal | all warnings, both severities, read-only | info-severity only, read-only |

Warn-severity warnings do not disappear from the published modal. They render, with more capability than before, as the section extras that already exist. §12 test 1 proves it.

### 3.2 The gate

The trim is enabled by one derived boolean, `routedWarningsRenderElsewhere`, computed inside `ShowReviewSurface` as `renderSectionExtras !== undefined`.

It is NOT a prop passed from `PublishedReviewModal`, and it cannot be: `WarningsBreakdown` is mounted by the section registry (`components/admin/wizard/step3ReviewSections.tsx:3865`) through `render: (s) => ...`, whose only argument is `SectionData`, and its sibling `railCount` has the same shape (`components/admin/wizard/step3ReviewSections.tsx:3099`). There is no channel from the modal to the registry render other than `SectionData` itself. It is also NOT derived from `mode` (`components/admin/wizard/step3ReviewSections.tsx:2398`) or from `isPublished(d)` (`components/admin/review/sectionData.ts:172`).

Deriving it inside the surface makes the gate the precondition itself rather than a caller's assertion about the precondition. `ShowReviewSurface` holds `renderSectionExtras` in scope at both points that need the value: the chrome context provider (`components/admin/review/ShowReviewSurface.tsx:909`) and the rail-count call (`components/admin/review/ShowReviewSurface.tsx:795`).

**Distribution to the two readers:**

1. **Panel body.** The boolean joins `Step3SectionChromeContext`, which `WarningsBreakdown` already consumes for `parseNotes` (`components/admin/wizard/step3ReviewSections.tsx:2425`). No new prop on the component.
2. **Rail count.** `railCount` widens to `(d: SectionData, opts: { routedWarningsRenderElsewhere: boolean }) => number`. Every existing row ignores the second argument; only the `warnings` row reads it.

**Single predicate.** Both readers call one exported helper, `visibleWarningRows(warnings, routedWarningsRenderElsewhere)`, which returns the rows to render. Neither reader reimplements the filter. This is what makes the §12 test 3 assertion meaningful rather than an agreement between two copies of the same mistake.

**Guard conditions.** `renderSectionExtras` absent (the wizard, and any future mount that omits it): the boolean is `false` and `visibleWarningRows` returns the input unchanged, so the render is byte-identical to today. Present: warn-severity rows are filtered out. `warnings` empty: both branches return an empty array, and §3.4 selects the empty state. There is no third value; the boolean is computed from a presence check, so it cannot be `undefined` at either reader.

A future published mount that omits `renderSectionExtras` therefore keeps listing every warning rather than hiding it, which is the safe direction and needs no maintainer to remember anything.

### 3.3 Rail count

`railCount` for the `warnings` row (`components/admin/wizard/step3ReviewSections.tsx:3859`) returns `visibleWarningRows(d.warnings, opts.routedWarningsRenderElsewhere).length`, the same call the body makes. The count therefore equals the rendered row count by construction rather than by coincidence.

The count deliberately excludes the extras cards rendered beneath the panel. Those belong to the `warnings` bucket, which the rail already signals through `attentionSections` and the per-section dot; counting them in the panel's own row count is the overstatement this change removes.

### 3.4 Empty state

Today the branch is binary (`components/admin/wizard/step3ReviewSections.tsx:2458`): zero warnings renders `No parse warnings for this sheet.`

After the trim the published panel can be body-empty in three materially different situations, and R1 findings 2 and 3 both landed here: the naive "warnings are in their own sections" line is false when the warnings are in the `warnings` bucket rendering directly below, and "need a look" is false when every warn row is already ignored.

The predicate therefore keys on **active** (not-ignored) warn rows, and distinguishes **here** from **elsewhere**. Both facts come from the model `PublishedReviewModal` already built: `buildSectionWarningModel` returns per-section `active` and `ignored` arrays (`lib/admin/sectionWarningModel.ts:111-116`). The modal derives two counts and passes them to `ShowReviewSurface`, which forwards them through the same chrome context as the gate:

- `activeWarnHere` — active items in the `warnings` bucket, which render as extras beneath this panel;
- `activeWarnElsewhere` — active items in every other section.

| Body list | `activeWarnHere` | `activeWarnElsewhere` | Rendered in the body |
| --- | --- | --- | --- |
| non-empty | any | any | the list, nothing else (see §3.5) |
| empty | > 0 | any | nothing. The actionable cards render immediately below; a line above them claiming anything about location would be noise or a lie. |
| empty | 0 | > 0 | the Elsewhere line |
| empty | 0 | 0 | the Clean line |

**Authored copy, final.**

Elsewhere line:

> Nothing else to note here. The warnings that need a look are in their own sections.

Clean line (published only):

> Nothing needs a look on this sheet.

The Clean line replaces `No parse warnings for this sheet.` on the published surface only, because that older wording is false when the sheet has warnings that are all ignored: they are parse warnings, and they still exist in the `Ignored (N)` disclosures. "Nothing needs a look" is true in both the no-warnings and the all-ignored cases, which is exactly the pair this branch cannot distinguish and does not need to. The wizard keeps `No parse warnings for this sheet.` verbatim, where it fires only on a genuinely empty warning array and is exactly right.

Both lines are rendered elements, not conceptual states: a `<p>` in the slot the existing empty-state `<p>` occupies, with its classes (`text-sm text-text-subtle`), each under its own `data-testid` so a test can tell all four rows of the matrix apart. Neither uses the word "below", which is what made the retiring line in §3.5 wrong. No em dash, no apostrophe.

### 3.5 The non-blocking line retires (published only)

`These warnings don't block publishing. Some include an optional fix you can apply below.` (`components/admin/wizard/step3ReviewSections.tsx:2472`) does not render in published mode after this change. Its second sentence points "below" at controls that are no longer below, and its first is already carried per card by `helpfulContext` (`AGENDA_PDF_UNREADABLE`: "Nothing is broken; no action is needed"; `UNKNOWN_FIELD`: "nothing on the crew page is affected"). The wizard keeps it verbatim.

The published `CorrectionLoopCallout` mount (`components/admin/wizard/step3ReviewSections.tsx:2470`) also does not render, per §4. **The published panel body therefore carries no panel-level guidance at all**: the list, or one empty-state line, and nothing else. That is the intended end state, and §12 tests 7a and 7b assert both absences rather than leaving them to inspection.

## 4. Change 2: the loop sentence moves into the card popover

Every warning card already renders a `?` trigger whose body is the code's `triggerContext` (`components/admin/PerShowActionableWarnings.tsx:39-44` selects the fields, `components/admin/PerShowActionableWarnings.tsx:85` destructures them, `components/admin/PerShowActionableWarnings.tsx:172` passes `popoverCopy`). All 40 `WARNING_CARD_COPY_CODES` carry one, pinned by `tests/messages/_metaWarningCardCopy.test.ts`, so the trigger is present on every registered card.

### 4.1 Caller-supplied, so staged is untouched

`PerShowActionableWarnings` has two mounts: the published extras factory (`components/admin/showpage/sectionWarningExtras.tsx:101` and `components/admin/showpage/sectionWarningExtras.tsx:146`) and `StagedReviewCard`. R1 finding 5 is correct that "every warning card" plus "staged unchanged in any respect" cannot both hold if the leaf hardcodes the sentence.

So the leaf does not hardcode it. `PerShowActionableWarnings` gains one optional input, `followUpCopy?: string`, and appends it to the popover body when present. **The published extras factory is the only caller that passes it.** `StagedReviewCard` passes nothing and renders exactly as today, byte for byte.

The staged wizard keeps its panel-level `CorrectionLoopCallout` because `RescanSheetButton` sits on that surface and its panel is still the sole actionable site there. Only the published mount of the callout is dropped.

### 4.2 The sentence is not re-authored

`components/admin/CorrectionLoopCallout.tsx:26` already holds it behind `correctionLoopCopy(mode)`, and that module's header states single-source copy as an explicit contract: "one template string parameterized by a verb map, NOT two independently-authored literals". So `correctionLoopCopy` is exported and the extras factory calls it with `"resync"`, giving the exact string the published panel renders today:

> Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.

A second literal would violate that contract and let the two drift. Exporting an existing function is the whole mechanism change.

### 4.3 Guard conditions

R1 finding 10 is correct that the trigger-presence rules were underspecified. The popover body is composed from two independent optional strings, and all four combinations are defined:

| `triggerContext` | `followUpCopy` | Popover |
| --- | --- | --- |
| present | present | trigger context, then the follow-up. The published case for all 40 registered codes. |
| present | absent | trigger context alone. Today's behavior, and the staged case. |
| blank or null | present | the follow-up alone. A trigger renders. This is a deliberate widening: an uncataloged code on the published surface now gets a `?` where it previously got none, because there is real content to show. |
| blank or null | absent | no trigger, exactly as today. |

Blank means empty after trim, normalized by the same `nonEmpty` rule `warningCardCopyFields` already applies (`components/admin/PerShowActionableWarnings.tsx:41-43`), extended to the new input so a whitespace-only caller value cannot manufacture an empty popover.

The third row is the only behavior change for an uncataloged code, and §12 test 6c exercises it with a synthetic warning carrying a code absent from the catalog, which is the seam R1 finding 10 asked to be named. No synthetic catalog entry is created.

## 5. Change 3: info-severity alerts leave the attention surface

`deriveAttentionItems` (`lib/admin/attentionItems.ts:303`) gains one filter clause: drop any alert row whose code is in `DOUG_EXCLUDED_CODES`. It sits beside the existing `PICKER_EPOCH_RESET` clause (`lib/admin/attentionItems.ts:316`), which stays separate because that code is not info-severity and its cut has a different rationale.

This is a structural fix, not a three-code list. Any future code that gains `severity: "info"` is excluded automatically, which is what the audience-split spec intended.

### 5.1 What changes

| Code | Route row | Severity | Resolution | After |
| --- | --- | --- | --- | --- |
| `ROLE_FLAGS_NOTICE` | `crew` (`lib/admin/attentionItems.ts:99`) | info | manual | dropped from modal |
| `SHOW_FIRST_PUBLISHED` | `overview` (`lib/admin/attentionItems.ts:121`) | info | manual | dropped from modal |
| `SHOW_UNPUBLISHED` | `overview` (`lib/admin/attentionItems.ts:122`) | none | auto | unchanged |
| `LIVE_ROW_CONFLICT` | `overview` (`lib/admin/attentionItems.ts:112`) | none | manual | unchanged |

The health arm of `DOUG_EXCLUDED_CODES` is already excluded upstream by `fetchPerShowAlerts` (`lib/adminAlerts/fetchPerShowAlerts.ts:103-104`), so adding the whole set is a no-op for those codes rather than a second filter with different semantics. The remaining info-arm members carry no `ATTENTION_ROUTES` row and never reach the modal, so they are unaffected either way.

### 5.2 The data-gaps digest

`SHOW_FIRST_PUBLISHED` is the sole carrier of the publish-time data-gaps digest (`lib/admin/attentionItems.ts:278`), which reports how many rows were dropped at publish. Dropping the code from the modal does not destroy that information: the alert row persists and the bell renders it. No rehoming work is required, and none is in scope.

### 5.3 Counts

Of the 45 `ADMIN_ALERTS_CODES`, 25 are `audience: "health"` and excluded at fetch. Of the 20 remaining, `PICKER_EPOCH_RESET` is already cut in derivation, leaving 19 reachable in the modal today. This change removes 2, leaving 17.

## 6. Dimensional Invariants

None. This change adds no fixed-height or fixed-width parent and no new flex or grid parent-child relationship. Every element it touches is a block-flow child of an existing panel (`flex flex-col gap-3`) whose height is content-driven: the filtered `<ul>` reuses the current list container and classes, and each empty-state line is a `<p>` in the slot the existing empty-state `<p>` occupies, with the same classes. No `getBoundingClientRect` assertion is warranted, because there is no parent whose dimension a child must match.

The one dimensional risk worth naming is negative: nothing may introduce a fixed height on the Parse warnings panel to "hold its place" when the list shortens. The panel is content-height today and stays content-height.

## 7. Transition Inventory

The published panel body has four states after this change, one per row of the §3.4 matrix: **List**, **Silent** (body-empty with active warnings in the `warnings` bucket below), **Elsewhere**, **Clean**. That is 4 states and 6 unordered pairs.

| Pair | Treatment |
| --- | --- |
| List to Silent | instant, no animation needed |
| List to Elsewhere | instant, no animation needed |
| List to Clean | instant, no animation needed |
| Silent to Elsewhere | instant, no animation needed |
| Silent to Clean | instant, no animation needed |
| Elsewhere to Clean | instant, no animation needed |

Every pair is instant for one shared reason: each is reachable only through a server round trip (re-sync, ignore, bulk ignore, un-ignore), which re-renders the panel wholesale from new props. No client-side state transitions between these states, so there is no moment at which two of them are simultaneously present to animate between.

**Compound transitions.** The panel's only animated descendant is the `Ignored (N)` disclosure in the extras beneath it, a native `<details>` whose chevron is the sole animated property (`components/admin/showpage/sectionWarningExtras.tsx:140-142`, `transition-transform group-open:rotate-90`, body instant). The body and the extras are siblings with independent render paths, so a body state change while the disclosure is open or mid-rotation cannot interrupt it: the disclosure is not remounted by a body text change, and no shared key or `AnimatePresence` spans the two. The interesting compound case is real and testable, because un-ignoring the last active warning moves the body from Silent to Clean while the disclosure directly below is open; §12 test 10 exercises it. No `AnimatePresence` is added or removed by this change.

The `?` popover in change 2 is an existing component with existing transition coverage (`tests/components/admin/compactAlertCompoundTransitions.test.tsx`); its body content changes, not its mount behavior or its animation.

## 8. Flag lifecycle

| Field | Storage | Write paths | Read paths | Effect on output |
| --- | --- | --- | --- | --- |
| `routedWarningsRenderElsewhere` | none. Derived in `ShowReviewSurface` as `renderSectionExtras !== undefined` | `PublishedReviewModal` passing `renderSectionExtras` (`components/admin/showpage/PublishedReviewModal.tsx:737`); the wizard passing none | `Step3SectionChromeContext` consumer in `WarningsBreakdown`; the `warnings` row's `railCount` closure. Both via `visibleWarningRows` | when `true`, panel body and rail count both drop warn-severity rows; when `false`, both render exactly as today |
| `activeWarnHere` / `activeWarnElsewhere` | none. Derived in `PublishedReviewModal` from the `bySection` model (`lib/admin/sectionWarningModel.ts:111-116`) | the same modal, alongside `renderSectionExtras` | the §3.4 empty-state branch in `WarningsBreakdown`, via the same context | selects which of the three body-empty rows renders |
| `followUpCopy` | none. A React prop | the published extras factory only (`components/admin/showpage/sectionWarningExtras.tsx`), value `correctionLoopCopy("resync")` | `PerShowActionableWarnings` popover composition | appends the loop sentence to the popover body; absent for `StagedReviewCard`, which is unchanged |

No column is empty, so none of the three is a zombie flag.

## 9. Tier and domain completeness matrix

| Layer | Action |
| --- | --- |
| Table DDL | N/A. No table is added or altered. |
| Inline CHECK | N/A. No constraint changes. |
| RPC read path | N/A. No RPC is added or called differently. |
| RPC write path | N/A. |
| Propagation trigger | N/A. |
| Cleanup function | N/A. |
| Advisory lock topology | N/A. This change touches no `pg_advisory` path and mutates nothing. |
| Message catalog `§12.4` | N/A. No code is added, removed, or re-worded. `DOUG_EXCLUDED_CODES` is derived from existing `severity` fields, which are unchanged. |
| Mutation surface observability | N/A. No mutating route, no server action, no new admin surface. Nothing is added to `AUDITABLE_MUTATIONS`. |
| Supabase call boundary | N/A. No new Supabase client call. `fetchPerShowAlerts` is read but not edited. |
| Frontend | Changes 1, 2, 3 as specified. |
| Tests | §12. |

## 10. Empirical grounding

This spec's subject is render selection: which already-fetched rows a component lists. It involves no component lifecycle race, no optimistic state, no close or navigation race, no cross-surface concurrency, and no undocumented framework behavior, so the mandatory pre-draft spike rule does not apply.

What it did require was live-code verification, which was run before drafting rather than described. The transcript covers all 16 claim clusters and is attached to the review dispatch. Three findings changed the design rather than confirming it:

1. `warningsBySection` routes unmapped warn warnings to the `warnings` bucket, which means the published panel double-renders them within one panel and that the trim resolves to "info-severity only" rather than "drop what is mapped elsewhere".
2. `DOUG_EXCLUDED_CODES` has zero production consumers, which reframed change 3 from a new policy decision into a regression repair with a ratified mechanism already in the tree.
3. The registry's `render` and `railCount` receive only `SectionData`, which killed the first draft's caller-passed prop and produced the derived gate in §3.2.

The 40-code `helpfulContext` corpus in §2.2 was likewise read in full, not sampled, before concluding that the cards state the correction and omit the follow-up.

## 11. Meta-test inventory

**Creates one:** a fails-by-default assertion that no `DOUG_EXCLUDED_CODES` member survives `deriveAttentionItems`. It iterates the live set rather than a hand-listed pair, so a future info-severity code that gains an `ATTENTION_ROUTES` row fails CI instead of silently reappearing in the modal. This is the structural defense the audience-split intent lacked, and per the structural-defense calibration rule it ships in the first commit that touches the class, not after a recurrence.

**Creates a second:** a no-loss assertion for the published warning surface. For a fixture spanning mapped, unmapped, active, and ignored warn rows, the union of warning identities rendered by the panel body and by the extras equals the input set exactly, with no identity appearing twice. This pins the §2.1 chain structurally rather than per-instance, and it is the defense against the class R1 finding 1 named: it fails if a future change drops a bucket, suppresses a partition, or stops rendering a section.

**Extends one:** `tests/admin/roleFlagsNoticeReclassify.test.ts:18-21` currently asserts set membership as a proxy for behavior. It gains a behavioral assertion that the code is absent from derived items, so the test proves the exclusion instead of proving the set contains a string.

**Does not touch:** `tests/admin/_metaAttentionRoutes.test.ts` (route keys stay set-equal because no row is deleted); `tests/messages/_metaWarningCardCopy.test.ts` (no catalog field changes); `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutation surface added); `tests/auth/_metaInfraContract.test.ts` (no Supabase call site added).

## 12. Test plan

Each entry names the failure mode it catches. Expected values derive from fixture composition, never from a hardcoded literal a wrong implementation could also satisfy. Fixtures use asymmetric severity counts (for example 3 info, 5 warn) so a filter that keeps the wrong arm cannot coincidentally produce the right cardinality.

1. **No warning is lost (the gate on the whole change).** Fixture spanning all four quadrants: warn mapped to a section, warn unmapped (the `warnings` bucket), plus an ignored member of each. Render the full published mount. Assert by warning identity, not count, that the union of the panel body and the extras subtree equals the input set, that no identity appears twice, and that every active warn identity in the extras carries its Report/Ignore control. Catches: a dropped model entry, a suppressed fallback bucket, an unrendered section, or controls lost in the move. This is the structural no-loss meta-test from §11.
2. **Published panel body lists no warn-severity row.** Same fixture. Assert the body's rendered identities equal exactly the fixture's info-severity identities. Catches: a filter that drops the wrong arm, or that only drops mapped warnings and leaves the `warnings` bucket duplicating inside one panel.
3. **Wizard is unchanged.** Same fixture through the staged mount. Assert the body's rendered identities equal the full input set, and that the `CorrectionLoopCallout` and the non-blocking line are both present. Asserting identities, not presence, is the point: presence alone would pass if the wizard silently dropped a row. Catches: the gate leaking into staged mode, which would hide warnings on the surface that has no other render site.
4. **Rail count is independently correct in both modes.** Derive the expected value from the fixture's severity composition, separately per mode, and assert `railCount` equals it. Then, as a second assertion, assert it equals the rendered row count. The first assertion is what prevents the tautology R1 finding 9 names: two readers sharing one wrong filter would agree with each other but not with the fixture.
5. **All four empty-state rows are distinguishable.** One fixture per §3.4 row. Assert the expected testid renders and the other three do not, including the Silent row rendering none of them while the extras below are non-empty. Catches: the panel claiming the sheet is clean while sections are flagged, and the two lies R1 findings 2 and 3 identified.
6. **Popover composition, all four guard rows.** (a) trigger plus follow-up on a registered code; (b) trigger alone on the staged mount; (c) follow-up alone on a synthetic warning whose code is absent from the catalog, asserting a trigger now renders; (d) neither, asserting no trigger. Assert the composed body text, not merely that a trigger exists. Catches: a composition that drops one side, and each guard boundary in §4.3.
7. **The two published removals are asserted absent.** (a) no `correction-loop-callout` testid anywhere in the published mount; (b) no non-blocking-line testid in the published mount. Catches: an implementation that adds the popover sentence without removing either duplicate, which R1 finding 7 correctly noted every other test would tolerate.
8. **Staged cards are byte-identical.** Render `StagedReviewCard` before and after conceptually by asserting its popover bodies contain no follow-up sentence and that it passes no `followUpCopy`. Catches: the leaf hardcoding the sentence, which is the failure mode §4.1 exists to prevent.
9. **Extraction is scoped.** The assertions in 2 and 5 query within the panel body container and exclude the extras subtree, which independently renders warning titles. Without this scoping a test could pass by reading the very cards the trim relies on. Test 1 deliberately queries both and is the only test that may.
10. **Compound transition.** With the `Ignored (N)` disclosure open, un-ignore the last active warn row and assert the body moves Silent to Clean while the disclosure remains open and mounted. Catches: a body state change remounting the extras subtree and collapsing an open disclosure mid-interaction.
11. **No `DOUG_EXCLUDED_CODES` member survives derivation.** Feed one synthetic alert row per set member through `deriveAttentionItems`; assert an empty result. Catches: the §2.3 regression class recurring for any future code. This is the §11 meta-test.
12. **The two named codes are absent, the two retained codes are present.** Explicit rows for `ROLE_FLAGS_NOTICE`, `SHOW_FIRST_PUBLISHED`, `SHOW_UNPUBLISHED`, `LIVE_ROW_CONFLICT`. Catches: an over-broad filter removing the retained pair.
13. **The bell path is structurally independent of the cut.** Assert that `components/admin/BellPanel.tsx` does not import `deriveAttentionItems`, and that the bell's own entry-construction path yields entries for both cut codes given rows carrying them. R1 finding 6 correctly rejected the earlier `rowCopy`-resolves-a-title assertion: it proves nothing about inclusion. Catches: a cut implemented in a shared path that reaches the bell.

## 13. Out of scope

- The card origin discriminator (see §1.1).
- Reordering `warnings`-bucket extras above the panel body (see §1.1). §3.4's Silent row exists precisely so the copy stays true while the wart remains.
- Any change to `SHOW_UNPUBLISHED` severity or to `LIVE_ROW_CONFLICT` (see §1.1).
- Rehoming the data-gaps digest (see §5.2).
- The staged wizard's warning surface, and `StagedReviewCard`, in any respect.
