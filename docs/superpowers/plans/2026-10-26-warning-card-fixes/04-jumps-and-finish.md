# Warning card fixes — Tasks 16-22: jumps, census reconciliation, the unsaved reading guard, verification, review, gate, closeout

Read 00-overview.md first.

<!-- tasks: depth=2 red-contract -->

## Task 16 — Hotels reservation marker and the callout label

<!-- task: red=`pnpm exec vitest run tests/components/admin/wizard/hotelReservationMarker.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:2828` why=`HotelsBreakdown renders HotelCard on this line with no index and no marker, and SectionFlagCallout always says Review in Sheet warnings for judgment entries, so the new suite expecting data-hotel-index, the Judgment call tag, the Sheet says line and a jump to the exact card, and See how we read it on reading-shown callouts, fails until both are built` ac=AC-4 -->

What is red and why: the reservation carries no index hook and no marker; the callout label ignores whether a reading is shown.

Claims AC-4 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:2800-2837` (`HotelsBreakdown` computes markers from `chrome?.calloutEntries`), `components/admin/wizard/step3ReviewSections.tsx:2889-2905` (`HotelCard` props `index: number`, `marker`; root `data-hotel-index`; marker block first, spec §5.4 markup), `components/admin/wizard/step3ReviewSections.tsx:716-717` (callout label)
- Create: tests/components/admin/wizard/hotelReservationMarker.test.tsx
- Modify: tests/e2e/warning-card-flows.spec.ts, tests/e2e/_warningCardLiveEntry.tsx (`?scenario=jumps`), `tests/e2e/_step3ReviewModalHarness.tsx`, `tests/e2e/standalone-baseline.json`

**Interfaces:** consumes `HOTEL_RESERVATION_JUDGMENT_CODES`, `sheetSaysText`, `readingShown` (Task 4), `JudgmentCallTag` (Task 7), the existing `chrome.onJumpToWarning`. Testids `wizard-step3-hotel-judgment-marker`, `-judgment-tag`, `-judgment-jump`, `-judgment-sheet-says` (spec §5.4).

- [ ] **Step 1: RED.** tests/components/admin/wizard/hotelReservationMarker.test.tsx (`// @vitest-environment jsdom`), rendering `HotelsBreakdown` inside `Step3SectionChromeContext.Provider` (`components/admin/wizard/step3ReviewSections.tsx:599`) with two hotels, `calloutEntries` built from real warnings (an inline guest split from `parseHotels` per Task 10's fixture, given `blockRef.index` 1) and an `onJumpToWarning` spy:
  - every `wizard-step3-hotel-card` carries `data-hotel-index` equal to its position;
  - only reservation 1 shows the marker; its first element child is the marker (above the hotel name); the jump's accessible name ends ` for <hotel name>`; clicking calls `onJumpToWarning(first.index, [all member indices])` where `first` is the lowest full-array index (fixture has two members on one reservation to prove grouping);
  - the Sheet says line text equals `Sheet says ` + `sheetSaysText(first.warning.rawSnippet)`;
  - index boundary (`B-INDEX`, `B-HOTELS-CAP`), one case per row, with the two-hotel fixture: `0` and `1` (= `shown.length - 1`) each mark exactly that reservation; `2` (= `shown.length`), `-1`, `NaN`, `1.5` and an absent index mark nothing. With a constructed 13-hotel list (past `HOTELS_CAP` = 12, so `shown.length` is 12): index `11` marks the 12th card; index `12` marks nothing (the 13th hotel is not shown). And `B-MAX-HOTELS`: `parseHotels` over the five-slot v4 block of `tests/parser/hotelAddressIntegration.test.ts:71-88` (five `RESERVATION \#n` slots with plain hotel names, parsed as `"v4"`) returns exactly 4 reservations and one `HOTEL_CARDINALITY_EXCEEDED` (the module-local `MAX_HOTELS`, `lib/parser/blocks/hotels.ts:57`), so every parsed `blockRef.index` (0 to 3) is below `HOTELS_CAP`. Five separate `| Hotel Reservations | … |` inline lines do NOT reach this cap: the inline path reads only the first matching row (`lib/parser/blocks/hotels.ts:708-717`) and returns one reservation.
  **Probe P-T16** (plan time, live tree, run from the worktree root; the v4 five-slot block parses to four reservations and one cardinality warning):

```sh
node --import tsx -e 'const {parseHotels}=require("./lib/parser/blocks/hotels.ts"),{newAggregator}=require("./lib/parser/warnings.ts");const S=["| HOTEL | RESERVATION \\#1 |  | RESERVATION \\#2 |","| :---: | :---: | :---: | :---: |","|  | Hotel Name / Address |  | Hotel Name / Address |","|  | Hotel One |  | Hotel Two |","|  | Names on Reservation |  | Names on Reservation |","|  | Alice Brown |  | Bob Carter |","|  | RESERVATION \\#3 |  | RESERVATION \\#4 |","|  | Hotel Name / Address |  | Hotel Name / Address |","|  | Hotel Three |  | Hotel Four |","|  | Names on Reservation |  | Names on Reservation |","|  | Carol Diaz |  | Dave Evans |","|  | RESERVATION \\#5 |  |  |","|  | Hotel Name / Address |  |  |","|  | Hotel Five |  |  |","|  | Names on Reservation |  |  |","|  | Erin Fox |  |  |"].join("\n");const a=newAggregator(),h=parseHotels(S,"v4",a);console.log(h.length,JSON.stringify(h.map(x=>x.hotel_name)),a.warnings.filter(w=>w.code==="HOTEL_CARDINALITY_EXCEEDED").length)'
```

```text
4 ["Hotel One","Hotel Two","Hotel Three","Hotel Four"] 1
```

  - no chrome provider (published, standalone): no marker; a code outside `HOTEL_RESERVATION_JUDGMENT_CODES` with a valid index: no marker.
  - `SectionFlagCallout` with judgment entries: all members `readingShown` → `See how we read it`; one member a use-raw code in `legacy-unavailable` → `Review in Sheet warnings`; the flagged variant unchanged; sr suffix ` for <title>` kept.
- [ ] **Step 2: RED (real browser).** In tests/e2e/warning-card-flows.spec.ts, `?scenario=jumps` (two hotels, an inline guest split on reservation 1): click `wizard-step3-hotel-judgment-jump`, then poll until the target card `[data-warning-index="<i>"]` carries `data-step3-warning-flash` and its rect lies inside the scroller's rect; the jump button's rect height ≥ 44. Regenerate the baseline.
- [ ] **Step 3: GREEN.** Spec §5.4 and the §5.5 callout rule.
- [ ] **Step 4: green.** Both red commands; `pnpm exec vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/ci/_metaSpecRegistration.test.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key the six `step3ReviewSections.tsx` rows (S1b, Task 16 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 5: commit** `feat(onboarding): mark the judged reservation in Hotels and jump to its card`.

## Task 17 — Section jumps on staged wizard cards

<!-- task: red=`pnpm exec vitest run tests/components/admin/wizard/warningSectionJumps.test.tsx` red-state=authored red-target=`components/admin/review/ShowReviewSurface.tsx:1154` why=`the Warnings chrome receives onJumpToSection only inside this published-only pointer spread, and no jumpToHotel exists, so the new suite expecting Go to Pack list, Go to this reservation in Hotels and the other card jumps on the staged surface fails until a staged spread supplies onJumpToSection, jumpSections, onJumpToHotel and hotelCount` ac=AC-3,AC-7 -->

What is red and why: the staged Warnings chrome has no jump callback, no rendered-section list and no hotel jump.

Claims AC-3, AC-7 (declared in 00-overview.md, Acceptance criteria).

**Files:**
- Modify: `components/admin/review/ShowReviewSurface.tsx:558-566` (add `jumpToHotel(index)` after `jumpToRoom`, spec §5.5), `components/admin/review/ShowReviewSurface.tsx:1154-1159` (new staged spread after the pointer spread, spec §8.2)
- Modify: `components/admin/wizard/step3ReviewSections.tsx:488-506` (`Step3SectionChrome` gains optional `jumpSections`, `onJumpToHotel`, `hotelCount`), the active row (jump after help text, spec §8.3), the archived row (`jump` slot of `ArchivedTabWarningActions`)
- Create: tests/components/admin/wizard/warningSectionJumps.test.tsx
- Modify: tests/e2e/warning-card-flows.spec.ts, `tests/e2e/standalone-baseline.json`

**Interfaces:** `jumpSections?: ReadonlyArray<{ id: SectionId; label: string }>`, `onJumpToHotel?: (index: number) => void`, `hotelCount?: number`, ABSENT elsewhere (exactOptionalPropertyTypes). `jumpToHotel` mirrors `jumpToRoom` plus `jumpToWarning`'s one-shot flash on `[data-hotel-index="<index>"]`; a missing target falls back to `handleNavClick("hotels")`. Testid `wizard-step3-card-${dfid}-warning-${i}-section-jump`, `data-jump` = target or `reservation`.

- [ ] **Step 1: RED.** tests/components/admin/wizard/warningSectionJumps.test.tsx (`// @vitest-environment jsdom`), `WarningsBreakdown` under a chrome provider carrying `onJumpToSection` / `onJumpToHotel` spies, a `jumpSections` list and `hotelCount: 2`:
  - `UNKNOWN_FIELD` with `blockRef.kind: "crew"` → `Go to ` + the `crew` label from `jumpSections`, click calls `onJumpToSection("crew")`;
  - archived-tab warning → `Go to Pack list`, rendered between the include button and Report (Task 13 slot);
  - `HOTEL_GUEST_SPLIT_AMBIGUOUS` reservation jump boundary (`B-JUMP-INDEX`), with `hotelCount: 2`: `blockRef.index` `0` and `1` → `Go to this reservation in Hotels`, calling `onJumpToHotel(0)` / `onJumpToHotel(1)`; `2` (= `hotelCount`), `-1`, `NaN`, `1.5` → `Go to Hotels`, calling `onJumpToSection("hotels")`. With `hotelCount: 12` (the `Math.min(..., HOTELS_CAP)` value for 13 hotels): `11` → reservation jump, `12` → `Go to Hotels`.
  - `VENUE_ADDRESS_MISSING` → no jump (R4); info row → none; Ignored and Accepted rows → none; a target absent from `jumpSections` → none; `sectionForWarning` null → none; no `onJumpToSection` in chrome → none;
  - every jump's accessible name ends ` for <title>`; exactly one jump per card.
  - Surface wiring, in `tests/components/admin/wizard/Step3ReviewModal.test.tsx`: the staged modal renders a section jump on a crew card and clicking it makes `crew` the active rail item; with a constructed `StagedSectionData` holding 13 hotels (the spread's `Math.min(data.hotels.length, HOTELS_CAP)` yields 12), a `HOTEL_GUEST_SPLIT_AMBIGUOUS` at `blockRef.index` 11 shows `Go to this reservation in Hotels` and one at 12 shows `Go to Hotels` (`B-JUMP-INDEX` through the real spread); in `tests/components/admin/showpage/publishedReviewModal.test.tsx`: no `-section-jump` testid renders.
- [ ] **Step 2: RED (real browser).** In tests/e2e/warning-card-flows.spec.ts (`?scenario=jumps` gains an archived-tab warning and a staged pull sheet): click `Go to Pack list`; after the scroll settles (poll `scrollTop` until two consecutive reads are equal) the Pack list section's top is within 8px of the scroller's top and the rail's active item is Pack list. Click `Go to this reservation in Hotels`: the target `[data-hotel-index]` carries `data-step3-warning-flash` and lies in view. Each jump button's rect height ≥ 44. Regenerate the baseline.
- [ ] **Step 3: GREEN.** Spec §5.5 (`jumpToHotel`), §8.2 (spread, `hotelCount: Math.min(data.hotels.length, HOTELS_CAP)`, `HOTELS_CAP` imported from `components/admin/wizard/step3ReviewSections.tsx:192`), §8.3 (button markup, classes are the deleted link's).
- [ ] **Step 4: green.** Both red commands; `pnpm exec vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/wizard/archivedTabWarningCard.test.tsx tests/admin/wizardWarningChrome.structural.test.ts tests/ci/_metaSpecRegistration.test.ts`.
- [ ] **Reconcile (before commit).** Stage the task's files; run the walker set (00-overview.md, "Walker cover", the six census suites included); re-key the six `step3ReviewSections.tsx` rows and the ten `ShowReviewSurface.tsx` rows `jumpToHotel` and the staged spread shift: control-outline line 844, line 1025; forced-colors line 811, line 825, line 829, line 844, line 932, line 945, line 951, line 1025 (S1b, Task 17 row). Then commit; if a commit hook reformats, re-run and fix in a new commit of this task.
- [ ] **Step 5: commit** `feat(onboarding): jump from a wizard warning card to its section`.

<!-- tasks: end -->

## Task 18 — Whole-tree registry check (expect no change)

Not a red-contract task and not the first re-key: every row was reconciled by the task whose edit moved it (00-overview.md S1b), so this task proves the sum and expects to commit nothing.

- [ ] **Step 1: the six census suites and the count registries, green.** `pnpm exec vitest run tests/styles/_metaTapTargetFloor.test.ts tests/styles/_metaForcedColors.test.ts tests/styles/_metaControlOutlineFill.test.ts tests/styles/_metaControlOutlineResidue.test.ts tests/styles/_metaSubtleOnInteractive.test.ts tests/help/_metaRenderFaultMarking.test.ts tests/components/admin/sheetIconLinkContainment.test.ts tests/styles/_metaNewTabAnnouncement.test.ts tests/components/_metaOrphanedComponents.test.ts` passes.
- [ ] **Step 2: re-derive the S1 sweep** on the final tree. Save to the session scratchpad and run with `node`:

```js
// census-sweep.mjs: every line-keyed row pointing into a file this arc edits.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const TOUCHED = [
  "components/admin/wizard/step3ReviewSections.tsx", "components/admin/review/ShowReviewSurface.tsx",
  "components/admin/UseRawControl.tsx", "components/admin/UseRawControlBoundary.tsx",
  "components/admin/PerShowActionableWarnings.tsx", "components/admin/NoteWarningCard.tsx",
  "components/admin/CompactAlertCard.tsx", "components/admin/DataQualityWarningControls.tsx",
  "components/admin/showpage/sectionWarningExtras.tsx", "components/admin/wizard/archivedTabOffer.tsx",
  "components/admin/review/PublishedArchivedTabOffer.tsx", "components/admin/BulkIgnoreControls.tsx",
  "components/admin/SheetIconLink.tsx", "components/admin/wizard/Step3ReviewModal.tsx",
];
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const out = [];
for (const reg of walk("tests").filter((p) => /\.(ts|tsx)$/.test(p))) {
  const src = readFileSync(reg, "utf8");
  for (const f of TOUCHED) {
    const esc = f.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const res = [new RegExp(`file:\\s*"${esc}",\\s*(?://[^\\n]*\\n\\s*)*line:\\s*(\\d+)`, "g"), new RegExp(`"${esc}:(\\d+)"`, "g")];
    for (const re of res) for (const m of src.matchAll(re)) {
      const n = Number(m[1]);
      const text = (readFileSync(f, "utf8").split("\n")[n - 1] ?? "<EOF>").trim().slice(0, 70);
      out.push(`${reg} | ${f.split("/").pop()}:${n} | ${text}`);
    }
  }
}
console.log(out.sort().join("\n")); console.log(`TOTAL ${out.length}`);
```

  Expected: `TOTAL` equals 30 minus the one Task 9 delete plus the rows Tasks 12 to 14 added (the plan-time output and dispositions are in 00-overview.md, sweep S1), and every printed source text is the element its row names (by tag and class, as at plan time).
- [ ] **Step 3: outcome.** Both steps clean: nothing to commit. Any red row is a reconcile a task missed: fix it in a separate commit whose message names that task (`test(admin): reconcile <registry> missed by Task N`), then re-run both steps.
## Task 18b — Unsaved reading guard (spec §6.5, R15)

Added 2026-10-30 from the UI gate's P1, on Eric's decision R15: a picked reading waits for Save (§6.3), so Publish, Re-scan, Re-sync and closing the review must not drop it silently. Not a red-contract-block task (it lands after the census check), but it follows the same TDD order: RED first, observed, then GREEN.

**Files:**
- Create: components/admin/review/unsavedReadings.tsx (`"use client"`: the per-surface registry context, `useUnsavedReadingsRegistry` for the shell, `useUnsavedReadingsGuard` for controls, `useRegisterUnsavedReading` for row providers, and the `UnsavedReadingsPrompt` alertdialog, spec §6.5 "The prompt")
- Modify: `components/admin/review/ReviewModalShell.tsx` (owns one registry; provides it beside `ReviewModalCloseContext` at `components/admin/review/ReviewModalShell.tsx:595`; G1 to G5 route through `guard`; new optional `guardApiRef` prop populated in the `closeApiRef` layout effect, `components/admin/review/ReviewModalShell.tsx:299-305`), `components/admin/useRawDraft.tsx` (registers while `dirty`, `components/admin/useRawDraft.tsx:162`), `components/admin/wizard/Step3ReviewModal.tsx` (G6 to G8 through `guardApiRef`: `components/admin/wizard/Step3ReviewModal.tsx:897`, `components/admin/wizard/Step3ReviewModal.tsx:914`, `components/admin/wizard/Step3ReviewModal.tsx:996`), `components/admin/RescanSheetButton.tsx` (G9, its trigger at `components/admin/RescanSheetButton.tsx:213`), `components/admin/ReSyncButton.tsx` (G10, `components/admin/ReSyncButton.tsx:414` and `components/admin/ReSyncButton.tsx:539`)
- Create: tests/components/admin/review/unsavedReadingsGuard.test.tsx
- Modify: tests/e2e/warning-card-flows.spec.ts (the `save` scenario; its CSS `@source` list gains the new component), `tests/e2e/standalone-baseline.json`

**Interfaces:** `guard(action: () => void, trigger: HTMLElement | null): void`; `ReviewModalShellProps.guardApiRef?: RefObject<UnsavedGuard | null>`; testids `unsaved-readings-prompt`, `-title`, `-go-back`, `-discard`. No new mutation surface, route or `"use server"` export (invariant 10 unchanged): every guarded action is an existing one.

- [ ] **Step 1: RED (jsdom).** tests/components/admin/review/unsavedReadingsGuard.test.tsx (`// @vitest-environment jsdom`). Every guard-point case makes ONE row dirty through the real UI (a use-raw warning in a resolvable state on the staged modal, `use-raw-toggle-on-list` clicked; on the published modal the same through `buildSectionWarningExtras`), then presses the guard point and asserts the prompt is shown AND the action did not run; each case fails if its own point is unguarded, because the action spy is the assertion's subject:
  - G1 close button, G2 Escape, G3 backdrop, G4 grab tap, G5 grab drag past the threshold (pointer events, `clientY` delta 120): `onClose` uncalled under reduced motion, both modals for G1 to G3;
  - G6 Publish: `onRequestSetChecked` uncalled; G7 Approve & apply: `resolution.onApplyResolve` uncalled; G8 Ignore this sheet: `resolution.onIgnore` uncalled;
  - G9 Re-scan (a footer placement and the Pack list rescan-needed note) and G10 Re-sync and `Apply reduced version`: the `fetch` spy uncalled.
  - Count: one dirty row → `You have 1 unsaved reading change`; two → `You have 2 unsaved reading changes`; Save pressed on one (held promise) → the next guard press shows 1; that Save failing while the prompt is open → the title reads 2.
  - Buttons: `Go back` has initial focus; pressing it unmounts the prompt, leaves `Save` on the row, returns focus to the trigger, and the action stays uncalled; `Discard and continue` clears the draft (the row's main button reads `Accept` again) and calls the action exactly once; Escape is `Go back`. `N` reaching 0 while open (the dirty row's warning removed by a rerender) closes the prompt and runs nothing.
  - Zero-dirty passthrough: for every guard point, with no dirty row the action runs in the same event and no `unsaved-readings-prompt` exists.
  - `beforeunload`: with `addEventListener` spied on `window`, none registered at `N = 0`; at `N > 0` a dispatched cancelable `beforeunload` event is `defaultPrevented`; after Cancel and after unmount the listener is removed.
  Run `pnpm exec vitest run tests/components/admin/review/unsavedReadingsGuard.test.tsx` and observe it fail (no prompt renders).
- [ ] **Step 2: RED (real browser).** In tests/e2e/warning-card-flows.spec.ts, `?scenario=save` at 1280 and 320 widths: pick the other reading, press the dialog's close button; the prompt is visible, `Go back` is `document.activeElement`, both buttons are ≥ 44px tall by rect, the panel's rect lies inside the viewport; `Go back` returns focus to the close button and the row still reads `Save`. Run `node scripts/check-standalone-baseline.mjs --write`.
- [ ] **Step 3: GREEN.** Spec §6.5 exactly: the registry, the guard, G1 to G11, the prompt markup and copy, focus return, the transitions.
- [ ] **Step 4: green.** Both red commands; `pnpm exec vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/useRawDraft.transitions.test.tsx tests/components/admin/deferredChoiceMount.test.tsx tests/ci/_metaSpecRegistration.test.ts`; the suites that pin `RescanSheetButton` and `ReSyncButton` (`grep -rl "RescanSheetButton\|ReSyncButton" tests`).
- [ ] **Reconcile (before commit).** Stage the new files; run the walker set (00-overview.md, "Walker cover", censuses included); re-key any line-keyed row the edits moved (ReviewModalShell, Step3ReviewModal, RescanSheetButton, ReSyncButton, useRawDraft) by element identity, and register the prompt's two buttons wherever a scanner reports them as new; reconcile the count registries the brief lists (`tests/help/_metaServerTimeGuard.test.ts`, `tests/help/_renderFaultScan.ts`, `tests/help/_metaRenderFaultMarking.test.ts`, `tests/ci/modalWaitHelper/disposition.ts`, the standalone baseline, the forced-colors and tap-target tallies) only by the movement this task causes.
- [ ] **Step 5: commit** `feat(admin): warn before unsaved reading changes are lost`.

## Task 19 — Invariant-8 UI quality gate — run by the orchestrator, BEFORE final verification and review

The dual gate of AGENTS.md invariant 8, which that invariant places before adversarial review: `/impeccable` run once in its critique mode and once in its audit mode, each with the v3 setup gates (the context loader's read of PRODUCT.md and DESIGN.md, then the product-register reference), over the UI diff: `components/admin/**` files touched by Tasks 6-17 and the `DESIGN.md` addendum (Task 8). P0 and P1 findings are fixed in new commits or deferred through a `DEFERRED.md` entry naming its class-sweep exception. Each fix commit re-runs the affected task's green command AND the walker set (censuses included), reconciling any registry row the fix moved in that same commit by the 00-overview.md S1b procedure (a gate fix is a component edit, so it can move census lines again). The gate-run commit writes closeout.md §12 (findings, dispositions) and the machine-checkable `impeccable-gate:` marker line (grammar: `tests/docs/_invariant8Closeout.ts:44-49`). Until that commit no file in this unit names both gate modes in one phrase and no line starts with the marker prefix, so `tests/docs/_metaInvariant8Closeout.test.ts` stays green before the gate. Everything this task commits precedes Tasks 20 and 21, so the final review reviews it.

## Task 20 — Full local verification (after the gate's commits, before the final review)

Run from the worktree root on a clean tree (`git status --porcelain` prints nothing first); a red stops and is fixed in its owning task's area with its own commit, which puts Task 20 back at its first step.

- [ ] `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`
- [ ] `pnpm exec eslint $(git diff --name-only --diff-filter=AM origin/main...HEAD -- '*.ts' '*.tsx' '*.mjs')` and `pnpm format:check`
- [ ] Scoped suites over the touched trees: `pnpm heavy pnpm exec vitest run tests/components tests/admin tests/lib/admin tests/parser tests/drive tests/sync tests/messages tests/styles tests/help tests/cross-cutting tests/log tests/ci tests/docs tests/dev`
- [ ] Full unit suite before the review dispatch (a review of a red tree reviews nothing): `pnpm heavy pnpm test`
- [ ] Standalone e2e for every touched spec: `pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/warning-card-layout.spec.ts tests/e2e/warning-card-flows.spec.ts tests/e2e/compact-alert-card-layout.spec.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/published-review-modal.layout.spec.ts tests/e2e/packlist-rescan-recovery.spec.ts tests/e2e/bulk-ignore-eyebrow.layout.spec.ts tests/e2e/tap-target-floor.layout.spec.ts`, then `grep -c '"status": "flaky"' test-results/standalone-report.json` reads `0` (a retry-recovered failure exits 0), and `node scripts/check-standalone-baseline.mjs --list-check` exits 0.
- [ ] Generated freshness, on the committed tree only (the clean-tree precondition above makes the index comparison valid here; Task 5 compares two generations instead because its change is not staged yet): `pnpm gen:spec-codes && git diff --exit-code lib/messages/__generated__/`
- [ ] Invariant 10 (AC-10): `git diff --name-only origin/main...HEAD | grep -E '(^app/.*/route\.ts$|/_actions/)'` prints nothing; `git diff origin/main...HEAD | grep -E '^\+.*"use server"'` prints nothing; `pnpm exec vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/adminOutcomeBehavior.test.ts` passes.
- [ ] Re-verify every `red-target=` citation in 01-lib.md through 04-jumps-and-finish.md by READING the cited line on the pre-change tree (`git show origin/main:<path> | sed -n '<n>p'`) and matching it to the symbol its `why=` names (a resolving citation proves nothing, writing-plans.md `RED_TARGET_INVALID` limit).
- [ ] Pre-code mechanical UI checklist against spec §11: no em dash in any new string (`tests/styles/_metaEmDashCopy.test.ts`), every new control ≥ 44px (Tasks 7, 9, 13, 15, 16, 17 e2e), canonical type tokens only (`text-xs`, `text-subtle`).

## Task 21 — Adversarial review (cross-model), final — run by the orchestrator

Listed so the plan's checklist carries it; this executor does not dispatch it. The orchestrator dispatches whole-diff Codex review through `node scripts/codex-guard.mjs review --stage diff --round <n>` with split tight-scope briefs (AGENTS.md: split reviews are the default for large diffs), one per surface: (a) Tasks 1-5 (parser, anchors, routing, display module, catalog); (b) Tasks 6-9 (chrome, shell, adapters, layout specs); (c) Tasks 10-15 (comparison, Accept, Accepted, archived, reading model, mounts, flows spec); (d) Tasks 16-19 (jumps, censuses, the gate's fixes and closeout record). Each brief inlines REVIEWER ONLY, the fresh-eyes posture, `EXPLICITLY DO NOT RELITIGATE` citing spec §1.1 R1-R14, a consequence bound, a `PROBE DOMAIN:` line (the committed fixtures and the four harness scenarios), the threat fence (ordinary authoring mistakes), and the `VERDICT:` / `FINDINGS:` closing lines. No touched file is enrolled in `tests/mutation/source/registry.ts` (checked at plan time), so no `GUARD SURFACE:` line applies.

**The reviewed diff is the merged diff.** A fix after any round is a new commit that re-runs Task 20 and then the next round. After the final APPROVE round, the only commit is that round's own review-round corpus row, which codex-guard writes when the dispatch completes; no plan, closeout, code or ledger file is edited after it.

## Task 22 — Closeout (ship)

See closeout.md: push, real CI green, merge, fast-forward. No file is edited in this task.
