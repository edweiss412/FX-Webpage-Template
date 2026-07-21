# Warning surface trim (published show modal) — design

**Date:** 2026-07-20
**Status:** Draft for autonomous ship.
**Supersedes:** nothing. Narrows three existing render decisions; adds no component, no route, no table.

---

## 1. Summary

Three independent trims to what the show modal shows an operator, all of the same shape: a surface renders something a second time, or renders something that is not a problem.

1. **The published Parse warnings panel lists warn-severity warnings that already render as actionable cards inside their own sections.** The flat copy carries no controls, so the duplicate is also the powerless one. After this change the published panel lists info-severity warnings only.
2. **`CorrectionLoopCallout` states the post-edit loop once, at the bottom of that panel**, which the trim can empty. The sentence moves into the per-warning `?` popover, so it exists per warning instead of per panel.
3. **Two info-severity alert codes reach the modal's attention surface** despite an existing, spec-ratified exclusion set that no production code reads. Wiring that set in removes them.

No DB change, no migration, no advisory-lock path, no new route, no catalog edit.

## 1.1 Resolved scope — do not relitigate

Each decision below is ratified. Verify the citation; do not re-derive.

- **The panel keeps the name "Parse warnings"** (`components/admin/wizard/step3ReviewSections.tsx:3855`). A published-only rename was considered and rejected: it splits the rail label between staged and published for a panel whose identity is unchanged. (User decision, 2026-07-20.)
- **The trim gates on an explicit prop, never on `mode`.** `mode: "resync" | "rescan"` (`components/admin/wizard/step3ReviewSections.tsx:2398`) happens to coincide with "section extras are mounted" today because there are exactly two `ShowReviewSurface` mounts, but that is a coincidence, not a contract. See §3.2.
- **The card origin discriminator ("from the sheet" / "from the app") is CUT from this spec.** It was scoped, then dropped once change 3 established that nearly every alert remaining in the modal traces to the operator's sheet or Drive, which makes an origin label a distinction without a difference. (User decision, 2026-07-20.)
- **`SHOW_UNPUBLISHED` and `LIVE_ROW_CONFLICT` stay in the modal.** `SHOW_UNPUBLISHED` carries no `severity`, so `DOUG_EXCLUDED_CODES` does not cover it, and pulling it in would mean a catalog severity change with its own cascade through `lib/messages/adminSurface.ts`. `LIVE_ROW_CONFLICT` describes a genuinely broken state. (User decision, 2026-07-20.)
- **Change 3 removes codes from the modal only.** The `admin_alerts` row, the bell entry, and the audit trail are untouched. The bell reads `dougFacing` through its own `rowCopy` (`components/admin/BellPanel.tsx:125`), never through `deriveAttentionItems`, so a filter in the latter cannot reach it. This mirrors the existing `PICKER_EPOCH_RESET` cut (`lib/admin/attentionItems.ts:316`) exactly.
- **`ATTENTION_ROUTES` rows are NOT deleted for the cut codes.** `tests/admin/_metaAttentionRoutes.test.ts:14` requires the route keys to be set-equal to `ADMIN_ALERTS_CODES`. The cut lives in the derivation filter so the rows can stay, again mirroring `PICKER_EPOCH_RESET` (`lib/admin/attentionItems.ts:311-314` states this rule in prose).
- **The wizard (staged) surface is byte-identical after this change.** Every behavior below is published-only. The wizard keeps its full list, its `CorrectionLoopCallout`, and its non-blocking line, because `RescanSheetButton` sits on that surface and the panel is still its sole actionable site.
- **The unmapped-warn ordering wart is accepted, not fixed.** After the trim, `warnings`-bucket extras still render below the info list inside the same panel (`components/admin/review/ShowReviewSurface.tsx:975` invokes extras after `s.render(data)`). Reordering extras above the body is a separate change to a shared surface used by both mounts. Out of scope.
- **No new user-visible error code.** Nothing here adds a `§12.4` row, so no `pnpm gen:spec-codes` run and no `lib/messages/catalog.ts` edit is required.

## 2. Problem

### 2.1 The duplicate list

`warningsBySection` (`lib/admin/step3SectionStatus.ts:84`) routes warnings to sections. Two properties decide everything downstream:

- it drops info-severity entirely (`lib/admin/step3SectionStatus.ts:90`);
- every warn-severity warning lands in a bucket, its mapped section when that section renders, else the `warnings` bucket (`lib/admin/step3SectionStatus.ts:92`).

`buildSectionWarningModel` (`lib/admin/sectionWarningModel.ts:71`) turns that map into the per-section record, and `PublishedReviewModal` hands the resulting `renderSectionExtras` to the surface (`components/admin/showpage/PublishedReviewModal.tsx:252` and `components/admin/showpage/PublishedReviewModal.tsx:737`), which invokes it under every rendered section (`components/admin/review/ShowReviewSurface.tsx:975`).

So on the published surface **every warn-severity warning already renders as an actionable card**, with Report/Ignore, use-raw, recognize-role, per-code bulk ignore, and the `Ignored (N)` disclosure. The Parse warnings panel then renders the same warning again through `WarningsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:2395`, mounted at `components/admin/wizard/step3ReviewSections.tsx:3865`), read-only: its per-warning controls are gated on `wizardSessionId && dfid`, and no published source carries a wizard session.

Three consequences:

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

It has **zero production consumers**. Only two test files import it. The amber banner it governed was `PerShowAlertSection`, which the attention surface replaced, and the exclusion silently stopped applying.

`fetchPerShowAlerts` filters `HEALTH_CODES` only (`lib/adminAlerts/fetchPerShowAlerts.ts:103-104`), so the info-severity arm never runs. Two info-severity codes carry `ATTENTION_ROUTES` rows and therefore reach the modal today: `ROLE_FLAGS_NOTICE` (`lib/admin/attentionItems.ts:99`, routes to `crew`) and `SHOW_FIRST_PUBLISHED` (`lib/admin/attentionItems.ts:121`, routes to `overview`). Both are `resolution: "manual"`, so each demands a Resolve click to clear a notice reporting that an operator action succeeded.

## 3. Change 1: the published panel lists info-severity only

### 3.1 Behavior

| Surface | Panel body before | Panel body after |
| --- | --- | --- |
| Wizard (staged) | all warnings, both severities, with controls | unchanged |
| Published modal | all warnings, both severities, read-only | info-severity only, read-only |

Warn-severity warnings do not disappear from the published modal. They render, with more capability than before, as the section extras that already exist.

### 3.2 The gate

`WarningsBreakdown` takes a new optional boolean prop, `routedWarningsRenderElsewhere`. `PublishedReviewModal` passes `true` at the registry call site; the wizard passes nothing.

The prop is NOT derived from `mode` and NOT derived from `isPublished(d)` (`components/admin/review/sectionData.ts:172`). There are exactly two `ShowReviewSurface` mounts today, `components/admin/showpage/PublishedReviewModal.tsx:730` and `components/admin/wizard/Step3ReviewModal.tsx:610`, and only the first passes `renderSectionExtras`. A future published mount that omits extras would, under a `mode`-derived gate, hide every warn-severity warning with no surface rendering it. The prop names the actual precondition: something else renders the routed warnings.

**Guard conditions.** Absent or `false`: identical to today's render, both severities listed. `true`: the list filters to `w.severity !== "warn"`. `undefined` is the absent case under `exactOptionalPropertyTypes`; the prop is declared optional and read with an explicit `=== true` comparison so no other value can enable the trim.

### 3.3 Rail count

`railCount` (`components/admin/wizard/step3ReviewSections.tsx:3859`) must count the rows the panel actually renders, or the trim replaces one wrong number with another. It becomes a function of the same filtered list: unchanged where the prop is absent, filtered where it is set. The registry entry reads the same `SectionData` the render does, so the two cannot diverge.

Note the count excludes the extras cards rendered beneath the panel. Those belong to the `warnings` bucket, which the section rail already flags through `attentionSections` and the per-section dot; double-counting them in the panel's own row count is what this change removes.

### 3.4 Empty state

Today the branch is binary (`components/admin/wizard/step3ReviewSections.tsx:2458`): zero warnings renders `No parse warnings for this sheet.` After the trim a third case exists, and it is the one that must not lie.

| Filtered list | Show has warn-severity warnings | Rendered |
| --- | --- | --- |
| non-empty | either | the list (plus the trimmed guidance, §3.5) |
| empty | no | `No parse warnings for this sheet.` (unchanged copy) |
| empty | yes | a line stating that the warnings needing a look are in their own sections |

The third case is a **rendered element**, not a conceptual state: a `<p>` in the same slot and with the same classes as the existing empty line (`text-sm text-text-subtle`), under its own `data-testid`, so a test can distinguish all-clear from everything-is-elsewhere.

Authored copy, final:

> Nothing else to note here. The warnings that need a look are in their own sections.

It does not claim the sheet is clean, and it does not use the word "below", which is what made the retiring line in §3.5 wrong. No em dash, no apostrophe.

### 3.5 The non-blocking line retires (published only)

`These warnings don't block publishing. Some include an optional fix you can apply below.` (`components/admin/wizard/step3ReviewSections.tsx:2472`) does not survive the trim in published mode. Its second sentence points "below" at controls that are no longer below, and its first is already carried per card by `helpfulContext` (`AGENDA_PDF_UNREADABLE`: "Nothing is broken; no action is needed"; `UNKNOWN_FIELD`: "nothing on the crew page is affected"). The wizard keeps it verbatim.

## 4. Change 2: the loop sentence moves into the card popover

Every warning card already renders a `?` trigger whose body is the code's `triggerContext` (`components/admin/PerShowActionableWarnings.tsx:39-44` selects the fields, `components/admin/PerShowActionableWarnings.tsx:85` destructures them, `components/admin/PerShowActionableWarnings.tsx:172` passes `popoverCopy`). All 40 `WARNING_CARD_COPY_CODES` carry one, pinned by `tests/messages/_metaWarningCardCopy.test.ts`, so the trigger is present on every card.

`PerShowActionableWarnings` composes the popover body as the trigger context followed by the correction-loop sentence, instead of the trigger context alone.

**The sentence is not re-authored.** `components/admin/CorrectionLoopCallout.tsx:26` already holds it behind `correctionLoopCopy(mode)`, and that module's header states single-source copy as an explicit contract: "one template string parameterized by a verb map, NOT two independently-authored literals". So `correctionLoopCopy` is exported and called with `"resync"`, giving the exact string the published panel renders today:

> Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.

A second literal in `PerShowActionableWarnings` would violate that contract and let the two drift. Exporting an existing function is the whole mechanism change.

Properties this buys:

- **Per warning, never premature.** The sentence exists only where a warning exists, which is the objection that killed the `StatusStrip` placement.
- **No repetition on screen.** Forty cards can carry it and it is read at most once, on demand.
- **Static UI copy, not catalog copy.** One string in the component, so no `lib/messages/catalog.ts` edit, no `pnpm gen:spec-codes`, no `§12.4` lockstep, and no interaction with the in-flight `feat/alert-popover-context` branch, which authors `helpfulContext` for a disjoint set of alert codes.
- **`buildHelpPopoverBody` is untouched.** Composition happens at the call site, so the shared builder in `components/admin/compactAlertHelp.tsx` keeps its current contract and the sibling branch has zero file overlap.

**Guard conditions.** `triggerContext` null or blank: the popover body is the loop sentence alone, which is still worth a trigger, so the card keeps its `?`. Both absent: unreachable for the 40 registered codes, but the existing null-body path is preserved, and an uncataloged code renders no trigger exactly as today. The sentence names the Re-sync verb, so it is composed only where the re-sync affordance exists; `PerShowActionableWarnings` is mounted from the published extras factory (`components/admin/showpage/sectionWarningExtras.tsx`) and from `StagedReviewCard`, so the sentence is passed in by the caller rather than hardcoded in the leaf.

`CorrectionLoopCallout` itself is unchanged and keeps its wizard mount. Only the published mount is dropped.

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

None. This change adds no fixed-height or fixed-width parent and no new flex or grid parent-child relationship. Every element it touches is a block-flow child of an existing panel (`flex flex-col gap-3`) whose height is content-driven: the filtered `<ul>` reuses the current list container and classes, and the third empty-state line is a `<p>` in the slot the existing empty-state `<p>` occupies, with the same classes. No `getBoundingClientRect` assertion is warranted, because there is no parent whose dimension a child must match.

The one dimensional risk worth naming is negative: nothing may introduce a fixed height on the Parse warnings panel to "hold its place" when the list shortens. The panel is content-height today and stays content-height.

## 7. Transition Inventory

The panel body has three states after this change: **List** (filtered list non-empty), **Clean** (empty, no warnings anywhere), **Elsewhere** (empty, warnings live in sections). That is 3 states and 3 ordered pairs.

| Pair | Treatment |
| --- | --- |
| List to Clean | instant, no animation needed. Reached only by a server round trip (re-sync or ignore-all), which re-renders the panel wholesale; there is no client-side state that animates between them. |
| List to Elsewhere | instant, no animation needed. Same mechanism. |
| Clean to Elsewhere | instant, no animation needed. Same mechanism, and the two states differ only in the text of a single `<p>`. |

**Compound transitions.** The panel's only other animated descendant is the `Ignored (N)` disclosure in the extras beneath it, a native `<details>` whose chevron is the sole animated property (`components/admin/showpage/sectionWarningExtras.tsx:140-142`, `transition-transform group-open:rotate-90`, body instant). The panel body and the extras are siblings with independent render paths, so a body state change while the disclosure is open or mid-rotation cannot interrupt it: the disclosure is not remounted by a body text change, and no shared key or `AnimatePresence` spans the two. No `AnimatePresence` is added or removed by this change.

The `?` popover in change 2 is an existing component with existing transition coverage (`tests/components/admin/compactAlertCompoundTransitions.test.tsx`); its body content changes, not its mount behavior or its animation.

## 8. Flag lifecycle

| Field | Storage | Write paths | Read paths | Effect on output |
| --- | --- | --- | --- | --- |
| `routedWarningsRenderElsewhere` | none, a React prop | `PublishedReviewModal` registry call site, literal `true` | `WarningsBreakdown` body; the `railCount` closure in the section registry | when `true`, the panel's list and its rail count both drop warn-severity rows; when absent, both render exactly as today |

No column is empty, so this is not a zombie flag. It has exactly one writer and two readers, and the two readers must consume the same predicate, pinned by a test asserting the rendered row count equals the rail count on a mixed-severity fixture.

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
| Tests | §11. |

## 10. Empirical grounding

This spec's subject is pure render selection: which already-fetched rows a component lists. It involves no component lifecycle race, no optimistic state, no close or navigation race, no cross-surface concurrency, and no undocumented framework behavior, so the mandatory pre-draft spike rule does not apply.

What it did require was live-code verification, which was run before drafting rather than described. The transcript covers all 16 claim clusters and is attached to the review dispatch. Two findings changed the design rather than confirming it:

1. `warningsBySection` routes unmapped warn warnings to the `warnings` bucket, which means the published panel double-renders them within one panel and that the trim resolves to "info-severity only" rather than "drop what is mapped elsewhere".
2. `DOUG_EXCLUDED_CODES` has zero production consumers, which reframed change 3 from a new policy decision into a regression repair with a ratified mechanism already in the tree.

The 40-code `helpfulContext` corpus in §2.2 was likewise read in full, not sampled, before concluding that the cards state the correction and omit the follow-up.

## 11. Meta-test inventory

**Creates one:** a fails-by-default assertion that no `DOUG_EXCLUDED_CODES` member survives `deriveAttentionItems`. It iterates the live set rather than a hand-listed pair, so a future info-severity code that gains an `ATTENTION_ROUTES` row fails CI instead of silently reappearing in the modal. This is the structural defense the audience-split intent lacked, and per the structural-defense calibration rule it ships in the first commit that touches the class, not after a recurrence.

**Extends one:** `tests/admin/roleFlagsNoticeReclassify.test.ts:18-21` currently asserts set membership as a proxy for behavior. It gains a behavioral assertion that the code is absent from derived items, so the test proves the exclusion instead of proving the set contains a string.

**Does not touch:** `tests/admin/_metaAttentionRoutes.test.ts` (route keys stay set-equal because no row is deleted); `tests/messages/_metaWarningCardCopy.test.ts` (no catalog field changes); `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutation surface added); `tests/auth/_metaInfraContract.test.ts` (no Supabase call site added).

## 12. Test plan

Each entry names the failure mode it catches, per the anti-tautology rule. Expected values derive from fixture composition, never from a hardcoded literal that a wrong implementation could also satisfy.

1. **Published panel lists no warn-severity row.** Fixture: warnings of both severities, at least one mapped to a section and at least one unmapped. Assert the rendered row count equals the fixture's info-severity count computed from the fixture, and that no rendered row carries the `warn` severity label. Catches: a filter that drops the wrong arm, or that only drops mapped warnings and leaves the `warnings` bucket duplicating inside one panel.
2. **Wizard panel is unchanged.** Same fixture through the staged mount. Assert every warning renders and the `CorrectionLoopCallout` and non-blocking line are present. Catches: a gate that leaks into staged mode, which would hide warnings on the surface that has no other render site.
3. **Rail count equals rendered rows.** Both modes, mixed-severity fixture. Assert the registry `railCount` equals the number of rendered list rows. Catches: the two readers of the flag diverging, which is exactly the defect this change exists to remove.
4. **Third empty state is distinguishable.** Fixture with zero info-severity and at least one warn-severity warning. Assert the "elsewhere" testid renders and the all-clear testid does not; and the inverse for a fixture with no warnings at all. Catches: the panel claiming the sheet is clean while sections are flagged.
5. **Extraction is scoped to the panel body.** The assertions in 1 and 4 query within the panel's own container and exclude the extras subtree, which independently renders warning titles. Without this scoping, a test could pass by reading the very cards the trim relies on.
6. **Popover body carries both parts.** Assert the popover contains the trigger context and the loop sentence for a code that has a trigger context, and the loop sentence alone for a code whose trigger context is blank. Catches: a composition that drops one side, and the blank-trigger guard.
7. **No `DOUG_EXCLUDED_CODES` member survives derivation.** Feed one synthetic alert row per set member through `deriveAttentionItems`; assert an empty result. Catches: the regression class in §2.3 recurring for any future code.
8. **The two named codes are absent, the two retained codes are present.** Explicit rows for `ROLE_FLAGS_NOTICE`, `SHOW_FIRST_PUBLISHED`, `SHOW_UNPUBLISHED`, `LIVE_ROW_CONFLICT`. Catches: an over-broad filter removing the retained pair.
9. **Bell copy is unaffected.** Assert `rowCopy` still resolves a title for both cut codes. Catches: a cut implemented in a shared path that reaches the bell.

## 13. Out of scope

- The card origin discriminator (see §1.1).
- Reordering `warnings`-bucket extras above the panel body (see §1.1).
- Any change to `SHOW_UNPUBLISHED` severity or to `LIVE_ROW_CONFLICT` (see §1.1).
- Rehoming the data-gaps digest (see §5.2).
- The staged wizard's warning surface in any respect.
