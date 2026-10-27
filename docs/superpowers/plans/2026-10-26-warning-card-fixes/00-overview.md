# Warning card fixes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Sheet warnings cards show judgment calls as judgment calls, show what we read, reach the cell / section / reservation they talk about in one tap, defer a reading change behind an explicit Save, and resolve the archived pull sheet from its own card.

**Architecture:** Pure pieces land first (parser `readAs`, the venue value-cell anchor, the archived-tab routing key, one display module, the catalog rows). Then the two sheet-icon host rows (wizard title row, the compact card's message row), the published adapters, the reading comparison, Accept wording, the Accepted disclosure, the archived card, and the deferred reading choice (one provider per row over the existing pure derivation). Hotel and section jumps come last, then a census reconciliation after every component edit has landed.

**Tech Stack:** Next.js 16 client components, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + Testing Library (jsdom), Playwright standalone harnesses (esbuild-bundled live entries, Tailwind CLI CSS).

**Spec:** `docs/superpowers/specs/2026-10-26-warning-card-fixes-design.md` (Codex spec review APPROVE, round 3). Executors read both. Section numbers below (§N) are the spec's.

**Branch / worktree:** `feat/warning-card-fixes` at `/Users/ericweiss/FX-worktrees/warning-card-fixes` (invariant 11 satisfied). No ledger entry matches (spec §1.5), so invariant 12 does nothing here.

## Files in this unit

| File | Contents |
|---|---|
| 00-overview.md | this file: constraints, review focus, meta-test inventory, plan-time sweeps, harness readiness, spec ambiguities |
| 01-lib.md | Tasks 1-5: parser, anchors, routing, display module, catalog lockstep |
| 02-chrome.md | Tasks 6-9: sheet icon backdrops, the two host rows (layout-dimensions tasks), wizard row kinds, published adapters |
| 03-accept-archived-reading.md | Tasks 10-15: comparison, Accept wording, Accepted disclosure, archived card, transition audit + deferred choice, mounts |
| 04-jumps-and-finish.md | Tasks 16-21: reservation marker, section jumps, census reconciliation, local verification, cross-model review, the UI quality gate, closeout |
| closeout.md | the closeout record, §12 filled at gate time |

## Global Constraints

- No visible severity word on any wizard card; no em dash in any new user-visible string (spec §11, `tests/styles/_metaEmDashCopy.test.ts`).
- Every new interactive element is ≥ 44px tall by rect (`min-h-tap-min`, `--spacing-tap-min: 44px`, `app/globals.css:224`), except the icon link, whose floor is its host row (§13).
- Copy is verbatim from spec §11; apostrophes follow the host file (Builder's call D7): ASCII `'` in `DataQualityWarningControls.tsx` and `BulkIgnoreControls.tsx`, `&rsquo;` in `UseRawControl.tsx` JSX, `’` in `archivedTabOffer.tsx`. Copy assertions are apostrophe-agnostic (precedent `tests/components/step3SheetCard.test.tsx:491`).
- Named values have one definition (§20): `SHEET_SAYS_CAP = 160`, `WE_READ_NAMES_CAP = 6`, `CASE_PREVIEWS_CAP = 3`, `CASE_PREVIEW_CHARS = 40` in lib/admin/warningReadingDisplay.ts; `ARCHIVED_TAB_INCLUDE_LABEL = "Use this pull sheet"`, `ARCHIVED_TAB_INCLUDE_PENDING = "Including…"` in `components/admin/wizard/archivedTabOffer.tsx`. Tests import these; they never retype them.
- Counts in tests derive from the named sets (`AMBIGUITY_CODES`, `USE_RAW_CODES`, `HOTEL_RESERVATION_JUDGMENT_CODES`), never from literals.
- Invariant 5: no code string renders; `callUseRawAction` returns `"ok" | "failed"`.
- Invariant 10: no new `"use server"` file or export, no new route, no inline server action (spec §10, R10). components/admin/useRawDraft.tsx is `"use client"`. `tests/log/_metaMutationSurfaceObservability.test.ts` is re-run in Task 19 to confirm.
- Invariant 2: each Save runs two existing endpoints one after the other from the client; no lock nests.
- Invariant 1 and 6: one task, one commit, conventional-commit message. **Declared exception:** the line-keyed census suites `tests/styles/_metaTapTargetFloor.test.ts`, `tests/styles/_metaForcedColors.test.ts`, `tests/styles/_metaControlOutlineFill.test.ts`, `tests/styles/_metaControlOutlineResidue.test.ts`, `tests/styles/_metaSubtleOnInteractive.test.ts`, `tests/help/_metaRenderFaultMarking.test.ts` key rows by source LINE, so they go red from the first component task and are re-keyed once, in Task 18, after the last component edit (brief requirement; re-keying earlier would be redone by every later task). Every other suite a task touches is green at that task's commit, including the COUNT-keyed registries, which each task updates in its own commit.
- Heavy phases: any full-suite vitest, non-interactive Playwright, or build runs as `pnpm heavy <cmd>` (outermost only). Scoped vitest with explicit files runs unwrapped.
- New `.tsx` test files never quote the sheet icon's accessible-name phrase verbatim (it is counted repo-wide by `tests/components/admin/sheetIconLinkContainment.test.ts:46`); they assert the `aria-label` CONTAINS the card title.
- New jsdom suites start with `// @vitest-environment jsdom`.
- No file under `docs/superpowers/specs/` dated before 2026-10-26 is edited except the two §9 lockstep files.

## Review Focus

1. **Inline guest names on the warning vs on the reservation.** `readAs.names` is `row.names` at `lib/parser/blocks/hotels.ts:933`; if any later step rewrites the reservation's names, "We read" would show names the Hotels section does not. Pinned in Task 1 by asserting `readAs.names` deep-equals `hotels[blockRef.index].names` on every producing exit, derived from the parse output, never a literal.
2. **A warning persisted before this change** (no `readAs`, no venue `sourceCell`): the card shows no "We read" and stays link-less (L5); `readingShown` must be false for it, so the callout keeps "Review in Sheet warnings". Pinned in Task 4 (`readingShown` row for a legacy inline warning) and Task 16 (callout label case).
3. **A refreshed reading that differs from what this tab sent** (another tab saved in between): the refreshed value wins and nothing resurrects "Not saved yet". Pinned in Task 14 by deferred-response sequences 4, 5 and 13.
4. **An archived tab whose include is pressed in Pack list while the card's own include is pending**: two independent flags; the later POST takes the existing 409 refresh path. Pinned in Task 14's §14.1 re-assertion (compound transition 3: two placements, two POSTs, each observed as its own request) on top of Task 13's row-lock case.
5. **A `blockRef.index` that is `NaN`, negative, non-integer or ≥ the rendered hotel count**: no reservation marker and the card jump falls back to `Go to Hotels`. Pinned in Task 16 (marker) and Task 17 (jump) with one case per bad value.

## Acceptance criteria

Derived from the spec's ratified decisions (§1.1) and its two mandatory inventories; each is claimed by the `ac=` field of the task markers in the task files.

- AC-1 — no wizard card shows a severity word; needs-a-look, judgment and info rows are told apart by chip, dot, tag and sr-only prefix; the published card carries the tag for judgment codes (R1, B2) (discharged by Task 7, Task 8 and Task 9)
- AC-2 — the warning sheet link is the shared icon at the end of the wizard title row and of the compact card message row, on every warning-card surface (R2, R11) (discharged by Task 6, Task 7 and Task 9)
- AC-3 — Venue with no address links the empty value cell when one is uniquely found, else the venue region, and never gets a section jump (R3, R4) (discharged by Task 2 and Task 17)
- AC-4 — the inline hotel guest split shows Sheet says and We read; the reservation carries the tag, a Sheet says line and a jump to its card, and the card jumps back (R5) (discharged by Task 1, Task 4, Task 10 and Task 16)
- AC-5 — judgment rows read Accept; the reading choice waits for Save, Save persists the reading and accepts the card, Cancel restores it, on both surfaces (R6) (discharged by Task 11, Task 14 and Task 15)
- AC-6 — the archived pull sheet card shows tab and case previews, the one `Use this pull sheet` include, keeps Ignore as keep-skipped, jumps to Pack list, and its help names Pack list (R7, R13) (discharged by Task 3, Task 5 and Task 13)
- AC-7 — every staged-wizard warn card whose warning routes to a rendered section gets one Go to jump (R8) (discharged by Task 17)
- AC-8 — accepted judgment rows sit in their own Accepted (N) disclosure on both surfaces; counts and the ignore store are unchanged (R12) (discharged by Task 12)
- AC-9 — the three helpfulContext rows land in all six lockstep places in one commit (spec §9) (discharged by Task 5)
- AC-10 — no new mutation surface; every write reuses a registered action or route (R10) (discharged by Task 19)
- AC-11 — the §13 Dimensional Invariants hold in a real browser and every §14 / §14.1 transition is reached or proven unreachable (discharged by Task 7, Task 9 and Task 14)

## Meta-test inventory

EXTENDS (a registry row or a new case lands in the named task):

- `tests/messages/_metaWarningCardCopy.test.ts` — §9 rows; new case "no `AMBIGUITY_CODES` member's `controlsNote` mentions Ignore" (Task 5).
- `tests/cross-cutting/codes.test.ts` (x1 catalog parity) — exercised by the §9 lockstep (Task 5).
- `tests/components/admin/sheetIconLinkContainment.test.ts` — its render-site counts (`EXPECTED` at `tests/components/admin/sheetIconLinkContainment.test.ts:46`, the builder-token counts at `tests/components/admin/sheetIconLinkContainment.test.ts:1111`, the icon-anchor counts at `tests/components/admin/sheetIconLinkContainment.test.ts:1266`) move with each new `SheetIconLink` call site (Tasks 7, 9).
- `tests/styles/_metaNewTabAnnouncement.test.ts` — three `NewTabHint` text links leave, two `SheetIconLink` sites arrive (Tasks 7, 9).
- `tests/styles/noBareRingOffset.test.ts` — re-run; `BACKDROP_SKIN` registration (`tests/styles/noBareRingOffset.test.ts:28`) covers the two new keys (Task 6).
- `tests/components/admin/attentionMarkParity.test.ts` — re-run; `JudgmentCallTag` routes its ring through `attentionMarkClass("judgment", "sunken")`, so no exemption row (Task 7).
- `tests/ci/_metaSpecRegistration.test.ts` via `tests/e2e/standalone-baseline.json` — every task adding Playwright tests regenerates the baseline (Tasks 7, 9, 13, 15, 16, 17).
- Line-keyed censuses re-keyed in Task 18: `tests/styles/tapTargetCensus.ts`, `tests/styles/forcedColorsCensus.ts`, `tests/styles/controlOutlineScan.ts`, `tests/styles/subtleInteractiveExemptions.ts`, `tests/styles/_metaControlOutlineResidue.test.ts` (its inline `RESIDUE_CENSUS`), `tests/help/_metaRenderFaultMarking.test.ts` (`REPORTED_RESIDUE`).

CREATES: none. No new registry-style meta-test: every new surface reuses an enrolled one.

Not applicable, with reason: Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`) — no new Supabase call (§10). Sentinel hiding (`tests/components/tiles/_metaSentinelHidingContract.test.ts`) — no crew tile changes. Admin-alert catalog — no admin alert. Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no lock surface; each endpoint keeps its own single holder. Email normalization — no email. Mutation-surface registry (`tests/log/_auditableMutations.ts`) — no new surface (R10); exercised, not extended.

## Registry reconciliation (run at plan time)

Measured 2026-10-26 on the branch tip by a throwaway `tsx` script importing each registry.

| Registry | Now | After | Moved by |
|---|---|---|---|
| `LINK_ONLY_ANCHORED` size (`lib/drive/showDayTimeAnchors.ts:65`) | 13 | 14 (`VENUE_ADDRESS_MISSING`) | Task 2 |
| `KIND_TO_SECTION` keys (`lib/admin/step3SectionStatus.ts:28`) | 22 | 23 (`pull_sheet_archived_tab`) | Task 3 |
| `AMBIGUITY_CODES` size | 7 | 7 | none |
| `AMBIGUITY_CODES` members with a `controlsNote` | `[]` | `[]` (new guard keeps it so) | none |
| `EXPECTED_HELPFUL_CONTEXT` keys (`tests/messages/warningCardCopyRegistry.ts`) | 49 | 49 (three values change) | Task 5 |
| `MESSAGE_CATALOG` / `SPEC_CODES` keys | unchanged | unchanged | none (no new code) |
| `USE_RAW_CODES` (today `IN_SCOPE`, `components/admin/UseRawControl.tsx:55`) | 4 | 4, moved to lib/admin/warningReadingDisplay.ts | Task 4 |

## Pre-draft code-verification pass

Run 2026-10-26 on the branch tip (`f9fe5c0ec`), `grep -c -F <symbol> <file>` per row; every count ≥ 1, no MISSING. Abridged to the symbols tasks name:

```
1  lib/parser/ambiguityCodes.ts :: export function isAmbiguityCode
1  components/admin/SheetIconLink.tsx :: export function SheetIconLink
3  components/admin/SheetIconLink.tsx :: BACKDROP_SKIN
1  lib/messages/collapsedSummary.ts :: export function stripEmphasis
1  components/admin/wizard/step3ReviewSections.tsx :: function WarningsBreakdown
1  components/admin/wizard/step3ReviewSections.tsx :: -warning-${i}-open
1  components/admin/wizard/step3ReviewSections.tsx :: function HotelsBreakdown
1  components/admin/wizard/step3ReviewSections.tsx :: function HotelCard
1  components/admin/wizard/step3ReviewSections.tsx :: function SectionFlagCallout
3  components/admin/wizard/step3ReviewSections.tsx :: HOTELS_CAP   (exported, :192)
2  components/admin/review/ShowReviewSurface.tsx :: jumpToRoom
5  components/admin/review/ShowReviewSurface.tsx :: jumpToWarning
13 components/admin/review/ShowReviewSurface.tsx :: handleNavClick
1  components/admin/UseRawControl.tsx :: export function deriveUseRawControlState
2  components/admin/UseRawControl.tsx :: IN_SCOPE
1  components/admin/UseRawControl.tsx :: function ChoiceRow
1  components/admin/DataQualityWarningControls.tsx :: export function DataQualityWarningControls
1  components/admin/BulkIgnoreControls.tsx :: export function BulkIgnoreControls
1  components/admin/CompactAlertCard.tsx :: compact-alert-message
2  components/admin/PerShowActionableWarnings.tsx :: linkOffsetClass
1  components/admin/NoteWarningCard.tsx :: note-warning-sheet-link
4  components/admin/showpage/sectionWarningExtras.tsx :: SectionWarningItemControls
1  components/admin/wizard/archivedTabOffer.tsx :: deriveArchivedOffers
3  components/admin/wizard/archivedTabOffer.tsx :: postPullSheetOverride
1  components/admin/review/PublishedArchivedTabOffer.tsx :: Include this gear
1  lib/admin/step3SectionStatus.ts :: export function sectionForWarning
1  lib/drive/showDayTimeAnchors.ts :: export function attachSourceCellAnchors
2  lib/drive/unknownFieldAnchors.ts :: resolveUnknownFieldCell
1  lib/parser/warnings.ts :: emitInlineHotelGuestAmbiguity
1  lib/dataQuality/ignorableSnippet.ts :: export function normalizeSnippet (2 matches incl. use)
1  components/admin/review/attentionMark.ts :: export function attentionMarkClass
1  lib/sheet-links/buildSheetDeepLink.ts :: export const REGION_ANCHOR_SPEC
1  lib/sheet-links/buildSheetDeepLink.ts :: export const SOURCE_LINK_ALLOWLIST
1  lib/drive/exportSheetToMarkdown.ts :: export function synthesizeBlocksFromXlsx
1  lib/drive/showDayTimeAnchors.ts :: export type WarningAnchorSources
1  lib/sync/attachWarningAnchors.ts :: export async function attachWarningAnchors
```

Test paths, harnesses and scripts each confirmed present with `test -e` (43 paths, 0 missing), including `tests/e2e/standalone.config.ts`, `tests/e2e/_step3ReviewModalHarness.tsx`, `tests/e2e/_step3ReviewModalBundle.mjs`, `tests/e2e/_compactAlertCardLiveEntry.tsx`, `tests/e2e/helpers/liveEntryToolchain.ts`, `scripts/check-standalone-baseline.mjs`, `tests/_shared/premise.ts`.

Every type, prop and signature the tasks introduce (the `readAs` variant, `resolveVenueAddressValueCell`, the display module exports, `CompactAlertCard.sheetLink`, `JudgmentCallTag` props, `ArchivedTabIncludeButton` / `ArchivedTabWarningActions` props, `DataQualityWarningControls` lock props, `UseRawSurface`, `callUseRawAction`, `UseRawDraftValue`, `offersReadingChoice`) was written into a scratch file importing the real repo types and checked with `pnpm exec tsc -p <scratch tsconfig extending tsconfig.json>`: exit 0. Scratch removed.

**Plan-time probes** (throwaway `node --import tsx` scripts, removed):

- Venue anchors on every committed workbook. `VENUE_ADDRESS_MISSING` fires on `fintech.xlsx`, `rpas.xlsx`, `fixed-income.xlsx`, all the 3-column scope layout (`| VENUE | VENUE NAME | Kimpton Gray |` / `|  | VENUE ADDRESS |  |`), which the UNKNOWN_FIELD scan cannot see (blank col 0, `lib/drive/unknownFieldAnchors.ts:81`). The spec's R14 venue-block rule (§4.2 item 3), run as a throwaway script over all seven workbooks: the three emitting workbooks each resolve to `INFO!C14`; `east-coast.xlsx` (the only 2-column block, `INFO!A8` `Hotel Address`) with `INFO!B8` deleted resolves to `INFO!B8` and then emits the warning once; unedited east-coast, `ria.xlsx`, `consultants.xlsx`, `redefining-fi.xlsx` each have one address row with a value, resolve to `null`, and emit nothing. Task 2 tests exactly these shapes.
- `esbuild` `alias` on an `@/app/admin/onboarding/_actions/useRawStaged` specifier substitutes the stub module in a bundle (`ALIAS-OK`), so the Save-flow live entry can stub both staged actions (Task 15).
- Token contrast from `app/globals.css` (light / dark): `surface` vs `warning-bg` 1.103 / 1.347; `surface` vs `surface-sunken` 1.109 / 1.092; `text` on `warning-bg` 15.60 / 10.64; `text-subtle` on `info-bg` 5.79 / 5.89. Matches §3.6.

## Plan-time sweeps (authored AND run; per-hit dispositions)

### S1. Line-keyed census rows pointing into files this arc edits

Command (script kept at the arc's scratchpad; reproduced in full in Task 18 so the executor re-runs the same derivation): walk every `tests/**/*.ts(x)` file, match `file: "<touched>", … line: N` and `"<touched>:N"` keys for the 14 touched component files, print the live source text at that line.

Output 2026-10-26 (`TOTAL 30`):

```
tests/help/_metaRenderFaultMarking.test.ts | UseRawControl.tsx:433 | if (state === "legacy-unavailable") {
tests/styles/_metaControlOutlineResidue.test.ts | step3ReviewSections.tsx:2500 | <span className="shrink-0 rounded-pill border border-border bg-surface
tests/styles/controlOutlineScan.ts | ShowReviewSurface.tsx:1025 | <button
tests/styles/controlOutlineScan.ts | ShowReviewSurface.tsx:844 | <button
tests/styles/controlOutlineScan.ts | Step3ReviewModal.tsx:894 | <button
tests/styles/controlOutlineScan.ts | Step3ReviewModal.tsx:980 | <button
tests/styles/controlOutlineScan.ts | step3ReviewSections.tsx:4975 | <button
tests/styles/controlOutlineScan.ts | step3ReviewSections.tsx:5057 | <button
tests/styles/forcedColorsCensus.ts | PerShowActionableWarnings.tsx:458 | <a
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:1025 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:811 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:825 | <extra.Icon
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:829 | <span
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:844 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:932 | <button
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:945 | <s.Icon
tests/styles/forcedColorsCensus.ts | ShowReviewSurface.tsx:951 | <span
tests/styles/forcedColorsCensus.ts | Step3ReviewModal.tsx:590 | <button
tests/styles/forcedColorsCensus.ts | Step3ReviewModal.tsx:662 | <span
tests/styles/forcedColorsCensus.ts | Step3ReviewModal.tsx:729 | <ChevronDown
tests/styles/forcedColorsCensus.ts | UseRawControl.tsx:334 | <button
tests/styles/forcedColorsCensus.ts | UseRawControl.tsx:360 | <span
tests/styles/forcedColorsCensus.ts | UseRawControl.tsx:372 | <span className={`text-xs font-semibold ${checked ? "text-text-strong"
tests/styles/subtleInteractiveExemptions.ts | sectionWarningExtras.tsx:285 | <summary
tests/styles/subtleInteractiveExemptions.ts | step3ReviewSections.tsx:1692 | <summary className="flex min-h-tap-min cursor-pointer list-none items-
tests/styles/subtleInteractiveExemptions.ts | step3ReviewSections.tsx:3511 | <summary
tests/styles/tapTargetCensus.ts | DataQualityWarningControls.tsx:239 | <button
tests/styles/tapTargetCensus.ts | SheetIconLink.tsx:91 | <a
tests/styles/tapTargetCensus.ts | Step3ReviewModal.tsx:1084 | <input
tests/styles/tapTargetCensus.ts | step3ReviewSections.tsx:4375 | <a
```

Dispositions (applied in Task 18, by element identity, never by line arithmetic):

- `forcedColorsCensus.ts` `PerShowActionableWarnings.tsx:458` `<a` — **DELETE** (the text link is removed in Task 9; spec §16.3).
- `Step3ReviewModal.tsx` rows (6) — **no change expected**: no task edits `Step3ReviewModal.tsx`. Task 18 re-runs the sweep; a Step3ReviewModal row that moved is a defect to investigate, not a re-key.
- Every other row (23) — **RE-KEY**: same element, new line, located by its tag + class string on the final tree.
- **ADD**: Task 18 adds rows only for elements the scanners report as new and unprovable (expected candidates: the Accepted `<summary>` on both surfaces in `subtleInteractiveExemptions.ts`, per §16.3). Each added row's reason is copied from its Ignored twin.

The baseline run of all ten census and count-pin suites on this tip was green (`10 passed, 644 tests`), so any red after Task 18 is this arc's.

**Two registries §16.3 does not list, found by this sweep:** `tests/help/_metaRenderFaultMarking.test.ts` (`UseRawControl.tsx:433`, edited by Tasks 4, 10, 14) and the inline census in `tests/styles/_metaControlOutlineResidue.test.ts` (`step3ReviewSections.tsx:2500`, shifted by Tasks 7, 8, 12, 13, 16, 17). Both are in Task 18.

### S2. Tests pinning what this arc removes or renames

Command: `grep -rlE "warning-[^\"']*-open|Open in Sheet" tests` plus `grep -rnE 'toContain\("(warn|info)"\)' tests`, then each hit read.

| Hit | Disposition |
|---|---|
| `tests/components/step3SheetCard.test.tsx:690` and lines 758, 766, 784, 1162, 1165 (`…-warning-N-open`) | Task 7: testid becomes `…-sheetlink`; assertions keep the href checks |
| `tests/components/admin/parsePanelComposition.test.tsx:103-105` (`textContent` contains `info` / `warn`) | Task 8: replaced by the row-kind assertions (chip glyph, dot, tag, sr prefix) |
| `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/components/admin/sheetWarningsPanel.test.tsx`, `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx` (warning text link) | Task 9 (published) and Task 7 (wizard row in `newTabAnnouncementBehavior`) |
| `tests/parser/parseWarningDeepLinkRender.test.tsx` | Task 2 (membership pin) and Task 7 (wizard link render, if it reads the wizard testid) |
| `tests/admin/attentionClearingKind.test.ts`, `tests/admin/bellFeed.test.ts`, `tests/adminAlerts/alertActions.test.ts`, `tests/components/admin/review/attentionBanner.test.tsx`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx`, `tests/components/bellPanelRedesign.test.tsx`, `tests/dev/fullSplitComposite.test.ts`, `tests/e2e/_compactAlertCardLiveEntry.tsx`, `tests/e2e/_pillFocusLiveEntry.tsx`, `tests/components/shared/newTabHint.test.tsx` | **No change**: alert-action labels / `NewTabHint` unit, out of class (spec §2, B9) |
| `tests/drive/unknownFieldAnchors.test.ts:222` | comment only; no change |
| `tests/components/telemetry/activeFilterChips.test.tsx:49` | unrelated (`href` query); no change |
| Old include labels: `tests/components/admin/review/publishedArchivedTabOffer.test.tsx` (10), `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx` (6), `tests/components/admin/wizard/archivedTabOffer.render.test.tsx` (1) | Task 13 (R13) |
| `Gear section`: `lib/messages/catalog.ts`, generated spec codes, `tests/messages/warningCardCopyRegistry.ts`; `components/crew/icons/sectionIcons.tsx:122`, `tests/e2e/crew-page.spec.ts:885` | first three Task 5; the crew-page pair names the crew Gear section, out of class |
| `raw-not-guest-scoped` resolution equality: `tests/parser/blocks/hotels.inlineGuestAmbiguity.test.ts` (fires-once `it.each`) | Task 1 (now carries `readAs`); `tests/components/UseRawControl.test.tsx` renders the sentence, re-run in Task 10 |

### S3. Ignored-list fixtures holding judgment rows (spec §16.3 last bullet)

Command: `grep -rlE "ignored-summary|ignored-warnings|Ignored \(" tests`, then per file `grep -cE "<the seven AMBIGUITY_CODES>"`. 19 files; judgment codes appear in three:

| File | Disposition |
|---|---|
| `tests/components/admin/showpage/sectionWarningControls.test.tsx` (`tests/components/admin/showpage/sectionWarningControls.test.tsx:68` ROOM_HEADER, active list only; ignored assertions use `FIELD_UNREADABLE`) | re-run in Task 12; expected unchanged |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx:1902` (HOTEL_GUEST fixture) | re-run in Task 12; if it lands in an ignored partition, its expectation moves to `…-accepted-…` |
| `tests/helpers/publishedSurfaceProps.tsx:58` (Rooms factory makes ROOM_HEADER) | re-run consumers in Task 12; any consumer that ignores a Rooms-factory warning now finds it under Accepted |

The other 16 files carry no judgment code; no change.

## e2e harness-readiness checklist (applies to every Playwright task)

- **Boot:** standalone, no dev server, no Supabase. `test.beforeAll` (a) bundles a live entry: the wizard entry tests/e2e/_warningCardLiveEntry.tsx through `tests/e2e/_step3ReviewModalBundle.mjs` (the bundler already proven on the real `Step3ReviewModal` tree: empties node builtins, stubs `"use server"` modules), the compact-card entry `tests/e2e/_compactAlertCardLiveEntry.tsx` through `bundleLiveEntry` exactly as `tests/e2e/compact-alert-card-layout.spec.ts:64-71` does; (b) compiles real CSS with `compileEntryCss` over `app/globals.css` with explicit `@source` lines for every component file whose classes the spec measures (listed per task), because a static render of the default fixture does not contain the new classes; (c) serves the work dir over `node:http` on port 0 (`127.0.0.1`). Config: `tests/e2e/standalone.config.ts`, project `standalone-chromium`.
- **Readiness gate:** `page.goto(live.html?scenario=…)`, `await page.evaluate(() => document.fonts.ready)`, `await expect(<first fixture testid>).toBeVisible()`, then a CSS premise: a known padded element's computed padding is > 0 (real Tailwind emitted). Never `networkidle`.
- **Detach safety:** geometry reads use `page.evaluate` with `document.querySelector` and an explicit null check that throws a named error, never `locator.evaluate` on an element a step can unmount (the Save flow unmounts its row). Waits on unmount use `expect(locator).toHaveCount(0)`.
- **Registration:** the spec file name joins the `testMatch` alternation in `tests/e2e/standalone.config.ts:85`, and every task that adds or renames a Playwright test runs `node scripts/check-standalone-baseline.mjs --write` and commits `tests/e2e/standalone-baseline.json` in the same commit (the PR #977 failure, `3b1fd2fa0`). The standalone CI job (`.github/workflows/standalone-e2e.yml:71`) runs the whole config on every PR, so no path filter needs wiring.
- **Run:** `pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts <spec>`.

## Why the layout and transition-audit tasks are the implementing tasks

writing-plans requires a layout-dimensions task (§13) and a transition-audit task (§14, §14.1). Written after the code they measure, both would pass the moment they are authored, which the red-contract rejects. So the real-browser DI assertions are the RED of the two tasks that build the host rows (Task 7: wizard title row, DI-1 to DI-11; Task 9: compact card message row, DI-C1 to DI-C9), and the §14 transition audit with its deferred-response probe is the RED of the task that builds the reading model (Task 14), which also pastes and re-asserts §14.1 over the archived row Task 13 built. Each of those task bodies pastes its spec table verbatim.

## Spec ambiguities, resolutions and builder's calls

1. **RESOLVED by spec R14 (orchestrator relaying Eric, 2026-10-26).** The round-0 venue lookup went through the UNKNOWN_FIELD scan and reached no committed workbook that raises the warning (all 3-column). The spec now derives the anchor from the venue grid block itself, at label column 0 or 1, so the 3-column layout links its empty value cell; the generic scan is unchanged. Remaining limits (combined `VENUE NAME/VENUE ADDRESS` label row, horizontal header-table layout, a venue table with no `VENUE` header row, unread labels) fall back to the region (spec §17 L1-L3). Task 2 implements and tests it.

**Builder's calls (they stand; recorded so review does not re-derive them):**

2. **Bulk accept partial-success copy** is not in the spec. Today `Ignored ${ok} of ${n}. Refresh to see the rest.` (`components/admin/BulkIgnoreControls.tsx:146`); judgment groups get `Accepted ${ok} of ${n}. Refresh to see the rest.` (Task 11), the spec's verb swap applied to the one string §6.2 does not list.
3. **Home of `HOTEL_RESERVATION_JUDGMENT_CODES`** (unstated in §5.4): lib/admin/warningReadingDisplay.ts beside `USE_RAW_CODES`, with `isJudgmentCall` as the one spelling of the kind test (Task 4).
4. **Archived card order:** Tab and Cases lines in the row-label slot, then help text, then include, jump, Report + Ignore. This satisfies §7.3's bullet order and §8.3's "after the help text" (Task 13 `ArchivedTabWarningActions` takes the jump as a slot).
5. **Save + accept announcement** is `Reading saved. Judgment call accepted.`, from §11 (§6.3 rule 4 only says "announce").
6. **Census coverage beyond §16.3** (sweep S1, S2): `tests/help/_metaRenderFaultMarking.test.ts` and the inline census in `tests/styles/_metaControlOutlineResidue.test.ts` also key on moved lines; `tests/components/step3SheetCard.test.tsx` and `tests/components/admin/parsePanelComposition.test.tsx` pin the removed link and word. All are in tasks.
7. **`ArchivedTabIncludeButton` gets an optional `testId` prop** (§7.3 names the card's testid, not the prop); Pack list and the Resolve box keep their testids on the wrapping `ArchivedTabOffer`.

## Task index

| # | Task | File | Commit type(scope) |
|---|---|---|---|
| 1 | Inline guest emitter keeps its names (`readAs`) | 01 | `feat(parser)` |
| 2 | Venue-with-no-address links the empty value cell | 01 | `feat(sync)` |
| 3 | Route archived-tab warnings to Pack list | 01 | `feat(onboarding)` |
| 4 | The reading-display module | 01 | `feat(admin)` |
| 5 | §12.4 catalog lockstep: three helpfulContext rows | 01 | `fix(onboarding)` |
| 6 | Sheet icon link: two new backdrops | 02 | `feat(admin)` |
| 7 | Layout dimensions I: wizard title row with the icon link and the tag | 02 | `feat(onboarding)` |
| 8 | Wizard row kinds: chip, dot, sr prefix, no severity word | 02 | `feat(onboarding)` |
| 9 | Layout dimensions II: compact card icon link, published adapters, published tag | 02 | `feat(admin)` |
| 10 | Read-only "Sheet says / We read" comparison | 03 | `feat(admin)` |
| 11 | Accept wording on judgment rows and bulk chips | 03 | `feat(admin)` |
| 12 | Accepted (N) disclosures | 03 | `feat(admin)` |
| 13 | Archived pull sheet card: one include button, row locks | 03 | `feat(onboarding)` |
| 14 | Transition audit: the deferred reading choice | 03 | `feat(admin)` |
| 15 | Mount the deferred choice on both surfaces; Save flow in a real browser | 03 | `feat(admin)` |
| 16 | Hotels reservation marker and the two-way jump | 04 | `feat(onboarding)` |
| 17 | Section jumps on staged wizard cards | 04 | `feat(onboarding)` |
| 18 | Line-keyed census reconciliation | 04 | `test(admin)` |
| 19 | Full local verification | 04 | none unless a fix lands |
| 20 | Adversarial review (cross-model) — orchestrator | 04 | review-round corpus row |
| 21 | Invariant-8 UI quality gate — orchestrator | 04 | `docs(onboarding)` |
| 22 | Closeout | closeout.md | `docs(onboarding)` |
