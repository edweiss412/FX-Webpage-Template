# Missing-pack-list notice — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this arc runs it natively, inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `PULL_SHEET_MISSING` notice when a show's sheet yields no pack list, quiet when an archived pull-sheet tab already speaks for the absence.

**Architecture:** One warn code emitted from `parseSheet` right after `parsePullSheet` when `pullSheet` is null, registered through the same files as `VENUE_ADDRESS_MISSING` (the template arc, `docs/superpowers/plans/2026-10-25-nearmiss-read-blocks-and-venue-address.md` Task 2). `finalizeArchivedTabs` removes it whenever the exporter returned at least one archived pull-sheet tab. No component change.

**Tech Stack:** TypeScript, Vitest, the markdown-fixture parser under `lib/parser/`, the sync helpers under `lib/sync/`.

**Spec:** `docs/superpowers/specs/parser/2026-10-26-pack-list-missing-warning-design.md` (approved at spec review round 4). Executors read both.

**Branch:** `feat/pack-list-missing-warning`

impeccable-gate: N/A — no UI surface

No file under `app/` or `components/`, no `app/globals.css` token block, no `DESIGN.md`, no `tailwind.config.*` is touched. The notice renders through the existing section callout and catalog-driven cards (spec §4.5).

## Global Constraints

- Copy is verbatim from spec §4.6; no em dash, straight apostrophes, none of the copy-restore spec §4.1 banned vocabulary.
- `rawSnippet` is the literal `"no pack list"`; `blockRef` is exactly `{ kind: "pull_sheet" }`; `message` is the Doug-readable string of spec §4.3, because the staged first-seen card shows it.
- §12.4 lockstep: master spec row, `pnpm gen:spec-codes`, `lib/messages/catalog.ts` row land in one commit (AGENTS.md).
- The notice never changes any parse-result field but `warnings` (spec §4.2).
- Corpus-derived counts and verdicts in tests are computed from fixtures or exporter output, never retyped.
- Heavy phases (full suite) run under `pnpm heavy`, outermost only.

## Review Focus

1. A sheet the parser cannot read at all (MI-1 version-detection failure): `pullSheet` is null on the stub, and the notice must not fire. Pinned in Task 1 (AC-3).
2. An accepted archived tab whose content changed: `discardAndRerun` re-runs `finalizeArchivedTabs` on the no-override parse, which still has archived tabs, so the notice must stay removed. Pinned in Task 2 by a `discardAndRerun` case.
3. A sheet with an archived tab AND other warnings: removal must keep every other warning and its order, since review jump targets key on array position. Pinned in Task 2 (AC-4).
4. A notice that was Ignored: the fingerprint is the constant snippet, so it must be stable across two different firing fixtures. Pinned in Task 1 by asserting two firing fixtures produce equal `warningFingerprint` values.
5. A pack list with cases but zero items: no notice (spec §7 item 1). Pinned in Task 1 by a case that mocks `parsePullSheet` to return one itemless case on a firing fixture.

## Meta-test inventory

EXTENDS:
- `tests/parser/dataGapsClassCompleteness.test.ts` (gap-class partition): one new `GAP_CLASSES` member.
- `tests/messages/_metaWarningCardCopy.test.ts` (card-copy registry): one new registry code, and the Ignore-naming pin.
- `tests/cross-cutting/codes.test.ts` (x1 catalog parity): one new §12.4 row.
- `tests/parser/warningScanScopeAnchor.test.ts` via `tests/parser/_warningCodeAnchor.ts`: one new code.
- `tests/app/admin/attentionModalGallery.serverProps.test.ts`: `RENDERED_IDS_BEFORE` gains one id.
- `tests/messages/_metaErrorCatalogDocs.test.ts`, `tests/help/errors-grouping.test.tsx`: exercised, no edit expected (`PULL` prefix mapped in `app/help/errors/_families.ts`).

CREATES: none.

Not applicable, with reason: Supabase call boundaries, admin-alert catalog, advisory-lock topology, email normalization, sentinel hiding, mutation-surface observability — no DB call, no admin alert, no lock, no email, no tile change, no mutation surface.

## Acceptance-criteria coverage

The criteria live in the spec (§5); this table maps each to its owner.

| Spec criterion | Owner |
| --- | --- |
| AC-1, AC-2, AC-3, AC-6, AC-7, AC-8 | Task 1 |
| AC-4, AC-5 | Task 2 |

## Registry reconciliation (run at plan time)

Measured 2026-10-26 on the branch tip by a throwaway `tsx` script importing each registry and reading the copy-spec counts. "After" is what Task 1 must produce; every row moves by exactly the one code `PULL_SHEET_MISSING` or not at all.

| Registry | Now | After |
| --- | --- | --- |
| `GAP_CLASSES` (`lib/parser/dataGaps.ts`), pinned `tests/parser/dataGaps.test.ts:44` | 40 | 41 |
| `DATA_GAP_CODES` size, pinned `tests/parser/dataGapsClassCompleteness.test.ts:97` | 40 | 41 |
| Persisted-warning universe, pinned `tests/parser/dataGapsClassCompleteness.test.ts:101`, title "total 61 (40/8/2/11)" | 61 | 62, title "total 62 (41/8/2/11)" |
| `MESSAGE_CATALOG` keys | 284 | 285 |
| `SPEC_CODES` keys (`lib/messages/__generated__/spec-codes.ts`) | 284 | 285, regenerated |
| `WARNING_CODE_ANCHOR` (`tests/parser/_warningCodeAnchor.ts`) | 62 | 63 |
| `WARNING_CARD_COPY_CODES` | 49 | 50 |
| `EXPECTED_TRIGGER_CONTEXT` keys | 49 | 50 |
| `EXPECTED_HELPFUL_CONTEXT` keys | 49 | 50 |
| `EXPECTED_CONTROLS_NOTE` keys | 4 | 5 |
| `EXPECTED_LONG_EXPLANATION` keys | 2 | 3 |
| Codes whose `controlsNote` names Ignore | `["UNKNOWN_FIELD","VENUE_ADDRESS_MISSING"]` | `["PULL_SHEET_MISSING","UNKNOWN_FIELD","VENUE_ADDRESS_MISSING"]` (sorted) |
| Copy-restore spec §3.1 heading "(N codes)" | 49 | 50 |
| Copy-restore spec §3.1 "Parser emitters (N)" | 36 | 37 |
| `EXPECTED_CORPUS_WARN_CODES` (raw corpus) | 8 | 9: the notice fires on 8 of 10 raw fixtures (spec TABLE-A) |

## Pre-draft code-verification pass

Run 2026-10-26 against the branch tip, `grep -c -F <symbol> <file>`:

```
1  lib/parser/pull-sheet.ts  ::  export function parsePullSheet
1  lib/parser/index.ts  ::  const pullSheetResult = parsePullSheet(markdown);
1  lib/parser/index.ts  ::  function buildMinimalParsedSheet(
1  lib/parser/warnings.ts  ::  export function emitVenueAddressMissing
1  lib/parser/warnings.ts  ::  export const VENUE_ADDRESS_MISSING
1  lib/sync/pullSheetOverride.ts  ::  export function finalizeArchivedTabs
1  lib/sync/pullSheetOverride.ts  ::  export async function discardAndRerun
1  lib/parser/dataGaps.ts  ::  export function isQualityRegression
3  lib/admin/step3SectionStatus.ts  ::  KIND_TO_SECTION
1  lib/admin/step3SectionStatus.ts  ::  export function sectionForWarning
1  lib/dataQuality/ignorableSnippet.ts  ::  export function hasIgnorableSnippet
1  lib/dataQuality/warningFingerprint.ts  ::  export function warningFingerprint
1  tests/parser/mutation/fixtures.ts  ::  FixtureRef
1  tests/_shared/premise.ts  ::  export function premiseHolds
```

## Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1 — PULL_SHEET_MISSING, emitted by the parser and registered end to end

<!-- task: red=`pnpm exec vitest run tests/parser/pullSheetMissing.test.ts` red-state=authored red-target=`lib/parser/index.ts:679` why=`parseSheet reads parsePullSheet's result on this line and emits nothing when pullSheet is null, so the new suite's corpus case expecting exactly one PULL_SHEET_MISSING on fixtures/shows/exporter-xlsx/fintech.md fails until the emit call follows this line` ac=AC-1,AC-2,AC-3,AC-6,AC-7,AC-8 -->

**Files:**
- Create: tests/parser/pullSheetMissing.test.ts (new; the path the red command names)
- Modify: `lib/parser/warnings.ts`, `lib/parser/index.ts`, `lib/parser/dataGaps.ts`, `lib/messages/catalog.ts`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md`, `lib/messages/__generated__/spec-codes.ts` (regenerated), the `gen:internal-code-enums` output (regenerated), `tests/messages/warningCardCopyRegistry.ts`, `tests/messages/_metaWarningCardCopy.test.ts`, `tests/parser/_warningCodeAnchor.ts`, `tests/parser/dataGaps.test.ts`, `tests/parser/dataGapsClassCompleteness.test.ts`, `tests/app/admin/attentionModalGallery.serverProps.test.ts`, every parser corpus baseline that records warning signatures (Step 4 names them).

**Interfaces:**
- Produces, in `lib/parser/warnings.ts`: `export const PULL_SHEET_MISSING = "PULL_SHEET_MISSING"` and `export function emitPullSheetMissing(agg: ParseAggregator | undefined): void`, pushing `{ severity: "warn", code: "PULL_SHEET_MISSING" (literal), message: "We didn't find a pack list we could read in this sheet." (spec §4.3), blockRef: { kind: "pull_sheet" }, rawSnippet: "no pack list" }`. Modelled on `emitVenueAddressMissing`.
- Task 2 consumes the `PULL_SHEET_MISSING` constant.

- [ ] **Step 1: RED.** Create the new suite tests/parser/pullSheetMissing.test.ts, mirroring `tests/parser/venueAddressMissing.test.ts` (same `FIXTURES`/`readFixture` from `tests/parser/mutation/fixtures.ts`, same `premiseHolds`):
  - AC-1: for every `FIXTURES` entry, parse with `parseSheet(readFixture(f), f.path)`; `expected = parsed.pullSheet === null`; assert the count of `PULL_SHEET_MISSING` is `expected ? 1 : 0`. Premises above the loop, unconditional: some fixture expects 1, some expects 0.
  - AC-2: on the first firing fixture's warning: `severity === "warn"`, `blockRef` deep-equals `{ kind: "pull_sheet" }`, `rawSnippet === "no pack list"`, `message` equal to the spec §4.3 string, `sourceCell` undefined, `hasIgnorableSnippet(w)` true, `sectionForWarning(w) === "packlist"`.
  - Review Focus 4: two distinct firing fixtures' warnings give equal non-null `warningFingerprint` values.
  - AC-3: `parseSheet("")` (the MI-1 stub; premise: its `hardErrors` contains `MI-1_VERSION_DETECTION_FAILED` and `pullSheet === null`) carries no `PULL_SHEET_MISSING`.
  - Review Focus 5: `vi.doMock("@/lib/parser/pull-sheet")` so `parsePullSheet` returns `{ pullSheet: [{ caseLabel: "Case 1", items: [] }], warnings: [] }`, re-import `parseSheet`, parse `fixtures/shows/exporter-xlsx/fintech.md` (premise: its unmocked parse fires the notice), and assert the mocked parse carries no `PULL_SHEET_MISSING` and has `pullSheet` with one case of zero items. Unmock and `vi.resetModules()` in a `finally`, as the AC-6 case does.
  - AC-6: the same `vi.doMock` shape as the venue suite's emitter-silenced case, mocking `emitPullSheetMissing` to a no-op; on every firing fixture assert the result minus `warnings` deep-equals the real result minus `warnings`, with premises that the real parse emitted the notice and the silenced one did not.
  Run: RED on AC-1 and AC-2.
- [ ] **Step 2: GREEN, code.** Add the constant and `emitPullSheetMissing` to `lib/parser/warnings.ts`; in `lib/parser/index.ts` after `const pullSheet = pullSheetResult.pullSheet;` add `if (pullSheet === null) emitPullSheetMissing(agg);` with a one-line comment citing the spec §4.1.
- [ ] **Step 3: GREEN, registration (one commit with Step 2, spec §4.7):**
  - Master spec §12.4 row beside `PULL_SHEET_ON_ARCHIVED_TAB`, condition column "the sheet yields no pack list: no tab with PULL SHEET in its name, or nothing in it we read as a pack list (spec `docs/superpowers/specs/parser/2026-10-26-pack-list-missing-warning-design.md`)", Doug-facing cell and follow-up from spec §4.6, crew cell `—`; plus the YAML appendix `PULL_SHEET_MISSING:` `helpfulContext` line.
  - `pnpm gen:spec-codes` and `pnpm gen:internal-code-enums`.
  - `lib/messages/catalog.ts` row, every field verbatim from spec §4.6.
  - `lib/parser/dataGaps.ts` `GAP_CLASSES` entry `{ code: "PULL_SHEET_MISSING", label: "missing pack list", gateExempt: true }` placed beside the venue entry; count pins and the completeness title per the reconciliation table.
  - Copy-restore spec §3.1 heading count, "Parser emitters" list and count, and an appended §4.2 row `PULL_SHEET_MISSING — title: **"No pack list found"**`.
  - `tests/messages/warningCardCopyRegistry.ts`: the five maps per the reconciliation table, values verbatim from spec §4.6; `EXPECTED_CORPUS_WARN_CODES` gains the code.
  - `tests/messages/_metaWarningCardCopy.test.ts`: the Ignore-naming pin per the reconciliation table, with a comment paragraph matching the venue one: `PULL_SHEET_MISSING` always writes the constant snippet.
  - `tests/parser/_warningCodeAnchor.ts`: `WARNING_CODE_ANCHOR` gains the code.
  - `tests/app/admin/attentionModalGallery.serverProps.test.ts`: `RENDERED_IDS_BEFORE` gains `warn-pull-sheet-missing`, with a comment line in the venue entry's style.
  - AC-7 in `tests/parser/dataGaps.test.ts`, beside the venue case: `isQualityRegression(summarize([X]), summarize([X, warn("PULL_SHEET_MISSING")]))` is false, with a positive control that adding a non-exempt code is a regression.
- [ ] **Step 4: Baselines.** Run `pnpm exec vitest run tests/parser` and, for each baseline suite that fails only on new `PULL_SHEET_MISSING` signatures, regenerate with its update env var (`UPDATE_VENUE_PARITY_BASELINE=1` for `tests/parser/venueSignalParity.test.ts`; any other found is named in the commit body with its env var). Review each diff: the only added signature is one `PULL_SHEET_MISSING` per fixture whose `pullSheet` is null; nothing removed.
- [ ] **Step 5: GREEN run.** `pnpm exec vitest run tests/parser/pullSheetMissing.test.ts tests/parser/dataGaps.test.ts tests/parser/dataGapsClassCompleteness.test.ts tests/messages tests/cross-cutting/codes.test.ts tests/help tests/app/admin/attentionModalGallery.serverProps.test.ts tests/parser/warningScanScopeAnchor.test.ts`: all green.
- [ ] **Step 6: Commit** `feat(parser): PULL_SHEET_MISSING notice when a sheet yields no pack list`.

### Task 2 — finalizeArchivedTabs removes the notice when an archived pull-sheet tab exists

<!-- task: red=`pnpm exec vitest run tests/sync/pullSheetOverrideReconcile.test.ts` red-state=authored red-target=`lib/sync/pullSheetOverride.ts:230` why=`finalizeArchivedTabs attaches the tabs and appends the archived-tab warnings on these lines but never removes PULL_SHEET_MISSING, so the new case finalizing a parse that carries the notice with one archived tab still finds it` ac=AC-4,AC-5 -->

**Files:**
- Modify: `lib/sync/pullSheetOverride.ts`, `tests/sync/pullSheetOverrideReconcile.test.ts`

**Interfaces:**
- Consumes: `PULL_SHEET_MISSING` from `lib/parser/warnings.ts` (Task 1).
- Produces: no new export; `finalizeArchivedTabs(pr, tabs)` keeps its signature and return.

- [ ] **Step 1: RED.** In `tests/sync/pullSheetOverrideReconcile.test.ts`, a `describe("finalizeArchivedTabs and PULL_SHEET_MISSING")`:
  - AC-4 removal: `pr.warnings = [other1, notice, other2]` (two distinct non-notice warnings, premise that the notice is present); finalize with one `included: false` tab → warnings equal `[other1, other2, <one PULL_SHEET_ON_ARCHIVED_TAB>]` in that order. Same with one `included: true` tab → `[other1, other2]`.
  - AC-4 positive control: same input, empty tab list → warnings deep-equal the input.
  - Review Focus 2: `discardAndRerun` does not call `finalizeArchivedTabs` itself; the production callers' `reparseNoOverride` closures do (`lib/sync/runScheduledCronSync.ts` and `lib/sync/runOnboardingScan.ts`, each `return finalizeArchivedTabs(…, noOverride.archivedPullSheetTabs)`). Mirror that: `reconcile: { kind: "content_changed", changedTab }`, `reparseNoOverride: async () => finalizeArchivedTabs(<parse carrying the notice>, [changedTab with included: false])`, `clearOverride: async () => {}`. Assert the returned `parseResult` has no `PULL_SHEET_MISSING` and does carry `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`. Paired case with `reconcile: { kind: "tab_missing" }` and a closure finalizing with `[]`: the notice stays (one), because no archived tab remains to speak for the absence (spec §4.1 stage 2).
  - AC-5: synthesize `fixtures/shows/exporter-xlsx/redefining-fi.xlsx` and `fintech.xlsx` with `synthesizeMarkdownFromXlsx`, parse each markdown, finalize with the returned tabs. Premises read from the exporter: redefining's tab list is non-empty, fintech's is empty, and both raw parses carry the notice. Assert redefining ends with zero `PULL_SHEET_MISSING` and fintech with one.
  Run: RED on the removal and AC-5 redefining cases.
- [ ] **Step 2: GREEN.** In `finalizeArchivedTabs`, when `tabs.length > 0`, replace `pr.warnings` with the same array minus every warning whose `code === PULL_SHEET_MISSING`, before appending the archived-tab warnings. Comment cites spec §4.1 stage 2.
- [ ] **Step 3: GREEN run.** `pnpm exec vitest run tests/sync/pullSheetOverrideReconcile.test.ts tests/sync/sourceAnchorsPipeline.test.ts tests/sync/prepareOnboardingFilesErrorKind.test.ts tests/parser/payloadZeroWidthEnriched.test.ts` (every suite that calls `finalizeArchivedTabs`): green.
- [ ] **Step 4: Commit** `feat(sync): drop PULL_SHEET_MISSING when an archived pull-sheet tab exists`.

<!-- tasks: end -->

## Closeout

Run in order on the final tree, from the worktree root; a red stops the closeout.

1. `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`.
2. `pnpm exec eslint .` and `pnpm format:check`.
3. Full unit suite, outermost-wrapped: `pnpm heavy pnpm test`.
4. Generated-file freshness: `pnpm gen:spec-codes && pnpm gen:internal-code-enums && git diff --exit-code lib/messages/__generated__/`.
5. The probe re-run (`pnpm exec tsx docs/superpowers/specs/parser/probes/2026-10-26-pack-list-missing-probe.ts`) prints the same TABLE-A/B verdicts as the committed `.out.txt`.
6. Invariant 8: no UI surface (marker line above). Invariant 12: no ledger row is closed by this branch.
7. Whole-diff cross-model review (codex-guard, `--stage diff`). Then push, real CI green on all required checks, `gh pr merge --merge`, fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` is `0  0`.

## Documented limits

The spec's §7 is the record; this plan adds none.
