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
- **The gate is the CONJUNCTION of two present preconditions (`routedWarnings` and `renderSectionExtras`), not a hand-passed boolean and not inferred from `mode`.** See §3.2. R1 finding 4 and self-finding S1 established that a prop cannot reach the registry readers at all; R2a finding 1 established that resting the gate on one optional while the copy reads another lets the two desync.
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

The trim is enabled by one value that carries its own preconditions, `routedWarnings`:

```
type RoutedWarnings = { here: number; elsewhere: number };
```

`PublishedReviewModal` derives it from the model it already builds (`lib/admin/sectionWarningModel.ts:111-116` gives per-section `active` and `ignored` arrays): `here` counts active items in the `warnings` bucket, `elsewhere` counts active items in every other section. It passes the object to `ShowReviewSurface` alongside `renderSectionExtras`. The wizard passes neither.

**The gate is the conjunction of both preconditions:**

```
const routedWarningsRenderElsewhere =
  routedWarnings !== undefined && renderSectionExtras !== undefined;
```

R2a finding 1 is the reason the two are conjoined rather than the gate resting on `renderSectionExtras` alone. Deriving the gate from one input while the empty-state copy reads a second, independently-optional input lets the two desync: a mount could enable the trim while supplying no counts, so warn rows would vanish and the copy selecting between §3.4's body-empty rows would have nothing to read. Requiring both makes "the trim is on" and "the counts exist" the same fact. `routedWarnings` is therefore never `undefined` at any reader that runs, and §3.4's predicates are total over the non-negative integers.

Both directions of partial configuration fail safe: extras without counts, or counts without extras, leave the gate `false`, and `false` means today's render.

**Why the value is passed rather than computed in the surface.** The counts require the ignored-fingerprint partition, which is server-derived and lives only in the modal's model; `ShowReviewSurface` cannot compute them. What the surface must NOT do is infer the gate from `mode` (`components/admin/wizard/step3ReviewSections.tsx:2398`) or from `isPublished(d)` (`components/admin/review/sectionData.ts:172`), because neither implies a warning renders anywhere else.

**Why it cannot be a prop on `WarningsBreakdown`.** That component is mounted by the section registry (`components/admin/wizard/step3ReviewSections.tsx:3865`) through `render: (s) => ...`, whose only argument is `SectionData`, and its sibling `railCount` has the same shape (`components/admin/wizard/step3ReviewSections.tsx:3099`). There is no channel from the modal to the registry render other than `SectionData` itself. `ShowReviewSurface` is the one place that holds both the modal's props and the registry's call sites: the chrome context provider (`components/admin/review/ShowReviewSurface.tsx:909`) and the rail-count call (`components/admin/review/ShowReviewSurface.tsx:795`).

**Distribution to the three readers:**

1. **Panel body list.** The gate joins `Step3SectionChromeContext`, which `WarningsBreakdown` already consumes for `parseNotes` (`components/admin/wizard/step3ReviewSections.tsx:2425`). No new prop on the component.
2. **Panel body empty state.** `routedWarnings` joins the same context, read only when the gate is on.
3. **Rail count.** `railCount` widens to `(d: SectionData, opts: { routedWarningsRenderElsewhere: boolean }) => number`. Every existing row ignores the second argument; only the `warnings` row reads it.

**Single predicate.** Readers 1 and 3 call one exported helper, `visibleWarningRows(warnings, routedWarningsRenderElsewhere)`, which returns the rows to render. Neither reimplements the filter, so §12 test 4's equality assertion cannot be satisfied by two copies of the same mistake.

**Guard conditions.** Gate `false` (the wizard, and any partially configured mount): `visibleWarningRows` returns its input unchanged and the empty-state branch keeps today's binary form, so the render is byte-identical to today. Gate `true`: warn-severity rows are filtered out and §3.4's four-row matrix selects the body. `warnings` empty: both branches return an empty array. `here` and `elsewhere` are non-negative integers by construction (array lengths), never negative and never fractional.

### 3.3 Rail count

`railCount` for the `warnings` row (`components/admin/wizard/step3ReviewSections.tsx:3859`) returns `visibleWarningRows(d.warnings, opts.routedWarningsRenderElsewhere).length`, the same call the body makes. The count therefore equals the rendered row count by construction rather than by coincidence.

The count deliberately excludes the extras cards rendered beneath the panel. Those belong to the `warnings` bucket, which the rail already signals through `attentionSections` and the per-section dot; counting them in the panel's own row count is the overstatement this change removes.

### 3.4 Empty state

Today the branch is binary (`components/admin/wizard/step3ReviewSections.tsx:2458`): zero warnings renders `No parse warnings for this sheet.`

After the trim the published panel can be body-empty in three materially different situations. R1 findings 2 and 3 both landed here: the naive "warnings are in their own sections" line is false when the warnings are in the `warnings` bucket rendering directly below, and "need a look" is false when every warn row is already ignored.

The predicate therefore keys on **active** (not-ignored) warn rows, and distinguishes **here** from **elsewhere**, reading `routedWarnings.here` and `routedWarnings.elsewhere` from §3.2. Both are defined whenever the gate is on, which is the same fact, so the matrix is total.

| Body list | `here` | `elsewhere` | State | Rendered in the body |
| --- | --- | --- | --- | --- |
| non-empty | any | any | List | the list, and nothing else (§3.5) |
| empty | > 0 | any | Silent | nothing. The actionable cards render immediately below; a line above them claiming anything about location would be noise or a lie. |
| empty | 0 | > 0 | Elsewhere | the Elsewhere line |
| empty | 0 | 0 | Clean | the Clean line |

Rows are evaluated top to bottom and are mutually exclusive: the first column partitions on list emptiness, and the remaining three rows partition the `(here, elsewhere)` quadrant on `here > 0` then `elsewhere > 0`. No input satisfies two rows.

**Authored copy, final.**

Elsewhere line:

> Nothing else to note here. The warnings that need a look are in their own sections.

Clean line (published only):

> Nothing needs a look on this sheet.

The Clean line replaces `No parse warnings for this sheet.` on the published surface only, because that older wording is false when the sheet has warnings that are all ignored: they are parse warnings, and they still exist in the `Ignored (N)` disclosures. "Nothing needs a look" is true in both the no-warnings and the all-ignored cases, which is exactly the pair this row cannot distinguish and does not need to. The wizard keeps `No parse warnings for this sheet.` verbatim, where it fires only on a genuinely empty warning array and is exactly right.

Both lines are rendered elements, not conceptual states: a `<p>` in the slot the existing empty-state `<p>` occupies, carrying its classes (`text-sm text-text-subtle`), each under its own `data-testid` so a test can tell all four rows apart. Neither uses the word "below", which is what made the retiring line in §3.5 wrong. No em dash, no apostrophe. §12 test 5 asserts the exact sentences, the element type, and the classes, because a testid rendering the wrong copy is a failure this change specifically exists to prevent.

### 3.5 The non-blocking line retires (published only)

`These warnings don't block publishing. Some include an optional fix you can apply below.` (`components/admin/wizard/step3ReviewSections.tsx:2472`) does not render in published mode after this change. Its second sentence points "below" at controls that are no longer below, and its first is already carried per card by `helpfulContext` (`AGENDA_PDF_UNREADABLE`: "Nothing is broken; no action is needed"; `UNKNOWN_FIELD`: "nothing on the crew page is affected"). The wizard keeps it verbatim.

The published `CorrectionLoopCallout` mount (`components/admin/wizard/step3ReviewSections.tsx:2470`) also does not render, per §4.

**The published panel body therefore carries no panel-level guidance in any of its four states.** Its complete content is: the info list (List), or one empty-state line (Elsewhere, Clean), or nothing at all (Silent). R2a finding 4 correctly caught an earlier wording here that described only the first two and silently excluded Silent. §12 tests 7a and 7b assert both retired elements are absent by rendered text, not by testid.

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

R1 finding 10 and R2a finding 2 both landed here. The popover body is composed from two independent optional strings, and the input partition below is over the FULL domain of each: `undefined`, `null`, a blank string, or a non-blank string.

Both inputs are normalized by one rule before composition, the same `nonEmpty` rule `warningCardCopyFields` already applies (`components/admin/PerShowActionableWarnings.tsx:41-43`): trim, then treat an empty result as absent. So `undefined`, `null`, `""`, and `"   "` all collapse to **absent**, and only a string with non-whitespace content is **present**. This is what makes the table below total with two rows per input rather than one row per raw value.

| `triggerContext` | `followUpCopy` | Popover |
| --- | --- | --- |
| present | present | trigger context, then the follow-up, in that order. The published case for all 40 registered codes. |
| present | absent | trigger context alone. Today's behavior, and the staged case. |
| absent | present | the follow-up alone. A trigger renders. This is a deliberate widening: an uncataloged code on the published surface now gets a `?` where it previously got none, because there is real content to show. |
| absent | absent | no trigger, exactly as today. |

The third row is the only behavior change for an uncataloged code. §12 test 6c exercises it with a synthetic warning carrying a code absent from the catalog, which is the seam R1 finding 10 asked to be named; no synthetic catalog entry is created. §12 test 6e exercises whitespace-only `followUpCopy` specifically, because a normalization that missed it would manufacture an empty trigger on every uncataloged card.

Order is part of the contract, not an accident of composition: the trigger context explains when the card appears, and the follow-up explains what to do after acting on it, so the sequence is chronological. §12 test 6a asserts exact ordered text, so a reversed composition fails.

## 5. Change 3: info-severity alerts leave the attention surface

`deriveAttentionItems` (`lib/admin/attentionItems.ts:303`) gains one filter clause: drop any alert row whose code is in `DOUG_EXCLUDED_CODES`. It sits beside the existing `PICKER_EPOCH_RESET` clause (`lib/admin/attentionItems.ts:316`), which stays separate because that code is not info-severity and its cut has a different rationale.

This is a structural fix, not a three-code list. Any future code that gains `severity: "info"` is excluded automatically, which is what the audience-split spec intended.

**Test seam.** `deriveAttentionItems` takes the exclusion set as an optional argument defaulting to `DOUG_EXCLUDED_CODES`. Production callers pass nothing and behave identically; a test passes a synthetic set containing an arbitrary code and asserts that code is dropped. R3b finding 11 is correct that a source scan cannot distinguish set-driven code from an implementation that slices the first two members of the set, and that behavior over the live set cannot either, because only two members currently carry a route. Injection makes the claim provable rather than argued, and is the reason a seam is worth one optional parameter.

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

The published panel body has four states, one per row of the §3.4 matrix: **List**, **Silent** (body-empty with active warn rows in the `warnings` bucket rendering below), **Elsewhere**, **Clean**. That is 4 states and 6 unordered pairs.

| Pair | Reached by | Treatment |
| --- | --- | --- |
| List to Silent | ignoring or fixing the last info row while active warn rows remain here | instant, no animation needed |
| List to Elsewhere | ignoring or fixing the last info row while active warn rows remain elsewhere only | instant, no animation needed |
| List to Clean | ignoring or fixing the last info row with no active warn rows anywhere | instant, no animation needed |
| Silent to Elsewhere | ignoring the last active warn row in the `warnings` bucket while others remain elsewhere | instant, no animation needed |
| Silent to Clean | **ignoring** the last active warn row anywhere | instant, no animation needed |
| Elsewhere to Clean | ignoring the last active warn row in another section | instant, no animation needed |

R2a finding 3 correctly caught the inverse of the fifth row in an earlier draft. Un-ignoring cannot produce Clean: un-ignoring ADDS an active row, so it moves Clean to Silent or Clean to Elsewhere. Ignoring is the direction that empties the active set.

Reverse reachability is real for all six pairs, but by two different actions, which R3a finding 1 and R4a finding 1 together pinned down. The three pairs among Silent, Elsewhere, and Clean reverse by un-ignoring a WARN row, since all three are body-empty states distinguished only by the active warn counts. The three pairs involving List reverse by un-ignoring an INFO row: an un-ignored warn row is filtered out of the published body and so can never produce List, but an un-ignored info row lands in the body and restores it, with the unchanged warn distribution deciding which state List was reached from. Every reverse direction carries the same instant treatment.


Every pair is instant for one shared reason: each is reachable only through a server round trip (re-sync, ignore, bulk ignore, un-ignore), which re-renders the panel wholesale from new props. No client-side state transitions between these states, so there is no moment at which two of them are simultaneously present to animate between.

**Compound transitions.** The panel's only animated descendant is the `Ignored (N)` disclosure in the extras beneath it, a native `<details>` whose chevron is the sole animated property (`components/admin/showpage/sectionWarningExtras.tsx:140-142`, `transition-transform group-open:rotate-90`, body instant).

R2a finding 3's second half is also correct and is not waved away: ignoring the last active warn row does NOT merely change sibling body text, it moves that warning from the extras' active list into its ignored list, so the disclosure's own contents change in the same render. Sibling render paths therefore do not by themselves guarantee the `<details>` instance survives with its open state. What must hold is that the disclosure is not re-keyed or remounted by the membership change, and that is a real risk worth an executable assertion rather than a prose claim. §12 test 10 performs the ignore with the disclosure open and asserts it remains open and mounted with its count incremented. If the assertion fails, the fix belongs to this change, not to a follow-up.

No `AnimatePresence` is added or removed by this change. The `?` popover in change 2 is an existing component with existing transition coverage (`tests/components/admin/compactAlertCompoundTransitions.test.tsx`); its body content changes, not its mount behavior or its animation.

## 8. Flag lifecycle

| Field | Storage | Write paths | Read paths | Effect on output |
| --- | --- | --- | --- | --- |
| `routedWarnings` (`{ here, elsewhere }`) | none. Derived in `PublishedReviewModal` from the `bySection` model (`lib/admin/sectionWarningModel.ts:111-116`) | that modal only, passed to `ShowReviewSurface` alongside `renderSectionExtras` (`components/admin/showpage/PublishedReviewModal.tsx:737`); the wizard passes nothing | `ShowReviewSurface` (to compute the gate); `Step3SectionChromeContext` consumer in `WarningsBreakdown` (to select the §3.4 body-empty row) | its presence is half the gate; its two counts select among Silent, Elsewhere, and Clean |
| `routedWarningsRenderElsewhere` | none. Derived in `ShowReviewSurface` as `routedWarnings !== undefined && renderSectionExtras !== undefined` | not written; computed from the two props above | `Step3SectionChromeContext` consumer in `WarningsBreakdown`; the `warnings` row's `railCount` closure. Both via `visibleWarningRows` | when `true`, panel body and rail count both drop warn-severity rows; when `false`, both render exactly as today |
| `followUpCopy` | none. A React prop | the published extras factory only (`components/admin/showpage/sectionWarningExtras.tsx`), value `correctionLoopCopy("resync")` | `PerShowActionableWarnings` popover composition | appends the loop sentence to the popover body; absent for `StagedReviewCard`, which is unchanged |

No column is empty, so none of the three is a zombie flag. The first two are deliberately coupled: the gate cannot be true without the counts, which is the defect R2a finding 1 identified in the previous draft, where they were independent optionals.

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

**Creates three.**

1. **Set-driven attention exclusion, proven by injection.** `deriveAttentionItems` takes its exclusion set as an optional argument (§5). The meta-test passes a synthetic set and asserts membership drives the drop, then separately asserts the complement: every `ATTENTION_ROUTES` code that is NOT in `DOUG_EXCLUDED_CODES` and is not `PICKER_EPOCH_RESET` survives derivation. R3b findings 11 and 12 are both closed by this pair: injection excludes a hand-list that merely references the set, and the complement assertion excludes a filter that drops routes it should keep.
2. **No warning is lost on the published surface.** For a fixture spanning two mapped sections, the fallback bucket, and ignored members of each: the body-plus-extras identity union equals the input set, no identity appears twice, each identity appears under the section id `warningsBySection` routes it to, in its correct partition, and **the body's rendered row-element count equals the expected identity count**. The count assertion is what closes R3b findings 2 and 9: an identity-based query cannot see a leaked row that carries no identity marker, but a row-element count can.
3. **Bell inclusion through the rendered panel.** `BellPanel` is rendered against a mocked feed response carrying both cut codes, and both entries are asserted present in its output. R3b finding 13 correctly rejected a builder-plus-source-scan pair: the panel can drop codes itself with a predicate importing no forbidden symbol. Rendering the panel is the only assertion that cannot be satisfied that way. The source scan is retained as a cheap second signal, not as the proof.

**Extends one:** `tests/admin/roleFlagsNoticeReclassify.test.ts:18-21` currently asserts set membership as a proxy for behavior. It gains a behavioral assertion that the code is absent from derived items, so the test proves the exclusion instead of proving the set contains a string.

**Does not touch:** `tests/admin/_metaAttentionRoutes.test.ts` (route keys stay set-equal because no row is deleted); `tests/messages/_metaWarningCardCopy.test.ts` (no catalog field changes); `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutation surface added); `tests/auth/_metaInfraContract.test.ts` (no Supabase call site added).

## 12. Test plan

Each entry names the concrete wrong implementation it excludes. Where an exclusion is not fully achievable, the limit is stated rather than implied.

**Shared published fixture** (tests 1, 2, 4, 5a, 7, 9): 3 info-severity rows with distinct titles; 2 active warn rows mapped to two DIFFERENT sections, one of which is `UNKNOWN_ROLE_TOKEN` so a recognize-role control is in scope and one of which is a use-raw-eligible structural code, so no control assertion can pass vacuously (R3b finding 3); 2 active warn rows routing to the fallback `warnings` bucket; 1 ignored warn row mapped to a section; 1 ignored warn row in the bucket. Identity is the `stableWarningKeys` key read from each rendered row root. Expected values are computed from the fixture in the test body; no cardinality is a literal.

**Three extraction modes, always all three.** Identity equality answers "are the right rows here"; a row-ELEMENT count answers "are there any extra rows"; and a `textContent` scan of the body container for every warn row's catalog title, raw `code`, and `message` answers "did anything warn-shaped leak in unmarked". R3b findings 2 and 9 and R4b findings 1, 2, and 9 all reduce to the same point, that a single extraction mode is blind to a leak that avoids its signature. Tests 1, 2, 5, and 9 each carry all three; earlier drafts promised the scan and then omitted it from test 1, which R4b finding 1 correctly caught.

Composed published mount for tests 1, 2, 4, 5, 7, 9, 10: `ShowReviewSurface` + `step3Sections` + `buildSectionWarningModel` + `buildSectionWarningExtras`, the composition `tests/components/admin/showpage/sectionWarningControls.test.tsx` already establishes.

1. **No warning is lost, and each lands in the right place.** Identity union equals input, no duplicates, correct section id per identity, correct active/ignored partition, body row-element count equals expected, and each active warn row carries a Report/Ignore control that is enabled and has an accessible name. Excludes: a fallback container swallowing every warning; a dropped model entry; a suppressed bucket; an unrendered section; controls lost or rendered inert (R3b finding 1). §11 meta-test 2.
2. **The published body lists exactly the info rows.** Body identities equal the fixture's 3 info identities AND the body's row-element count equals 3. Excludes: dropping the wrong severity arm; a vacuous pass (the 3 info rows make one impossible); filtering only mapped warnings; and a warn row leaking in without an identity marker, which the count catches and identity equality alone would not.
3. **The wizard is unchanged in list, controls, copy, and card content.** Staged mount, same fixture. Assert (a) identities equal the FULL input set and the row-element count matches, (b) the `UNKNOWN_ROLE_TOKEN` row renders its recognize-role control and the structural row renders its use-raw control, (c) the non-blocking line's text equals a FROZEN literal written in the test, (d) the callout text equals a FROZEN literal, not `correctionLoopCopy("rescan")`. R3b finding 3 is correct that comparing rendered output to the helper lets a wrong helper and its output change together; freezing the strings in the test is the fix. (e) An inline snapshot of one rendered card's markup, committed in this change, guards card content.
4. **Rail count, independently derived per mode.** Published expected value is the fixture's info-row count; staged expected is the fixture's total; both computed from the fixture definition, never by calling `visibleWarningRows`. Then, separately, each equals its mode's rendered row count. Excludes: the production predicate becoming its own oracle. Stated limit: an implementation hardcoding these two fixture-specific numbers would pass, which no unit test at this level can exclude.
5. **All four §3.4 states, by what each actually renders.** Fixtures: (a) List, with `here > 0` AND rows elsewhere, so a body-empty predicate that wrongly overrides a non-empty list fails; (b) Silent; (c) Elsewhere; (d) Clean with zero warnings; (e) Clean with warnings that are ALL ignored. Assertions differ by state because only two states render a line, which R3b finding 5 correctly caught the previous draft eliding: for (c) and (d)/(e), assert the line's `textContent` equals the §3.4 authored sentence exactly, the element is a `<p>` carrying `text-sm text-text-subtle`, with no `hidden` attribute, no inline `display:none`, no hiding class, and no ancestor inside the panel carrying any of those, and the other state's testid is absent; for (a), assert the list renders and NEITHER line testid is present; for (b), assert the body container's `childNodes` is empty, which covers a raw text node as well as an element (R4b finding 5), while the extras below are non-empty. Excludes: an ignored row counted as active; the right testid with wrong copy, element, or classes; a visually hidden line; a precedence inversion.
6. **Popover composition over the full domain and every registered code.** (a) For EVERY member of `WARNING_CARD_COPY_CODES`, render a published card and assert the popover text equals that code's `triggerContext` followed by the loop sentence, in that order, exactly. R3b finding 6 is correct that one sampled code permits an implementation that appends the follow-up only where tested; iterating all 40 closes it. (b) staged mount: popover equals `triggerContext` alone. (c) uncataloged code with follow-up: a trigger renders carrying the follow-up alone. (d) neither input: no trigger. (e) normalization matrix: for EACH input independently, `undefined`, `null`, `""`, a space run, a tab, a newline, and a non-breaking space are each exercised as a table row. All of them behave as absent, INCLUDING U+00A0: `String.prototype.trim` strips the ECMAScript `WhiteSpace` production, which contains U+00A0. An earlier draft asserted the opposite from memory rather than from a measurement; plan review R1a finding 3 caught it and `node -e` confirmed `"\u00a0".trim().length === 0`. The table pins measured behavior. (f) The published popover's follow-up substring and the staged callout's rendered text are asserted EQUAL to each other, which catches a duplicate assembled from concatenated fragments in a way a source scan for a literal cannot (R3b finding 6).
7. **The two published removals are absent by rendered text.** The published mount's rendered text contains neither the loop sentence nor the non-blocking sentence, both as frozen literals, anywhere in the modal, with the loop-sentence assertion scoped to exclude popover bodies where §4 deliberately puts it. Excludes: a survivor whose testid was removed or renamed.
8. **Staged cards gain nothing, proven against a committed baseline.** (a) An inline snapshot of EVERY card `StagedReviewCard` renders for the shared fixture, **recorded in the plan's first task against unmodified code and committed before any implementation task runs**. R4b finding 8 is correct that a snapshot recorded after the fact blesses whatever the implementation already did; recording it first inverts that, so the snapshot is a genuine before-baseline and any staged change in a later task fails against it. R3b finding 8 is correct that the previous assertions proved only the absence of one exact sentence; a snapshot is the baseline that makes the broader claim real, and creating it now is what the earlier draft lacked. (b) Its popover bodies equal their `triggerContext` values exactly. (c) A source-scan guard that its mount (`components/admin/StagedReviewCard.tsx:521`) passes no `followUpCopy`.
9. **No warn row reaches the body, instrumented or not.** For each active warn identity, assert absence from the body container; AND assert the body's row-element count equals the info count; AND assert the body container's `textContent` contains none of the warn rows' catalog titles. The third assertion is what catches a leak carrying neither identity nor a row-element shape, which R3b finding 9 correctly showed the previous two could not.
10. **Compound transition: ignore with the disclosure open, same node.** Capture the `<details>` DOM node reference while open and the body is Silent. Ignore the last active warn row. Assert the body renders the Clean line, the disclosure's count incremented, it is still open, and **the captured node is the same object still in the document**. R3b finding 10 is correct that a replacement `<details open>` passes every state assertion; node identity is the only assertion that excludes a remount.
11. **Set-driven exclusion, proven by injection, plus the complement.** (a) Call `deriveAttentionItems` twice with TWO DIFFERENT synthetic exclusion sets, each containing a different arbitrary routed code, and assert each call drops exactly its own set's member and retains the other's. R4b finding 11 correctly noted a single static injection can be absorbed into a hand-list; two disjoint sets cannot be, short of reimplementing set membership. (b) With the default set, assert every `ATTENTION_ROUTES` code that is neither a `DOUG_EXCLUDED_CODES` member nor `PICKER_EPOCH_RESET` SURVIVES derivation. (c) Retain the live-set loop as a forward-looking net. Excludes: a two-member slice of the set (a); a filter that drops routes it should keep (b), which R3b finding 12 correctly noted tests 11 and 12 previously permitted. §11 meta-test 1.
12. **Named codes, regression-narrow.** Explicit rows for `ROLE_FLAGS_NOTICE`, `SHOW_FIRST_PUBLISHED`, `SHOW_UNPUBLISHED`, `LIVE_ROW_CONFLICT`; the first two absent, the last two present. It deliberately does not carry the structural claim, which test 11 does.
13. **Bell inclusion through the rendered panel.** Render `BellPanel` against a mocked feed response carrying both cut codes and assert both appear as BELL ENTRIES, located by the entry element's own testid or role and asserted one per code, not merely as text somewhere in the panel (R4b finding 13). Excludes the case R3b finding 13 named, where the panel itself drops the codes with a predicate importing no forbidden symbol, which a builder-level assertion and a source scan both miss. The source scan over `BellPanel`, the feed route, and its transitive builder is retained as a second signal. §11 meta-test 3.

## 12.1 Stated limits of this test plan

R4 review reached the point where each round proposed a more perverse hypothetical implementation than the last: a control with an enabled attribute and a no-op handler, retired copy emitted through CSS generated content, a warn row rendered as an unmarked element carrying neither identity nor row shape nor catalog title nor code nor message. Those are not closable by adding another prose assertion, because the space of perverse implementations is not finite and prose cannot enumerate it.

Per the AGENTS.md three-round cap on a single vector, the test-plan vector is declared closed in prose HERE, and the following limits are stated rather than patched:

- **Handler behavior.** These tests assert a control renders, is enabled, and is named. They do not assert its handler does anything. Control behavior is covered by the existing suites that own those controls, not by this change.
- **Non-DOM rendering paths.** Assertions read the rendered DOM. Copy emitted through CSS generated content, or into a portal outside the queried modal, is out of reach. No production code here uses either.
- **Unmarked leaks.** The three extraction modes cover a leak that carries an identity, a row shape, a title, a code, or a message. An element carrying none of those is not detectable by any assertion that does not simply diff the whole body, which would be a snapshot and would fail on every legitimate copy change.
- **Finite fixtures.** Tests 4, 11, 12, and 13 use fixtures. An implementation that hardcodes exactly those fixtures passes. This is a property of unit testing, not of this plan.

The convergence path from here is executable, not editorial: the tests are the artifact, so writing them is the spike. Anything the prose could not settle is settled by the whole-diff review reading real test code against real implementation code, which is the next gate this change passes through.

## 13. Out of scope

- The card origin discriminator (see §1.1).
- Reordering `warnings`-bucket extras above the panel body (see §1.1). §3.4's Silent row exists precisely so the copy stays true while the wart remains.
- Any change to `SHOW_UNPUBLISHED` severity or to `LIVE_ROW_CONFLICT` (see §1.1).
- Rehoming the data-gaps digest (see §5.2).
- The staged wizard's warning surface, and `StagedReviewCard`, in any respect.
