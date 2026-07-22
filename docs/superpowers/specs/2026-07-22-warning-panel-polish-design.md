# Warning-panel polish bundle — design

**Date:** 2026-07-22
**Status:** Ratified scope (owner decisions 2026-07-21, mockup-reviewed). Autonomous ship approved at the brainstorming gate; user spec/plan review gates waived.
**Predecessor:** `docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md` (#532) and its DEFERRED.md clusters dated 2026-07-21. This spec graduates seven deferred items; it amends nothing in the trim's ratified mechanism sections.

## §1 Problem

The warning-surface-trim ship (#532) parked thirteen findings in `DEFERRED.md` (§"warning-surface-trim (2026-07-21)" and its three sub-clusters). On 2026-07-21 the owner reviewed all thirteen against visual mockups and ratified dispositions: seven become changes (this spec), six stay parked with their existing rationale. Every change below is UI-only: no DB, no migrations, no advisory-lock surface, no new mutation surface.

### §1.1 Resolved scope — do not relitigate

Owner decisions, 2026-07-21 (mockup artifact + AskUserQuestion answers, this session). Reviewers verify the contracts below instead of re-deriving them:

1. **Heading-count suppression stays.** The Silent state renders no `(0)` chip beside the amber pill; the heading count does NOT include the routed-card bucket. Ratified at trim spec §3.3; carve-out shipped in `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:687-694`). Owner re-confirmed 2026-07-21 (picked "Option A, keep as-is").
2. **Panel title stays "Parse warnings"** on both surfaces (trim spec §1.1: a published-only rename splits the rail label for a panel whose identity is unchanged).
3. **`SHOW_FIRST_PUBLISHED` / `ROLE_FLAGS_NOTICE` stay bell-only.** Owner accepted 2026-07-21. Role-flag deltas remain visible on the show modal via the Sheet changes feed rows built in `lib/sync/changeLog/fieldChanges.ts:154-181`; the first-publish data-gaps digest is bell-only by ratified intent (`2026-07-04-alert-audience-split` §3).
4. **The crew-row banner stays dormant** with zero producers; the placement test at `tests/e2e/published-show-attention.spec.ts:126` stays SKIPPED (not deleted) as the contract that un-skips when a crew-routed, non-health, actionable code carrying a `crewName` exists.
5. **Correction advice stays reachable in BOTH the panel callout and the per-card popovers.** Owner picked "keep both" — each site covers a state the other cannot (cards exist without the callout in the Silent state; the callout covers info rows that never become cards).
6. **The staged-snapshot MEDIUM stays parked** (un-defer trigger is a wizard Step-3 composition change, not an owner decision).
7. **The wizard (staged) surface stays byte-identical.** Every change below is gated on the published trim gate (`routedWarningsRenderElsewhere` / the `renderSectionExtras`+`routedWarnings` pair); the staged render path is contractually unchanged, extending the trim's existing gate discipline (`lib/admin/visibleWarningRows.ts:10-15`, `components/admin/wizard/step3ReviewSections.tsx:2515-2527`).

## §2 The seven changes

| # | Change | Surface | Visual delta |
|---|--------|---------|--------------|
| 1 | Popover renders trigger-context and follow-up as two paragraphs | warning cards (published sections) | yes — paragraph break |
| 2 | Always-mounted `role="status"` announces panel state changes | published Parse-warnings panel | none (sr-only) |
| 3 | Follow-up sentence excluded from each card's `aria-describedby` | warning cards | none |
| 4 | Extras seam drops its `border-t` in the Silent state | published section extras | yes — one hairline |
| 5 | Correction-loop callout suppressed when all listed info rows are non-actionable | published panel | yes — callout absence |
| 6 | Pointer sentence names affected sections, bolded + tappable (scroll) | published panel, elsewhere state | yes — inline links |
| 7 | Stale "FULL-array index" comment corrected | comment only | none |

Changes 1 and 3 share one mechanism (§3.1). Changes 2, 5, 6 are published-gate-only (§1.1 item 7). Change 7 is a comment edit shipping in the same commit as whichever task touches that file first.

## §3 Mechanisms

### §3.1 Changes 1+3 — structured popover follow-up (`afterBody`)

**Today.** `PerShowActionableWarnings` joins the catalog `triggerContext` and the follow-up sentence with a single space into one string (`components/admin/PerShowActionableWarnings.tsx:147-148`) because `HoverHelp` renders its body as one text run. That string flows through `CompactAlertHelp`'s `popoverCopy` prop (`components/admin/compactAlertHelp.tsx:93`) into `buildHelpPopoverBody` (`compactAlertHelp.tsx:64-82`) and lands in `HoverHelp`'s `children`, rendered inside `<div id={descId}>` (`components/admin/HoverHelp.tsx:254`). The trigger's description is `aria-describedby: learnMore ? descId : bodyId` (`HoverHelp.tsx:181`) — with no `learnMore` (these cards pass `helpHref: null`, `PerShowActionableWarnings.tsx:247`), the description is the whole popover, so the follow-up sentence enters every card's spoken description.

**Change.** One additive prop, three call-site edits:

- `HoverHelp` gains optional `afterBody?: ReactNode`. When present it renders inside the popover `div`, immediately after `<div id={descId}>{children}</div>` and before the `learnMore` link, styled as a second paragraph (`mt-2` on its wrapper — matching the `learnMore` link's existing `mt-2` offset at `HoverHelp.tsx:269`). The describedby rule at `HoverHelp.tsx:181` extends to `learnMore || afterBody !== undefined ? descId : bodyId` — same narrowing rationale as the existing `learnMore` branch comment (`HoverHelp.tsx:179-180`): supplementary content is excluded from the description. Callers passing neither prop see byte-identical DOM and identical describedby resolution (today's `descId` div wraps all describable content, so `descId` vs `bodyId` text is identical for them — no behavior change).
- `CompactAlertHelp` gains optional `followUpCopy?: string | null`; when non-empty it forwards `afterBody={<p ...>{followUpCopy}</p>}` to `HoverHelp`. `buildHelpPopoverBody` is unchanged (follow-up is not part of the body).
- `PerShowActionableWarnings` stops joining: `popoverBody` reverts to `context` alone; the trimmed `followUp` (same `w.sourceCell` gate as today, `PerShowActionableWarnings.tsx:136-139`) is passed as `followUpCopy`. The comment block at `PerShowActionableWarnings.tsx:140-146` (space-join rationale) is replaced — its premise ("a real break would mean changing the SHARED popover body") is retired by the additive prop.

**Guard conditions.** `followUpCopy` absent / null / empty / whitespace → no `afterBody`, describedby stays `bodyId` — byte-identical to today's no-followUp cards. `context` null with `followUp` present: today's join renders the followUp as the body; under this change the body is the followUp-free `context = null` → `buildHelpPopoverBody` returns null → **no trigger at all**. That is a real (rare) regression vector, so the call site guards it: when `context` is null and `followUp` is non-null, pass the followUp as `popoverCopy` (body) and no `afterBody` — preserving today's rendered content exactly. (Today both codes with a `sourceCell`-gated followUp carry a non-null `triggerContext`, but the guard is stated per the guard-conditions rule, not left to data luck.)

**Popover paragraph count:** exactly 2 maximum (body + follow-up). No cap table needed — the follow-up is a single fixed sentence from `correctionLoopCopy("resync")` (`components/admin/showpage/sectionWarningExtras.tsx:199`).

### §3.2 Change 2 — panel live region

**Today.** Ignoring or un-ignoring a row round-trips through the server (`router.refresh()` at `components/admin/DataQualityWarningControls.tsx:56`) and the panel re-renders with nothing announced. Precedent for the fix: the always-mounted sr-only `role="status"` sibling in `components/admin/BulkIgnoreControls.tsx:173-177`.

**Change.** The published Parse-warnings panel body (the `WarningsBreakdown` render in `components/admin/wizard/step3ReviewSections.tsx`, a `"use client"` file) mounts ONE always-present sr-only `<span role="status">` when the trim gate is on (`routedWarningsRenderElsewhere === true` — published-only per §1.1 item 7; the staged DOM is unchanged). Its text content is the panel's current-state sentence, derived from the same facts the body already branches on (`rows.length`, `here`, `elsewhere` — `step3ReviewSections.tsx:2519-2527`):

- `rows.length > 0` → `"{rows.length} warnings listed."` (singular: `"1 warning listed."`)
- Silent (`here > 0`) → `""` (empty — the cards below are the content; announcing a panel state here would speak over them)
- elsewhere-only → `"No warnings listed here. The warnings that need a look are in their own sections."`
- clean → `"Nothing needs a look on this sheet."`

`role="status"` (implicit `aria-live="polite"`) announces only when the text CHANGES after mount, which is exactly the ignore/un-ignore re-render; initial mount announces nothing. The span is a sibling rendered above the existing state branches, always mounted across all four states (conditional mounting drops the announcement — the `BulkIgnoreControls.tsx:173-174` comment is the citation of record).

**Guard conditions.** Gate off → span absent (staged byte-identity). All-ignored vs no-warnings both land in the clean sentence — the same pair the visible copy deliberately does not distinguish (`step3ReviewSections.tsx:2572-2573`).

### §3.3 Change 4 — Silent-state seam

**Today.** The section-extras container always renders `mt-3 border-t border-border pt-3` (`components/admin/showpage/sectionWarningExtras.tsx:218`). In the Silent state the section suppresses its body card (`suppressPanelCard`, `step3ReviewSections.tsx:708-715`), so the heading sits directly above the extras and the `border-t` reads as a heading underline (DEFERRED audit P3, 2026-07-21).

**Change.** `buildSectionWarningExtras` already receives its args object (`sectionWarningExtras.tsx:137-143`); the render callback it returns receives `(id, d)`. The seam must drop exactly when the section renders no body card. That fact lives in the chrome (`suppressPanelCard`), computed where the callback's output is placed. Mechanism: the extras container's `border-t` classes become conditional on a new optional boolean threaded the same way the crew-filtering fact already is (`renderedCrewKeys`, `sectionWarningExtras.tsx:139-142`) — an options field stating "the section body is suppressed; render seamless." The plan pins the exact threading site after reading the placement code; the contract here is: **Silent state → no `border-t`/`pt-3` seam; all other states → byte-identical container classes.**

### §3.4 Change 5 — callout actionability gate

**Today.** With the trim gate on, the callout renders unless no listed row has a `sourceCell` (`step3ReviewSections.tsx:2620-2622`). The panel's listable info-severity universe is exactly two codes: `DAY_RESTRICTION_DOUBLE_LOCATION` (`lib/parser/personalization.ts:71-77`) — actionable, its catalog copy asks the operator to "Remove the duplicate" (`lib/messages/catalog.ts:1213-1217`) — and `TYPO_NORMALIZED` (`lib/parser/blocks/venue.ts:134-141`) — non-actionable, the parser already fixed it. A sheet whose only listed row is `TYPO_NORMALIZED` still shows "Fixed it in the sheet? …", which asserts nothing false but prompts action where none exists (DEFERRED re-gate P3, reopened by owner 2026-07-21).

**Change.** A minimal exported predicate in `lib/admin/` (new module or co-located with `visibleWarningRows`): `ACTIONABLE_INFO_CODES: ReadonlySet<string> = { "DAY_RESTRICTION_DOUBLE_LOCATION" }` plus `warningInvitesCorrection(w): boolean` — true for `severity === "warn"`, true for info codes in the set, false otherwise. The callout gate at `step3ReviewSections.tsx:2620` becomes: render iff NOT gated-off-by-sourceCell (existing condition) AND `rows.some(warningInvitesCorrection)`. Wizard surface unchanged (the existing condition already short-circuits on `routedWarningsRenderElsewhere === false`; the new conjunct is added inside the published branch only — the plan states the exact boolean so the staged render is untouched).

**Set maintenance contract.** The set is the actionability registry for info codes. A NEW info-severity `ParseWarning` code must decide its membership at introduction; the test suite pins the current universe (a test enumerates all `severity: "info"` emitters in `lib/parser/**` — today exactly the two named codes — and fails when a new one appears without a set decision, comment-anchored the same way existing registry tests are).

### §3.5 Change 6 — pointer sentence names its sections

**Today.** The elsewhere state renders a fixed sentence naming nothing (`step3ReviewSections.tsx:2564-2570`). The data to name the sections already exists: `RoutedWarnings.activeWarningsBySection` (`lib/admin/routedWarnings.ts:41-54`) carries the ACTIVE warn rows per section; its non-`"warnings"` keys are exactly the sections the sentence should name. Section display labels and order come from the `step3Sections` registry the surface already renders from; scroll targeting exists (`ShowReviewSurface` scrolls via `scroller.scrollTo` with `sectionTopFor`, `components/admin/review/ShowReviewSurface.tsx:455`; section elements are registered per id at `ShowReviewSurface.tsx:992-994`).

**Change.** In the elsewhere state only, the sentence becomes: `"Nothing else to note here. The warnings that need a look are in "` followed by inline section-name buttons — each **bolded** (`font-semibold text-text-strong`), rendered as a `<button type="button">` with `min-h-tap-min` (44px floor per the mechanical UI gate; inline-flex so the line does not inflate — the `HoverHelp.tsx:212` / `PerShowActionableWarnings.tsx:190` inline pattern), separated by commas with a final "and", ending with a period. Tap scrolls to that section via a new `onJumpToSection?: (id: SectionId) => void` callback threaded through the existing `Step3SectionChromeContext` chrome object (the same vehicle that already carries `parseNotes` and `routedWarnings`, `step3ReviewSections.tsx:2513-2518`); `ShowReviewSurface` supplies it from its existing scroll helper. Owner picked mockup Option A + click-to-scroll (2026-07-21).

**Ordering and cap.** Sections are ordered by registry (visual) order, not object-key order. **Cap = 3 named sections**; beyond that the sentence ends `", and N more."` where N counts the unnamed remainder (no interaction on the "N more" text). The cap literal 3 appears once, as a named constant next to the sentence builder; the current section registry bounds the possible count at wizard-registry size, but the cap is stated so the sentence is bounded by contract, not by data.

**Guard conditions.** `onJumpToSection` absent (standalone/legacy mounts that pass no chrome, or chrome without the callback) → names render as plain bold text, not buttons (progressive: sentence still informative). Empty `activeWarningsBySection` minus `warnings` while `elsewhere > 0` cannot occur (both derive from the same loop, `routedWarnings.ts:48-55`); the builder still guards: zero derivable names → fall back to today's exact sentence. Label lookup miss for a section id → that id is skipped from naming (counted in "N more" only if others render; all-miss → fallback sentence).

**A11y.** Buttons get discernible names = their visible section label (no aria-label needed). The sentence stays one `<p>`; buttons are inline children.

### §3.6 Change 7 — comment fix

`step3ReviewSections.tsx:2643-2645` says the `data-warning-index` is the "same FULL-array index as the testid"; since the trim, `i` indexes the TRIMMED `rows` (`visibleWarningRows` result, `step3ReviewSections.tsx:2519`). Comment updated to state it indexes the rendered (trimmed) rows and that the only consumer is the staged jump path, which is never gated. No code change.

## §4 Out of scope

Everything in §1.1. Additionally: no change to `HoverHelp`'s open/close/geometry behavior; no change to `buildHelpPopoverBody`'s null contract; no rail-count or heading-count semantics change; no staged-surface DOM change of any kind; no new §12.4 codes, no admin_alert changes, no telemetry surface changes (all touched code paths are render-only — invariant 10 does not attach).

## §5 Transition inventory

New/changed visual states and their transitions — all instant by design; this surface ships no animations today and this bundle adds none:

| Pair | Treatment |
|------|-----------|
| Callout present ↔ suppressed (change 5) | instant — server re-render, matches every existing panel-state change |
| Seam present ↔ absent (change 4) | instant — deliberate; states never transition client-side (Silent is a render-time fact) |
| Pointer sentence plain ↔ linked (change 6, callback presence) | not a runtime transition — mount-time fact |
| Popover one-block ↔ two-block (change 1) | not a runtime transition — content fact |
| Live region text changes (change 2) | instant text swap; sr-only, no visual |

No compound transitions: none of these states animate, and no state can change while another is mid-transition (there are no transitions).

## §6 Dimensional invariants

None. No fixed-height/width parent gains flex/grid children. The inline section-name buttons use `min-h-tap-min` inside a flowing `<p>` (no fixed-dimension parent); the popover keeps its existing `w-72 max-w-[80vw]` scroll container (`HoverHelp.tsx:248`), unchanged.

## §7 Numeric literals (single source)

- **2** — max paragraphs in a warning-card popover (§3.1).
- **3** — pointer-sentence section-name cap (§3.5); named constant at the builder.
- **44px / `min-h-tap-min`** — tap-target floor for the inline section buttons (§3.5), per DESIGN.md.
- **2** — info-severity codes in today's panel universe: `DAY_RESTRICTION_DOUBLE_LOCATION`, `TYPO_NORMALIZED` (§3.4); pinned by the emitter-enumeration test, not by prose elsewhere in this spec.

## §8 Test plan

TDD per task (invariant 1). Concrete failure modes each test catches:

1. **Popover structure (changes 1+3).** RTL render of a card with both context and followUp: assert the followUp text is NOT inside the element `aria-describedby` resolves to, IS inside the popover body container, and the describedby element contains the context. Catches: followUp re-entering descriptions; followUp dropped from the popover. Guard case: context-null + followUp-present renders the followUp as body (trigger still exists). Regression case: a no-followUp card's trigger `aria-describedby` resolution and popover DOM are unchanged (structural equality against the pre-change shape, not a snapshot of the whole card).
2. **HoverHelp `afterBody` contract.** Unit: absent `afterBody` + absent `learnMore` → describedby = bodyId (today's behavior, pinned); present `afterBody` → describedby = descId and `afterBody` renders outside the descId div. Catches: shared-component regression for the app's other popovers.
3. **Live region (change 2).** RTL: gate ON, render panel in list state → `role="status"` present with count sentence; re-render with one fewer row → text changes (jsdom asserts text content, not announcement — real announcement behavior is the pattern's contract per `BulkIgnoreControls.tsx:173-177`). Always-mounted: present-and-empty in the Silent state. Gate OFF → absent entirely (staged byte-identity, asserted via the staged baseline suite in item 7). Singular/plural boundary at N=1.
4. **Seam (change 4).** RTL: Silent state extras container carries no `border-t`; List state container classes byte-identical to today (assert the exact class string). Catches: seam dropped in the wrong state.
5. **Callout gate (change 5).** Matrix over listed rows: {only TYPO_NORMALIZED} → no callout; {only DAY_RESTRICTION_DOUBLE_LOCATION} → callout; {TYPO_NORMALIZED + any warn row} → callout; wizard (gate off) with only TYPO_NORMALIZED → callout unchanged (staged contract). Anti-tautology: fixtures built from real emitter shapes (severity from `lib/parser` emitters, not hand-tagged), assertions target the callout testid, not a container that also renders per-card copy. Plus the emitter-enumeration registry test (§3.4): walks `lib/parser/**` for `severity: "info"` emissions and asserts the found code set equals the set's decision universe.
6. **Pointer links (change 6).** RTL with chrome callback spy: elsewhere state with 2 sections → sentence names both in registry order, buttons fire callback with the right `SectionId`; 5 sections → first 3 named + "and 2 more"; callback absent → no buttons, bold text only; zero derivable names → today's exact fallback sentence. Real-browser (Playwright, existing published-modal e2e harness): tapping a section name scrolls the section into view — assert via the existing section container testid becoming visible in viewport (`getBoundingClientRect` position delta), using the harness's hydration gate (`waitForRowHydration`-class), never `networkidle` alone; detach-safe locators.
7. **Staged byte-identity.** The existing staged baseline suite (`tests/components/admin/stagedCardBaseline.test.tsx`) passes unchanged; ungated assertions in existing suites (`tests/components/admin/showpage/sectionWarningControls.test.tsx`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`) pass unchanged except where a test pins copy this spec changes (each such edit is enumerated in the plan, per-file).
8. **Tap target.** Playwright or jsdom-computed class assertion: inline section buttons carry `min-h-tap-min` (the mechanical-gate greps also cover this pre-code).

Meta-test inventory (writing-plans rule): this bundle EXTENDS the emitter-enumeration registry pattern (new test, §3.4/§8.5). It does not touch Supabase call boundaries, sentinel hiding, admin-alert catalogs, advisory locks, or email normalization — no existing registry rows change. Mutation-surface observability (invariant 10): no new mutation surfaces (render-only diff); the static-discovery meta-test needs no new rows.

## §9 DEFERRED.md graduation

The same PR updates `DEFERRED.md`: the seven resolved items move to resolved/graduated form per the repo's existing convention (see the SHAREHUB precedent commits `5e6c2776a` / `36e33c342` — graduate resolved entries rather than deleting), each citing this spec. The six stay-parked items get their entries updated only where this session's decisions sharpened the un-defer trigger (e.g. the crew-banner entry records the 2026-07-21 owner decision to accept bell-only).

## §10 Flag lifecycle

No new boolean config fields. The one new optional callback (`onJumpToSection`) and the two new optional props (`afterBody`, `followUpCopy`) are wired end-to-end in this PR (storage: none — props; write: named call sites; read: named components; effect: §3.1/§3.5) — no zombie surface.
