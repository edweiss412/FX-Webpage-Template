# Warning card fixes — Tasks 16-22: jumps, census reconciliation, verification, review, gate, closeout

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
  - one case per bad `blockRef.index` — `NaN`, `-1`, `1.5`, `hotels.length` (out of range), absent — renders no marker anywhere;
  - no chrome provider (published, standalone): no marker; a code outside `HOTEL_RESERVATION_JUDGMENT_CODES` with a valid index: no marker.
  - `SectionFlagCallout` with judgment entries: all members `readingShown` → `See how we read it`; one member a use-raw code in `legacy-unavailable` → `Review in Sheet warnings`; the flagged variant unchanged; sr suffix ` for <title>` kept.
- [ ] **Step 2: RED (real browser).** In tests/e2e/warning-card-flows.spec.ts, `?scenario=jumps` (two hotels, an inline guest split on reservation 1): click `wizard-step3-hotel-judgment-jump`, then poll until the target card `[data-warning-index="<i>"]` carries `data-step3-warning-flash` and its rect lies inside the scroller's rect; the jump button's rect height ≥ 44. Regenerate the baseline.
- [ ] **Step 3: GREEN.** Spec §5.4 and the §5.5 callout rule.
- [ ] **Step 4: green.** Both red commands; `pnpm exec vitest run tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/ci/_metaSpecRegistration.test.ts`.
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
  - `HOTEL_GUEST_SPLIT_AMBIGUOUS` with `blockRef.index: 1` → `Go to this reservation in Hotels`, calls `onJumpToHotel(1)`; with `NaN`, `-1`, `1.5`, `2` (= `hotelCount`) → `Go to Hotels`, calls `onJumpToSection("hotels")`;
  - `VENUE_ADDRESS_MISSING` → no jump (R4); info row → none; Ignored and Accepted rows → none; a target absent from `jumpSections` → none; `sectionForWarning` null → none; no `onJumpToSection` in chrome → none;
  - every jump's accessible name ends ` for <title>`; exactly one jump per card.
  - Surface wiring, in `tests/components/admin/wizard/Step3ReviewModal.test.tsx`: the staged modal renders a section jump on a crew card and clicking it makes `crew` the active rail item; in `tests/components/admin/showpage/publishedReviewModal.test.tsx`: no `-section-jump` testid renders.
- [ ] **Step 2: RED (real browser).** In tests/e2e/warning-card-flows.spec.ts (`?scenario=jumps` gains an archived-tab warning and a staged pull sheet): click `Go to Pack list`; after the scroll settles (poll `scrollTop` until two consecutive reads are equal) the Pack list section's top is within 8px of the scroller's top and the rail's active item is Pack list. Click `Go to this reservation in Hotels`: the target `[data-hotel-index]` carries `data-step3-warning-flash` and lies in view. Each jump button's rect height ≥ 44. Regenerate the baseline.
- [ ] **Step 3: GREEN.** Spec §5.5 (`jumpToHotel`), §8.2 (spread, `hotelCount: Math.min(data.hotels.length, HOTELS_CAP)`, `HOTELS_CAP` imported from `components/admin/wizard/step3ReviewSections.tsx:192`), §8.3 (button markup, classes are the deleted link's).
- [ ] **Step 4: green.** Both red commands; `pnpm exec vitest run tests/components/admin/wizard/Step3ReviewModal.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/admin/wizard/archivedTabWarningCard.test.tsx tests/admin/wizardWarningChrome.structural.test.ts tests/ci/_metaSpecRegistration.test.ts`.
- [ ] **Step 5: commit** `feat(onboarding): jump from a wizard warning card to its section`.

<!-- tasks: end -->

## Task 18 — Line-keyed census reconciliation (after the last component edit)

Not a red-contract task: its failing state is produced by Tasks 7-17, not by anything this task writes. What is red and why: the six line-keyed suites named in 00-overview.md fail because rows point at lines the earlier tasks moved.

- [ ] **Step 1: observe red.** `pnpm exec vitest run tests/styles/_metaTapTargetFloor.test.ts tests/styles/_metaForcedColors.test.ts tests/styles/_metaControlOutlineFill.test.ts tests/styles/_metaControlOutlineResidue.test.ts tests/styles/_metaSubtleOnInteractive.test.ts tests/help/_metaRenderFaultMarking.test.ts`. Record which rows each names.
- [ ] **Step 2: re-run the plan-time sweep** on the final tree. Save to the session scratchpad and run with `node`:

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

  Compare against the 30-row plan-time output in 00-overview.md (sweep S1).
- [ ] **Step 3: apply the S1 dispositions.** Delete the `PerShowActionableWarnings.tsx:458` forced-colors row. For every RE-KEY row, find the SAME element on the final tree by tag plus its class string or token (never by adding a delta), confirm the row's stated reason still describes it, and update the line, appending a one-line provenance comment in each registry's house style ("<old> -> <new> on feat/warning-card-fixes; located by its own element"). Any `Step3ReviewModal.tsx` row that moved stops the task. For every element a scanner reports as NEW and unprovable, add a row whose reason is copied from its twin (the Accepted `<summary>` from the Ignored `<summary>`, both surfaces); any other new element is a defect in the task that added it, not a census row.
- [ ] **Step 4: green, after commit hooks.** Commit, then re-run Step 1 (prettier can move lines; a row keyed before the hook ran is re-checked after it): all six pass, and the sweep's TOTAL equals 30 minus deletions plus additions, with every printed line text matching its row's element.
- [ ] **Step 5: commit** `test(admin): re-key the line-keyed censuses after the warning card edits` (amend nothing; a post-hook fix is a new commit).

## Task 19 — Full local verification

Run on the final tree from the worktree root; a red stops and is fixed in its owning task's area with its own commit.

- [ ] `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`
- [ ] `pnpm exec eslint $(git diff --name-only --diff-filter=AM origin/main...HEAD -- '*.ts' '*.tsx' '*.mjs')` and `pnpm format:check`
- [ ] Scoped suites over the touched trees: `pnpm heavy pnpm exec vitest run tests/components tests/admin tests/lib/admin tests/parser tests/drive tests/sync tests/messages tests/styles tests/help tests/cross-cutting tests/log tests/ci tests/docs tests/dev`
- [ ] Full unit suite before any review dispatch (a review of a red tree reviews nothing): `pnpm heavy pnpm test`
- [ ] Standalone e2e for every touched spec: `pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/warning-card-layout.spec.ts tests/e2e/warning-card-flows.spec.ts tests/e2e/compact-alert-card-layout.spec.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/published-review-modal.layout.spec.ts tests/e2e/packlist-rescan-recovery.spec.ts tests/e2e/bulk-ignore-eyebrow.layout.spec.ts tests/e2e/tap-target-floor.layout.spec.ts`, then `grep -c '"status": "flaky"' test-results/standalone-report.json` reads `0` (a retry-recovered failure exits 0), and `node scripts/check-standalone-baseline.mjs --list-check` exits 0.
- [ ] Generated freshness: `pnpm gen:spec-codes && git diff --exit-code lib/messages/__generated__/`
- [ ] Invariant 10 (AC-10): `git diff --name-only origin/main...HEAD | grep -E '(^app/.*/route\.ts$|/_actions/)'` prints nothing; `git diff origin/main...HEAD | grep -E '^\+.*"use server"'` prints nothing; `pnpm exec vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/adminOutcomeBehavior.test.ts` passes.
- [ ] Re-verify every `red-target=` citation in 01-lib.md through 04-jumps-and-finish.md by READING the cited line on the pre-change tree (`git show origin/main:<path> | sed -n '<n>p'`) and matching it to the symbol its `why=` names (a resolving citation proves nothing, writing-plans.md `RED_TARGET_INVALID` limit).
- [ ] Pre-code mechanical UI checklist against spec §11: no em dash in any new string (`tests/styles/_metaEmDashCopy.test.ts`), every new control ≥ 44px (Tasks 7, 9, 13, 15, 16, 17 e2e), canonical type tokens only (`text-xs`, `text-subtle`).

## Task 20 — Adversarial review (cross-model) — run by the orchestrator

Listed so the plan's checklist carries it; this executor does not dispatch it. The orchestrator dispatches whole-diff Codex review through `node scripts/codex-guard.mjs review --stage diff --round <n>` with split tight-scope briefs (AGENTS.md: split reviews are the default for large diffs), one per surface: (a) Tasks 1-5 (parser, anchors, routing, display module, catalog); (b) Tasks 6-9 (chrome, shell, adapters, layout specs); (c) Tasks 10-15 (comparison, Accept, Accepted, archived, reading model, mounts, flows spec); (d) Tasks 16-18 (jumps, censuses). Each brief inlines REVIEWER ONLY, the fresh-eyes posture, `EXPLICITLY DO NOT RELITIGATE` citing spec §1.1 R1-R14, a consequence bound, a `PROBE DOMAIN:` line (the committed fixtures and the four harness scenarios), the threat fence (ordinary authoring mistakes), and the `VERDICT:` / `FINDINGS:` closing lines. No touched file is enrolled in `tests/mutation/source/registry.ts` (checked at plan time), so no `GUARD SURFACE:` line applies. Fixes land as new commits; rounds are recorded in the review-round corpus.

## Task 21 — Invariant-8 UI quality gate — run by the orchestrator

The dual gate of AGENTS.md invariant 8: `/impeccable` run once in its critique mode and once in its audit mode, each with the v3 setup gates (the context loader's read of PRODUCT.md and DESIGN.md, then the product-register reference), over the UI diff: `components/admin/**` files touched by Tasks 6-17 and the `DESIGN.md` addendum (Task 8). P0 and P1 findings are fixed (new commits) or deferred through a `DEFERRED.md` entry naming its class-sweep exception. Findings and dispositions go into closeout.md §12 in the gate-run commit, together with the machine-checkable `impeccable-gate:` marker line (grammar: `tests/docs/_invariant8Closeout.ts:44-49`). Until that commit, no file in this unit names both gate modes in one phrase and no line starts with the marker prefix, so `tests/docs/_metaInvariant8Closeout.test.ts` stays green at plan time.

## Task 22 — Closeout

See closeout.md for the ordered steps.
