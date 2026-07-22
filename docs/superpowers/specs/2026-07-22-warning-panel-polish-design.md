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

### §3.1 Changes 1+3 — structured popover follow-up (`afterBodyText`)

**Today.** `PerShowActionableWarnings` joins the catalog `triggerContext` and the follow-up sentence with a single space into one string (`components/admin/PerShowActionableWarnings.tsx:147-148`) because `HoverHelp` renders its body as one text run. That string flows through `CompactAlertHelp`'s `popoverCopy` prop (`components/admin/compactAlertHelp.tsx:93`) into `buildHelpPopoverBody` (`compactAlertHelp.tsx:64-82`) and lands in `HoverHelp`'s `children`, rendered inside `<div id={descId}>` (`components/admin/HoverHelp.tsx:254`). The trigger's description is `aria-describedby: learnMore ? descId : bodyId` (`HoverHelp.tsx:181`) — with no `learnMore` (these cards pass `helpHref: null`, `PerShowActionableWarnings.tsx:247`), the description is the whole popover, so the follow-up sentence enters every card's spoken description.

**Change.** One additive prop, three call-site edits:

- `HoverHelp` gains optional `afterBodyText?: string`. **Deliberately a string, not ReactNode:** the popover keeps `role="tooltip"` when no `learnMore` exists (`HoverHelp.tsx:244`), and a `ReactNode` slot would let a caller place interactive content inside a tooltip with no `aria-controls` disclosure relationship (`HoverHelp.tsx:181-182` adds `aria-controls` only with `learnMore`) — an accessibility-invalid state the narrower type makes unrepresentable. When present (non-empty after trim) it renders as `<p className="mt-2">{afterBodyText}</p>` inside the popover `div`, immediately after `<div id={descId}>{children}</div>` and before the `learnMore` link (matching the link's existing `mt-2` offset at `HoverHelp.tsx:269`). The describedby rule at `HoverHelp.tsx:181` extends to `learnMore || afterBodyText ? descId : bodyId` — same narrowing rationale as the existing `learnMore` branch comment (`HoverHelp.tsx:179-180`): supplementary content is excluded from the description. Callers passing neither prop see byte-identical DOM and identical describedby resolution (today's `descId` div wraps all describable content, so `descId` vs `bodyId` text is identical for them — no behavior change).
- `CompactAlertHelp` gains optional `followUpCopy?: string | null`; when non-empty it forwards `afterBodyText={followUpCopy}` to `HoverHelp`. `buildHelpPopoverBody` is unchanged (follow-up is not part of the body).
- `PerShowActionableWarnings` stops joining: `popoverBody` reverts to `context` alone; the trimmed `followUp` (same `w.sourceCell` gate as today, `PerShowActionableWarnings.tsx:136-139`) is passed as `followUpCopy`. The comment block at `PerShowActionableWarnings.tsx:140-146` (space-join rationale) is replaced — its premise ("a real break would mean changing the SHARED popover body") is retired by the additive prop.

**Guard conditions.** `followUpCopy` absent / null / empty / whitespace → no `afterBodyText`, describedby stays `bodyId` — byte-identical to today's no-followUp cards. `context` null with `followUp` present: today's join renders the followUp as the body; under this change the body is the followUp-free `context = null` → `buildHelpPopoverBody` returns null → **no trigger at all**. That is a real (rare) regression vector, so the call site guards it: when `context` is null and `followUp` is non-null, pass the followUp as `popoverCopy` (body) and no `afterBodyText` — preserving today's rendered content exactly. (Today both codes with a `sourceCell`-gated followUp carry a non-null `triggerContext`, but the guard is stated per the guard-conditions rule, not left to data luck.)

**Popover paragraph count:** exactly 2 maximum (body + follow-up). No cap table needed — the follow-up is a single fixed sentence from `correctionLoopCopy("resync")` (`components/admin/showpage/sectionWarningExtras.tsx:199`).

### §3.2 Change 2 — panel live region

**Today.** Ignoring or un-ignoring a row round-trips through the server (`router.refresh()` at `components/admin/DataQualityWarningControls.tsx:56`) and the panel re-renders with nothing announced. Precedent for the fix: the always-mounted sr-only `role="status"` sibling in `components/admin/BulkIgnoreControls.tsx:173-177`.

**Change.** The published Parse-warnings panel body (the `WarningsBreakdown` render in `components/admin/wizard/step3ReviewSections.tsx`, a `"use client"` file) mounts ONE always-present sr-only `<span role="status">` when the trim gate is on (`routedWarningsRenderElsewhere === true` — published-only per §1.1 item 7; the staged DOM is unchanged).

**The sentence must change on every transition an ignore/un-ignore can cause, so it is a pure function of the full count tuple `(rows.length, here, elsewhere)`** — not of `rows.length` alone (a routed warn row's ignore never changes `rows.length`, because published rows are info-only per `lib/admin/visibleWarningRows.ts:18-24`). Builder: concatenate the applicable parts, space-separated, never empty —

- `rows.length > 0` → `"{n} warning(s) listed."`
- `here > 0` → `"{n} warning(s) need a look below."`
- `elsewhere > 0` → `"{n} warning(s) need a look in their own sections."`
- all three zero → `"Nothing needs a look on this sheet."`

Distinct count tuples produce distinct text, so ANY ignore/un-ignore that changes any bucket (info row listed here, warn card below, warn card in another section) changes the text and announces. The Silent state announces its card count rather than going empty — an earlier draft emitted `""` there, which made the un-ignore transition clean→Silent announce nothing; and a `here > 0` panel with `parseNotes` still shows its card (`ShowReviewSurface.tsx:265-269` suppresses only when notes are absent), so a non-empty sentence is also the honest description. `role="status"` (implicit polite) announces only when the text CHANGES after mount; initial mount announces nothing. The span is a sibling rendered above the existing state branches, always mounted across all states (conditional mounting drops the announcement — the `BulkIgnoreControls.tsx:173-174` comment is the citation of record).

**Guard conditions.** Gate off → span absent (staged byte-identity). All-ignored vs no-warnings both land in the clean sentence — the same pair the visible copy deliberately does not distinguish (`step3ReviewSections.tsx:2572-2573`). Singular/plural per count part at n=1.

### §3.3 Change 4 — Silent-state seam

**Today.** The section-extras container always renders `mt-3 border-t border-border pt-3` (`components/admin/showpage/sectionWarningExtras.tsx:218`). In the Silent state the section suppresses its body card (`suppressPanelCard`, `step3ReviewSections.tsx:708-715`), so the heading sits directly above the extras and the `border-t` reads as a heading underline (DEFERRED audit P3, 2026-07-21).

**Change.** The suppression fact is `suppressWarningsPanelCard`, computed in `ShowReviewSurface` (`components/admin/review/ShowReviewSurface.tsx:265-269`) — and the extras callback is INVOKED in that same component, at `ShowReviewSurface.tsx:1076` (`renderSectionExtras?.(s.id, data)`), even though the factory is built in `PublishedReviewModal` (`components/admin/showpage/PublishedReviewModal.tsx:258-261`). So no context threading and no factory argument: the callback signature (`ShowReviewSurface.tsx:192`, and the factory's return type in `sectionWarningExtras.tsx:143`) gains an optional third parameter `opts?: { seamless?: boolean }`, and the `ShowReviewSurface.tsx:1076` call site passes `{ seamless: s.id === "warnings" && suppressWarningsPanelCard }`. Inside `renderSectionExtras`, `seamless === true` drops `border-t border-border pt-3` (and the `mt-3`) from the container at `sectionWarningExtras.tsx:218`; every other invocation renders the container classes byte-identically. The staged wizard passes no `renderSectionExtras` at all (`ShowReviewSurface.tsx:196`) — untouched.

**Scope of the seam drop.** `suppressWarningsPanelCard` is true only for the `warnings` section, only when its body renders nothing (no listed rows, no `parseNotes` — the `ShowReviewSurface.tsx:257-264` no-drop guard keeps the card when notes exist) and `here > 0`. Consequences the tests pin (§8.4): a `here`-with-`parseNotes` panel keeps card AND seam; in a mixed here+elsewhere sheet only the warnings-section extras go seamless — other sections' extras (Crew etc.) keep their seam because their section body cards render.

### §3.4 Change 5 — callout actionability gate

**Today.** With the trim gate on, the callout renders only when some LISTED row carries a `sourceCell` (`step3ReviewSections.tsx:2620-2622`). The panel's listable info-severity universe is exactly two codes: `DAY_RESTRICTION_DOUBLE_LOCATION` (`lib/parser/personalization.ts:71-77`) — actionable, its catalog copy asks the operator to "Remove the duplicate" (`lib/messages/catalog.ts:1213-1217`) — and `TYPO_NORMALIZED` (`lib/parser/blocks/venue.ts:134-141`) — non-actionable, the parser already fixed it. **Neither code ever carries a `sourceCell`:** anchors attach only to `OPERATOR_ACTIONABLE_ANCHORED` codes (`lib/parser/dataGaps.ts:370-391`; attach gate at `lib/sync/attachWarningAnchors.ts:30`), and both info codes are absent from that set. So the published callout's current gate can NEVER fire — the R2 `sourceCell` conjunct, added against cell-less asset/Drive rows, silently turned the callout off for the info rows the earlier P0 repair added it back FOR. (The DEFERRED re-gate P3 entry describing the callout as rendering for a `TYPO_NORMALIZED`-only sheet reflects the pre-R2 diff.)

**Change.** The published branch's gate is REPLACED, not extended. A minimal decision map in `lib/admin/` (new module or co-located with `visibleWarningRows`): `INFO_CODE_ACTIONABILITY: Readonly<Record<string, "actionable" | "not-actionable">> = { DAY_RESTRICTION_DOUBLE_LOCATION: "actionable", TYPO_NORMALIZED: "not-actionable" }` — a total decision per known info code, so the deliberate negative for `TYPO_NORMALIZED` is representable — plus `infoRowInvitesCorrection(w): boolean` (true iff `INFO_CODE_ACTIONABILITY[w.code] === "actionable"`). The gate at `step3ReviewSections.tsx:2620` becomes: when `routedWarningsRenderElsewhere` is false → render unconditionally (wizard branch, byte-identical); when true → render iff `rows.some(infoRowInvitesCorrection)`. The `sourceCell` conjunct is retired on this branch: published rows are info-only (`visibleWarningRows.ts:22-23`), so the asset/Drive cell-less codes R2 guarded against (warn-severity) can never be listed here, and `DAY_RESTRICTION_DOUBLE_LOCATION`'s fix IS a sheet-cell edit (its `dougFacing` copy directs one) even though the row is unanchored.

**Behavior delta stated honestly:** today the published callout never renders; after this change it renders exactly when an actionable info row is listed. `TYPO_NORMALIZED`-only sheets stay callout-free (the owner's ask); `DAY_RESTRICTION_DOUBLE_LOCATION` sheets gain the callout (the P0 repair's original intent, restored).

**Map maintenance contract (structural defense, ships in this bundle).** A NEW info-severity `ParseWarning` code must decide its actionability at introduction. The registry test follows the established completeness-scan pattern of `tests/parser/dataGapsClassCompleteness.test.ts` (`tests/parser/dataGapsClassCompleteness.test.ts:5-23` documents why producer tracing is intractable and code-literal scanning is the mechanism; `tests/parser/dataGapsClassCompleteness.test.ts:164-199` the scan): scan code literals across `lib/parser/**` AND `lib/sync/**` for `severity: "info"` emissions, assert the discovered code set EQUALS the map's key set. A new emitter without a map decision fails the test.

### §3.5 Change 6 — pointer sentence names its sections

**Today.** The elsewhere state renders a fixed sentence naming nothing (`step3ReviewSections.tsx:2564-2570`). The data to name the sections already exists: `RoutedWarnings.activeWarningsBySection` (`lib/admin/routedWarnings.ts:41-54`) carries the ACTIVE warn rows per section; its non-`"warnings"` keys are exactly the sections the sentence should name. Section display labels and order come from the `step3Sections` registry the surface already renders from; scroll targeting exists (`ShowReviewSurface` scrolls via `scroller.scrollTo` with `sectionTopFor`, `components/admin/review/ShowReviewSurface.tsx:455`; section elements are registered per id at `ShowReviewSurface.tsx:992-994`).

**Change.** In the elsewhere state only, the sentence becomes: `"Nothing else to note here. The warnings that need a look are in "` followed by inline section-name buttons — each **bolded** (`font-semibold text-text-strong`), rendered as a `<button type="button">`, separated by commas with a final "and", ending with a period. **Tap-target floor WITHOUT line inflation:** an actual 44px inline box would enlarge the paragraph's line box, so the buttons use the pseudo-element hit-area pattern `HoverHelp` already documents for exactly this constraint (`HoverHelp.tsx:200-205`; the `compactTrigger` branch at `HoverHelp.tsx:211`): `relative` text-sized button + `before:absolute before:inset-x-0 before:-inset-y-3 before:content-['']` overlay reaching the 44px floor with zero layout inflation. Tap scrolls to that section via a new `onJumpToSection?: (id: SectionId) => void` callback threaded through the existing `Step3SectionChromeContext` chrome object (the same vehicle that already carries `parseNotes` and `routedWarnings`, `step3ReviewSections.tsx:2513-2518`); `ShowReviewSurface` supplies its existing `handleNavClick` (`ShowReviewSurface.tsx:441` — already invoked with a section id by the "+N more" affordance at `ShowReviewSurface.tsx:478`). Owner picked mockup Option A + click-to-scroll (2026-07-21).

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

None. No fixed-height/width parent gains flex/grid children. The inline section-name buttons keep text-height boxes with a pseudo-element hit overlay (§3.5 — no 44px layout box inside the flowing `<p>`); the popover keeps its existing `w-72 max-w-[80vw]` scroll container (`HoverHelp.tsx:248`), unchanged.

## §7 Numeric literals (single source)

- **2** — max paragraphs in a warning-card popover (§3.1).
- **3** — pointer-sentence section-name cap (§3.5); named constant at the builder.
- **44px** — tap-target floor for the inline section buttons, met via the `before:` overlay (§3.5), per DESIGN.md.
- **2** — info-severity codes in today's panel universe: `DAY_RESTRICTION_DOUBLE_LOCATION`, `TYPO_NORMALIZED` (§3.4); pinned by the §3.4 registry test, not by prose elsewhere in this spec.

## §8 Test plan

TDD per task (invariant 1). Concrete failure modes each test catches:

1. **Popover structure (changes 1+3).** RTL render of a card with both context and followUp: assert the followUp text is NOT inside the element `aria-describedby` resolves to, IS inside the popover body container, and the describedby element contains the context. Catches: followUp re-entering descriptions; followUp dropped from the popover. Guard case: context-null + followUp-present renders the followUp as body (trigger still exists). Regression case: a no-followUp card's trigger `aria-describedby` resolution and popover DOM are unchanged (structural equality against the pre-change shape, not a snapshot of the whole card).
2. **HoverHelp `afterBodyText` contract.** Unit: absent `afterBodyText` + absent `learnMore` → describedby = bodyId (today's behavior, pinned); present `afterBodyText` → describedby = descId and the after-body paragraph renders outside the descId div; empty/whitespace `afterBodyText` behaves as absent. Catches: shared-component regression for the app's other popovers.
3. **Live region (change 2).** RTL: gate ON, render at a count tuple, re-render varying EACH bucket independently — `rows.length` change, `here` change (routed warn card ignored below), `elsewhere` change (routed warn card ignored in another section) — each produces a text change (jsdom asserts text content, not announcement — real announcement behavior is the pattern's contract per `BulkIgnoreControls.tsx:173-177`). Re-rendering with changed props IS the production path: `router.refresh()` (`DataQualityWarningControls.tsx:56`) delivers new server props to the same mounted tree. Always-mounted and non-empty across all states including Silent; clean state reads the clean sentence; un-ignore clean→Silent transition changes text (the `""`-in-Silent bug this spec's first draft had). Gate OFF → absent entirely. Singular/plural boundary at n=1 per part.
4. **Seam (change 4).** RTL matrix: Silent state warnings-section extras container carries no `border-t`/`pt-3`/`mt-3`; List state byte-identical classes (assert exact class string); `here`-with-`parseNotes` state keeps card AND seam; mixed here+elsewhere: warnings-section extras seamless while another section's extras (e.g. crew) keep the seam in the same render. Catches: seam dropped in the wrong state or the wrong section.
5. **Callout gate (change 5).** Matrix over LISTED rows (published rows are info-only — a warn row can never be listed, so no warn-row case exists on this branch): {only TYPO_NORMALIZED} → no callout; {only DAY_RESTRICTION_DOUBLE_LOCATION} → callout; {both} → callout; {none listed} → no callout (empty-state branches, callout unreachable); wizard (gate off) with only TYPO_NORMALIZED → callout renders (staged contract unchanged). Anti-tautology: fixtures built from real emitter shapes (severity and fields copied from the `lib/parser` emitters, including ABSENT `sourceCell`, not hand-tagged), assertions target `data-testid="correction-loop-callout"` (`CorrectionLoopCallout.tsx:44`), not a container that also renders per-card popover copy. Plus the registry test (§3.4): code-literal scan across `lib/parser/**` AND `lib/sync/**` per the `dataGapsClassCompleteness` pattern; discovered set equals `INFO_CODE_ACTIONABILITY` key set.
6. **Pointer links (change 6).** RTL with chrome callback spy: 2 sections → sentence names both in registry order, buttons fire callback with the right `SectionId`; 1 section → single name, no comma/"and"; 3 sections → all three named, NO "more" suffix (cap boundary); 4 sections → first 3 + "and 1 more" (first overflow); partial label-lookup miss → missing id skipped, counted in "N more"; ALL labels miss → today's exact fallback sentence; callback absent → no buttons, bold text only. Real-browser (Playwright, existing published-modal e2e harness): FIRST assert the target section's container is NOT at the aligned scroll position (pre-click guard so "becomes visible" cannot pass vacuously), then tap, then assert the container reaches the aligned position (`getBoundingClientRect` delta within tolerance), using the harness's hydration gate (`waitForRowHydration`-class), never `networkidle` alone; detach-safe locators.
7. **Staged byte-identity.** The card baseline suite (`tests/components/admin/stagedCardBaseline.test.tsx:6-22` — snapshots only `PerShowActionableWarnings` card `<li>`s) is NECESSARY but not sufficient for this bundle's claim; the contract is proven by targeted gate-off ABSENCE assertions per change: gate off → no `role="status"` span (change 2), extras callback never invoked so no seam variant reachable (change 4 — the staged wizard passes no `renderSectionExtras`, `ShowReviewSurface.tsx:196`), callout renders unconditionally in the `rows.length > 0` branch (change 5), pointer sentence is the elsewhere-state branch which is gate-on-only (change 6, `step3ReviewSections.tsx:2558-2570`). Plus: existing suites (`tests/components/admin/showpage/sectionWarningControls.test.tsx`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`) pass unchanged except where a test pins copy this spec changes (each such edit enumerated in the plan, per-file).
8. **Tap target.** Real-browser (same Playwright spec as item 6): for each inline section button, assert the effective hit area spans ≥44px vertically — click at the button's visual center ±21px vertical offset still triggers the callback target (or assert the before-pseudo-element overlay box via `getBoundingClientRect` on the button plus computed style). A jsdom class assertion is only the mechanical-gate backstop, not the proof.

Meta-test inventory (writing-plans rule): this bundle EXTENDS the code-literal completeness-scan registry pattern of `tests/parser/dataGapsClassCompleteness.test.ts` (new test, §3.4/§8.5). It does not touch Supabase call boundaries, sentinel hiding, admin-alert catalogs, advisory locks, or email normalization — no existing registry rows change. Mutation-surface observability (invariant 10): no new mutation surfaces (render-only diff); the static-discovery meta-test needs no new rows.

## §9 DEFERRED.md graduation

The same PR updates `DEFERRED.md`: the seven resolved items move to resolved/graduated form per the repo's existing convention (see the SHAREHUB precedent commits `5e6c2776a` / `36e33c342` — graduate resolved entries rather than deleting), each citing this spec. The six stay-parked items get their entries updated only where this session's decisions sharpened the un-defer trigger (e.g. the crew-banner entry records the 2026-07-21 owner decision to accept bell-only).

## §10 Flag lifecycle

No new boolean config fields. The one new optional callback (`onJumpToSection`) and the two new optional props (`afterBodyText`, `followUpCopy`) are wired end-to-end in this PR (storage: none — props; write: named call sites; read: named components; effect: §3.1/§3.5) — no zombie surface.
