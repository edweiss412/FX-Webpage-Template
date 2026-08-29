# Plan — the three wave codes get a cell link

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `REF_ERROR_LITERAL`, `ROW_CELLS_FUSED` and `LEADING_COLUMN_AUTOCORRECTED` warning whose source cell can be recovered carries a `scope: "cell"` anchor, so its wizard row and its published card render "Open in Sheet" and a "Sheet cell TAB!A1" line; every warning whose cell cannot be recovered stays exactly as it is today.

**Architecture:** The three parser modules each split into a position-reporting scanner and the unchanged emitter. A new resolver under `lib/drive/` replays those scanners over `synthesizeBlocksFromXlsx`'s block list, rendered per block by the ONE renderer `synthesizeMarkdownFromXlsx` uses, so each hit maps to `(absRow, absCol0 + cell)`. `attachSourceCellAnchors` gains a branch that pairs the i-th warning of a code with the i-th replay hit under count and content guards, ahead of the existing region fallbacks. Two components gain one span each.

**Tech Stack:** TypeScript, Next.js 16, `xlsx` (SheetJS), Vitest + Testing Library, `pnpm spec:lint`, `codex-guard`.

**Status:** APPROVED 2026-08-29 by cross-model review at its fifth round (R1 to R4 returned 12, 9, 5 and 1 findings, every one repaired by class sweep in the same round; R5, authorized past the four-round cap by bl-orch at 13:44 CDT, returned none; rows in `docs/review-rounds/feat/ref-error-cell-anchors/`, the plan stage's round-economy record beside them). Implementation and closeout are the Opus pane's (§8).

**Spec:** `docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md` (canonical). Branch `feat/ref-error-cell-anchors`, worktree `/Users/ericweiss/FX-worktrees/reflink`. Closes no ledger row; files none.

**The invariant-8 closeout marker lives in the stem-named sibling closeout file** new file 2026-08-29-ref-error-cell-anchors-closeout.md under `docs/superpowers/plans/`, written by Task 6.

## Global constraints

- **THE ARC NEVER MERGES.** bl-orch (`w15:p2`) issues the merge word after its own gates. No `gh pr merge`, no `--auto`, no auto-merge at push time. Task 6 ends with a readiness line sent to bl-orch.
- **The local Postgres is a named single slot.** Take no DB-touching run until bl-orch names you holder. `DB-free` in this plan means one of two things, and nothing else: the vitest `parallel` project (`vitest.projects.ts` `PARALLEL_TEST_GLOBS`: `tests/parser`, `tests/drive`, `tests/components`, `tests/sheet-links` among others; CI runs that whole project with no database as `unit-suite-nodb`, `.github/workflows/unit-suite.yml:146`), or an explicitly listed file that opens no client (this plan's four serial-project files: `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/admin/perShowActionableTransitions.test.tsx`, `tests/admin/sectionWarningModel.autocorrect.test.ts`, `tests/sync/attachWarningAnchors.test.ts`; none imports a Supabase client or reads `TEST_DATABASE_URL`, `rg` 2026-08-29). `tests/admin` and `tests/sync` as DIRECTORIES are serial and DB-sharing, and `pnpm test:fast` is the full suite with different phase timing (`scripts/test-fast.mjs:2-6`), not a DB-free half (the R4 review's finding). The full suite (`pnpm heavy pnpm test`) waits for the slot, with the explicit loopback `TEST_DATABASE_URL` override (the wave-common brief under FX-worktrees/_briefs).
- **The pre-push set is derived, not remembered.** Before every push, read `.github/workflows/quality.yml` and run what its `quality` job runs (read the file, do not recite this list), plus the DB-free half of the unit suite.
- **Every message to bl-orch is chunked under 600 characters, numbered, with the arc name `arc-reflink` in EACH part**, sent with `herdr agent send w15:p2 "<msg>"` then `sleep 3; herdr pane send-keys w15:p2 Enter`, and read back. The decision ask goes in the LAST sentence.
- **Review cap is four rounds per stage.** At four, file the round-economy record (the base-sha-named markdown beside the JSONL rows under docs/review-rounds/feat/ref-error-cell-anchors) and report to bl-orch before any further round. `--round` restarts at 1 after any merge-base move. Every dispatch goes through `node scripts/codex-guard.mjs review --brief <file> --cwd <worktree> --out <fresh dir> --stage diff --round <n>`, backgrounded, and the wrapper's JSONL rows under `docs/review-rounds/feat/ref-error-cell-anchors/` are committed with the arc.
- **Tree read-only while a review round is in flight.** Repairs park until the verdict.
- **Process mint freeze in force.** This arc files no ledger row.
- **Copy rules** (spec §3, §7): no em dash in user-visible strings, no apostrophe in the new string, canonical classes only.
- **Heavy phases wrap:** `pnpm heavy <cmd>` for any full-suite vitest, playwright, or build; scoped vitest runs with an explicit file list stay unwrapped.
- Conventional commits, one per task: `feat(drive)`, `feat(parser)`, `feat(sync)`, `feat(admin)`, `test(...)`, `docs(plan)`.

## 1. Plan-wide invariants that bear on this diff

- **Invariant 1, TDD.** Every task below is red-then-green on the SAME command; the red run's decisive line is pasted into the commit body.
- **Invariant 2, advisory locks.** N/A. `attachWarningAnchors` is a pure raw-workbook read on both ingestion paths (`lib/sync/attachWarningAnchors.ts`, header comment, "NO pg_advisory* call (invariant 2)"); this plan adds one more pure family to it and touches no lock.
- **Invariant 5, no raw codes in UI.** The new span renders `title` and `a1` from `sourceCell`, never a code.
- **Invariant 7, spec is canonical.** No amendment.
- **Invariant 8, UI gate.** IN SCOPE, two files under `components/`: `components/admin/wizard/step3ReviewSections.tsx` (one span in the warning row, Task 5) and `components/admin/PerShowActionableWarnings.tsx` (one span in the card, Task 5). Task 6 runs the critique + audit pair and writes the marker line in the sibling closeout file.
- **Invariant 9, Supabase call boundaries.** N/A. No Supabase client call is added or edited.
- **Invariant 10, mutation-surface observability.** N/A. No route handler or server action is added or edited.
- **Invariant 12, ledger.** No row closed, no row filed, no marker.

## 1.1 Do not relitigate

Spec §1.1 in full, plus:

- **Ordinal pairing is the design, and the guards are what make it safe** (spec §2.4). A reviewer who wants a key join on `(kind, snippet)` is asking for the design spec §1 fact 1 measured as returning null on the dispatching workbook: five identical keys on five tabs.
- **`tests/parser/waveCodesNoSourceCell.test.ts` is replaced, not extended.** Its header names this change as the reason it would be replaced (spec §2.5).
- **The grain rule is a class repair, and `FIELD_UNREADABLE` is a peer of the shape** (spec §1.1 point 10 of the round-2 brief; AGENTS.md class-sweep default). A finding that it touches a code outside the three is reading the sweep.
- **This plan does not name both gate halves; the closeout sibling does.** `tests/docs/_invariant8Closeout.ts` `declaresGate` folds the unit (plan + stem-named sibling) and requires both phrases; a plan that named both before the marker exists would red the guard on every intermediate commit. Task 6 writes both phrases and the marker in one commit.
- **`attachWarningAnchors`'s fifth parameter stays optional.** Seven existing test call sites pass three or four arguments; both production call sites forward it (Task 4). A missing forward degrades to refusal (spec §2.4 "Same blocks"), never to a wrong cell.

## 2. Meta-test inventory

- CREATES a new suite waveCodeAnchors.test.ts under `tests/drive/` (Task 3: replay equals parse over the corpus and six constructed variants, the sixth being the Step 2.5 seam pin; the refusals and the positive hand-built pairings) and a new suite waveCodeAnchors.resolution.test.ts beside it (Task 4: T3, the dispatching workbook's five cells through `attachWarningAnchors`).
- REPLACES `tests/parser/waveCodesNoSourceCell.test.ts` with waveCodesSourceCell.test.ts under `tests/parser/` (Task 4).
- EXTENDS `tests/parser/refErrorLiteral.test.ts`, `tests/parser/rowCellsFused.test.ts`, `tests/parser/leadingColumnAutocorrect.test.ts` (Task 2: scanner positions and emitter equivalence), `tests/drive/synthesizeBlocks.test.ts` (Task 1: `blockMarkdown`), `tests/sync/attachWarningAnchors.test.ts` (Task 4: `synthOpts` reaches the replay), `tests/parser/operatorActionableWarnings.test.ts` and `tests/admin/sectionWarningModel.autocorrect.test.ts` (Task 4: five rows stay five on the staged selector and in the published model), `tests/components/step3SheetCard.test.tsx`, `tests/components/step3SheetCard.transitions.test.tsx`, `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/admin/perShowActionableTransitions.test.tsx` (Task 5).
- Not applicable: `tests/auth/_metaInfraContract.test.ts` (no Supabase call), `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutation surface), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock), `tests/mutation/source/registry.ts` (no enrolled surface is touched: none of the three parser modules nor any `lib/drive/*Anchors.ts` has a row, `rg` 2026-08-29), `tests/messages/_metaWarningCardCopy.test.ts` (no catalog change).
- `tests/docs/_metaInvariant8Closeout.test.ts` reads this plan and its sibling closeout file by walker; Task 6 satisfies it.

## 3. Pre-draft verification (run 2026-08-29 on `origin/main` at `e7751f61d`, which this branch's code equals at `cb5cc3abd`)

Every symbol below was grepped on the live tree; line numbers are drafting-time locators.

- `lib/drive/exportSheetToMarkdown.ts:112` `export type GridBlockRow = { absRow: number | null; cells: string[] }`; `lib/drive/exportSheetToMarkdown.ts:117` `export type GridBlock = { kind: "grid"; sheetName: string; absCol0: number; rows: GridBlockRow[] }`; `lib/drive/exportSheetToMarkdown.ts:119` `OpaqueBlock = { kind: "opaque"; markdown: string }`; `lib/drive/exportSheetToMarkdown.ts:120` `SynthesizedBlock`; `lib/drive/exportSheetToMarkdown.ts:93` `expandMerges` (top-left row only, columns of the merge); `lib/drive/exportSheetToMarkdown.ts:231-256` `trimBlock` (column slice from `firstNonBlankCol`, rows never sliced, `absCol0: firstCol + firstNonBlankCol`; `normalizeBlock` is the identity today, spec §2.1); `lib/drive/exportSheetToMarkdown.ts:259` `export function renderRow(cells, width)`; `lib/drive/exportSheetToMarkdown.ts:264` `function tableMarkdown(block)` (NOT exported; header row, one delimiter row of colon-dash-colon cells, remaining rows); `lib/drive/exportSheetToMarkdown.ts:377` `export function synthesizeBlocksFromXlsx(buffer, opts?)`; `lib/drive/exportSheetToMarkdown.ts:392` `export function synthesizeMarkdownFromXlsx(buffer, opts?)` whose body is `blocks.map(b => b.kind === "grid" ? tableMarkdown(b.rows.map(r => r.cells)) : b.markdown)` joined with `"\n\n"`; `lib/drive/exportSheetToMarkdown.ts:434` a second `tableMarkdown` caller inside the OLD-tab region collection (unchanged by Task 1).
- `lib/parser/refErrorDetector.ts:41` `REF_LITERAL = "#REF!"`; `lib/parser/refErrorDetector.ts:56` `isAlignmentRow`; `lib/parser/refErrorDetector.ts:87` `kindOfFirstCell`; `lib/parser/refErrorDetector.ts:103` `firstCell`; `lib/parser/refErrorDetector.ts:110` `export function detectRefErrorLiterals(markdown): ParseWarning[]`, the loop at `lib/parser/refErrorDetector.ts:112-159` walks `lines`, resets `sectionKind` on `prevBlank || opener !== null`, skips non-rows and alignment rows, and pushes `{ severity: "warn", code: "REF_ERROR_LITERAL", message, blockRef: { kind: sectionKind }, rawSnippet: cellRaw.trim() }` per cell of `splitRow(line)` whose `clean()` contains the literal.
- `lib/parser/rowWidthDiscriminator.ts:135` `type Row = { line; cells; alignment; header }`; `lib/parser/rowWidthDiscriminator.ts:137` `export function detectFusedRows(markdown)`; `lib/parser/rowWidthDiscriminator.ts:157-163` `closeRun` (drops `runWarnings` when `runAmbiguous`); `lib/parser/rowWidthDiscriminator.ts:165-200` `flush` (modal over DATA rows, pushes `{ code: "ROW_CELLS_FUSED", blockRef: { kind: sectionKind }, rawSnippet: r.line.trim() }` for each row at `modal - 1`); `lib/parser/rowWidthDiscriminator.ts:205-236` the row loop (`analyzeRow`, delimiter counting, `sectionKind` from `kindOfFirstCell(firstCell(...))`).
- `lib/parser/leadingColumnNormalize.ts:9` `export function normalizeLeadingColumn(markdown): { corrected: string; warnings: ParseWarning[] }`; `lib/parser/leadingColumnNormalize.ts:26` `correct(from, to)` shifts `lines[from..to)` left and pushes ONE warning with `blockRef.kind` from `canonicalSectionKind(lines[from].split("|")[1])` post-shift; `lib/parser/leadingColumnNormalize.ts:139-147` `opener`; the loop at `lib/parser/leadingColumnNormalize.ts:150-167` calls `correct(start, i)` when `rows.every(leadsEmpty)`; `lib/parser/leadingColumnNormalize.ts:168` returns `lines.join("\n")`.
- `lib/parser/index.ts:558` `export function parseSheet(markdown, filename?)`; `lib/parser/index.ts:572` `stripZeroWidth`; `lib/parser/index.ts:616-617` Step 2.5 `normalizeSectionHeaders` → `markdown = secNorm.corrected`; `lib/parser/index.ts:625-626` Step 2.55 `normalizeLeadingColumn` → `markdown = colNorm.corrected`; `lib/parser/index.ts:632-633` Step 2.6 `detectRefErrorLiterals(markdown)`, `detectFusedRows(markdown)`, pushed in that order. `lib/parser/sectionHeaderNormalize.ts:67` `normalizeSectionHeaders` rewrites only `parts[1]` of a matched header line and returns `out.join("\n")` over a `lines.map` (line count preserved).
- `lib/drive/showDayTimeAnchors.ts:32` `CELL_ANCHORED_CODES`; `lib/drive/showDayTimeAnchors.ts:40-43` `KIND_TO_REGION = { agenda: "schedule", pull_sheet: "gear_packlist" }`; `lib/drive/showDayTimeAnchors.ts:118` `export type WarningAnchorSources = { showDay; crewRole; unknownField?; region }`; `lib/drive/showDayTimeAnchors.ts:138` `export function attachSourceCellAnchors(warnings, sources)`; `lib/drive/showDayTimeAnchors.ts:143` the gate; `lib/drive/showDayTimeAnchors.ts:145-199` the branch chain (`SCHEDULE_TIME_UNPARSED`, five crew codes, `UNKNOWN_FIELD`, `FIELD_UNREADABLE`, `ORPHANED_CREW_ROWS`, `HOTEL_REGION_ANCHORED`, `KIND_TO_REGION`, the four region codes); `lib/drive/showDayTimeAnchors.ts:206` `if (cell) w.sourceCell = cell`; `lib/drive/showDayTimeAnchors.ts:211` `hasCellAnchoredWarning`.
- `lib/sync/attachWarningAnchors.ts:24` `export async function attachWarningAnchors(warnings, bytes, resolveGids, regionAnchors?)`; `lib/sync/attachWarningAnchors.ts:38-44` the per-family `safe` wrapper; `lib/sync/attachWarningAnchors.ts:45-50` `attachSourceCellAnchors(warnings, { showDay, crewRole, unknownField, region })`. Production call sites: `lib/sync/runOnboardingScan.ts:1435` (`parseResult.warnings, bytes, resolveGids, sourceAnchors`; in scope there: `pullSheetOverrideApplied: OverrideSnapshot`, `lib/sync/runOnboardingScan.ts:1326`, reassigned `lib/sync/runOnboardingScan.ts:1379` on discard-and-rerun, where `parseResult` is likewise reassigned `lib/sync/runOnboardingScan.ts:1378` to the no-override reparse of `lib/sync/runOnboardingScan.ts:1354`) and `lib/sync/runScheduledCronSync.ts:3325` (`enriched.warnings, xlsxBytes, async () => titleToGid, sourceAnchors ?? {}`; in scope: `includeOpts`, `lib/sync/runScheduledCronSync.ts:3149`, `{ includePullSheetFromTab } | {}`; the cron's discard-and-rerun at `lib/sync/runScheduledCronSync.ts:3378` onward runs AFTER this call and replaces only `pullSheet` on `...enriched`). `lib/sync/pullSheetOverride.ts:22` `OverrideSnapshot = { tabName: string; fingerprint: string } | null`.
- `lib/drive/unknownFieldAnchors.ts:45` `export function normalizeCellKey(s)` (`clean` + whitespace collapse + lower); `lib/drive/unknownFieldAnchors.ts:70` `synthesizeBlocksFromXlsx(buffer)` (no opts) is that scanner's own call.
- `lib/sheet-links/buildSheetDeepLink.ts:10` `SourceAnchor = { title; gid; a1?; scope?: "cell" | "tab" }` (comment: scope "is set by the raw-workbook anchor scanner and by nothing else"; Task 3 amends the comment to name the second scanner); `lib/sheet-links/buildSheetDeepLink.ts:35-39` the `scoped` branch.
- `lib/parser/dataGaps.ts:459` `operatorActionableWarnings` dedups by `${code}\0${gid}\0${a1}` only when `a1` is truthy; `lib/parser/dataGaps.ts:507` `stripLegacyUnknownFieldAnchors` (UNKNOWN_FIELD only, colon fingerprint); `lib/parser/dataGaps.ts:533` `selectActionableForDisplay`.
- `lib/dataQuality/warningIdentity.ts:9` `warningIdentityKey` folds `${gid}:${a1}`; `lib/dataQuality/warningIdentity.ts:46` `stableWarningKeys`. `lib/dataQuality/warningFingerprint.ts:9` `warningFingerprint` is `code + " " + normalizeSnippet(rawSnippet)`.
- `components/admin/wizard/step3ReviewSections.tsx:3232` `const rowLabel = w.code === "UNKNOWN_FIELD" ? labelFromRawSnippet(w.rawSnippet) : null`, rendered at `components/admin/wizard/step3ReviewSections.tsx:3239-3245` as `data-testid={`wizard-step3-card-${dfid}-warning-${i}-label`}` with `Sheet row <span className="font-mono text-text">`; `components/admin/wizard/step3ReviewSections.tsx:3277-3287` the `-open` link. The warnings loop indexes the RAW `warnings` array (`components/admin/wizard/step3ReviewSections.tsx:2958-2970`).
- `components/admin/PerShowActionableWarnings.tsx:109-154` props (`items`, `driveFileId`, `renderItemControls?`, `condensed?`, `showControlsNote?`); `components/admin/PerShowActionableWarnings.tsx:246` `href`; `components/admin/PerShowActionableWarnings.tsx:259-260` `rawLabel` / `rowLabel`; `components/admin/PerShowActionableWarnings.tsx:320-333` the `per-show-actionable-row-label` span and its `-value` child; `components/admin/PerShowActionableWarnings.tsx:396-409` the `Open in Sheet` link.
- `tests/parser/waveCodesNoSourceCell.test.ts:48-52` `WAVE_CODES`; `tests/parser/waveCodesNoSourceCell.test.ts:66-71` `sources` (showDay, crewRole, unknownField, region with `crew`, `schedule`, `gear_packlist`); `tests/parser/waveCodesNoSourceCell.test.ts:77` `KIND_TO_REGION_UNDER_TEST`; `tests/parser/waveCodesNoSourceCell.test.ts:80-94` the control case; `tests/parser/waveCodesNoSourceCell.test.ts:96-134` the two arms per code.
- `tests/drive/unknownFieldAnchors.test.ts:19` `buildInfoWorkbook`, `tests/drive/unknownFieldAnchors.test.ts:31` `buildWorkbook(tabs)` (multi-tab, gid = insertion index), `tests/drive/unknownFieldAnchors.test.ts:57` `fixtureBuffer(relative)` (pooled-buffer slice). `tests/sync/attachWarningAnchors.test.ts:7` `xlsxBuffer(aoa)`. `tests/components/step3SheetCard.test.tsx:134` `parseResult(overrides)`, `tests/components/step3SheetCard.test.tsx:155` `stagedRow(pr)`, `tests/components/step3SheetCard.test.tsx:164` `card(q)`, `WSID` / `DFID` constants. `tests/admin/perShowActionableRenderControls.test.tsx:28` `render(<PerShowActionableWarnings items={items} driveFileId="df" />)`. `tests/admin/perShowActionableTransitions.test.tsx:104` `VARIANTS`, `tests/admin/perShowActionableTransitions.test.tsx:143` the every-ordered-pair loop. `tests/components/step3SheetCard.transitions.test.tsx:82` the §4.5 transition describe. `tests/_shared/premise.ts:26` `premise(description, actual, mustExceed)` (numeric, strictly past) and `tests/_shared/premise.ts:36` `premiseHolds(description, condition)` (boolean); there is no boolean form of `premise` (the R1 review's first finding). `tests/admin/perShowActionableTransitions.test.tsx:88-93` `warn(code, autocorrect?)` spreads `autocorrect` conditionally; `tests/admin/perShowActionableTransitions.test.tsx:104-115` `VARIANTS` `as const satisfies Record<string, { code; guidance; trigger; note }>`, every member carrying every field (the file's own TS2339 note at `tests/admin/perShowActionableTransitions.test.tsx:101-102`); `tests/admin/perShowActionableTransitions.test.tsx:121-123` `itemsFor`. `tests/admin/sectionWarningModel.autocorrect.test.ts:24-29` calls `buildSectionWarningModel({ slug, warnings, ignoredFingerprints, renderedSectionIds })`; `lib/admin/sectionWarningModel.ts:48` `active: SectionWarningItem[]`; `lib/admin/step3SectionStatus.ts:76` `sectionForWarning` returns null for a kind absent from `KIND_TO_SECTION` (`section` is absent) and `lib/admin/step3SectionStatus.ts:92-104` `warningsBySection` files such a warning under `warnings`.
- `tests/parser/parseWarningDeepLinkRender.test.tsx:21-42` pins `CELL_ANCHORED_CODES` = actionable + the five hotel codes; unchanged by this plan (no membership change). `tests/parser/operatorActionableWarnings.test.ts:8` "contains exactly the twenty-four codes", unchanged.
- Snippet typecheck (writing-plans rule): the pure snippets of Task 3 (`WAVE_CODES`, `WaveCodeSite`, `rowOfLine`, `ownerOfFragment`, `cellAnchor`, `pairWaveCodeSites`) and Task 4 (`grainOf`) were compiled 2026-08-29 against this worktree's `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) with `@/` and `xlsx` resolved: zero errors. The parts that import the not-yet-existing scanners (`extractWaveCodeSites`, `pairAllWaveCodes`) compile once Task 2 lands and are checked by Task 3's own `pnpm typecheck` step.
- Corpus probe (spec §1): `docs/superpowers/specs/probes/2026-08-29-ref-anchors-replay.report.txt`: fintech 5 REF, fixed-income 5, rpas 5, consultants 6, others 0; zero FUSED, zero LEADING; per-block equals whole-doc on 7 of 7. Reachability probe (spec §1, §8): `docs/superpowers/specs/probes/2026-08-29-leading-column-reachability.report.txt`, seven constructed workbook shapes (an unshifted section followed by a shifted one, a block-initial shifted section followed by `CLIENT`, by mixed-case `Venue`, by `DRESS`, by `VENUE`, a typo'd `TRANSPORTATON` header, a shifted row with a literal pipe), zero `LEADING_COLUMN_AUTOCORRECTED` warnings on all seven. The derivation: `lib/drive/exportSheetToMarkdown.ts:144-170` `splitBlocks` (an uppercase known header as a row's first non-blank cell starts a new block, `lib/parser/knownSections.ts:290` `isMidBlockSectionStart`) and `trimBlock` (a uniformly blank leading column is sliced off), `lib/parser/leadingColumnNormalize.ts:17-24` `leadsEmpty` (the alignment row's cell 1 is the colon-dash marker, not empty), `lib/parser/leadingColumnNormalize.ts:139-147` `opener` (a shifted opener needs `splitCellsUnescaped(line).length === lastUnshiftedWidth + 1`, impossible under `renderRow`'s padding to one width). `.github/workflows/mutation-harness.yml:30-33` triggers are `schedule` and `workflow_dispatch`; `.github/workflows/mutation-harness.yml:42-59` the `pull_request` path filter names no parser module; `.github/workflows/mutation-harness.yml:75` and `.github/workflows/mutation-harness.yml:186` `if: github.event_name != 'pull_request'` on the parser and source shard jobs; `.github/workflows/mutation-harness.yml:180-183` the documented escape `gh workflow run mutation-harness.yml --ref <branch>`. `tests/docs/_invariant8Closeout.ts:139-141`: `dispositions` must be `recorded` when `p0 + p1 > 0` and `none` otherwise. `vitest.projects.ts` `PARALLEL_TEST_GLOBS` lists the DB-free directories (`tests/components`, `tests/sheet-links`, `tests/parser`, `tests/drive` among them; `tests/admin` and `tests/sync` are absent, so they run in the serial, DB-sharing project); `scripts/test-fast.mjs:2-6` declares `test:fast` a full-suite runner with coverage identical to `pnpm test`; `.github/workflows/unit-suite.yml:146` `unit-suite-nodb` runs only the parallel project, with no database.

## 4. File structure

- NEW module waveCodeAnchors.ts under `lib/drive/`: `WAVE_CODES`, `WaveCode`, `WaveCodeSite`, `SynthOpts`, `extractWaveCodeSites`, `pairWaveCodeSites`, `pairAllWaveCodes`, `WavePairedAnchors`.
- EDIT `lib/drive/exportSheetToMarkdown.ts`: export `blockMarkdown`; `synthesizeMarkdownFromXlsx` uses it.
- EDIT `lib/parser/refErrorDetector.ts`: `scanRefErrorLiterals` + `RefErrorHit`; `detectRefErrorLiterals` maps it.
- EDIT `lib/parser/rowWidthDiscriminator.ts`: `scanFusedRows` + `FusedRowHit`; `detectFusedRows` maps it; `Row` gains `index`.
- EDIT `lib/parser/leadingColumnNormalize.ts`: return gains `shifted`.
- EDIT `lib/drive/showDayTimeAnchors.ts`: `WarningAnchorSources.wave?`, the new branch, a cursor per code.
- EDIT `lib/sync/attachWarningAnchors.ts`: fifth parameter `synthOpts?`, the `wave` family.
- EDIT `lib/sync/runOnboardingScan.ts`, `lib/sync/runScheduledCronSync.ts`: forward `synthOpts`.
- EDIT `lib/sheet-links/buildSheetDeepLink.ts`: the `scope` doc comment names both scanners.
- EDIT `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/PerShowActionableWarnings.tsx`: the cell line.
- NEW suite waveCodeAnchors.test.ts under `tests/drive/` (Task 3); NEW suite waveCodeAnchors.resolution.test.ts under `tests/drive/` (Task 4); NEW suite waveCodesSourceCell.test.ts under `tests/parser/`; DELETE `tests/parser/waveCodesNoSourceCell.test.ts`; EDIT the suites listed in §2.
- NEW sibling closeout file 2026-08-29-ref-error-cell-anchors-closeout.md under `docs/superpowers/plans/` (Task 6).

All new test files match `BASE_INCLUDE` (`vitest.projects.ts:34`, `tests/**/*.test.ts(x)`) and live in directories already in the parallel project; no wiring change.

<!-- tasks: depth=3 red-contract -->

### Task 1: `blockMarkdown`, the one renderer for a block

<!-- task: red=`pnpm vitest run tests/drive/synthesizeBlocks.test.ts` red-state=authored red-target=`lib/drive/exportSheetToMarkdown.ts:264` why=`tableMarkdown is module-private and no blockMarkdown export exists, so the new case's import is undefined and the equality it asserts throws` ac=AC-2 -->

**Files:**
- Modify: `lib/drive/exportSheetToMarkdown.ts`
- Test: `tests/drive/synthesizeBlocks.test.ts`

What is red and why: `blockMarkdown` is not exported from `exportSheetToMarkdown.ts`; the new case imports it and calls it, so it throws `TypeError` until the export lands.

- [ ] **Step 1: RED.** Add to `tests/drive/synthesizeBlocks.test.ts` (imports: add `blockMarkdown` to the existing import from `@/lib/drive/exportSheetToMarkdown`; `readdirSync`, `readFileSync` from `node:fs`; `join` from `node:path`; `premise` from `@/tests/_shared/premise`; the file has no fixture-buffer helper (`tests/drive/synthesizeBlocks.test.ts:1-8` imports `buildXlsx` only), so add `fixtureBuffer` copied from `tests/drive/unknownFieldAnchors.test.ts:57-60`, the pooled-buffer slice, with a comment naming the source; the R2 review's first finding):

```ts
describe("blockMarkdown is the one renderer synthesizeMarkdownFromXlsx uses (spec 2026-08-29 §2.2)", () => {
  const DIR = join(process.cwd(), "fixtures/shows/exporter-xlsx");
  const files = readdirSync(DIR).filter((f) => f.endsWith(".xlsx")).sort();
  it("premise: the corpus holds the seven workbooks the spec measured", () => {
    premise("corpus workbooks", files.length, 6);
  });
  for (const f of files) {
    it(`${f}: blocks.map(blockMarkdown).join("\\n\\n") equals the document`, () => {
      const buffer = fixtureBuffer(join("fixtures/shows/exporter-xlsx", f));
      const { blocks } = synthesizeBlocksFromXlsx(buffer);
      const { markdown } = synthesizeMarkdownFromXlsx(buffer);
      expect(blocks.map(blockMarkdown).join("\n\n")).toBe(markdown);
    });
  }
  it("an opaque block renders as its own markdown, a grid block as a header, one delimiter row, then rows", () => {
    const opaque = { kind: "opaque" as const, markdown: "| PULL SHEET |\n| :---: |\n| x |" };
    expect(blockMarkdown(opaque)).toBe(opaque.markdown);
    const grid = {
      kind: "grid" as const,
      sheetName: "INFO",
      absCol0: 0,
      rows: [
        { absRow: 0, cells: ["A", "B"] },
        { absRow: 1, cells: ["c"] },
      ],
    };
    expect(blockMarkdown(grid).split("\n")).toEqual(["| A | B |", "| :---: | :---: |", "| c |  |"]);
  });
});
```

The grid expectation is derived from `renderRow`'s documented contract (`exportSheetToMarkdown.ts:258`, "padded to `width`, each cell escaped"); if the literal padding differs, read `renderRow` and set the literal from it, never from the function under test's output.

Run: `pnpm vitest run tests/drive/synthesizeBlocks.test.ts` (DB-free). Expected: the new describe fails on `blockMarkdown is not a function`; the four existing cases pass.

- [ ] **Step 2: GREEN.** In `lib/drive/exportSheetToMarkdown.ts`, directly below `tableMarkdown`:

```ts
/** One block's markdown, exactly as `synthesizeMarkdownFromXlsx` emits it inside the joined
 *  document. The anchor replay renders through this same function (spec 2026-08-29 §2.2), so
 *  the text a scanner sees per block is byte for byte the text it sees in the document. */
export function blockMarkdown(block: SynthesizedBlock): string {
  return block.kind === "grid" ? tableMarkdown(block.rows.map((r) => r.cells)) : block.markdown;
}
```

and in `synthesizeMarkdownFromXlsx` replace the `tables` mapping with `const tables = blocks.map(blockMarkdown);`. The second `tableMarkdown` caller (`lib/drive/exportSheetToMarkdown.ts:434`, OLD-tab region collection) is unchanged.

Run the same command. Expected: PASS. Then `pnpm vitest run tests/drive/round-trip-fixture.test.ts tests/drive/synthesizeBlocksEquivalence.test.ts` (DB-free): PASS, the byte pin for spec AC-2.

- [ ] **Step 3: Commit** `feat(drive): export blockMarkdown as the one per-block renderer`.

### Task 2: position-reporting scanners under the three emitters

<!-- task: red=`pnpm vitest run tests/parser/refErrorLiteral.test.ts tests/parser/rowCellsFused.test.ts tests/parser/leadingColumnAutocorrect.test.ts` red-state=authored red-target=`lib/parser/refErrorDetector.ts:110` why=`scanRefErrorLiterals and scanFusedRows are not exported and normalizeLeadingColumn returns no shifted field, so the new cases' imports are undefined and the shifted expectation reads undefined` ac=AC-2 -->

**Files:**
- Modify: `lib/parser/refErrorDetector.ts`, `lib/parser/rowWidthDiscriminator.ts`, `lib/parser/leadingColumnNormalize.ts`
- Test: the three suites above

What is red and why: none of the three scanners exists; the emitters are the only export. The new cases call the scanners.

- [ ] **Step 1: RED.** Add one describe to each suite. Hand-built markdown, positions asserted from the fixture's own line and cell indexes (never from the scanner's output). Imports: `scanRefErrorLiterals` and `detectRefErrorLiterals` from `@/lib/parser/refErrorDetector` (the suite imports only `parseSheet` today, `tests/parser/refErrorLiteral.test.ts:16`); `scanFusedRows` and `detectFusedRows` from `@/lib/parser/rowWidthDiscriminator` (`tests/parser/rowCellsFused.test.ts:19-24` has neither); `tests/parser/leadingColumnAutocorrect.test.ts:9` already imports `normalizeLeadingColumn`, nothing new:

`tests/parser/refErrorLiteral.test.ts`:

```ts
describe("scanRefErrorLiterals reports the line and cell of every hit; the emitter maps it (spec 2026-08-29 §2.3)", () => {
  const md = ["| CREW | A | B |", "| :---: | :---: | :---: |", "| Alice | #REF! | x |", "| Bob | y | #REF!/z |", "", "| #REF! | q |"].join("\n");
  it("positions", () => {
    expect(scanRefErrorLiterals(md).map(({ line, cell, kind }) => [line, cell, kind])).toEqual([
      [2, 1, "crew"],
      [3, 2, "crew"],
      [5, 0, "section"],
    ]);
  });
  it("the emitter is the scanner mapped: same order, same kind, same snippet", () => {
    const hits = scanRefErrorLiterals(md);
    const warnings = detectRefErrorLiterals(md);
    expect(warnings.map((w) => [w.blockRef?.kind, w.rawSnippet])).toEqual(hits.map((h) => [h.kind, h.snippet]));
  });
  it("corpus fixtures: the scanner's hit count equals the pinned per-fixture warning count", () => {
    for (const [path, n] of Object.entries(PINNED_COUNTS)) {
      expect(scanRefErrorLiterals(readFileSync(path, "utf8")), path).toHaveLength(n);
    }
  });
});
```

(`PINNED_COUNTS`: hoist the inline `expected` record of the existing per-fixture-count case at `tests/parser/refErrorLiteral.test.ts:46-52` to a module-level const of that name and have both cases read it, so one table pins both the emitter and the scanner. Note the scanner runs on the RAW fixture text while the emitter case runs through `parseSheet`, which applies the seams first; the counts agree because no seam adds or removes a `#REF!` cell, which is exactly spec §2.4's count guard stated on the corpus. If `crew` is not the kind `canonicalSectionKind("CREW")` yields, read `lib/parser/sectionKind.ts` `LABEL_TO_KIND` and set the literal from it.)

`tests/parser/rowCellsFused.test.ts`: a section whose four data rows are three cells wide plus one data row two cells wide, asserting `scanFusedRows(md)` reports that row's line index and `detectFusedRows(md)` maps it; an ambiguous run (two delimiter rows) yields no hits from either.

`tests/parser/leadingColumnAutocorrect.test.ts`: reuse the file's `shiftLogicalSection(md, firstSection)` mutation of `east-coast.md` (`fixtures/shows/exporter-xlsx/east-coast.md`, the path that suite reads at `tests/parser/leadingColumnAutocorrect.test.ts:43`) and assert `normalizeLeadingColumn(mutated).shifted` equals `[{ from: firstSection, to, kind }]` where `to` is computed in the test by walking the mutated lines from `firstSection` with the file's own `openerCell` helper (the first later line that is not a row or that opens a new logical section), and `kind` equals `result.warnings[0]!.blockRef?.kind`; on the unshifted `md`, `shifted` is `[]`.

Run: the task's red command (DB-free). Expected: three new describes fail on undefined imports / `undefined` shifted; every existing case passes.

- [ ] **Step 2: GREEN.**

`refErrorDetector.ts`: add `export type RefErrorHit = { line: number; cell: number; kind: string; snippet: string }` and `export function scanRefErrorLiterals(markdown: string): RefErrorHit[]` holding the existing loop body with `line` = index in `lines` and `cell` = index in `splitRow(line)`; `detectRefErrorLiterals` becomes `scanRefErrorLiterals(markdown).map((h) => ({ severity: "warn", code: "REF_ERROR_LITERAL", message: <the existing literal>, blockRef: { kind: h.kind }, rawSnippet: h.snippet }))`. The header comment gains two sentences: the position is reported by the scanner for the anchor replay and is never placed on the warning.

`rowWidthDiscriminator.ts`: `Row` gains `index: number`; `export type FusedRowHit = { line: number; kind: string; snippet: string }`; `scanFusedRows` holds the loop with `runHits` buffered and dropped exactly as `runWarnings` is; `detectFusedRows` maps hits to the existing warning literal.

`leadingColumnNormalize.ts`: the return type gains `shifted: { from: number; to: number; kind: string }[]`; `correct(from, to)` pushes `{ from, to, kind }` with the same `kind` expression it puts on the warning.

Run the task command: PASS. Then `pnpm vitest run tests/parser/mutation/signalTextDrift.test.ts tests/parser/cleanCorpusCalibration.test.ts tests/parser/waveCodesNoSourceCell.test.ts tests/parser/index.test.ts` (DB-free; the last only if it exists, else the parser suite's nearest `parseSheet` pin): PASS, the emitter contract is unchanged.

- [ ] **Step 3: Commit** `feat(parser): position-reporting scanners under the three wave-code emitters`.

### Task 3: `waveCodeAnchors`, the replay and the pairing

<!-- task: red=`pnpm vitest run tests/drive/waveCodeAnchors.test.ts` red-state=authored red-target=`lib/drive/showDayTimeAnchors.ts:143` why=`no waveCodeAnchors module exists under lib/drive, so the new suite's import fails; the production surface it feeds, attachSourceCellAnchors, admits the three codes at its gate and then has no branch that could anchor them` ac=AC-3 -->

**Files:**
- Create: new module waveCodeAnchors.ts under `lib/drive/`
- Modify: `lib/sheet-links/buildSheetDeepLink.ts` (doc comment on `scope`)
- Test: new suite waveCodeAnchors.test.ts under `tests/drive/`

What is red and why: the module does not exist; every case imports it.

- [ ] **Step 1: RED.** Create the suite waveCodeAnchors.test.ts under `tests/drive/`. Imports: `describe`, `it`, `expect` from `vitest`; `readdirSync`, `readFileSync` from `node:fs`; `join` from `node:path`; `* as XLSX` from `xlsx`; `synthesizeMarkdownFromXlsx` from `@/lib/drive/exportSheetToMarkdown`; `parseSheet` from `@/lib/parser`; `WAVE_CODES`, `extractWaveCodeSites`, `pairWaveCodeSites`, `ownerOfFragment`, `type WaveCodeSite`, `type SynthOpts` from `@/lib/drive/waveCodeAnchors`; `normalizeCellKey` from `@/lib/drive/unknownFieldAnchors`; `premise`, `premiseHolds` from `@/tests/_shared/premise`; `buildXlsx` from `../helpers/buildXlsx`; `type ParseWarning` from `@/lib/parser/types`. Helpers: copy `buildWorkbook` and `fixtureBuffer` from `tests/drive/unknownFieldAnchors.test.ts:31` and `tests/drive/unknownFieldAnchors.test.ts:57` (or import them if that file exports them; it does not today, so copy, with a comment naming the source), plus:

```ts
/** Independent raw scan: every cell whose text contains #REF!, as `TAB!A1`, in workbook order. */
function rawRefCells(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const sh = wb.Sheets[name]!;
    const ref = sh["!ref"];
    if (!ref) continue;
    const r = XLSX.utils.decode_range(ref);
    for (let R = r.s.r; R <= r.e.r; R++) {
      for (let C = r.s.c; C <= r.e.c; C++) {
        const c = sh[XLSX.utils.encode_cell({ r: R, c: C })] as XLSX.CellObject | undefined;
        const t = c ? String(c.w ?? c.v ?? "") : "";
        if (t.includes("#REF!")) out.push(`${name}!${XLSX.utils.encode_cell({ r: R, c: C })}`);
      }
    }
  }
  return out;
}
const DIR = join(process.cwd(), "fixtures/shows/exporter-xlsx");
/** gid per tab = its index in SheetNames, the convention `buildWorkbook` and `attachWarningAnchors`'s resolver share in these suites. */
function gidsFor(buffer: ArrayBuffer): Map<string, number> {
  return new Map(XLSX.read(buffer, { type: "array" }).SheetNames.map((name, i) => [name, i] as const));
}
/** Edit one cell of a committed workbook and re-serialize (one ordinary edit away from the corpus). */
function editCell(buffer: ArrayBuffer, tab: string, a1: string, text: string): ArrayBuffer {
  const wb = XLSX.read(buffer, { type: "array" });
  const sh = wb.Sheets[tab];
  if (!sh) throw new Error(`no tab ${tab}`);
  sh[a1] = { t: "s", v: text };
  const at = XLSX.utils.decode_cell(a1);
  const r = XLSX.utils.decode_range(sh["!ref"] ?? a1);
  r.s.r = Math.min(r.s.r, at.r); r.s.c = Math.min(r.s.c, at.c); r.e.r = Math.max(r.e.r, at.r); r.e.c = Math.max(r.e.c, at.c);
  sh["!ref"] = XLSX.utils.encode_range(r);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
/** Fan a merged top-left cell out across its merge's columns on the top row, as the exporter's `expandMerges` does. */
function expandMerged(buffer: ArrayBuffer, cells: string[]): string[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return cells.flatMap((ref) => {
    const [tab, a1] = ref.split("!") as [string, string];
    const at = XLSX.utils.decode_cell(a1);
    const m = (wb.Sheets[tab]?.["!merges"] ?? []).find((mr) => mr.s.r === at.r && mr.s.c === at.c);
    if (!m) return [ref];
    const out: string[] = [];
    for (let c = m.s.c; c <= m.e.c; c++) out.push(`${tab}!${XLSX.utils.encode_cell({ r: at.r, c })}`);
    return out;
  });
}
function parseAndSites(buffer: ArrayBuffer, gids: Map<string, number>, opts?: SynthOpts) {
  const { markdown } = synthesizeMarkdownFromXlsx(buffer, opts);
  const warnings = parseSheet(markdown, "probe.xlsx").warnings;
  const sites = extractWaveCodeSites(buffer, gids, opts);
  return { warnings, sites };
}
const triple = (w: ParseWarning) => [w.code, w.blockRef?.kind ?? null, normalizeCellKey(w.rawSnippet ?? "")];
const siteTriple = (s: WaveCodeSite) => [s.code, s.kind, normalizeCellKey(s.snippet ?? "")];
```

Cases (spec §5 T1, T3, T4):

```ts
describe("T1 corpus: replay equals parse", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".xlsx")).sort();
  let refSites = 0, fusedSites = 0, leadingSites = 0;
  for (const f of files) {
    it(f, () => {
      const buffer = fixtureBuffer(join("fixtures/shows/exporter-xlsx", f));
      const gids = gidsFor(buffer); // Map from XLSX.read(buffer).SheetNames, index = gid
      const { warnings, sites } = parseAndSites(buffer, gids);
      const parsed = warnings.filter((w) => (WAVE_CODES as readonly string[]).includes(w.code));
      expect(sites.map(siteTriple)).toEqual(parsed.map(triple));
      for (const code of WAVE_CODES) {
        const paired = pairWaveCodeSites(warnings, sites, code);
        expect(paired.length).toBe(warnings.filter((w) => w.code === code).length);
        if (code === "REF_ERROR_LITERAL") expect(paired.every((a) => a !== null)).toBe(true);
      }
      refSites += sites.filter((s) => s.code === "REF_ERROR_LITERAL").length;
      fusedSites += sites.filter((s) => s.code === "ROW_CELLS_FUSED").length;
      leadingSites += sites.filter((s) => s.code === "LEADING_COLUMN_AUTOCORRECTED").length;
    });
  }
  it("premise: the corpus yields REF sites and no FUSED / LEADING sites (both exporter-unreachable, spec §8); a corpus change that starts emitting either is noticed here", () => {
    premise("corpus REF sites", refSites, 0);
    premiseHolds("corpus has no FUSED / LEADING sites (spec §1, §8)", fusedSites === 0 && leadingSites === 0);
  });
});
```

(The premise case runs after the `for` cases in file order; if vitest ordering makes that fragile, compute the three counts in a `beforeAll` over the same files and premise on them in each variant case instead.)

T3 (the dispatching workbook through `attachWarningAnchors`) needs Task 4's router branch, so it lives in its own suite that Task 4 creates (waveCodeAnchors.resolution.test.ts under `tests/drive/`) and this task's command is green in full at its GREEN step (the R1 review's second finding).

Variants (a)-(f) from spec §5 T1 (no workbook this exporter synthesizes can produce `ROW_CELLS_FUSED` or `LEADING_COLUMN_AUTOCORRECTED`, spec §1 and §8, the reachability probe in §3; their scanners are covered by Task 2's hand-built markdown and their pairing by the T4 hand-built sites below), each built from a corpus workbook with `editCell` / `buildWorkbook`, each asserting through `parseAndSites` + `pairWaveCodeSites`, and each asserting the anchor's `a1` against a coordinate computed from the edit it made (never read from the site):

- (a) `editCell(east-coast, "INFO", <a data cell inside CREW>, "#REF!")` → one site, `anchor.a1` equals that cell, `title === "INFO"`. (Pick the cell by reading the INFO grid for the `CREW` header row and taking the row below it, column B; premise that the cell was blank or text before the edit.)
- (b) same as (a) plus `editCell(..., <cell A of that row>, "a|b")` → the REF site's `anchor` is STILL the `#REF!` cell's true column (the fragment map absorbs the fracture); and `ownerOfFragment(["a|b", "#REF!"], 2, 5)` (out of range) is `null`, `ownerOfFragment` on a row whose per-cell counts cannot reconcile is `null` (construct by passing `width` smaller than `cells.length` so the padded whole-row render differs; assert null).
- (c) `fixtureBuffer(consultants)` → the six REF sites' `a1` equal `["A3","B3","C3","A4","B4","C4"]` on `AGENDA`, derived from `sh["!merges"]` for A3 and A4; then `editCell(consultants, "AGENDA", "A3", "prefix | #REF!")` (the merge copies it across B3 and C3) → three sites whose `a1` are `A3`, `B3`, `C3` in order (round-1 finding 1: the naive map sent the first to B3); and `buildWorkbook` with a row `["a|b", "#REF!", "#REF!"]` → two sites at `B` and `C` of that row exactly.
- (d) `XLSX.utils.sheet_add_aoa(ws, rows, { origin: "B2" })` with a `#REF!` at the aoa's `[1][1]` → `a1 === "C3"`.
- (e) `buildXlsx([{ name, grid }])` imported from `tests/helpers/buildXlsx` (as `tests/drive/synthesizeBlocks.test.ts:8` does) and the `regionA` pull-sheet grid of `tests/drive/synthesizeBlocks.test.ts:10-16` (copied, with a comment naming the source): an `INFO` tab holding a `#REF!` data cell and an `OLD PULL SHEET` tab holding `regionA` with `#REF!` written into one of its item cells. An OLD tab is collected only when `collectPullSheetRegionsFromMarkdown` finds a pull-sheet region in it (`exportSheetToMarkdown.ts:427-466`), which `regionA` satisfies (that file's own "included OLD pull-sheet region is opaque" case). `parseAndSites(buffer, gids, { includePullSheetFromTab: "OLD PULL SHEET" })` → two REF sites: the INFO one with its cell, the opaque one with `anchor: null`, and `pairWaveCodeSites` yields `[cell, null]` in workbook order (premise: the OLD tab is appended after INFO, so the opaque hit is second; assert the order from `sites.map(s => s.anchor === null)`). Then `parseSheet` on the markdown synthesized WITH the option but `extractWaveCodeSites` called WITHOUT it → one site against two warnings → all-null.
- (f) the Step 2.5 seam pin: `buildWorkbook` with one tab of three rows, `["TRANSPORTATON", "", ""]`, `["Driver", "#REF!", ""]`, `["Van", "v", ""]` (shape 6 of the reachability report). Premise, executable: `warnings` holds exactly one `SECTION_HEADER_AUTOCORRECTED` (`premiseHolds`; if that spelling stops being one `normalizeSectionHeaders` corrects, pick one from `lib/parser/sectionHeaderNormalize.ts`). Assert: the parse-side REF warning's `blockRef.kind` is `transportation` while the replay site's `kind` is `section` (the two sides disagree on kind by design), and `pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL")` yields `B2` on that tab (computed from the row the test built), because REF pairing compares snippet and never kind (spec §2.4). If this case fails, STOP: a seam that rewrites or reorders is a design finding (spec §2.4 says none does); report it to bl-orch with the failing case before touching `pairWaveCodeSites`.

T4 refusals, `pairWaveCodeSites` directly with hand-built `WaveCodeSite[]` and `ParseWarning[]`: counts 2 vs 3, 2 vs 1, snippet mismatch at index 1, LEADING kind mismatch at index 1 (all `[null, ...]`); a null-anchor placeholder at index 0 with a cell at index 1 yields `[null, cell]`. Positive arms for the two codes no exporter workbook reaches: two `ROW_CELLS_FUSED` warnings against two FUSED sites with pairwise equal normalized snippets yield both cells; two `LEADING_COLUMN_AUTOCORRECTED` warnings against two LEADING sites with pairwise equal kinds yield both cells.

Run: `pnpm vitest run tests/drive/waveCodeAnchors.test.ts` (DB-free). Expected: every case fails on the missing module.

- [ ] **Step 2: GREEN.** Create waveCodeAnchors.ts under `lib/drive/`:

```ts
import * as XLSX from "xlsx";
import { blockMarkdown, renderRow, synthesizeBlocksFromXlsx, type GridBlock } from "@/lib/drive/exportSheetToMarkdown";
import { scanRefErrorLiterals } from "@/lib/parser/refErrorDetector";
import { scanFusedRows } from "@/lib/parser/rowWidthDiscriminator";
import { normalizeLeadingColumn } from "@/lib/parser/leadingColumnNormalize";
import { clean, splitRow } from "@/lib/parser/blocks/_helpers";
import { normalizeCellKey } from "@/lib/drive/unknownFieldAnchors";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

export const WAVE_CODES = ["REF_ERROR_LITERAL", "ROW_CELLS_FUSED", "LEADING_COLUMN_AUTOCORRECTED"] as const;
export type WaveCode = (typeof WAVE_CODES)[number];
export type WaveCodeSite = { code: WaveCode; kind: string; snippet: string | null; anchor: SourceAnchor | null };
export type SynthOpts = { includePullSheetFromTab?: string };
export type WavePairedAnchors = Partial<Record<WaveCode, (SourceAnchor | null)[]>>;

/** blockMarkdown line k → block row: 0 → 0, 1 → delimiter (never a hit), k ≥ 2 → k - 1. */
function rowOfLine(line: number): number | null {
  if (line === 1) return null;
  return line === 0 ? 0 : line - 1;
}

/** Fragment index → owning exporter cell, derived from the SAME escape/split pair the
 *  markdown path uses: cell j yields splitRow(renderRow([cells[j]], 1)).length fragments;
 *  padding cells (j >= cells.length, up to width) yield one each. Null when the per-cell
 *  counts do not sum to the whole padded row's fragment count (an escape interaction nobody
 *  has constructed) or the index is out of range. */
export function ownerOfFragment(cells: readonly string[], width: number, fragment: number): number | null {
  const counts: number[] = [];
  for (let j = 0; j < Math.max(width, cells.length); j++) {
    counts.push(j < cells.length ? splitRow(renderRow([cells[j]!], 1)).length : 1);
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== splitRow(renderRow(cells, width)).length) return null;
  let acc = 0;
  for (let j = 0; j < counts.length; j++) {
    acc += counts[j]!;
    if (fragment < acc) return j < cells.length ? j : null;
  }
  return null;
}

function cellAnchor(block: GridBlock, gid: number, row: number, col: number): SourceAnchor | null {
  const src = block.rows[row];
  if (!src || src.absRow === null) return null;
  return { title: block.sheetName, gid, a1: XLSX.utils.encode_cell({ r: src.absRow, c: block.absCol0 + col }), scope: "cell" };
}

export function extractWaveCodeSites(buffer: ArrayBuffer, titleToGid: Map<string, number>, synthOpts?: SynthOpts): WaveCodeSite[] {
  const out: WaveCodeSite[] = [];
  const { blocks } = synthesizeBlocksFromXlsx(buffer, synthOpts);
  for (const block of blocks) {
    const md = blockMarkdown(block);
    const grid = block.kind === "grid" ? block : null;
    const gid = grid ? titleToGid.get(grid.sheetName) : undefined;
    const anchorAt = (line: number, col: number | null): SourceAnchor | null => {
      if (!grid || typeof gid !== "number" || col === null) return null;
      const row = rowOfLine(line);
      return row === null ? null : cellAnchor(grid, gid, row, col);
    };
    const width = grid ? grid.rows.reduce((m, r) => Math.max(m, r.cells.length), 0) : 0;
    for (const h of scanRefErrorLiterals(md)) {
      // The scanner's cell index is a FRAGMENT index (spec §2.1): map it to the owning
      // exporter cell through the exporter's own renderRow + splitRow pair, and refuse the
      // row when the per-cell counts do not reconcile with the whole-row count.
      const row = rowOfLine(h.line);
      const cells = grid && row !== null ? (grid.rows[row]?.cells ?? null) : null;
      const owner = cells ? ownerOfFragment(cells, width, h.cell) : null;
      const ok = owner !== null && clean(cells![owner] ?? "").includes("#REF!");
      out.push({ code: "REF_ERROR_LITERAL", kind: h.kind, snippet: h.snippet, anchor: ok ? anchorAt(h.line, owner) : null });
    }
    for (const h of scanFusedRows(md)) {
      const row = rowOfLine(h.line);
      const cells = grid && row !== null ? (grid.rows[row]?.cells ?? []) : [];
      const first = cells.findIndex((c) => clean(c) !== "");
      out.push({ code: "ROW_CELLS_FUSED", kind: h.kind, snippet: h.snippet, anchor: anchorAt(h.line, first >= 0 ? first : null) });
    }
    for (const s of normalizeLeadingColumn(md).shifted) {
      out.push({ code: "LEADING_COLUMN_AUTOCORRECTED", kind: s.kind, snippet: null, anchor: anchorAt(s.from, 0) });
    }
  }
  return out;
}

export function pairWaveCodeSites(warnings: readonly ParseWarning[], sites: readonly WaveCodeSite[], code: WaveCode): (SourceAnchor | null)[] {
  const P = warnings.filter((w) => w.code === code);
  const R = sites.filter((s) => s.code === code);
  const refuse = P.map(() => null);
  if (P.length !== R.length) return refuse;
  for (let i = 0; i < P.length; i++) {
    const p = P[i]!, r = R[i]!;
    if (code === "LEADING_COLUMN_AUTOCORRECTED") {
      if ((p.blockRef?.kind ?? null) !== r.kind) return refuse;
    } else if (normalizeCellKey(p.rawSnippet ?? "") !== normalizeCellKey(r.snippet ?? "")) return refuse;
  }
  return R.map((r) => r.anchor);
}

export function pairAllWaveCodes(warnings: readonly ParseWarning[], sites: readonly WaveCodeSite[]): WavePairedAnchors {
  const out: WavePairedAnchors = {};
  for (const code of WAVE_CODES) out[code] = pairWaveCodeSites(warnings, sites, code);
  return out;
}
```

The three scanners run per block in the order the parser emits their warnings within a code, and sites are pushed in that same order per code; cross-code order is irrelevant because pairing filters by code. Note the scanners run on `md` which has NO seams applied; the guards in `pairWaveCodeSites` are what make that safe (spec §2.4).

In `lib/sheet-links/buildSheetDeepLink.ts`, amend the `scope` doc comment: set by the two raw-workbook anchor scanners (`unknownFieldAnchors`, `waveCodeAnchors`) and by nothing else.

Run the task command: PASS, every case. Then `pnpm typecheck`.

- [ ] **Step 3: Commit** `feat(drive): waveCodeAnchors, a detector replay over the exporter's blocks with ordinal pairing`.

### Task 4: the router branch, the `wave` family, and `synthOpts` at both call sites

<!-- task: red=`pnpm vitest run tests/drive/waveCodeAnchors.resolution.test.ts tests/parser/waveCodesSourceCell.test.ts tests/sync/attachWarningAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts tests/admin/sectionWarningModel.autocorrect.test.ts tests/drive/showDayTimeAnchors.test.ts` red-state=authored red-target=`lib/drive/showDayTimeAnchors.ts:145` why=`the branch chain in attachSourceCellAnchors names none of the three codes and WarningAnchorSources has no wave field, so a paired cell is never attached, the T3 fintech case reads sourceCell undefined, and the new waveCodesSourceCell suite's positive arm fails` ac=AC-1,AC-3,AC-4 -->

**Files:**
- Modify: `lib/drive/showDayTimeAnchors.ts`, `lib/sync/attachWarningAnchors.ts`, `lib/sync/runOnboardingScan.ts`, `lib/sync/runScheduledCronSync.ts`, `lib/sync/applyParseResult.ts` (comment only: the "never clobbers" promise now cites the grain rule)
- Create: new suite waveCodesSourceCell.test.ts under `tests/parser/`; new suite waveCodeAnchors.resolution.test.ts under `tests/drive/` (T3); Delete: `tests/parser/waveCodesNoSourceCell.test.ts`
- Test: also `tests/sync/attachWarningAnchors.test.ts`, `tests/parser/operatorActionableWarnings.test.ts`, `tests/admin/sectionWarningModel.autocorrect.test.ts`

What is red and why: `attachSourceCellAnchors` has no branch for the three codes (`showDayTimeAnchors.ts:145-199`), so every positive assertion below reads `undefined`.

- [ ] **Step 1: RED.** First the T3 suite, waveCodeAnchors.resolution.test.ts under `tests/drive/` (imports: `describe`, `it`, `expect` from `vitest`; `readFileSync` from `node:fs`; `join` from `node:path`; `* as XLSX` from `xlsx`; `synthesizeMarkdownFromXlsx` from `@/lib/drive/exportSheetToMarkdown`; `parseSheet` from `@/lib/parser`; `attachWarningAnchors` from `@/lib/sync/attachWarningAnchors`; `SOURCE_LINK_ALLOWLIST`, `buildSheetDeepLink` from `@/lib/sheet-links/buildSheetDeepLink`; `WAVE_CODES`, `extractWaveCodeSites` from `@/lib/drive/waveCodeAnchors`; `premise`, `premiseHolds` from `@/tests/_shared/premise`; `fixtureBuffer`, `gidsFor`, `rawRefCells` and `expandMerged` copied from the Task 3 suite, or imported if Task 3 exported them, with a comment naming the source):

```ts
describe("T3 the dispatching workbook, through attachWarningAnchors", () => {
  it("fintech.xlsx: five REF warnings resolve, in order, to the five #REF! cells an independent scan finds", async () => {
    const buffer = fixtureBuffer("fixtures/shows/exporter-xlsx/fintech.xlsx");
    const gids = gidsFor(buffer);
    const { markdown } = synthesizeMarkdownFromXlsx(buffer);
    const warnings = parseSheet(markdown, "fintech.xlsx").warnings;
    await attachWarningAnchors(warnings, buffer, () => Promise.resolve(gids));
    const refs = warnings.filter((w) => w.code === "REF_ERROR_LITERAL");
    const expected = rawRefCells(buffer);
    premiseHolds("five raw #REF! cells (spec §1 table)", expected.length === 5);
    expect(refs.map((w) => `${w.sourceCell?.title}!${w.sourceCell?.a1}`)).toEqual(expected);
    for (const w of refs) {
      expect(w.sourceCell?.scope).toBe("cell");
      expect(SOURCE_LINK_ALLOWLIST as readonly string[]).not.toContain(w.sourceCell!.title);
      expect(buildSheetDeepLink("DF", w.sourceCell)).toBe(`https://docs.google.com/spreadsheets/d/DF/edit#gid=${w.sourceCell!.gid}&range=${w.sourceCell!.a1}`);
    }
  });
  it("consultants.xlsx: six REF warnings, AGENDA rows 3 and 4, columns A through C (merge fan-out, spec §1.1)", async () => {
    const buffer = fixtureBuffer("fixtures/shows/exporter-xlsx/consultants.xlsx");
    const gids = gidsFor(buffer);
    const { markdown } = synthesizeMarkdownFromXlsx(buffer);
    const warnings = parseSheet(markdown, "consultants.xlsx").warnings;
    await attachWarningAnchors(warnings, buffer, () => Promise.resolve(gids));
    const refs = warnings.filter((w) => w.code === "REF_ERROR_LITERAL");
    const raw = rawRefCells(buffer);
    const expected = expandMerged(buffer, raw); // A3 and A4 each fan out across their merge's three columns
    premiseHolds("two raw #REF! cells, each merged three wide (spec §1 table)", raw.length === 2 && expected.length === 6);
    expect(expected).toEqual(["AGENDA!A3", "AGENDA!B3", "AGENDA!C3", "AGENDA!A4", "AGENDA!B4", "AGENDA!C4"]); // the spec §1 table, so the derived list and the measured one must agree
    expect(refs.map((w) => `${w.sourceCell?.title}!${w.sourceCell?.a1}`)).toEqual(expected);
    for (const w of refs) expect(w.sourceCell?.scope).toBe("cell");
  });
  it("east-coast.xlsx: no wave warnings, no sites", () => {
    const buffer = fixtureBuffer("fixtures/shows/exporter-xlsx/east-coast.xlsx");
    const gids = gidsFor(buffer);
    const { markdown } = synthesizeMarkdownFromXlsx(buffer);
    const warnings = parseSheet(markdown, "east-coast.xlsx").warnings;
    premise("east-coast parses with some warnings, so an empty wave filter is a selection, not an empty parse", warnings.length, 0);
    expect(warnings.filter((w) => (WAVE_CODES as readonly string[]).includes(w.code))).toEqual([]);
    expect(extractWaveCodeSites(buffer, gids)).toEqual([]);
  });
});
```

- [ ] **Step 1, continued.** `git rm tests/parser/waveCodesNoSourceCell.test.ts`. Create waveCodesSourceCell.test.ts under `tests/parser/` from the deleted file's fixture (`sources` with `showDay`, `crewRole`, `unknownField`, `region` incl. `schedule` and `gear_packlist`; the control case verbatim; imports: the deleted file's own (`attachSourceCellAnchors`, `type WarningAnchorSources` from `@/lib/drive/showDayTimeAnchors`; `normalizeCrewNameKey` from `@/lib/drive/crewRoleAnchors`; `OPERATOR_ACTIONABLE_ANCHORED` from `@/lib/parser/dataGaps`; `type ParseWarning`; `type SourceAnchor`) plus `CELL_ANCHORED_CODES` from `@/lib/drive/showDayTimeAnchors`, `WAVE_CODES` from `@/lib/drive/waveCodeAnchors`, `normalizeCellKey` from `@/lib/drive/unknownFieldAnchors`, and `premise`, `premiseHolds` from `@/tests/_shared/premise`), plus:

```ts
const cell = (a1: string): SourceAnchor => ({ title: "VENUE", gid: 5, a1, scope: "cell" });
for (const code of WAVE_CODES) {
  it(`${code}: a paired cell is attached, in warning order, for a non-region kind`, () => {
    const warnings = [warn(code, "crew"), warn(code, "crew")];
    attachSourceCellAnchors(warnings, { ...sources, wave: { [code]: [cell("A1"), cell("B7")] } });
    expect(warnings.map((w) => w.sourceCell)).toEqual([cell("A1"), cell("B7")]);
  });
  it(`${code}: with no wave family, a crew-kind warning stays undefined (the deleted file's first arm)`, () => {
    expect(OPERATOR_ACTIONABLE_ANCHORED.has(code), `${code} in the anchored set`).toBe(true);
    const warnings = [warn(code, "crew")];
    attachSourceCellAnchors(warnings, sources);
    expect(warnings[0]!.sourceCell, `${code} must stay link-less`).toBeUndefined();
  });
  it(`${code}: with no wave family, agenda and pull_sheet get the region (the ratified fallback, the deleted file's second arm)`, () => {
    for (const kind of ["agenda", "pull_sheet"] as const) {
      const warnings = [warn(code, kind)];
      attachSourceCellAnchors(warnings, sources);
      expect(warnings[0]!.sourceCell, `${code}/${kind}`).toEqual(sources.region[KIND_TO_REGION_UNDER_TEST[kind]]);
    }
  });
  it(`${code}: a paired null falls through to the region fallback for kind agenda`, () => {
    const warnings = [warn(code, "agenda")];
    attachSourceCellAnchors(warnings, { ...sources, wave: { [code]: [null] } });
    expect(warnings[0]!.sourceCell).toEqual(sources.region.schedule);
  });
  it(`${code}: a wave array shorter than the warnings never throws and leaves the tail unanchored`, () => {
    const warnings = [warn(code, "crew"), warn(code, "crew")];
    attachSourceCellAnchors(warnings, { ...sources, wave: { [code]: [cell("A1")] } });
    expect(warnings.map((w) => w.sourceCell)).toEqual([cell("A1"), undefined]);
  });
}
```

(`warn(code, kind)` builds `{ severity: "warn", code, message: "m", blockRef: { kind, name: "Alice", iso: "2026-06-24" }, rawSnippet: "| Alice | A1 | 08:00 |" } as ParseWarning`, the deleted file's shape; `KIND_TO_REGION_UNDER_TEST` is the deleted file's local copy of the mapping (`tests/parser/waveCodesNoSourceCell.test.ts:77`), kept local so the suite pins the mapping it depends on. The "shorter array" case pins the cursor's bounds; `pairWaveCodeSites` never produces one, but the router must not trust that.)

The grain pin (spec §2.1 "Assignment never demotes", T5), derived over `CELL_ANCHORED_CODES`:

```ts
describe("assignment never demotes a cell anchor to a range (spec §2.1)", () => {
  const range = (a1: string): SourceAnchor => ({ title: "INFO", gid: 0, a1 });
  const isCell = (a: SourceAnchor | null | undefined): boolean =>
    !!a && typeof a.a1 === "string" && a.a1.length > 0 && !a.a1.includes(":");
  const regionOnly: WarningAnchorSources = {
    showDay: [], crewRole: [], unknownField: [],
    region: { crew: range("A2:D5"), schedule: range("A1:F40"), gear_packlist: range("A1:C9"), hotels: range("A10:D12"), rooms: range("A1:B4"), transportation: range("A20:D25"), details: range("A1:B9") },
  };
  // One kind per code that reaches that code's branch (the chain at showDayTimeAnchors.ts:145-199).
  const kindFor = (code: string): string =>
    code.startsWith("HOTEL_") ? "hotels"
    : code === "FIELD_UNREADABLE" || code === "COLUMN_HEADER_AUTOCORRECTED" || code === "ORPHANED_CREW_ROWS" ? "crew"
    : code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE" ? "rooms"
    : code === "SECTION_HEADER_AUTOCORRECTED" ? "transportation"
    : code === "FIELD_LABEL_AUTOCORRECTED" ? "details"
    : code.startsWith("PULL_SHEET_") ? "pull_sheet"
    : "agenda";
  const warnFor = (code: string): ParseWarning =>
    code === "UNKNOWN_FIELD"
      ? { ...warn(code, "crew"), blockRef: { kind: "crew", name: "L" }, rawSnippet: "L | V" } // emitUnknownField's shape, lib/parser/rawSnippet.ts:1
      : warn(code, kindFor(code));
  // The pass that yields a CELL for a code, one entry per cell-yielding branch of the chain:
  // showDay, crewRole (the five crew codes and FIELD_UNREADABLE), unknownField, and this
  // task's wave family. Every other member of CELL_ANCHORED_CODES resolves to a region range
  // by design and has no cell source, so the halves below run over two DERIVED sets whose
  // union is the whole set: a new member is asserted in one half or the other, never skipped.
  const CELL_PASS: Record<string, WarningAnchorSources> = {
    SCHEDULE_TIME_UNPARSED: { ...regionOnly, showDay: [{ iso: "2026-06-24", anchor: cell("B7") }] },
    UNKNOWN_FIELD: { ...regionOnly, unknownField: [{ kind: "crew", label: normalizeCellKey("L"), value: normalizeCellKey("V"), anchor: cell("D3") }] },
  };
  for (const c of ["UNKNOWN_ROLE_TOKEN", "UNKNOWN_DAY_RESTRICTION", "UNKNOWN_STAGE_RESTRICTION", "STAGE_WORD_AUTOCORRECTED", "ROLE_TOKEN_AUTOCORRECTED", "FIELD_UNREADABLE"]) {
    CELL_PASS[c] = { ...regionOnly, crewRole: [{ name: normalizeCrewNameKey("Alice"), anchor: cell("C12") }] };
  }
  for (const c of WAVE_CODES) CELL_PASS[c] = { ...regionOnly, wave: { [c]: [cell("C3")] } };
  const CELL_CAPABLE = [...CELL_ANCHORED_CODES].filter((c) => c in CELL_PASS);
  const REGION_ONLY = [...CELL_ANCHORED_CODES].filter((c) => !(c in CELL_PASS));
  it("premise: the two derived sets partition CELL_ANCHORED_CODES and neither is empty", () => {
    premise("cell-capable members", CELL_CAPABLE.length, 0);
    premise("region-only members", REGION_ONLY.length, 0);
    expect(Object.keys(CELL_PASS).filter((c) => !CELL_ANCHORED_CODES.has(c))).toEqual([]);
  });
  const contested: string[] = [];
  for (const code of CELL_ANCHORED_CODES) {
    it(`${code}: a cell survives a region-only pass`, () => {
      const probe = [warnFor(code)];
      attachSourceCellAnchors(probe, regionOnly);
      if (probe[0]!.sourceCell) contested.push(code); // this code's region-only pass yields a range: the survival below is contested, not vacuous
      const kept = [{ ...warnFor(code), sourceCell: cell("C3") }];
      attachSourceCellAnchors(kept, regionOnly);
      expect(kept[0]!.sourceCell).toEqual(cell("C3"));
    });
  }
  it("premise: the region-only pass contested FIELD_UNREADABLE and every wave code (kind agenda)", () => {
    premiseHolds("FIELD_UNREADABLE contested", contested.includes("FIELD_UNREADABLE"));
    premiseHolds("every wave code contested", WAVE_CODES.every((c) => contested.includes(c)));
  });
  for (const code of CELL_CAPABLE) {
    it(`${code}: a range is upgraded by its cell-yielding pass`, () => {
      const probe = [warnFor(code)];
      attachSourceCellAnchors(probe, CELL_PASS[code]!);
      premiseHolds(`${code}: the cell pass resolves a cell from an unanchored warning`, isCell(probe[0]!.sourceCell));
      const up = [{ ...warnFor(code), sourceCell: range("A1:F40") }];
      attachSourceCellAnchors(up, CELL_PASS[code]!);
      expect(up[0]!.sourceCell).toEqual(probe[0]!.sourceCell);
    });
  }
  for (const code of REGION_ONLY) {
    it(`${code}: has no cell-yielding branch; a range is overwritten by the same-grain region (spec §2.1 idempotency)`, () => {
      const w = [{ ...warnFor(code), sourceCell: range("Z1:Z2") }];
      attachSourceCellAnchors(w, regionOnly);
      expect(isCell(w[0]!.sourceCell)).toBe(false);
      expect(w[0]!.sourceCell).not.toEqual(range("Z1:Z2"));
    });
  }
});
```

(`cell` is this file's `{ title: "VENUE", gid: 5, a1, scope: "cell" }` helper; `normalizeCrewNameKey` from `@/lib/drive/crewRoleAnchors`, `normalizeCellKey` from `@/lib/drive/unknownFieldAnchors`. The `contested` list is filled by the same cases the second premise guards, and that premise case follows them in file order. On the live tree the `FIELD_UNREADABLE` survival case fails (its cell is replaced by `region.crew`), every wave-code survival case with kind `agenda` fails (replaced by `region.schedule`), and every wave-code upgrade case fails on its premise (no branch yields a cell yet); the upgrade cases for the seven non-wave cell-capable codes pass on arrival, which is the point of a class repair: those branches already behave as the rule states. The R1 review's fourth finding: the earlier draft titled the upgrade half and never ran it.)


`tests/sync/attachWarningAnchors.test.ts` (T7): build variant (e)'s workbook with `xlsxBuffer`-style helpers (an `INFO` tab with a `#REF!` data cell and an `OLD PULL SHEET` tab with `#REF!`), parse with `{ includePullSheetFromTab: "OLD PULL SHEET" }`, then `attachWarningAnchors(warnings, buffer, gids, {}, { includePullSheetFromTab: "OLD PULL SHEET" })` → the INFO warning has a `scope: "cell"` anchor; the same call without the fifth argument → every REF warning's `sourceCell` is undefined.

`tests/parser/operatorActionableWarnings.test.ts` (T8, regression pin, green on arrival): five `REF_ERROR_LITERAL` warnings with `sourceCell` `a1` `A1` on gids 1..5 survive `operatorActionableWarnings` as five (the staged page's selector, `app/admin/show/staged/[stagedId]/page.tsx:204`); `warningIdentityKey` over them yields five distinct strings. And in `tests/admin/sectionWarningModel.autocorrect.test.ts` (the suite that drives `buildSectionWarningModel`, `lib/admin/sectionWarningModel.ts`), the same five, with `blockRef: { kind: "section" }`, passed to `buildSectionWarningModel({ slug: "s", warnings, ignoredFingerprints: new Set(), renderedSectionIds: new Set(["crew"]) })` land under `record.warnings!.active` as five items (`section` is not a wizard section, so `warningsBySection` files them under `warnings`, §3): the published review modal applies no dedup (spec §2.5).

Run the task command (DB-free). Expected: the T3 fintech and consultants cases fail on `sourceCell` undefined (east-coast passes); the `waveCodesSourceCell` positive arms, the grain pin's contested survival cases and the wave-code upgrade cases, and the T7 positive case fail on `undefined`; both T8 cases pass.

- [ ] **Step 2: GREEN.**

`lib/drive/showDayTimeAnchors.ts`: the assignment site `if (cell) w.sourceCell = cell` becomes `if (cell && grainOf(cell) >= grainOf(w.sourceCell)) w.sourceCell = cell` with

```ts
/** cell (single a1, no colon) = 2, range/tab (anything else) = 1, none = 0. Spec 2026-08-29 §2.1. */
function grainOf(a: SourceAnchor | null | undefined): 0 | 1 | 2 {
  if (!a) return 0;
  return typeof a.a1 === "string" && a.a1.length > 0 && !a.a1.includes(":") ? 2 : 1;
}
```

`WarningAnchorSources` gains `wave?: WavePairedAnchors`. In `attachSourceCellAnchors`, before the loop, `const waveCursor: Partial<Record<WaveCode, number>> = {}`; inside the loop, before the `SCHEDULE_TIME_UNPARSED` branch:

```ts
    if ((WAVE_CODES as readonly string[]).includes(w.code)) {
      const code = w.code as WaveCode;
      const i = waveCursor[code] ?? 0;
      waveCursor[code] = i + 1;
      cell = sources.wave?.[code]?.[i] ?? null;
      // null falls through: the code-agnostic KIND_TO_REGION fallback below still applies
      // for agenda / pull_sheet kinds (spec 2026-08-29 §1.1, the ratified exception).
    }
```

and make the `KIND_TO_REGION` branch reachable after it: the chain is `if / else if`; restructure so the wave branch sets `cell` and, when `cell` is still null, the existing `else if (w.blockRef?.kind && KIND_TO_REGION[...])` arm runs. The simplest shape that keeps every other branch byte-identical: wrap the existing chain in `if (cell === null) { ...existing chain... }` after the wave block. Update the `KIND_TO_REGION` comment's "Reached only for in-set codes" sentence to name the wave branch's fallthrough.

`lib/sync/attachWarningAnchors.ts`: signature gains `synthOpts?: SynthOpts` (import from `@/lib/drive/waveCodeAnchors`); inside, `const sites = safe(() => extractWaveCodeSites(bytes, gids, synthOpts), [] as WaveCodeSite[])`; pass `wave: pairAllWaveCodes(warnings, sites)` in the sources object. The header comment lists the new family and the parameter.

`lib/sync/runOnboardingScan.ts:1435`: fifth argument `pullSheetOverrideApplied ? { includePullSheetFromTab: pullSheetOverrideApplied.tabName } : undefined` (the applied snapshot tracks `parseResult` through the discard-and-rerun reassignment at `lib/sync/runOnboardingScan.ts:1378-1379`, so it names the tab the live `parseResult` was actually synthesized with, or null when the reparse ran without one).

`lib/sync/runScheduledCronSync.ts:3325`: fifth argument `includeOpts` (`lib/sync/runScheduledCronSync.ts:3149`; `{}` when no override, which the replay reads as no option).

Run the task command: PASS, all files. Then `pnpm vitest run tests/drive/waveCodeAnchors.test.ts` (DB-free): still PASS. Then `pnpm vitest run tests/parser/parseWarningDeepLinkRender.test.tsx tests/drive/unknownFieldAnchors.test.ts tests/drive/unknownFieldAnchors.live.test.ts tests/drive/crewRoleAnchors.test.ts tests/drive/sourceAnchors.test.ts` (DB-free): PASS. `pnpm typecheck`: PASS.

- [ ] **Step 3: Sweep (fix-round regression budget, authored and run).** `rg -n "waveCodesNoSourceCell" lib tests docs --glob '!docs/review-rounds/**'` → only the two specs' historical mentions (`docs/superpowers/specs/2026-08-27-wizard-warning-row-links-copy-design.md:164`, `docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md:288`) and this arc's spec; no code reference. `rg -n "attachWarningAnchors\(" lib` → exactly the two production call sites, both with five arguments.

- [ ] **Step 4: Commit** `feat(sync): pair the three wave codes to their replayed cells in attachSourceCellAnchors`.

### Task 5: the cell line on the wizard row and the published card

<!-- task: red=`pnpm vitest run tests/components/step3SheetCard.test.tsx tests/admin/perShowActionableRenderControls.test.tsx tests/components/step3SheetCard.transitions.test.tsx tests/admin/perShowActionableTransitions.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:3232` why=`the warning row renders a Sheet row label for UNKNOWN_FIELD only and has no cell line, so queryByTestId for the -cell element is null for a scope-cell anchor; the published card at PerShowActionableWarnings.tsx:259 has the same gap` ac=AC-1 -->

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/PerShowActionableWarnings.tsx`
- Test: the four suites above

Opus-only (UI). What is red and why: neither component renders a cell line; the positive cases query a test id that does not exist.

- [ ] **Step 1: RED.** Cases per spec §5 T6 and §10. Wizard (`tests/components/step3SheetCard.test.tsx`; imports: `type SourceAnchor` from `@/lib/sheet-links/buildSheetDeepLink`, and `ParseWarning` added to the file's `@/lib/parser/types` type import at `tests/components/step3SheetCard.test.tsx:21-28`), eight cases over one warning at index 0, `REF_ERROR_LITERAL`, severity `warn`, message `m`:

```tsx
// Inside the §4.3 breakdown describe (the one titled with the component name and the section number) (`tests/components/step3SheetCard.test.tsx:551`), which owns `expand`.
function refWarning(sourceCell: SourceAnchor | null): ParseWarning { // never ParseWarning["sourceCell"]: that includes undefined, which exactOptionalPropertyTypes refuses on a present optional property (the R1 review's sixth finding)
  return { severity: "warn", code: "REF_ERROR_LITERAL", message: "m", blockRef: { kind: "section" }, rawSnippet: "\\#REF\\!", sourceCell };
}
/** Render the card and open the review modal: the warning rows live inside it and nothing in the list is queryable before "More" (the R3 review's third finding). */
function renderExpanded(warnings: ParseWarning[]) {
  const q = render(<Step3SheetCard row={stagedRow(parseResult({ warnings }))} wizardSessionId={WSID} />);
  return within(expand(q));
}
function cellLineText(region: ReturnType<typeof within>, i: number): string | null {
  const el = region.queryByTestId(`wizard-step3-card-${DFID}-warning-${i}-cell`);
  if (!el) return null;
  expect(el.querySelector("a")).toBeNull(); // the -open link is a sibling, never inside the line
  return el.textContent;
}
test("scope cell: renders Sheet cell VENUE!A1 with the value in its own mono span", () => {
  const region = renderExpanded([refWarning({ title: "VENUE", gid: 5, a1: "A1", scope: "cell" })]);
  expect(cellLineText(region, 0)).toBe("Sheet cell VENUE!A1");
  expect(region.getByTestId(`wizard-step3-card-${DFID}-warning-0-cell-value`).textContent).toBe("VENUE!A1");
  expect(region.getByTestId(`wizard-step3-card-${DFID}-warning-0-open`).getAttribute("href")).toContain("range=A1");
});
test.each([
  ["scope tab", { title: "VENUE", gid: 5, scope: "tab" as const }],
  ["null", null],
  ["unscoped region range", { title: "INFO", gid: 0, a1: "A1:C3" }],
  ["scoped range", { title: "INFO", gid: 0, a1: "A1:C3", scope: "cell" as const }], // spec §3: a colon is the legacy block-range shape, no line even when scoped (the R2 review's third finding)
  ["blank a1", { title: "VENUE", gid: 5, a1: "  ", scope: "cell" as const }],
  ["blank title", { title: " ", gid: 5, a1: "A1", scope: "cell" as const }],
])("no cell line for %s", (_, sc) => {
  const region = renderExpanded([refWarning(sc)]);
  // Premise: the row itself is mounted (its catalog copy names #REF!), so the absence below is the line's, not the list's.
  expect(region.queryAllByText(/#REF!/).length).toBeGreaterThan(0);
  expect(region.queryByTestId(`wizard-step3-card-${DFID}-warning-0-cell`)).toBeNull();
});
test("UNKNOWN_FIELD with a Sheet row label renders the label and never the cell line", () => {
  const w: ParseWarning = {
    severity: "warn", code: "UNKNOWN_FIELD", message: "m",
    blockRef: { kind: "crew", name: "Backdrop" }, rawSnippet: "Backdrop | ",
    sourceCell: { title: "INFO", gid: 0, a1: "C4", scope: "cell" },
  };
  const region = renderExpanded([w]);
  expect(region.getByTestId(`wizard-step3-card-${DFID}-warning-0-label`).textContent).toContain("Backdrop");
  expect(region.queryByTestId(`wizard-step3-card-${DFID}-warning-0-cell`)).toBeNull(); // rowLabel wins: dropping the `rowLabel === null` conjunct fails here
});
```

(Placement: inside the §4.3 breakdown describe (the one titled with the component name and the section number) at `tests/components/step3SheetCard.test.tsx:551`, which owns `expand` (`tests/components/step3SheetCard.test.tsx:552-557`: click `-more`, return the `-review-content` pane), the way the existing `-open` cases at `tests/components/step3SheetCard.test.tsx:648-672` query `within(expand(q))`. The negative cases premise that the row mounted before asserting the line is absent, so an unmounted list cannot pass them.)

Published, in `tests/admin/perShowActionableRenderControls.test.tsx` (the suite the task command names; no new sibling, so RED and GREEN run the same command, the R2 review's fourth finding; imports: `type SourceAnchor` from `@/lib/sheet-links/buildSheetDeepLink`): the same eight cases against `per-show-actionable-cell` / `per-show-actionable-cell-value` with `render(<PerShowActionableWarnings items={[w]} driveFileId="df" />)`, and the scope-cell case repeated with `condensed` (the line renders in both modes). Clone-and-strip the `Open in Sheet` anchor before reading the item's text where the assertion is on the item rather than the span.

Transitions: `tests/components/step3SheetCard.transitions.test.tsx` (imports: `type SourceAnchor` from `@/lib/sheet-links/buildSheetDeepLink`, `type ParseWarning` added to its `@/lib/parser/types` import) gains one case inside its §4.5 describe:

```tsx
it("the cell line mounts and unmounts instantly with the anchor (C0 to C1 and back, spec §10)", () => {
  const dfid = "df-tr-cell";
  const row = (sc: SourceAnchor | null): Step3Row => ({
    ...stagedRow(dfid, "Tr"),
    parseResult: {
      ...parseResult("Tr"),
      warnings: [{ severity: "warn", code: "REF_ERROR_LITERAL", message: "m", blockRef: { kind: "section" }, rawSnippet: "\\#REF\\!", sourceCell: sc } satisfies ParseWarning],
    } as unknown as ParseResult,
  });
  const { getByTestId, queryByTestId, rerender } = render(<Step3SheetCard row={row(null)} wizardSessionId={WSID} />);
  fireEvent.click(getByTestId(`wizard-step3-card-${dfid}-more`)); // open the review modal once; rerenders keep component state, so it stays open
  const id = `wizard-step3-card-${dfid}-warning-0-cell`;
  expect(queryByTestId(id)).toBeNull();
  rerender(<Step3SheetCard row={row({ title: "VENUE", gid: 5, a1: "A1", scope: "cell" })} wizardSessionId={WSID} />);
  const el = getByTestId(id); // synchronous, no waitFor: the span is a bare conditional
  expect(el.closest("[data-motion]")).toBeNull();
  rerender(<Step3SheetCard row={row(null)} wizardSessionId={WSID} />);
  expect(queryByTestId(id)).toBeNull();
});
```

(If the modal needs more of `parseResult` than `show` to render its warnings list, build the row from the §4.3 suite's `parseResult(overrides)` fixture shape, `tests/components/step3SheetCard.test.tsx:134`, instead of this file's title-only one.) `tests/admin/perShowActionableTransitions.test.tsx` (imports: `type SourceAnchor` from `@/lib/sheet-links/buildSheetDeepLink`): `warn` (`tests/admin/perShowActionableTransitions.test.tsx:88-93`) gains a third parameter `sourceCell?: SourceAnchor`, spread the way `autocorrect` is (`...(sourceCell ? { sourceCell } : {})`); EVERY `VARIANTS` member gains `sourceCell: null` and a new member `H: { code: "SYN_H", guidance: false, trigger: false, note: false, sourceCell: CELL }` with `const CELL: SourceAnchor = { title: "VENUE", gid: 5, a1: "A1", scope: "cell" }`, and the `satisfies` record type gains `sourceCell: SourceAnchor | null` (every member carries it: the file's own rule at `tests/admin/perShowActionableTransitions.test.tsx:101-102`, a field absent from one member is TS2339 on the union); `itemsFor` becomes `warn(VARIANTS[v].code, v === "G" ? AUTOCORRECT : undefined, VARIANTS[v].sourceCell ?? undefined)`; `expectVariant` adds `expect(!!screen.queryByTestId("per-show-actionable-cell"), `${v} cell line`).toBe(VARIANTS[v].sourceCell !== null)`. The existing every-ordered-pair loop then covers C0↔C1 in both directions (the R1 review's seventh finding: without the `warn` forward, `H` rendered no anchor and the expectation stayed red).

Run the task command (DB-free). Expected: every positive case fails on a null test id; negatives pass (vacuously, which is why the positives exist).

- [ ] **Step 2: GREEN.** Wizard: in the `rowLabel` IIFE at `step3ReviewSections.tsx:3210-3243`, after computing `rowLabel`, compute

```tsx
const cellRef =
  rowLabel === null &&
  w.sourceCell?.scope === "cell" &&
  typeof w.sourceCell.a1 === "string" && w.sourceCell.a1.trim().length > 0 && !w.sourceCell.a1.includes(":") &&
  typeof w.sourceCell.title === "string" && w.sourceCell.title.trim().length > 0
    ? `${w.sourceCell.title.trim()}!${w.sourceCell.a1.trim()}`
    : null;
```

and render, when `rowLabel` is null and `cellRef` is not:

```tsx
<span data-testid={`wizard-step3-card-${dfid}-warning-${i}-cell`} className="wrap-break-word text-xs text-text-subtle">
  Sheet cell{" "}
  <span data-testid={`wizard-step3-card-${dfid}-warning-${i}-cell-value`} className="font-mono text-text">{cellRef}</span>
</span>
```

Published: the same predicate beside `rowLabel` at `PerShowActionableWarnings.tsx:259`, rendered in the `per-show-actionable-row-label` slot with that span's classes, test ids `per-show-actionable-cell` / `per-show-actionable-cell-value`, in both modes. A comment at each site cites spec §3 and states the mutual exclusion with the row label.

Pre-code mechanical checklist: the predicate rejects a colon in `a1` (spec §3, a range never renders); `Sheet cell` has no em dash and no apostrophe; classes are the row label's (`wrap-break-word text-xs text-text-subtle`, `font-mono text-text`); the span is not interactive.

Run the task command: PASS. Pre-dispatch mutants (writing-plans rule, all four families), each run and recorded in the commit body: (a) value emptied: `cellRef` replaced by `""` (the text and value assertions fail); (b) expected content plus an appended suffix: `{cellRef}x` in the value span (the `toBe("VENUE!A1")` assertions fail, which is why they are `toBe` and never `toContain`); (c) present but not live: `cellRef` rendered into a `data-cell` attribute on the row with the span removed, and separately the span wrapped in `{false && ...}` (the test-id query returns null); (d) each discriminating input varied in turn: the `scope` test inverted (`!== "cell"`), the `a1` blank check dropped, the colon check dropped, the `title` blank check dropped, the `rowLabel === null` conjunct dropped (the negative cases `scope tab`, `blank a1`, `scoped range`, `blank title` and `UNKNOWN_FIELD` each fail on exactly its input). A mutant every case survives is a test defect to repair before the commit.

- [ ] **Step 3: Commit** `feat(admin): name the sheet cell on wave-code warning rows and cards`.

### Task 6: closeout: impeccable pair, suites, whole-diff review, PR, readiness line

<!-- task: red=`test -f docs/superpowers/plans/2026-08-29-ref-error-cell-anchors-closeout.md` red-state=live red-target=`tests/docs/_invariant8Closeout.ts:45` why=`the stem-named sibling closeout file does not exist, so test -f exits 1; it exits 0 once this task writes the sibling carrying the RAN/RAN marker, whose form the walker's MARKER regex at that line then holds through the closeout guard (the gate command in Step 3). This plan itself deliberately never names both gate halves (the walker's declaresGate fold needs both, so naming them here before the marker exists would red the guard); the sibling is what makes the unit declare` ac=AC-5,AC-6,AC-7 -->

**Files:**
- Create: the sibling closeout file 2026-08-29-ref-error-cell-anchors-closeout.md under `docs/superpowers/plans/`
- Commit: `docs/review-rounds/feat/ref-error-cell-anchors/*.jsonl` (written by the wrapper)

- [ ] **Step 1: RED.** The task command (`test -f` on the sibling) exits 1: no such file. `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` is GREEN here and stays green, because this plan does not declare the gate (see the marker's `why=`); it becomes the sibling's form check once the sibling exists.
- [ ] **Step 2: impeccable critique + audit** on the Task 5 diff (`git diff origin/main...HEAD -- components/`), each as an isolated sub-agent with cwd pinned to this worktree, and each run with the canonical v3 setup gates FIRST (AGENTS.md invariant 8): the skill's context-load step (PRODUCT.md + DESIGN.md, the impeccable v3 setup script), then the PRODUCT register reference read (admin tooling), before the critique or audit pass; the sibling's §12 records both setup steps as run, the way `docs/superpowers/plans/2026-08-27-wizard-review-attention-menu-closeout.md:80-84` does (the R2 review's fifth finding). P0/P1 fixed in a commit or deferred with a `DEFERRED.md` row; every finding and disposition tabled in the sibling's §12, with the marker line `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>`: `recorded` when `p0 + p1 > 0`, `none` when both are zero (`tests/docs/_invariant8Closeout.ts:141`; a zero-finding pair marked `recorded` is malformed, the R1 review's tenth finding).
- [ ] **Step 3: GREEN.** Write the sibling with §12 and the marker, naming both gate halves there (and only there); the task command exits 0, and `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` holds the marker's form (a malformed line reds §4.1.2; a declaring unit without a marker reds §4.1.1).
- [ ] **Step 4: Unchanged-set check (AC-5).** `git diff origin/main...HEAD -- lib/parser/dataGaps.ts lib/sheet-links/buildSheetDeepLink.ts lib/messages tests/parser/_warningCodeAnchor.ts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` shows only the `scope` doc-comment hunk in `buildSheetDeepLink.ts`; paste the `--stat` in the sibling.
- [ ] **Step 5: Suites, local.** The DB-free half is `pnpm heavy pnpm vitest run --project parallel` (the CI-enforced no-database project, `unit-suite-nodb`), followed by the four serial-project files this plan touches, by explicit list: `pnpm vitest run tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/admin/sectionWarningModel.autocorrect.test.ts tests/sync/attachWarningAnchors.test.ts` (each client-free, the global constraint above). Then the pre-push set from `.github/workflows/quality.yml`. Never `pnpm test:fast` and never a `tests/admin` or `tests/sync` directory glob before the slot: both run DB suites (the R4 review's finding). Ask bl-orch for the DB slot before `pnpm heavy pnpm test`, and run it with the loopback `TEST_DATABASE_URL` override.
- [ ] **Step 6: Push and open the PR.** `git push -u origin feat/ref-error-cell-anchors`; open the PR (body: the spec link, the sibling link, the preflight declaration, the round counts so far). This push is what Steps 7 and 8 measure: `gh workflow run --ref` resolves the branch on origin, and the validation preview builds from the pushed head, so a dispatch or a live check before the push measures the plan-only head (the R2 review's sixth and seventh findings).
- [ ] **Step 7: Mutation harness on the pushed head (AC-2).** The parser mutation harness does NOT run on pull requests (`.github/workflows/mutation-harness.yml:75`, the parser jobs skip `pull_request`; the PR path filter names no parser module, §3): `gh workflow run mutation-harness.yml --ref feat/ref-error-cell-anchors`, pin the run id from `gh run list --workflow mutation-harness.yml --branch feat/ref-error-cell-anchors --limit 1`, confirm its head sha equals the pushed head, wait for it (`gh run watch <id>`), and read the nine parser jobs' conclusions (`parser-shards` ×8, `parser-gates`; `gh run view <id> --json jobs`). The score IS the ledger reconciliation each shard suite performs (`tests/parser/mutationHarness.shard0.test.ts`, the `slice alarms == ledger slice` case: `newHoles`, `fixedHoles`, `driftedAlarms`, `noOps`, `cosmeticViolations` all `[]`), so nine green jobs on the pushed head is "score unchanged" (AC-2), and a red shard names the moved sites in its assertion message. Record in the sibling: the run id, its head sha, the nine conclusions, and the eight `[mutation shard i/8] DONE …` lines (`gh run view <id> --log | grep 'mutation shard'`, emitted at `tests/parser/mutation/runShard.ts:139`). A red, cancelled or absent run is no evidence: AC-2 is undischarged until the nine conclusions exist (the R3 review's fifth finding: the harness has no per-run score to compare against main, the ledger is the comparison).
- [ ] **Step 8: Live check on the preview of the pushed head (AC-1, second half).** Once the validation deploy has this branch's preview and bl-orch has granted the DB slot, rescan `II - FinTech Forum CTO Summit 2026` in the wizard and record that the five rows carry `Open in Sheet` and `Sheet cell <TAB>!A1`; paste the observed five coordinates and the preview's head sha in the sibling. This half of AC-1 has no fixture substitute: if the preview or the slot is not reachable, set the marker's `blockedOn` to that, send bl-orch the ask, and hold; the arc is not READY until the five live coordinates are in the sibling.
- [ ] **Step 9: Commit the evidence.** Commit the sibling (§12 dispositions and marker, the Step 4 stat, the Step 7 numbers, the Step 8 coordinates) and push. The branch now holds everything that merges except the corpus rows Step 10's dispatches write.
- [ ] **Step 10: Whole-diff adversarial review** via codex-guard, `--stage diff --round 1`, on the tree at the Step 9 head; brief with `GUARD SURFACE: none in this diff, CANNOT-EXPRESS: resolvers, decided by the T1 replay-equals-parse suite and the T3/T4 resolution cases` (spec §6), the consequence bound / probe domain / threat fence from the spec review brief, REVIEWER ONLY, fresh eyes, the §1.1 do-not-relitigate list, `FINDINGS:` and `VERDICT:` terminal lines. Iterate to APPROVE within the four-round cap; commit each round's JSONL rows. Ordering rule, so the reviewed diff is the merging diff ("review covers what merges", `docs/agents/writing-plans.md:32`) without the literal reading the 2026-08-18 orchestrator ruling overrode (the wrapper appends a corpus row to `docs/review-rounds/**` inside the reviewed tree on every dispatch, so no review can be literally last on this repo): after the final APPROVE the only commits are corpus rows under `docs/review-rounds/**`. A repair a round demands is committed, re-run from Step 5 (and Step 2 if it touches Task 5 files, Step 7 if it touches `lib/`), pushed, re-recorded in the sibling where a number moved, and re-reviewed in the next round.
- [ ] **Step 11: Readiness.** Push the corpus rows; wait for all required contexts green at the shipping head (read the protection rule's required list from the API in one pass; `unit-suite` is a rollup, ABSENT is not green); send bl-orch `arc-reflink READY: PR #<n> head <40-char sha>`. No merge action.

<!-- tasks: end -->

## 5. Acceptance criteria coverage

The criteria live in the spec (§11). Coverage:

| AC | Discharged by |
| --- | --- |
| AC-1 | Task 4 (T3 fintech, consultants, east-coast through `attachWarningAnchors`, and the router), Task 5 (the two surfaces), Task 6 step 8 (live, mandatory, on the pushed head) |
| AC-2 | Task 1 (byte pin), Task 2 (emitter equivalence and the unchanged parser suites), Task 6 step 7 (harness score, dispatched on the pushed head) |
| AC-3 | Task 3 (variants including the seam pin (f), refusals, positive hand-built arms), Task 4 (router fallthrough) |
| AC-4 | Task 4 |
| AC-5 | Task 6 step 4 |
| AC-6 | Task 6 steps 2 and 3 |
| AC-7 | Task 6 steps 5, 10 and 11 |

## 6. Registry reconciliation, run at plan time

No registry-bearing meta-suite gains or loses rows: `OPERATOR_ACTIONABLE_ANCHORED` (24 members, `tests/parser/operatorActionableWarnings.test.ts:8`), `CELL_ANCHORED_CODES` (24 + 5, `tests/parser/parseWarningDeepLinkRender.test.tsx:21`), `WARNING_CODE_ANCHOR`, `SOURCE_LINK_ALLOWLIST`, `tests/mutation/source/registry.ts` are all untouched. Nothing to reconcile.

## 7. Sweeps authored and run at plan time (2026-08-29, tree at `cb5cc3abd`)

- `rg -n "waveCodesNoSourceCell" lib tests docs --glob '!docs/review-rounds/**'` → `docs/superpowers/specs/2026-08-27-wizard-warning-row-links-copy-design.md:164` (historical: "asserts the ABSENCE ... and is unaffected"; a dated statement about that arc, not edited), `docs/superpowers/specs/parser/2026-08-07-parser-mutation-wave-design.md:288` (the ratification this arc cites; not edited), this arc's spec (three mentions, all about the replacement), `docs/superpowers/plans/2026-08-27-wizard-warning-row-links-copy.md:1116` (a historical run command; not edited). No code reference: the file is deleted without a dangling import.
- `rg -n "attachWarningAnchors\(" lib tests` → definition `lib/sync/attachWarningAnchors.ts:24`; production callers `lib/sync/runOnboardingScan.ts:1435`, `lib/sync/runScheduledCronSync.ts:3325` (both gain the fifth argument, Task 4); test callers `tests/drive/unknownFieldAnchors.test.ts` ×4 and `tests/sync/attachWarningAnchors.test.ts` ×3 (unchanged; the parameter is optional).
- `rg -n "tableMarkdown\(|synthesizeMarkdownFromXlsx\(" lib/drive/exportSheetToMarkdown.ts` → `lib/drive/exportSheetToMarkdown.ts:264` definition, `lib/drive/exportSheetToMarkdown.ts:400` the caller Task 1 replaces with `blockMarkdown`, `lib/drive/exportSheetToMarkdown.ts:434` the OLD-tab region collector (unchanged).
- `rg -n "detectRefErrorLiterals|detectFusedRows|normalizeLeadingColumn" lib tests` (excluding the three definitions) → `lib/parser/index.ts:30`, `lib/parser/index.ts:32`, `lib/parser/index.ts:33`, `lib/parser/index.ts:625`, `lib/parser/index.ts:632`, `lib/parser/index.ts:633` (callers, unchanged: same names, same return shapes plus one additive field) and `tests/parser/leadingColumnAutocorrect.test.ts` ×10 (destructure `corrected` / `warnings`; unaffected by the additive `shifted`).
- `rg -n "WarningAnchorSources" lib tests` → `lib/drive/showDayTimeAnchors.ts:118`, `lib/drive/showDayTimeAnchors.ts:140` and `tests/parser/waveCodesNoSourceCell.test.ts:38`, `tests/parser/waveCodesNoSourceCell.test.ts:66` (the deleted file; its successor imports the same type).
- `rg -n "scope" lib/sheet-links/buildSheetDeepLink.ts` → the `SourceAnchor` doc comment (`lib/sheet-links/buildSheetDeepLink.ts:4-9`) that Task 3 amends, and the `scoped` branch (`lib/sheet-links/buildSheetDeepLink.ts:35-39`, unchanged).

## 8. Handoff

This plan is executed by a separate Opus pane launched by bl-orch on account3 at plan APPROVE; the implementer's brief is the arc file 2026-08-29-arc-reflink.md under FX-worktrees/_briefs (Stage 0 per the wave-common brief beside it; takeover of this worktree per AGENTS.md "Cross-account takeover": overwrite the marker's `sessionId`, register its own nudge, take the pane and agent labels `feat/ref-error-cell-anchors`). The spec+plan session stands down once bl-orch confirms the launch.
