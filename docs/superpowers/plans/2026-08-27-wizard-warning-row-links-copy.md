# Plan — sheet-warning rows link to their cell, and say only what their controls can do

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `UNKNOWN_FIELD` wizard row links to its own sheet cell (or its tab), the five `HOTEL_*` ambiguity rows link to the HOTEL block, and no card names a Report or Ignore button on a surface that has none.

**Architecture:** The exporter's block pipeline (`lib/drive/exportSheetToMarkdown.ts`) becomes a structured value with coordinates, rendered to markdown by one function and read by the anchor scanner through the parser's own opener/alignment core, so the detector and the scanner share one notion of "block". The hotel link is one code-gated arm in `attachSourceCellAnchors` over the region anchors both ingestion paths already carry. The copy split adds a catalog-internal `controlsNote` rendered by `PerShowActionableWarnings` only when the item's controls slot is non-null.

**Tech Stack:** TypeScript, Next.js 16, `xlsx` (SheetJS), Vitest + Testing Library, `pnpm spec:lint`, `codex-guard`.

**Spec:** `docs/superpowers/specs/2026-08-27-wizard-warning-row-links-copy-design.md` (canonical). Branch `fix/wizard-warning-row-links-copy`, worktree `/Users/ericweiss/FX-worktrees/wizard-warning-row-links`. Closes no ledger row; files `BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS` (Task 6).

**The invariant-8 closeout marker lives in the stem-named sibling closeout file** new file 2026-08-27-wizard-warning-row-links-copy-closeout.md under `docs/superpowers/plans/`, written by Task 7.

## Global constraints

- **THE ARC NEVER MERGES.** bl-orch (`w15:p2`) issues the merge word after its own gates. No `gh pr merge`, no `--auto`, no auto-merge at push time. Task 7 ends with a readiness line sent to bl-orch.
- **The local Postgres is a named single slot.** Take no DB-touching run, including runs you believe are DB-free, until bl-orch names you holder. Every command in this plan that is DB-free by construction is marked `DB-free`; the full suite (`pnpm heavy pnpm test`) and anything under `tests/db/` or `tests/sync/` that opens a client are NOT, and wait for the slot.
- **The pre-push set is derived, not remembered.** Before every push, read `.github/workflows/quality.yml` and run what its `quality` job runs (today `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, all three regardless of earlier failures; read the file, do not recite this list).
- **Every message to bl-orch is chunked under 600 characters, numbered, with the arc name `arc-wizwarnlinks` in EACH part.** `herdr agent send` keeps only the TAIL of a long text; an over-long message arrives without its subject or sender.
- **CI pollers run detached via `nohup`**, never as a harness task child; sweep by `ps` plus `lsof` on the worktree cwd, never the task list, and watch the node child, not the zsh wrapper.
- **Review cap is four rounds per stage.** At four, file the round-economy record (`docs/review-rounds/fix/wizard-warning-row-links-copy/` (the base-sha-named .md)) and report to bl-orch before any further round. `--round` restarts at 1 after any merge-base move.
- **Process mint freeze in force.** The one ledger row this arc files is product-facing (Task 6); no process-facing row of any kind.
- **Copy rules** (spec §4.2, §7): no em dash in user-visible strings, straight apostrophes as the catalog already uses, imperative lead on every action sentence.
- **Heavy phases wrap:** `pnpm heavy <cmd>` for any full-suite vitest, playwright, or build; scoped vitest runs with an explicit file list stay unwrapped.
- Conventional commits, one per task: `feat(parser)`, `feat(sync)`, `feat(admin)`, `docs(spec)`, `test(...)`, `docs(plan)`.

## 1. Plan-wide invariants that bear on this diff

- **Invariant 1, TDD.** Every task below is red-then-green on the SAME command; the red run's decisive line is pasted into the commit body.
- **Invariant 2, advisory locks.** N/A. No path that mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions` is touched; `attachWarningAnchors` is a pure raw-workbook read on both ingestion paths (`lib/sync/attachWarningAnchors.ts:12-15`), and this plan adds no acquisition and moves none.
- **Invariant 5, no raw codes in UI.** The new strings are catalog fields read through `messageFor`; no code literal reaches the DOM.
- **Invariant 7, spec is canonical.** No amendment.
- **Invariant 8, UI gate.** IN SCOPE: `components/admin/PerShowActionableWarnings.tsx` changes its guidance composition and its correction-sentence gate, and `NoteWarningCard.tsx` its sentence gate (all Task 5). Task 7 runs the critique + audit pair and writes the marker line.
- **Invariant 9, Supabase call boundaries.** N/A. No Supabase client call is added or edited.
- **Invariant 10, mutation-surface observability.** N/A. No route handler or server action is added or edited.
- **Invariant 12, ledger.** This arc closes no row, so no in-progress marker; the row it FILES is `OPEN` from its first commit (Task 6).

## 1.1 Do not relitigate

Spec §1.1 in full, plus:

- **The equivalence test (Task 2) is the design's proof, not a nicety.** A reviewer who wants a second header-regex family added to the old scanner is asking for the defect the spec §2.1 names.
- **The hotel arm is REGION grain and `OPERATOR_ACTIONABLE_ANCHORED` is untouched** (spec §1.1, §3). Task 4 adds a negative membership assertion so this cannot drift.
- **Ledger row filed under class-sweep exception (a)** by owner decision 2026-08-27 (spec §8); product-facing, unaffected by the freeze.

## 2. Meta-test inventory

- EXTENDS `tests/messages/_metaWarningCardCopy.test.ts`: the banned-vocabulary sweep gains `controlsNote`; a new whole-catalog assertion that no `helpfulContext` names a control (Task 5).
- EXTENDS `tests/parser/operatorActionableWarnings.test.ts`: negative assertion, no `HOTEL_*` member (Task 4).
- CREATES new file synthesizeBlocks.test.ts under `tests/drive/` (Task 2, structure with coordinates) and new file synthesizeBlocksEquivalence.test.ts under `tests/drive/` (Task 3: the coordinate path and the markdown path agree over the whole xlsx corpus, and every anchor binds all four join components).
- `tests/docs/_metaLedgerMintBar.test.ts` reads the new row by walker (Task 6); no edit.
- Not applicable: `tests/auth/_metaInfraContract.test.ts` (no Supabase call), `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutation surface), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock).

## 3. Pre-draft verification (run 2026-08-27 on `origin/main` at `66c9857f5`)

Every symbol below was grepped on the live tree; line numbers are drafting-time locators.

- `lib/parser/blocks/_rowScan.ts:41` `export function scanRowsWithOpener(markdown: string): ScannedRow[]`; `lib/parser/blocks/_rowScan.ts:1` imports `clean, splitRow` from `./_helpers`; `lib/parser/blocks/_rowScan.ts:25` `export type ScannedRow = { cells: string[]; opener: string }`.
- `lib/parser/blocks/_helpers.ts:47` `export function splitRow(line: string): string[]` (drops the outer pipes, trims each cell); `lib/parser/blocks/_helpers.ts:53` `export function clean(s: string): string`.
- `lib/parser/fieldNearMiss.ts:217` `function anchorNamespace(opener: string): string` (NOT exported today); `lib/parser/fieldNearMiss.ts:232` `detectFieldNearMisses` reads `cells[0]` as label, `cells[1]` as value, `anchorNamespace(row.opener)` as kind.
- `lib/drive/exportSheetToMarkdown.ts:41` `escapeCell` (not exported); `lib/drive/exportSheetToMarkdown.ts:107` `sheetGrid`; `lib/drive/exportSheetToMarkdown.ts:129` `splitBlocks` (blank-row split, `isMidBlockSectionStart` mid-block split, `trimBlock` per block); `lib/drive/exportSheetToMarkdown.ts:155` `normalizePullSheetGrid` (returns `[titleRow, ...grid.slice(firstDataRow)]` when it rewrites); `lib/drive/exportSheetToMarkdown.ts:185` `normalizeBlock` (identity); `lib/drive/exportSheetToMarkdown.ts:209` `trimBlock` (column slice only); `lib/drive/exportSheetToMarkdown.ts:228` `tableMarkdown`; `lib/drive/exportSheetToMarkdown.ts:333` `export function synthesizeMarkdownFromXlsx`; `lib/drive/exportSheetToMarkdown.ts:360-412` the tab loop (`OLD` tabs → regions via `collectPullSheetRegionsFromMarkdown`, pushed as markdown only when included).
- `lib/drive/unknownFieldAnchors.ts:58` `BLOCKS`, `lib/drive/unknownFieldAnchors.ts:66` `TERMINATORS`, `lib/drive/unknownFieldAnchors.ts:108` `DETAILS_NON_TERMINATOR_FIELDS`, `lib/drive/unknownFieldAnchors.ts:110` `export function normalizeCellKey`, `lib/drive/unknownFieldAnchors.ts:118` `firstNonBlank`, `lib/drive/unknownFieldAnchors.ts:126` `nextNonBlankAfter`, `lib/drive/unknownFieldAnchors.ts:140` `export function extractUnknownFieldAnchors(buffer, titleToGid)`, `lib/drive/unknownFieldAnchors.ts:204` `export function resolveUnknownFieldCell(anchors, kind, label, value): SourceAnchor | null`. No file outside `unknownFieldAnchors.ts` references `BLOCKS`, `TERMINATORS`, `DETAILS_NON_TERMINATOR_FIELDS`, `firstNonBlank`, or `nextNonBlankAfter` (`rg` on 2026-08-27: only `crewRoleAnchors.ts` has its own `TERMINATORS`, and `exportSheetToMarkdown.ts:210` a local `firstNonBlankCol`).
- `lib/drive/showDayTimeAnchors.ts:17` `export const CELL_ANCHORED_CODES = OPERATOR_ACTIONABLE_ANCHORED`; `lib/drive/showDayTimeAnchors.ts:100` `WarningAnchorSources` (`showDay`, `crewRole`, `unknownField?`, `region: Record<string, SourceAnchor>`); `lib/drive/showDayTimeAnchors.ts:120` `attachSourceCellAnchors`; `lib/drive/showDayTimeAnchors.ts:188` `hasCellAnchoredWarning`.
- `lib/parser/dataGaps.ts:406` `OPERATOR_ACTIONABLE_ANCHORED` (24 members, no `HOTEL_*`); `lib/parser/dataGaps.ts:449` `operatorActionableWarnings` dedups on `w.sourceCell?.a1` only when truthy; `lib/parser/dataGaps.ts:505` `stripLegacyUnknownFieldAnchors` strips an `a1` containing a colon.
- `lib/parser/warnings.ts`: six `code: "HOTEL_..."` emit sites, nine `kind: "hotels"` blockRefs; the five catalog codes are at `lib/messages/catalog.ts` lines 1588, 1603, 1618, 1634 and 1665.
- `lib/sheet-links/buildSheetDeepLink.ts:1` `SOURCE_LINK_ALLOWLIST = ["INFO","AGENDA","GEAR","TRAVEL","PULL SHEET"]`; `lib/sheet-links/buildSheetDeepLink.ts:3` `SourceAnchor = { title; gid; a1?: string }`; `lib/sheet-links/buildSheetDeepLink.ts:10` `buildSheetDeepLink` emits `#gid=N` alone when `a1` is absent and `#gid=0` for a non-allowlisted title; `lib/sheet-links/buildSheetDeepLink.ts:85` `REGION_ANCHOR_SPEC.hotels`.
- `lib/messages/catalog.ts:3` `MessageCatalogEntry`; `lib/messages/catalog.ts:52` `helpfulContext: string | null`; `lib/messages/catalog.ts:1321` `UNKNOWN_FIELD` entry (comment block `lib/messages/catalog.ts:1325-1347`, `helpfulContext` `lib/messages/catalog.ts:1351-1352`); `lib/messages/catalog.ts:1726` `PULL_SHEET_PARSE_PARTIAL`; `lib/messages/catalog.ts:2097` `UNKNOWN_SECTION_HEADER`.
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3255` `UNKNOWN_FIELD:`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3256` `PULL_SHEET_PARSE_PARTIAL:`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3269` `UNKNOWN_SECTION_HEADER:` appendix lines; generator `scripts/extract-spec-codes.ts` (`pnpm gen:spec-codes`), parity `tests/cross-cutting/codes.test.ts:28-31`.
- `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` lines 135, 147 and 149 §4.2 rows 15, 27, 29; `tests/messages/warningCardCopyRegistry.ts` lines 236, 268 and 272 `EXPECTED_HELPFUL_CONTEXT` rows; `tests/messages/_metaWarningCardCopy.test.ts:96-108` banned-vocabulary sweep over `["title","helpfulContext","triggerContext"]`.
- `components/admin/PerShowActionableWarnings.tsx:99` `renderItemControls?: (w, i) => ReactNode`; `components/admin/PerShowActionableWarnings.tsx:147` `const guidanceResult = resolveGuidance(entry, w)`; `components/admin/PerShowActionableWarnings.tsx:175` `movedGuidance`; `components/admin/PerShowActionableWarnings.tsx:355` `const controls = renderItemControls ? renderItemControls(w, i) : null`; `components/admin/PerShowActionableWarnings.tsx:381-396` the `per-show-actionable-guidance` spans; `components/admin/PerShowActionableWarnings.tsx:60` `export function resolveGuidance`; `components/admin/PerShowActionableWarnings.tsx:54` `GuidanceResult`.
- `components/admin/wizard/step3ReviewSections.tsx:3056` `const context = isMessageCode(w.code) ? messageFor(...).helpfulContext`; `components/admin/wizard/step3ReviewSections.tsx:3166` the row link site.
- `tests/components/step3SheetCard.test.tsx:38` `DFID`, `tests/components/step3SheetCard.test.tsx:39` `WSID`, helpers `parseResult`, `stagedRow`, `expand` in the same file; `tests/components/step3SheetCard.test.tsx:664` `wizard-step3-card-${DFID}-warning-0-open`.
- `tests/drive/unknownFieldAnchors.test.ts:13` `buildInfoWorkbook(rows)`; `tests/drive/unknownFieldAnchors.test.ts:110` the over-inclusive test to retire; `tests/parser/fieldNearMissBaseline.test.ts:436` `eastCoastAnchors()` builds a two-column `INFO` workbook from the east-coast `Stage` table and calls `extractUnknownFieldAnchors` (AC-N9 at `tests/parser/fieldNearMissBaseline.test.ts:448`).
- `tests/drive/showDayTimeAnchors.test.ts:100` `describe("attachSourceCellAnchors / hasCellAnchoredWarning")` with `regionAnchors = { crew: {...} }` shape at `tests/drive/showDayTimeAnchors.test.ts:106`.
- `tests/admin/perShowActionableRenderControls.test.tsx:22-36` renders with and without `renderItemControls`.
- `tests/mutation/source/registry.ts:2500` `id: "fieldNearMiss"`, suites `tests/parser/fieldNearMiss.test.ts`, `tests/parser/fieldNearMissBaseline.test.ts`, `scoreFloor: 0.95`.
- `BACKLOG.md:11` first row; rows are newest-first under the header, meta line form at `BACKLOG.md:12` (`**Status:** OPEN · **Filed:** 2026-08-27 (...) · **Facing:** ...`); `tests/docs/_metaLedgerMintBar.test.ts:86-99` requires a parseable `Filed` date and a leading `product|process` `Facing` token.

## 4. File structure

| file | responsibility after this arc |
| --- | --- |
| `lib/parser/blocks/_rowScan.ts` | `scanBlockCells` (pure core: opener + alignment skip over cell arrays) and `scanRowsWithOpener` (line grouping shell over it) |
| `lib/drive/exportSheetToMarkdown.ts` | `synthesizeBlocksFromXlsx` (structured blocks with coordinates), `renderRow` + `escapeCell` exported, `synthesizeMarkdownFromXlsx` as a renderer over the blocks |
| `lib/parser/fieldNearMiss.ts` | `anchorNamespace` exported; nothing else changes |
| `lib/drive/unknownFieldAnchors.ts` | `extractUnknownFieldAnchors` over `synthesizeBlocksFromXlsx`; `resolveUnknownFieldCell` with tab fallback; old header/terminator machinery deleted |
| `lib/drive/showDayTimeAnchors.ts` | `HOTEL_REGION_ANCHORED`, widened `CELL_ANCHORED_CODES`, hotel arm |
| `lib/messages/catalog.ts` | `controlsNote` field, three strings moved |
| `components/admin/PerShowActionableWarnings.tsx` | `showControlsNote` prop, `withControlsNote` composition, gated on the prop AND `controls` |
| `components/admin/showpage/sectionWarningExtras.tsx` | passes `showControlsNote` on the active list only |
| tests | two new suites, eight extended |

<!-- tasks: depth=3 red-contract -->

### Task 1: `scanBlockCells`, the shared opener/alignment core

<!-- task: red=`pnpm vitest run tests/parser/rowScanCore.test.ts` red-state=authored red-target=`lib/parser/blocks/_rowScan.ts:41` why=`scanBlockCells is not exported from _rowScan.ts, so the new suite's import is undefined and every case throws` ac=AC-2 -->

**Files:**
- Modify: `lib/parser/blocks/_rowScan.ts:25-60`
- Create: new file rowScanCore.test.ts under `tests/parser/`

**Interfaces:**
- Produces: `export type ScannedBlockRow = { cells: string[]; opener: string; index: number }`; `export function scanBlockCells(rowsOfCells: readonly (readonly string[])[]): ScannedBlockRow[]`. `scanRowsWithOpener` keeps its signature and output.

What is red and why: `scanBlockCells` does not exist, so the suite fails to import. `DB-free`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/rowScanCore.test.ts
import { describe, expect, it } from "vitest";
import { scanBlockCells, scanRowsWithOpener } from "@/lib/parser/blocks/_rowScan";

describe("scanBlockCells", () => {
  it("takes the opener from row 0 cell 0, skips alignment-shaped rows, and keeps each row's input index", () => {
    const rows = [
      ["Timestamp", "6/1/2025"],
      [":---:", ":---:"],
      ["Room Diagram", ""],
      ["", ""], // alignment-shaped (every cell matches /^[\s:|*-]*$/) → skipped
      ["Backdrop", "x"],
    ];
    expect(scanBlockCells(rows)).toEqual([
      { cells: ["Timestamp", "6/1/2025"], opener: "Timestamp", index: 0 },
      { cells: ["Room Diagram", ""], opener: "Timestamp", index: 2 },
      { cells: ["Backdrop", "x"], opener: "Timestamp", index: 4 },
    ]);
  });

  it("an alignment row as row 0 yields the empty opener, exactly as the markdown shell documents", () => {
    expect(scanBlockCells([[":---:"], ["A", "1"]])).toEqual([{ cells: ["A", "1"], opener: "", index: 1 }]);
  });

  it("empty input yields no rows", () => {
    expect(scanBlockCells([])).toEqual([]);
  });
});

describe("scanRowsWithOpener is the markdown shell over scanBlockCells", () => {
  it("two pipe runs separated by a blank line get their own openers and drop the delimiter rows", () => {
    const md = ["| VENUE | Hilton |", "| :---: | :---: |", "| Address | 1 Main |", "", "| Timestamp | t |", "| :---: | :---: |", "| Backdrop | |"].join("\n");
    expect(scanRowsWithOpener(md)).toEqual([
      { cells: ["VENUE", "Hilton"], opener: "VENUE" },
      { cells: ["Address", "1 Main"], opener: "VENUE" },
      { cells: ["Timestamp", "t"], opener: "Timestamp" },
      { cells: ["Backdrop", ""], opener: "Timestamp" },
    ]);
  });
});
```

- [ ] **Step 2: Run it, expect red**

Run: `pnpm vitest run tests/parser/rowScanCore.test.ts`
Expected: FAIL, `scanBlockCells is not a function` (or an import error naming it).

- [ ] **Step 3: Implement**

Replace the body of `lib/parser/blocks/_rowScan.ts` from the `ScannedRow` type through the end of `scanRowsWithOpener` (keep the doc comments above `scanRowsWithOpener`; the second exported helper further down the file, the per-line opener index, is untouched):

```ts
export type ScannedRow = { cells: string[]; opener: string };
export type ScannedBlockRow = { cells: string[]; opener: string; index: number };

const ALIGNMENT_SEGMENT = /^[\s:|*-]*$/;

/**
 * The opener/alignment core shared by the markdown shell below and the raw-workbook
 * anchor scanner (lib/drive/unknownFieldAnchors.ts). Opener = row 0 cell 0, cleaned;
 * every alignment-shaped row is dropped; `index` is the row's position in the INPUT so
 * a caller holding coordinates can map back. One definition, two callers, so the
 * detector and the scanner cannot disagree about which block a row belongs to.
 */
export function scanBlockCells(rowsOfCells: readonly (readonly string[])[]): ScannedBlockRow[] {
  const first = rowsOfCells[0];
  if (!first) return [];
  const opener = clean(first[0] ?? "");
  const out: ScannedBlockRow[] = [];
  rowsOfCells.forEach((cells, index) => {
    if (cells.every((seg) => ALIGNMENT_SEGMENT.test(seg))) return;
    if (cells.length > 0) out.push({ cells: [...cells], opener, index });
  });
  return out;
}

export function scanRowsWithOpener(markdown: string): ScannedRow[] {
  const rows: ScannedRow[] = [];
  let run: string[][] = [];
  const flush = () => {
    for (const r of scanBlockCells(run)) rows.push({ cells: r.cells, opener: r.opener });
    run = [];
  };
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (run.length > 0) flush();
      continue;
    }
    run.push(splitRow(trimmed));
  }
  if (run.length > 0) flush();
  return rows;
}
```

- [ ] **Step 4: Run the SAME command green**

Run: `pnpm vitest run tests/parser/rowScanCore.test.ts`
Expected: PASS.

- [ ] **Step 4b: Regression, the detector suites that pin `scanRowsWithOpener`**

Run: `pnpm vitest run tests/parser/fieldNearMiss.test.ts tests/parser/fieldNearMissBaseline.test.ts`
Expected: PASS. The baseline suite is the proof the shell's output did not move (65 rows, unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/_rowScan.ts tests/parser/rowScanCore.test.ts
git commit -m "refactor(parser): extract scanBlockCells from scanRowsWithOpener

<paste the red line from Step 2>"
```

### Task 2: `synthesizeBlocksFromXlsx`, the block pipeline as a value

<!-- task: red=`pnpm vitest run tests/drive/synthesizeBlocks.test.ts` red-state=authored red-target=`lib/drive/exportSheetToMarkdown.ts:333` why=`synthesizeBlocksFromXlsx and renderRow are not exported, so the new suite cannot import them` ac=AC-2 -->

**Files:**
- Modify: `lib/drive/exportSheetToMarkdown.ts` lines 41-48, 107-183, 209-241 and 333-412
- Create: new file synthesizeBlocks.test.ts under `tests/drive/`

**Interfaces:**
- Produces:
  ```ts
  export type GridBlockRow = { absRow: number | null; cells: string[] };
  export type GridBlock = { kind: "grid"; sheetName: string; absCol0: number; rows: GridBlockRow[] };
  export type OpaqueBlock = { kind: "opaque"; markdown: string };
  export type SynthesizedBlock = GridBlock | OpaqueBlock;
  export function synthesizeBlocksFromXlsx(buffer: ArrayBuffer, opts?: { includePullSheetFromTab?: string }): { blocks: SynthesizedBlock[]; archivedPullSheetTabs: ArchivedPullSheetTab[] };
  export function renderRow(cells: readonly string[], width: number): string; // "| a | b | |" exactly as tableMarkdown emits it
  export function escapeCell(value: string): string;
  ```
- `synthesizeMarkdownFromXlsx` keeps its signature and its bytes.

What is red and why: the new exports do not exist. `DB-free`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/drive/synthesizeBlocks.test.ts
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { renderRow, synthesizeBlocksFromXlsx, synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";

function workbook(tabs: Record<string, string[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(tabs)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("synthesizeBlocksFromXlsx carries coordinates the markdown loses (spec §2.2)", () => {
  it("splits at blank rows, keeps each row's absolute sheet row, and records the block's first column", () => {
    // Row 0 blank, rows 1-2 a block starting in column B, row 3 blank, rows 4-5 a block in column A.
    const buf = workbook({ INFO: [[], ["", "Timestamp", "t"], ["", "Backdrop", ""], [], ["Console", "QU-16"], ["Speaker", "KLA"]] });
    const { blocks } = synthesizeBlocksFromXlsx(buf);
    const grids = blocks.filter((b) => b.kind === "grid");
    expect(grids.map((b) => ({ sheet: b.sheetName, col: b.absCol0, rows: b.rows.map((r) => r.absRow) }))).toEqual([
      { sheet: "INFO", col: 1, rows: [1, 2] },
      { sheet: "INFO", col: 0, rows: [4, 5] },
    ]);
    expect(grids[0]!.rows[1]!.cells).toEqual(["Backdrop", ""]);
  });

  it("the synthesized PULL SHEET title row has no source row (absRow null); the data rows keep theirs", () => {
    const buf = workbook({ "PULL SHEET": [["Show Title", ""], ["", ""], ["1", "Cable", "x"], ["2", "Stand", "y"]] });
    const { blocks } = synthesizeBlocksFromXlsx(buf);
    const grid = blocks.find((b) => b.kind === "grid" && b.sheetName === "PULL SHEET");
    expect(grid && grid.kind === "grid" ? grid.rows.map((r) => r.absRow) : null).toEqual([null, 2, 3]);
  });

  it("a non-included OLD tab yields no block; an included OLD pull-sheet region is opaque", () => {
    const old = [["OLD TITLE", ""], ["", ""], ["1", "Cable", "x"]];
    const none = synthesizeBlocksFromXlsx(workbook({ INFO: [["CLIENT", "x"]], "OLD PULL SHEET": old }));
    expect(none.blocks.every((b) => b.kind === "grid" && b.sheetName === "INFO")).toBe(true);
    const included = synthesizeBlocksFromXlsx(workbook({ INFO: [["CLIENT", "x"]], "OLD PULL SHEET": old }), { includePullSheetFromTab: "OLD PULL SHEET" });
    expect(included.blocks.some((b) => b.kind === "opaque")).toBe(true);
  });

  it("renderRow pads to the width and escapes exactly as tableMarkdown does", () => {
    expect(renderRow(["a#b", "c|d"], 3)).toBe("| a\\#b | c\\|d |  |");
    const buf = workbook({ INFO: [["a#b", "c|d", ""], ["x", "", ""]] });
    expect(synthesizeMarkdownFromXlsx(buf).markdown.split("\n")[0]).toBe(renderRow(["a#b", "c|d"], 2));
  });
});
```

The last assertion's expected width comes from `trimBlock` (the third column is blank in every row and is sliced off), so the literal `2` is derived from the fixture, not chosen.

- [ ] **Step 2: Run it, expect red**

Run: `pnpm vitest run tests/drive/synthesizeBlocks.test.ts`
Expected: FAIL, `synthesizeBlocksFromXlsx` / `renderRow` not exported.

- [ ] **Step 3: Implement the tracked pipeline**

In `lib/drive/exportSheetToMarkdown.ts`:

(a) Export `escapeCell` (add `export` at line 41).

(b) Introduce tracked rows and refactor the grid helpers to carry them. Replace `sheetGrid`, `rowIsBlank`, `splitBlocks`, `normalizePullSheetGrid`, `trimBlock`, `tableMarkdown` with these (keep `expandMerges`, `cellText`, `isBlank`, `normalizeBlock` as they are, `normalizeBlock` now typed over `TrackedGrid`):

```ts
export type GridBlockRow = { absRow: number | null; cells: string[] };
type TrackedGrid = GridBlockRow[];
type TrackedBlock = { absCol0: number; rows: GridBlockRow[] };

export type GridBlock = { kind: "grid"; sheetName: string; absCol0: number; rows: GridBlockRow[] };
export type OpaqueBlock = { kind: "opaque"; markdown: string };
export type SynthesizedBlock = GridBlock | OpaqueBlock;

function sheetGrid(sheet: XLSX.WorkSheet): { grid: TrackedGrid; firstCol: number } {
  const ref = sheet["!ref"];
  if (!ref) return { grid: [], firstCol: 0 };
  const range = XLSX.utils.decode_range(ref);
  const cells: CellGrid = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const outputRow: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      outputRow.push(cellText(sheet[XLSX.utils.encode_cell({ r: row, c: col })]));
    }
    cells.push(outputRow);
  }
  expandMerges(cells, sheet["!merges"]);
  return {
    grid: cells.map((c, i) => ({ absRow: range.s.r + i, cells: c })),
    firstCol: range.s.c,
  };
}

function rowIsBlank(row: readonly string[]): boolean {
  return row.every(isBlank);
}

function splitBlocks(grid: TrackedGrid, firstCol: number): TrackedBlock[] {
  const blocks: TrackedGrid[] = [];
  let current: TrackedGrid = [];
  for (const row of grid) {
    if (rowIsBlank(row.cells)) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    // Header-aware split (spec 2026-07-27-export-blank-row-segmentation §2.2), unchanged.
    if (current.length > 0) {
      const firstCell = row.cells.find((cell) => !isBlank(cell)) ?? "";
      if (isMidBlockSectionStart(firstCell)) {
        blocks.push(current);
        current = [];
      }
    }
    current.push(row);
  }
  if (current.length > 0) blocks.push(current);
  return blocks.map((b) => trimBlock(b, firstCol)).filter((b): b is TrackedBlock => b !== null);
}

function normalizePullSheetGrid(sheetName: string, grid: TrackedGrid): TrackedGrid {
  if (!/PULL SHEET/i.test(sheetName)) return grid;
  const firstDataRow = grid.findIndex(({ cells: row }) => {
    const quantity = Number(row[0]);
    return Number.isFinite(quantity) && !isBlank(row[1] ?? "");
  });
  if (firstDataRow <= 0) return grid;
  const titleParts = grid
    .slice(0, firstDataRow)
    .flatMap(({ cells: row }) => row.filter((value) => !isBlank(value)))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (titleParts.length === 0) return grid;
  const width = Math.max(
    1,
    ...grid.slice(firstDataRow).map(({ cells: row }) => {
      for (let col = row.length - 1; col >= 0; col -= 1) {
        if (!isBlank(row[col] ?? "")) return col + 1;
      }
      return 0;
    }),
  );
  // The title row is synthesized: it has no source cell (absRow null).
  return [
    { absRow: null, cells: Array.from({ length: width }, () => titleParts.join("/")) },
    ...grid.slice(firstDataRow),
  ];
}

function trimBlock(block: TrackedGrid, firstCol: number): TrackedBlock | null {
  const firstNonBlankCol = block.reduce<number | null>((first, { cells: row }) => {
    for (let col = 0; col < row.length; col += 1) {
      if (!isBlank(row[col] ?? "")) return first === null ? col : Math.min(first, col);
    }
    return first;
  }, null);
  if (firstNonBlankCol === null) return null;
  const lastNonBlankCol = block.reduce((last, { cells: row }) => {
    for (let col = row.length - 1; col >= 0; col -= 1) {
      if (!isBlank(row[col] ?? "")) return Math.max(last, col);
    }
    return last;
  }, firstNonBlankCol);
  return {
    absCol0: firstCol + firstNonBlankCol,
    rows: block.map((r) => ({ absRow: r.absRow, cells: r.cells.slice(firstNonBlankCol, lastNonBlankCol + 1) })),
  };
}

/** One table row exactly as `tableMarkdown` emits it: padded to `width`, each cell escaped. */
export function renderRow(cells: readonly string[], width: number): string {
  const padded = Array.from({ length: width }, (_, index) => escapeCell(cells[index] ?? ""));
  return `| ${padded.join(" | ")} |`;
}

function tableMarkdown(rows: readonly (readonly string[])[]): string {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const delimiter = Array.from({ length: width }, () => ":---:");
  return [
    renderRow(rows[0] ?? [], width),
    `| ${delimiter.join(" | ")} |`,
    ...rows.slice(1).map((row) => renderRow(row, width)),
  ].join("\n");
}
```

Check `normalizeBlock`'s signature: it is the identity and its comment is kept; retype it as `(block: TrackedBlock): TrackedBlock`.

(c) Replace the tab loop in `synthesizeMarkdownFromXlsx` (line 360-412) with `synthesizeBlocksFromXlsx` and a renderer. Everything inside the `OLD`-tab branch is unchanged except that `sheetGrid(sheet)` becomes `sheetGrid(sheet).grid`, `splitBlocks(...)` gets the `firstCol` argument, and `.map(tableMarkdown)` becomes `.map((b) => tableMarkdown(b.rows.map((r) => r.cells)))`; included regions push `{ kind: "opaque", markdown: r.regionMarkdown }` instead of a string:

```ts
export function synthesizeBlocksFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { blocks: SynthesizedBlock[]; archivedPullSheetTabs: ArchivedPullSheetTab[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false }); // same options as today
  const blocks: SynthesizedBlock[] = [];
  const archivedPullSheetTabs: ArchivedPullSheetTab[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    if (/\bOLD\b/i.test(sheetName)) {
      /* the existing OLD-tab branch, verbatim, with the three substitutions above;
         `tables.push(...regions.map((r) => r.regionMarkdown))` becomes
         `blocks.push(...regions.map((r) => ({ kind: "opaque" as const, markdown: r.regionMarkdown })))` */
      continue;
    }
    const { grid, firstCol } = sheetGrid(sheet);
    for (const block of splitBlocks(normalizePullSheetGrid(sheetName, grid), firstCol).map(normalizeBlock)) {
      blocks.push({ kind: "grid", sheetName, absCol0: block.absCol0, rows: block.rows });
    }
  }
  return { blocks, archivedPullSheetTabs };
}

export function synthesizeMarkdownFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { markdown: string; archivedPullSheetTabs: ArchivedPullSheetTab[] } {
  const { blocks, archivedPullSheetTabs } = synthesizeBlocksFromXlsx(buffer, opts);
  const tables = blocks.map((b) =>
    b.kind === "grid" ? tableMarkdown(b.rows.map((r) => r.cells)) : b.markdown,
  );
  return { markdown: tables.join("\n\n"), archivedPullSheetTabs };
}
```

The `WorkbookSynthesisError` guard: today `synthesizeMarkdownFromXlsx` (line 333) wraps `synthesizeMarkdownFromXlsxUnguarded` (line 355) in a `try/catch` that rethrows a `WorkbookSynthesisError` and wraps anything else. Keep that shape: the loop above is `synthesizeBlocksFromXlsxUnguarded`, `synthesizeBlocksFromXlsx` wraps it in the SAME try/catch, and `synthesizeMarkdownFromXlsx` calls the guarded blocks function (no second guard). `tests/drive/workbookSynthesisError.test.ts` pins the behaviour and must stay green. In the `OLD`-tab branch, `rawGrid` becomes `sheetGrid(sheet)` (tracked): pass `rawGrid.grid` to `normalizePullSheetGrid` and `rawGrid.grid.map((r) => r.cells)` to `collectRawPullSheetPreviews` (line 390), which keeps its `CellGrid` signature.

- [ ] **Step 4: Run the SAME command green**

Run: `pnpm vitest run tests/drive/synthesizeBlocks.test.ts`
Expected: PASS.

- [ ] **Step 4b: Regression, the byte pin and the exporter suites**

Run: `pnpm vitest run tests/drive/round-trip-fixture.test.ts tests/drive/workbookSynthesisError.test.ts tests/drive/exportSheetToMarkdown.test.ts tests/drive/exportSheetArchivedPullSheet.test.ts tests/drive/sourceAnchors.test.ts`
Expected: PASS. `round-trip-fixture` is the byte-equality pin for spec §2.2; if it fails, the renderer moved bytes and the refactor is wrong, not the fixture.

- [ ] **Step 5: Typecheck, commit**

Run: `pnpm typecheck` (`DB-free`). Expected: clean.

```bash
git add lib/drive/exportSheetToMarkdown.ts tests/drive/synthesizeBlocks.test.ts
git commit -m "refactor(sync): expose the exporter's block pipeline with coordinates

synthesizeMarkdownFromXlsx is now a renderer over synthesizeBlocksFromXlsx;
bytes unchanged (round-trip-fixture green). <paste the red line from Step 2>"
```

### Task 3: the anchor scanner reads the same blocks the detector reads

<!-- task: red=`pnpm vitest run tests/drive/unknownFieldAnchors.test.ts tests/drive/synthesizeBlocksEquivalence.test.ts tests/sheet-links/buildSheetDeepLink.test.ts tests/sync/attachWarningAnchors.test.ts tests/parser/fieldNearMissBaseline.test.ts` red-state=authored red-target=`lib/drive/unknownFieldAnchors.ts:158` why=`extractUnknownFieldAnchors iterates the BLOCKS header families (venue, details) only, so a Timestamp-opened INFO block and a Console-opened GEAR block yield no anchor and the three new cases resolve null` ac=AC-1,AC-3,AC-4 -->

**Files:**
- Modify: `lib/parser/fieldNearMiss.ts:217` (add `export`)
- Modify: `lib/sheet-links/buildSheetDeepLink.ts` lines 3 and 10-26 (`scope` field; scoped anchors bypass the title gate) and `tests/sheet-links/buildSheetDeepLink.test.ts` (two new cases)
- Modify: `lib/drive/unknownFieldAnchors.ts` lines 16-108 and 118-215
- Modify: `tests/drive/unknownFieldAnchors.test.ts:110-120` (retire), plus new cases
- Create: new file synthesizeBlocksEquivalence.test.ts under `tests/drive/` (spec T1, both halves)
- Modify: `tests/parser/fieldNearMissBaseline.test.ts:498-540` (the two asymmetry pins flip, spec §2.6)
- Modify: `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md` (dated note under the §2.2 ratified amendment)

**Interfaces:**
- Consumes: `synthesizeBlocksFromXlsx`, `renderRow` (Task 2); `scanBlockCells` (Task 1); `anchorNamespace` (this task).
- Produces: `SourceAnchor.scope?: "cell" | "tab"`; `export function blockRowsForScan(block: GridBlock): string[][]` in `lib/drive/unknownFieldAnchors.ts`; `resolveUnknownFieldCell` may now return `{ title, gid, scope: "tab" }` without `a1`.

What is red and why: the scanner walks only its two header families (`lib/drive/unknownFieldAnchors.ts:158`, `for (const { kind, header } of BLOCKS)`), so the three new cases resolve `null`. `DB-free`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/drive/unknownFieldAnchors.test.ts` (it already imports `XLSX`, `parseSheet`, `premiseHolds`, and the two functions under test; add `synthesizeMarkdownFromXlsx` from `@/lib/drive/exportSheetToMarkdown` and `attachWarningAnchors` from `@/lib/sync/attachWarningAnchors`):

```ts
function buildWorkbook(tabs: Record<string, (string | null)[][]>): { buffer: ArrayBuffer; gids: Map<string, number> } {
  const wb = XLSX.utils.book_new();
  const gids = new Map<string, number>();
  let gid = 0;
  for (const [name, rows] of Object.entries(tabs)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? ""))), name);
    gids.set(name, gid);
    gid += 1;
  }
  return { buffer: XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer, gids };
}

/** Run the real ingestion shape: synthesize → parse → attach, then resolve through the
 *  warning's own blockRef. Never reads `kind` off the warning to decide the assertion. */
async function anchoredUnknownFields(tabs: Record<string, (string | null)[][]>) {
  const { buffer, gids } = buildWorkbook(tabs);
  const md = synthesizeMarkdownFromXlsx(buffer).markdown;
  const parsed = parseSheet(md, "probe.md");
  await attachWarningAnchors(parsed.warnings, buffer, () => Promise.resolve(gids));
  return parsed.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
}

describe("spec 2026-08-27 §2: anchors follow the exporter's blocks, every kind, every tab the exporter includes", () => {
  it("a Timestamp-opened INFO block and a Console-opened GEAR block both anchor to the row's own label cell", async () => {
    const warnings = await anchoredUnknownFields({
      INFO: [
        ["Timestamp", "6/1/2025"],
        ["Room Diagram", ""],
        ["Backdrop", ""],
      ],
      GEAR: [
        ["Console", "Allen & Heath QU-16"],
        ["Speaker", "QSC KLA"],
      ],
    });
    const byLabel = new Map(warnings.map((w) => [w.blockRef?.name, w.sourceCell ?? null]));
    premiseHolds("the detector flagged all three rows", byLabel.size === 3);
    expect(byLabel.get("Room Diagram")).toEqual({ title: "INFO", gid: 0, a1: "A2", scope: "cell" });
    expect(byLabel.get("Backdrop")).toEqual({ title: "INFO", gid: 0, a1: "A3", scope: "cell" });
    expect(byLabel.get("Speaker")).toEqual({ title: "GEAR", gid: 1, a1: "A2", scope: "cell" });
  });

  it("a block on a tab outside SOURCE_LINK_ALLOWLIST (FORM, the RIA shape) anchors too, scoped, and the link honours it", async () => {
    const warnings = await anchoredUnknownFields({ INFO: [["CLIENT", "x"]], FORM: [["Timestamp", "t"], ["Backdrop", ""]] });
    const w = warnings.find((x) => x.blockRef?.name === "Backdrop");
    premiseHolds("the FORM row was flagged", w !== undefined);
    expect(w!.sourceCell).toEqual({ title: "FORM", gid: 1, a1: "A2", scope: "cell" });
    expect(buildSheetDeepLink("dfid", w!.sourceCell)).toBe("https://docs.google.com/spreadsheets/d/dfid/edit#gid=1&range=A2");
  });

  it("a used range that starts at B2 anchors to the real coordinate, not the grid-relative one", async () => {
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.sheet_add_aoa(ws, [["Timestamp", "t"], ["Backdrop", ""]], { origin: "B2" });
    delete ws["!ref"]; ws["!ref"] = "B2:C3";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INFO");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    premiseHolds("the sheet's used range starts at B2", XLSX.read(buffer, { type: "array" }).Sheets.INFO!["!ref"] === "B2:C3");
    const md = synthesizeMarkdownFromXlsx(buffer).markdown;
    const parsed = parseSheet(md, "probe.md");
    await attachWarningAnchors(parsed.warnings, buffer, () => Promise.resolve(new Map([["INFO", 0]])));
    const w = parsed.warnings.find((x) => x.code === "UNKNOWN_FIELD" && x.blockRef?.name === "Backdrop");
    premiseHolds("the row was flagged", w !== undefined);
    expect(w!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "B3", scope: "cell" });
  });

  it("duplicate (kind,label,value) on one tab → the tab, not either cell; the same kind on two tabs → null", async () => {
    const dup = await anchoredUnknownFields({ INFO: [["Timestamp", "t"], ["Backdrop", ""], ["Backdrop", ""]] });
    premiseHolds("both duplicates flagged", dup.filter((w) => w.blockRef?.name === "Backdrop").length === 2);
    for (const w of dup) expect(w.sourceCell).toEqual({ title: "INFO", gid: 0, scope: "tab" });

    const split = await anchoredUnknownFields({
      INFO: [["Timestamp", "t"], ["Backdrop", ""]],
      GEAR: [["Timestamp", "t"], ["Backdrop", ""]],
    });
    for (const w of split) expect(w.sourceCell ?? null).toBeNull();
  });

  it("the synthesized PULL SHEET title row never anchors (absRow null)", () => {
    const { buffer, gids } = buildWorkbook({
      "PULL SHEET": [["Show Title", ""], ["", ""], ["1", "Cable", "x"], ["2", "Stand", "y"]],
    });
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    premiseHolds("the title row was synthesized", anchors.length > 0);
    expect(anchors.every((a) => a.label !== "show title")).toBe(true);
  });
});
```

Corpus case, first in the new describe (spec AC-1). `extractSourceAnchors` from `@/lib/drive/sourceAnchors`; `readFileSync`/`join` from node:

```ts
  it("the dispatching show's workbook (ria.xlsx): the three near-miss rows resolve to their own cells and the hotel row to the hotels region", async () => {
    const buffer = readFileSync(join(process.cwd(), "fixtures/shows/exporter-xlsx/ria.xlsx")).buffer as ArrayBuffer;
    const wb = XLSX.read(buffer, { type: "array" });
    const gids = new Map(wb.SheetNames.map((n, i) => [n, i] as const));
    const md = synthesizeMarkdownFromXlsx(buffer).markdown;
    const parsed = parseSheet(md, "ria.md");
    await attachWarningAnchors(parsed.warnings, buffer, () => Promise.resolve(gids));

    // Independent read: the cell whose text equals the label, on the expected tab.
    const cellOf = (tab: string, text: string): string => {
      const ws = wb.Sheets[tab]!;
      const range = XLSX.utils.decode_range(ws["!ref"]!);
      const hits: string[] = [];
      for (let r = range.s.r; r <= range.e.r; r++)
        for (let c = range.s.c; c <= range.e.c; c++) {
          const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
          if (typeof v === "string" && v.trim() === text) hits.push(XLSX.utils.encode_cell({ r, c }));
        }
      premiseHolds(`${tab}!${text} occurs exactly once`, hits.length === 1);
      return hits[0]!;
    };
    const uf = parsed.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
    const byName = new Map(uf.map((w) => [w.blockRef?.name, w.sourceCell ?? null]));
    premiseHolds("the three RIA near-miss rows are emitted", ["Room Diagram", "Backdrop", "Speaker"].every((n) => byName.has(n)));
    // The rows live on FORM and 3rd Level (spec §1); the workbook has no GEAR tab.
    expect(byName.get("Room Diagram")).toEqual({ title: "FORM", gid: gids.get("FORM"), a1: cellOf("FORM", "Room Diagram"), scope: "cell" });
    expect(byName.get("Backdrop")).toEqual({ title: "FORM", gid: gids.get("FORM"), a1: cellOf("FORM", "Backdrop"), scope: "cell" });
    expect(byName.get("Speaker")).toEqual({ title: "3rd Level", gid: gids.get("3rd Level"), a1: cellOf("3rd Level", "Speaker"), scope: "cell" });
    for (const name of ["Room Diagram", "Backdrop", "Speaker"]) {
      const c = byName.get(name)!;
      expect(buildSheetDeepLink("dfid", c)).toBe(`https://docs.google.com/spreadsheets/d/dfid/edit#gid=${c.gid}&range=${c.a1}`);
    }
  });
```

(`buildSheetDeepLink` imported from `@/lib/sheet-links/buildSheetDeepLink`. The hotel row of this workbook is asserted in Task 4, not here: a task ends green on its own command. If the RIA sheet's `Backdrop` occurred twice on `FORM`, the `cellOf` premise would say so instead of the assertion drifting; it occurs once, and `Backdrop (LED, Spandex)` does not equal `Backdrop` after trim.)

The T1 equivalence suite (spec §2.3, both halves), new file new file synthesizeBlocksEquivalence.test.ts under `tests/drive/`:

```ts
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderRow, synthesizeBlocksFromXlsx, synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { blockRowsForScan, extractUnknownFieldAnchors, normalizeCellKey } from "@/lib/drive/unknownFieldAnchors";
import { scanBlockCells, scanRowsWithOpener } from "@/lib/parser/blocks/_rowScan";
import { splitRow } from "@/lib/parser/blocks/_helpers";
import { anchorNamespace } from "@/lib/parser/fieldNearMiss";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const DIR = join(process.cwd(), "fixtures/shows/exporter-xlsx");
const WORKBOOKS = readdirSync(DIR).filter((f) => f.endsWith(".xlsx"));

describe("the anchor scanner reads the blocks the detector reads (spec §2.3)", () => {
  premise("the corpus has workbooks", WORKBOOKS.length, 0);
  for (const file of WORKBOOKS) {
    const buffer = readFileSync(join(DIR, file)).buffer as ArrayBuffer;
    const markdownRows = scanRowsWithOpener(synthesizeMarkdownFromXlsx(buffer).markdown);

    it(`${file} (a): coordinate path ≡ markdown path, in order`, () => {
      const grids = synthesizeBlocksFromXlsx(buffer).blocks.filter((b) => b.kind === "grid");
      premise(`${file} yields more than one grid block`, grids.length, 1);
      premiseHolds(`${file} has a block with more than two rows`, grids.some((b) => b.rows.length > 2));
      const fromCoords = grids.flatMap((b) => scanBlockCells(blockRowsForScan(b)).map((r) => ({ opener: r.opener, cells: r.cells })));
      expect(fromCoords).toEqual(markdownRows.map((r) => ({ opener: r.opener, cells: r.cells })));
    });

    it(`${file} (c): every anchor's a1 binds all four join components (tab, block kind, label, value)`, () => {
      const wb = XLSX.read(buffer, { type: "array" });
      const gids = new Map(wb.SheetNames.map((n, i) => [n, i] as const));
      const anchors = extractUnknownFieldAnchors(buffer, gids);
      premise(`${file} has anchors`, anchors.length, 0);
      for (const a of anchors) {
        // Independent row read from a1's column rightward, then the SHIPPED conversion
        // (renderRow + splitRow): a literal pipe inside a cell fractures the row for the
        // parser (escapeCell writes \|, splitRow splits on it anyway; ria.xlsx INFO!A47),
        // and the anchor's label is the parser's first fragment, by design (spec §9).
        const ws = wb.Sheets[a.anchor.title]!;
        const { r, c } = XLSX.utils.decode_cell(a.anchor.a1!);
        const range = XLSX.utils.decode_range(ws["!ref"]!);
        const rowCells: string[] = [];
        for (let col = c; col <= range.e.c; col++) {
          const v = ws[XLSX.utils.encode_cell({ r, c: col })]?.v;
          rowCells.push(v === undefined || v === null ? "" : String(v));
        }
        const conv = splitRow(renderRow(rowCells, rowCells.length));
        // Spec §2.3 derivation: the join key has FOUR components (tab, block kind, label,
        // value) and nothing else. All four against an independent read:
        expect(a.anchor.gid, `${file} ${a.anchor.title} gid`).toBe(gids.get(a.anchor.title));
        expect(normalizeCellKey(conv[0] ?? ""), `${file} ${a.anchor.title}!${a.anchor.a1} label`).toBe(a.label);
        expect(normalizeCellKey(conv[1] ?? ""), `${file} ${a.anchor.title}!${a.anchor.a1} value`).toBe(a.value);
        const block = synthesizeBlocksFromXlsx(buffer).blocks.find(
          (b) => b.kind === "grid" && b.sheetName === a.anchor.title && b.rows.some((row) => row.absRow === r),
        );
        premiseHolds(`${file} ${a.anchor.title}!${a.anchor.a1} sits in a grid block`, block !== undefined && block.kind === "grid");
        const opener = scanBlockCells(blockRowsForScan(block as Extract<typeof block, { kind: "grid" }>))[0]?.opener ?? "";
        expect(anchorNamespace(opener), `${file} ${a.anchor.title}!${a.anchor.a1} block kind`).toBe(a.kind);
      }
    });

    it(`${file} (b): every anchor's (kind,label,value) is a triple the detector's view contains`, () => {
      const wb = XLSX.read(buffer, { type: "array" });
      const gids = new Map(wb.SheetNames.map((n, i) => [n, i] as const));
      const anchors = extractUnknownFieldAnchors(buffer, gids);
      premise(`${file} anchors span more than one kind`, new Set(anchors.map((a) => a.kind)).size, 1);
      premiseHolds(`${file} has an anchored label escapeCell rewrites`, anchors.some((a) => /[#|\\]/.test(a.label)));
      const seen = new Set(markdownRows.map((r) => `${anchorNamespace(r.opener)}\u0000${normalizeCellKey(r.cells[0] ?? "")}\u0000${normalizeCellKey(r.cells[1] ?? "")}`));
      for (const a of anchors) expect(seen.has(`${a.kind}\u0000${a.label}\u0000${a.value}`), `${file}: ${a.kind}/${a.label}/${a.value}`).toBe(true);
    });
  }
});
```

If the escape-character premise fails on a workbook that has no `#`/`|`/backslash label, narrow that premise to "at least one workbook in the corpus" (hoist the check above the loop) rather than deleting it; `ria.xlsx` has `# of Technicians Needed`.

Flip the two asymmetry pins in `tests/parser/fieldNearMissBaseline.test.ts` (spec §2.6): replace the `withHeader` case ("the anchor scanner's header set is narrower than the detector's DETAILS family", line 515) with:

```ts
  it("every DETAILS-family spelling anchors the Stage row: one kind function on both sides (spec 2026-08-27 §2.2)", () => {
    for (const header of ["DETAILS", "DETAILS/Room Diagram", "GS DETAILS (FOR BOTH)"]) {
      const ws = XLSX.utils.aoa_to_sheet([[header, ""], ["Stge", "8' x 24' x 2'"]]); // near-miss of Stage
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "INFO");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const md = synthesizeMarkdownFromXlsx(buf).markdown;
      const w = parseSheet(md, "probe.md").warnings.find((x) => x.code === "UNKNOWN_FIELD" && x.blockRef?.name === "Stge");
      premiseHolds(`${header}: the near-miss row is emitted`, w !== undefined);
      const cell = resolveUnknownFieldCell(extractUnknownFieldAnchors(buf, new Map([["INFO", 0]])), w!.blockRef?.kind, w!.blockRef?.name, valueFromRawSnippet(w!.rawSnippet));
      expect(cell, header).toEqual({ title: "INFO", gid: 0, a1: "A2", scope: "cell" });
    }
  });
```

and rewrite the comment on the "Timestamp-block row resolves null" case (line 498) to: "Null here because the anchor set is the east-coast Stage table, which has no Timestamp block; a Timestamp row in its own workbook now anchors (tests/drive/unknownFieldAnchors.test.ts). Not a claim that Timestamp rows are unanchorable." If the near-miss guard does not accept `Stge` as a near-miss of `Stage` (`passesGuards` MIN_LEN / distinctiveness), pick the label the baseline's own Stage row used before it was corrected (read `tests/parser/fieldNearMissBaseline.test.ts` AC-N9 fixture rows) so the premise holds.

Append under the §2.2 ratified amendment paragraph in `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md`: "**Retired 2026-08-27** by `docs/superpowers/specs/2026-08-27-wizard-warning-row-links-copy-design.md` §2: the scanner now keys on `anchorNamespace` itself, so there is one family; the two baseline pins of the asymmetry were flipped in the same commit."

Reconcile the four live assertions the new resolver contract changes (spec §2.4: zero or several matches on a kind that lives on ONE tab now resolve to that tab), each with a one-line comment naming the spec section:

- line 73 (`"details", "Notes", "outside-val"`, the PROVENANCE-across-bound case): `toBeNull()` becomes `toEqual({ title: "INFO", gid: 0, scope: "tab" })`; the PROVENANCE claim the case makes (never the impostor cell) is unchanged and now reads "the tab, never the impostor".
- line 83 (true duplicate): `toBeNull()` becomes `toEqual({ title: "INFO", gid: 0, scope: "tab" })`.
- line 105 (`"details", "Nonexistent", "x"`): becomes `toEqual({ title: "INFO", gid: 0, scope: "tab" })`; the `undefined`-kind assertion on the next line stays `toBeNull()` (no kind, no join) and the `new Map()` assertion stays `[]`.
- line 133 (`"details", "Details Notes", "some note"`): becomes `toEqual({ title: "INFO", gid: 0, scope: "tab" })`; the comment above it ("never scanned as a details row") stays true: it is not a cell.

`tests/sync/attachWarningAnchors.test.ts` line 134: `toEqual({ title: "INFO", gid: 0, a1: "A2" })` becomes `toEqual({ title: "INFO", gid: 0, a1: "A2", scope: "cell" })`. Sweep, run at plan time, of every exact-object anchor assertion an UNKNOWN_FIELD anchor can reach (`rg -n "toEqual\(\{ title: \"INFO\"|sourceCell\)\.toEqual|\?\.a1\)\.toBe"` over the five anchor suites): `attachWarningAnchors.test.ts` lines 34, 96, 111 are crew-role and show-day anchors (unchanged producers, no `scope`); line 134 is the UNKNOWN_FIELD one above; `showDayTimeAnchors.test.ts` lines 461 and 493 build `unknownField` anchors by hand and get them back by identity or get `null` from an empty anchor list (no kind present, no tab), unchanged; its remaining hits are schedule/crew/region anchors, unchanged; `unknownFieldAnchors.test.ts` `?.a1` reads (lines 61, 95, 96, 131, 220, 233, 234, 237) read a cell's `a1` and stay cells.

Retire the case at line 110 ("over-inclusive: does NOT stop at an internal blank row within the block") and replace it with the truth spec §2.6 states:

```ts
  it("rows after an internal blank row anchor under their OWN block's kind (the exporter splits there, and so does the detector)", async () => {
    const warnings = await anchoredUnknownFields({
      INFO: [["DETAILS", ""], ["Stage Size", "40x12"], ["", ""], ["Stage Sze", "30x10"]],
    });
    const w = warnings.find((x) => x.blockRef?.name === "Stage Sze");
    premiseHolds("the second-block near-miss was flagged", w !== undefined);
    expect(w?.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A4", scope: "cell" });
  });
```

- [ ] **Step 2: Run it, expect red**

Run: `pnpm vitest run tests/drive/unknownFieldAnchors.test.ts tests/drive/synthesizeBlocksEquivalence.test.ts tests/sheet-links/buildSheetDeepLink.test.ts tests/sync/attachWarningAnchors.test.ts tests/parser/fieldNearMissBaseline.test.ts`
Expected: FAIL: the equivalence suite cannot import `blockRowsForScan`; the two new `buildSheetDeepLink` cases collapse to `#gid=0`; the reconciled `attachWarningAnchors` expectation lacks `scope`; the corpus case and the four new cases (`sourceCell` null where a cell is expected; the tab-level case gets `null` instead of `{title, gid}`). The retired case's replacement is also red (kind `stage sze` matches no `BLOCKS` family).

- [ ] **Step 3: Implement**

`lib/parser/fieldNearMiss.ts:217`: `export function anchorNamespace(opener: string): string {` (body unchanged; extend the doc comment with one line: "Exported for lib/drive/unknownFieldAnchors.ts, which keys anchors on the same function so the two cannot drift").

`lib/sheet-links/buildSheetDeepLink.ts`: `export type SourceAnchor = { title: string; gid: number; a1?: string; scope?: "cell" | "tab" };` and in `buildSheetDeepLink` replace the single fallback line with:

```ts
  if (!anchor || typeof anchor.gid !== "number") return `${base}#gid=0`;
  // Scanner-produced anchors (scope cell|tab) were located by content on their own tab and
  // bypass the region allowlist (spec 2026-08-27-wizard-warning-row-links-copy §2.5); every
  // unscoped anchor (regions, legacy persisted rows, crew-role and show-day cells) keeps the
  // read-time guard exactly as before.
  const scoped = anchor.scope === "cell" || anchor.scope === "tab";
  if (!scoped && !isAllowed(anchor.title)) return `${base}#gid=0`;
```

with two new cases in `tests/sheet-links/buildSheetDeepLink.test.ts` beside "disallowed title → first tab": `{ title: "FORM", gid: 3, a1: "A29", scope: "cell" }` → `#gid=3&range=A29`; `{ title: "3rd Level", gid: 10, scope: "tab" }` → `#gid=10`; and the existing disallowed-title case kept verbatim (unscoped `CLIENT` still collapses).

`lib/drive/unknownFieldAnchors.ts`: add `blockRowsForScan` (below) and delete `BLOCKS`, `TERMINATORS`, `DETAILS_NON_TERMINATOR_FIELDS`, `firstNonBlank`, `nextNonBlankAfter`, the `buildAbsGrid` import, and the header comment block at line 16-56 (replace it with the three-paragraph rationale below). Keep `UnknownFieldAnchor`, `normalizeCellKey`. New body:

```ts
import * as XLSX from "xlsx";
import { clean } from "@/lib/parser/blocks/_helpers";
import { splitRow } from "@/lib/parser/blocks/_helpers";
import { scanBlockCells } from "@/lib/parser/blocks/_rowScan";
import { anchorNamespace } from "@/lib/parser/fieldNearMiss";
import { renderRow, synthesizeBlocksFromXlsx, type GridBlock } from "@/lib/drive/exportSheetToMarkdown";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

// Spec 2026-08-27-wizard-warning-row-links-copy §2. Anchors are derived from the SAME
// block pipeline the detector reads (synthesizeBlocksFromXlsx → renderRow → splitRow →
// scanBlockCells), keyed on the SAME kind function (anchorNamespace), so a row the
// detector flags always has an anchor candidate under its own kind. The old scanner
// re-derived blocks with its own header regexes and reached two families on one tab.
//
// Never-wrong-cell is kept by the join, not by the scan: resolveUnknownFieldCell returns
// a cell only on exactly one (kind,label,value) match; zero or several fall back to the
// tab when the kind lives on exactly one tab, else null.
//
// Every exporter-included tab is scanned (the RIA rows live on FORM and 3rd Level). The
// anchors carry scope "cell" / "tab", which is what lets buildSheetDeepLink trust them
// past the REGION allowlist; that allowlist and its read-time guard are untouched for
// every unscoped anchor.

/** The ONE conversion from a grid block to the cell arrays the detector sees: padded to
 *  the block's width, escaped, joined and split exactly as tableMarkdown/splitRow do.
 *  Exported so the equivalence suite binds this path, not a re-derivation of it. */
export function blockRowsForScan(block: GridBlock): string[][] {
  const width = block.rows.reduce((m, r) => Math.max(m, r.cells.length), 0);
  return block.rows.map((r) => splitRow(renderRow(r.cells, width)));
}

export function extractUnknownFieldAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): UnknownFieldAnchor[] {
  const out: UnknownFieldAnchor[] = [];
  const { blocks } = synthesizeBlocksFromXlsx(buffer);
  for (const block of blocks) {
    if (block.kind !== "grid") continue; // every exporter-included tab; OLD tabs never reach here
    const gid = titleToGid.get(block.sheetName);
    if (typeof gid !== "number") continue;
    const scanned = scanBlockCells(blockRowsForScan(block));
    for (const row of scanned) {
      const src = block.rows[row.index];
      if (!src || src.absRow === null) continue;
      const label = clean(row.cells[0] ?? "");
      if (!label) continue;
      out.push({
        kind: anchorNamespace(row.opener),
        label: normalizeCellKey(label),
        value: normalizeCellKey(row.cells[1] ?? ""),
        anchor: { title: block.sheetName, gid, a1: XLSX.utils.encode_cell({ r: src.absRow, c: block.absCol0 }), scope: "cell" },
      });
    }
  }
  return out;
}

export function resolveUnknownFieldCell(
  anchors: UnknownFieldAnchor[],
  kind: string | undefined | null,
  label: string | undefined | null,
  value: string | undefined | null,
): SourceAnchor | null {
  if (!kind || !label) return null;
  const lk = normalizeCellKey(label);
  const vk = normalizeCellKey(value ?? "");
  const sameKind = anchors.filter((a) => a.kind === kind);
  const matches = sameKind.filter((a) => a.label === lk && a.value === vk);
  if (matches.length === 1) return matches[0]!.anchor;
  // Tab-level fallback (spec §2.4): the kind names a tab uniquely, the cell it does not.
  const tabs = new Set(sameKind.map((a) => `${a.anchor.gid}\u0000${a.anchor.title}`));
  if (tabs.size !== 1) return null;
  const { title, gid } = sameKind[0]!.anchor;
  return { title, gid, scope: "tab" };
}
```

If `lib/drive/unknownFieldAnchors.ts` and `lib/drive/exportSheetToMarkdown.ts` now import each other (they do not today; check with `rg -n "unknownFieldAnchors" lib/drive/exportSheetToMarkdown.ts`), stop and restructure; the exporter must not depend on the scanner.

- [ ] **Step 4: Run the SAME command green**

Run: `pnpm vitest run tests/drive/unknownFieldAnchors.test.ts tests/drive/synthesizeBlocksEquivalence.test.ts tests/sheet-links/buildSheetDeepLink.test.ts tests/sync/attachWarningAnchors.test.ts tests/parser/fieldNearMissBaseline.test.ts`
Expected: PASS, every case. `fieldNearMissBaseline` AC-N9 (the "Stage/Storage rows stay anchored" describe) is AC-3.

- [ ] **Step 4b: Regression, every other suite that resolves through the scanner or the link builder**

Run: `pnpm vitest run tests/drive/unknownFieldAnchors.live.test.ts tests/drive/showDayTimeAnchors.test.ts tests/parser/fieldNearMiss.test.ts tests/sheet-links/allowlistMeta.test.ts tests/components/admin/review/sectionFreshness.test.ts tests/drive/synthesizeBlocks.test.ts`
Expected: PASS. Read `tests/drive/unknownFieldAnchors.live.test.ts` line 63 before running: it resolves a live DETAILS label to a cell and stays a cell under the new scanner; if any of its assertions expects `null` for a label whose kind is on one tab, it now gets a tab anchor and the assertion is reconciled the same way as Step 1's four. `fieldNearMissBaseline` AC-N9 (line 448) is AC-3: the east-coast `Stage`/`Storage` rows still resolve. Add `tests/drive/unknownFieldAnchors.live.test.ts` to the same run: it is not env-gated (line 52, a committed-workbook DETAILS fidelity case) and must stay green.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm exec eslint lib/drive/unknownFieldAnchors.ts lib/parser/fieldNearMiss.ts && pnpm typecheck` (`DB-free`).

```bash
git add lib/parser/fieldNearMiss.ts lib/sheet-links/buildSheetDeepLink.ts tests/sheet-links/buildSheetDeepLink.test.ts tests/sync/attachWarningAnchors.test.ts lib/drive/unknownFieldAnchors.ts tests/drive/unknownFieldAnchors.test.ts tests/drive/synthesizeBlocksEquivalence.test.ts tests/parser/fieldNearMissBaseline.test.ts docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md
git commit -m "feat(sync): anchor UNKNOWN_FIELD rows through the exporter's blocks, every kind and tab

Tab-level fallback when the cell is not unique. <paste the red line from Step 2>"
```

### Task 4: a HOTEL block link for the five ambiguity codes

<!-- task: red=`pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/parseWarningDeepLinkRender.test.tsx tests/drive/unknownFieldAnchors.test.ts` red-state=authored red-target=`lib/drive/showDayTimeAnchors.ts:17` why=`CELL_ANCHORED_CODES is the actionable set, which holds no HOTEL_* code, so attachSourceCellAnchors skips a hotel warning before any arm runs and hasCellAnchoredWarning reports false for it` ac=AC-5 -->

**Files:**
- Modify: `lib/drive/showDayTimeAnchors.ts` lines 17 and 120-186
- Modify: `tests/drive/showDayTimeAnchors.test.ts` (new describe), `tests/parser/operatorActionableWarnings.test.ts:8-40` (negative assertion), `tests/parser/parseWarningDeepLinkRender.test.tsx:20-35` (identity contract → superset + exact difference), `lib/drive/showDayTimeAnchors.ts:11-16` and `lib/parser/dataGaps.ts:397-405` (doc comments)
- Modify: `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md:220`, `docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md:255` (dated amendment note)

What is red and why: `CELL_ANCHORED_CODES` aliases the actionable set (line 17), so the gate at line 125 skips hotel codes. `DB-free`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/drive/showDayTimeAnchors.test.ts` (imports already cover `attachSourceCellAnchors`, `hasCellAnchoredWarning`, `ParseWarning`; add `HOTEL_REGION_ANCHORED, CELL_ANCHORED_CODES` to the same import from `@/lib/drive/showDayTimeAnchors`):

```ts
describe("attachSourceCellAnchors: HOTEL ambiguity codes region-anchor to the hotels block (spec 2026-08-27 §3)", () => {
  const hotels = { title: "INFO", gid: 0, a1: "A40:C46" };
  const hotel = (code: string): ParseWarning => ({
    severity: "warn",
    code,
    message: "m",
    blockRef: { kind: "hotels", field: "guests", index: 0, name: "Park Hyatt Chicago" },
    rawSnippet: "Park Hyatt Chicago | ...",
  });

  it("every code in HOTEL_REGION_ANCHORED gets the hotels region, and nothing else", () => {
    const warnings = [...HOTEL_REGION_ANCHORED].map(hotel);
    expect(warnings.length).toBe(5);
    attachSourceCellAnchors(warnings, { showDay: [], crewRole: [], region: { hotels, crew: { title: "INFO", gid: 0, a1: "A2:D5" } } });
    for (const w of warnings) expect(w.sourceCell).toEqual(hotels);
  });

  it("no hotels region → link-less, never the crew region", () => {
    const w = hotel("HOTEL_GUEST_SPLIT_AMBIGUOUS");
    attachSourceCellAnchors([w], { showDay: [], crewRole: [], region: { crew: { title: "INFO", gid: 0, a1: "A2:D5" } } });
    expect(w.sourceCell ?? null).toBeNull();
  });

  it("the gid fetch gate sees a hotel warning; the actionable set does not", () => {
    expect(hasCellAnchoredWarning([hotel("HOTEL_ADDRESS_SPLIT_AMBIGUOUS")])).toBe(true);
    for (const code of HOTEL_REGION_ANCHORED) expect(CELL_ANCHORED_CODES.has(code)).toBe(true);
  });
});
```

In `tests/drive/unknownFieldAnchors.test.ts`, inside the spec §2 describe from Task 3, add the RIA hotel case (`extractSourceAnchors` from `@/lib/drive/sourceAnchors`):

```ts
  it("ria.xlsx: the HOTEL_GUEST_SPLIT_AMBIGUOUS row links to the hotels region (spec §3)", async () => {
    const buffer = readFileSync(join(process.cwd(), "fixtures/shows/exporter-xlsx/ria.xlsx")).buffer as ArrayBuffer;
    const wb = XLSX.read(buffer, { type: "array" });
    const gids = new Map(wb.SheetNames.map((n, i) => [n, i] as const));
    const parsed = parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown, "ria.md");
    await attachWarningAnchors(parsed.warnings, buffer, () => Promise.resolve(gids));
    const hotel = parsed.warnings.find((w) => w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS");
    premiseHolds("the hotel ambiguity is emitted", hotel !== undefined);
    const region = extractSourceAnchors(buffer, gids).hotels;
    premiseHolds("the workbook has a hotels region", region !== undefined);
    expect(hotel!.sourceCell).toEqual(region);
  });
```

In `tests/parser/parseWarningDeepLinkRender.test.tsx`, replace the identity case (the one whose title begins "population gate IS the render gate", lines 21-25) with:

```ts
  it("population gate = render gate + the hotel region set, exactly (spec 2026-08-27 §3)", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) expect(CELL_ANCHORED_CODES.has(code), code).toBe(true);
    const extra = [...CELL_ANCHORED_CODES].filter((c) => !OPERATOR_ACTIONABLE_ANCHORED.has(c)).sort();
    expect(extra).toEqual([...HOTEL_REGION_ANCHORED].sort());
  });
```

(import `HOTEL_REGION_ANCHORED` beside `CELL_ANCHORED_CODES`). Read the sibling case at line 27-35: if its "false otherwise" example is a `HOTEL_*` code, swap in `DATE_ORDER_SUGGESTS_DMY`.

In `tests/parser/operatorActionableWarnings.test.ts`, inside the existing membership `describe`, add:

```ts
  it("holds no HOTEL_* code: the hotel link is REGION grain through CELL_ANCHORED_CODES, never actionable membership (spec 2026-08-27 §1.1)", () => {
    expect([...OPERATOR_ACTIONABLE_ANCHORED].filter((c) => c.startsWith("HOTEL_"))).toEqual([]);
  });
```

- [ ] **Step 2: Run it, expect red**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/parseWarningDeepLinkRender.test.tsx tests/drive/unknownFieldAnchors.test.ts`
Expected: FAIL: `HOTEL_REGION_ANCHORED` not exported; the flipped identity case fails on `extra` being empty; the ria hotel case (added to the unknownFieldAnchors suite in this task, below) gets `null`. The negative membership case is green on arrival (a pin, not a red) and stays green.

- [ ] **Step 3: Implement**

`lib/drive/showDayTimeAnchors.ts:17`:

```ts
/** The five HOTEL ambiguity codes link to the HOTEL block, never a cell (spec
 *  2026-08-27-wizard-warning-row-links-copy §3). Deliberately NOT members of
 *  OPERATOR_ACTIONABLE_ANCHORED: they are spot-check ambiguities (hotel-ambiguity spec
 *  row cc), and only their LINK is widened here. */
export const HOTEL_REGION_ANCHORED: ReadonlySet<string> = new Set([
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  "HOTEL_CARDINALITY_EXCEEDED",
  "HOTEL_INLINE_GROUP_OWN_HOTEL",
  "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
]);
export const CELL_ANCHORED_CODES: ReadonlySet<string> = new Set([
  ...OPERATOR_ACTIONABLE_ANCHORED,
  ...HOTEL_REGION_ANCHORED,
]);
```

Rewrite the doc comment above `CELL_ANCHORED_CODES` (`lib/drive/showDayTimeAnchors.ts:11-16`) to: "The codes that carry a source-cell/region anchor: the render gate (OPERATOR_ACTIONABLE_ANCHORED) plus HOTEL_REGION_ANCHORED, and nothing else; tests/parser/parseWarningDeepLinkRender.test.tsx pins the difference exactly so population and render cannot drift by accident. Both sets are ReadonlySet<string>." Rewrite the last two sentences of the comment above `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:397-405`) to: "lib/drive/showDayTimeAnchors.ts builds its population gate (CELL_ANCHORED_CODES) as this set plus HOTEL_REGION_ANCHORED; the render gate stays this set alone."

In `attachSourceCellAnchors`, add an arm after the `ORPHANED_CREW_ROWS` arm and before the `KIND_TO_REGION` arm:

```ts
    } else if (HOTEL_REGION_ANCHORED.has(w.code)) {
      // Region grain only: the ambiguity describes how ONE cell was read and blockRef
      // carries a name, not a coordinate. A missed region degrades to null, never to
      // another section's range.
      cell = sources.region["hotels"] ?? null;
```

Amend the two hotel spec rows in place by appending to each cell: `**Amended 2026-08-27:** the LINK is now widened at region grain through \`HOTEL_REGION_ANCHORED\` / \`CELL_ANCHORED_CODES\` (spec 2026-08-27-wizard-warning-row-links-copy §3); membership in \`OPERATOR_ACTIONABLE_ANCHORED\` is still refused.`

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/parseWarningDeepLinkRender.test.tsx tests/drive/unknownFieldAnchors.test.ts`
Expected: PASS.

- [ ] **Step 4b: Regression**

Run: `pnpm vitest run tests/parser/waveCodesNoSourceCell.test.ts tests/parser/dataGaps.test.ts tests/parser/dataGapsClassCompleteness.test.ts tests/sync/attachWarningAnchors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/drive/showDayTimeAnchors.ts lib/parser/dataGaps.ts tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/parseWarningDeepLinkRender.test.tsx docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md
git commit -m "feat(sync): region-link the HOTEL ambiguity codes to the hotels block

<paste the red line from Step 2>"
```

### Task 5: the control sentence moves to `controlsNote`, rendered only beside the controls

<!-- task: red=`pnpm vitest run tests/messages/_metaWarningCardCopy.test.ts tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/components/step3SheetCard.test.tsx tests/components/admin/sheetWarningsPanel.test.tsx tests/components/admin/perShowActionableFollowUp.test.tsx tests/admin/showpage/crewUnderRowCards.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx` red-state=authored red-target=`lib/messages/catalog.ts:1352` why=`UNKNOWN_FIELD.helpfulContext still ends with "Report flags it to us; Ignore hides this notice.", so the registry no-control-names assertion fails, the wizard row still renders "Report", the card has no controlsNote to render, and the two correction-sentence gates still fire on a tab-level anchor` ac=AC-6 -->

**Files:**
- Modify: `lib/messages/catalog.ts:3-60` (field), line 1325-1352 (`UNKNOWN_FIELD` comment + string + new field), line 1726-1740, line 2097-2110
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` lines 3255, 3256 and 3269
- Regenerate: `lib/messages/__generated__/spec-codes.ts` (`pnpm gen:spec-codes`)
- Modify: `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` lines 135, 147 and 149
- Modify: `tests/messages/warningCardCopyRegistry.ts` lines 236, 268 and 272
- Modify: `tests/messages/_metaWarningCardCopy.test.ts:96-108` (+ new case)
- Modify: `components/admin/PerShowActionableWarnings.tsx` lines 54-67, 86-115, 147-180 (guidance composition; the `followUp` gate at line 163), `components/admin/NoteWarningCard.tsx:39` (`notePopoverParts` sentence gate, T8), `components/admin/showpage/sectionWarningExtras.tsx` (both ACTIVE-list `PerShowActionableWarnings` mounts)
- Modify: `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/admin/perShowActionableTransitions.test.tsx`, `tests/components/step3SheetCard.test.tsx`, `tests/messages/_metaCatalogCopyHygiene.test.ts:189-210` (`FIELD_POLICY` row), `tests/admin/showpage/crewUnderRowCards.test.tsx` and `tests/components/admin/showpage/publishedReviewModal.test.tsx` (mount binding, T6(e)), `tests/components/admin/sheetWarningsPanel.test.tsx` (the `notePopoverParts` table, T8) and `tests/components/admin/perShowActionableFollowUp.test.tsx` (T8)

**Interfaces:**
- Produces: `MessageCatalogEntry.controlsNote?: string | null`; `PerShowActionableWarnings` prop `showControlsNote?: boolean`; `export function withControlsNote(guidance: GuidanceResult, note: string | null): GuidanceResult` in `PerShowActionableWarnings.tsx`; `EXPECTED_CONTROLS_NOTE` in `tests/messages/warningCardCopyRegistry.ts`.

What is red and why: `lib/messages/catalog.ts:1352` still carries the control sentence in `helpfulContext`, no `controlsNote` exists, and both correction-sentence gates (`NoteWarningCard.tsx:39`, `PerShowActionableWarnings.tsx:163`) test `sourceCell` truthiness alone. `DB-free`.

- [ ] **Step 1: Write the failing tests**

`tests/messages/_metaWarningCardCopy.test.ts`: change the field tuple at line 100 to `["title", "helpfulContext", "triggerContext", "controlsNote"] as const` and add:

```ts
  it("frozen copy fixture: controlsNote matches spec 2026-08-27 §4.2 byte-for-byte, total", () => {
    const carrying = Object.entries(CATALOG)
      .filter(([, e]) => typeof e?.controlsNote === "string")
      .map(([c]) => c)
      .sort();
    expect(Object.keys(EXPECTED_CONTROLS_NOTE).sort()).toEqual(carrying);
    for (const [code, note] of Object.entries(EXPECTED_CONTROLS_NOTE)) expect(CATALOG[code]?.controlsNote, `${code}.controlsNote`).toBe(note);
  });

  it("no helpfulContext of a card code names a card control; the sentence lives in controlsNote (spec 2026-08-27 §4)", () => {
    // Scoped to the card codes: two alert-surface codes (TILE_SERVER_RENDER_FAILED,
    // TILE_PROJECTION_FETCH_FAILED) mention Report in helpfulContext and render where a
    // Report control exists; they are not card codes and not this arc's copy (plan §7).
    const offenders = [...WARNING_CARD_COPY_CODES]
      .filter((code) => typeof CATALOG[code]?.helpfulContext === "string" && /\b(Report|Ignore)\b/.test(CATALOG[code]!.helpfulContext!))
      .sort();
    expect(offenders).toEqual([]);
    // CATALOG is Record<string, Record<string, unknown>> in this file: extract with a
    // typeof narrowing on a local, never `!` on an unknown.
    const withNote: Array<[string, string]> = [];
    for (const [code, e] of Object.entries(CATALOG)) {
      const note = e?.controlsNote;
      if (typeof note === "string" && note.trim().length > 0) withNote.push([code, note]);
    }
    premiseHolds("at least the three moved rows carry a note", withNote.length >= 3);
    for (const [code, note] of withNote) {
      expect(WARNING_CARD_COPY_CODES.has(code), `${code} carries controlsNote but is not a card code`).toBe(true);
      expect(/\b(Report|Ignore)\b/.test(note), `${code}.controlsNote names a control`).toBe(true);
    }
  });
```

(`premise` is already imported at line 29; add `premiseHolds` beside it. `MESSAGE_CATALOG` is imported at line 25; the file's `CATALOG` alias and its `WARNING_CARD_COPY_CODES` import are defined between line 30 and line 50, verify the names before writing.)

`tests/messages/warningCardCopyRegistry.ts`, beside `EXPECTED_HELPFUL_CONTEXT`:

```ts
/** Spec 2026-08-27-wizard-warning-row-links-copy §4.2. Frozen literals: the render test
 *  reads THESE, never the catalog, so a suffix added to the catalog string fails here. */
export const EXPECTED_CONTROLS_NOTE: Record<string, string> = {
  UNKNOWN_FIELD: "Use Report to flag it to us, or Ignore to hide this notice.",
  PULL_SHEET_PARSE_PARTIAL: "Use Report if you'd like the format supported.",
  UNKNOWN_SECTION_HEADER: "Use Report if this section should be supported.",
};
```

`tests/admin/perShowActionableRenderControls.test.tsx`, new describe (import `EXPECTED_CONTROLS_NOTE` from `@/tests/messages/warningCardCopyRegistry`, NOT the catalog):

```tsx
describe("controlsNote renders only beside the controls (spec 2026-08-27 §4.3)", () => {
  const w: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "m",
    rawSnippet: "Backdrop | ",
    blockRef: { kind: "timestamp", name: "Backdrop" },
  };
  const NOTE = EXPECTED_CONTROLS_NOTE.UNKNOWN_FIELD!;

  function guidanceText(container: HTMLElement): string {
    // Anti-tautology: strip the controls node first, so the Report button's own label
    // cannot satisfy a "contains Report" assertion.
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-testid="dq-controls"]').forEach((n) => n.remove());
    return clone.querySelector('[data-testid="per-show-actionable-guidance"]')?.textContent ?? "";
  }

  test("active list (showControlsNote): the guidance line ends with the note", () => {
    const { container } = render(
      <PerShowActionableWarnings items={[w]} driveFileId="df" showControlsNote renderItemControls={() => <span data-testid="dq-controls">Report Ignore</span>} />,
    );
    expect(guidanceText(container).endsWith(NOTE)).toBe(true);
  });

  test("the prop is the gate, not the render-prop's return: undefined / false / '' returns change nothing", () => {
    for (const ret of [undefined, false, ""] as const) {
      const { container, unmount } = render(
        <PerShowActionableWarnings items={[w]} driveFileId="df" showControlsNote renderItemControls={() => ret} />,
      );
      expect(guidanceText(container).endsWith(NOTE)).toBe(true);
      unmount();
    }
  });

  test("ignored list (item controls, no showControlsNote): no note, so Ignore is never named beside Un-ignore", () => {
    const { container } = render(
      <PerShowActionableWarnings items={[w]} driveFileId="df" renderItemControls={() => <span data-testid="dq-controls">Report Un-ignore</span>} />,
    );
    expect(/\b(Report|Ignore)\b/.test(guidanceText(container))).toBe(false);
  });

  test("without the prop (staged card, gallery, any mount that does not promise controls), the note is absent", () => {
    const { container } = render(<PerShowActionableWarnings items={[w]} driveFileId="df" />);
    const text = guidanceText(container);
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(NOTE)).toBe(false);
    expect(/\b(Report|Ignore)\b/.test(text)).toBe(false);
  });
});
```

(`EXPECTED_CONTROLS_NOTE` is a test-side literal, so `NOTE` is defined by construction; add `expect(typeof NOTE).toBe("string")` as the first line of each test anyway.)

`tests/admin/perShowActionableTransitions.test.tsx` (spec §11), edited to what the file actually is (read lines 14-92 first): (1) the `SYNTH` record type (line 24) gains `controlsNote?: string | null`, and `SYN_B`, `SYN_C`, `SYN_D` set `controlsNote: null` so the real `UNKNOWN_FIELD` spread cannot leak the new note into today's variants; `SYN_A` has no `SYNTH` entry by design (unknown code) and needs nothing. (2) Add `SYN_E: { title: "E title", helpfulContext: "E guidance", triggerContext: null, controlsNote: "E note: use Report" }` (G2) and `SYN_F: { title: "F title", helpfulContext: null, triggerContext: null, controlsNote: "F note: use Report" }` (G3). (3) G4 needs an INSTANCE line, which `autocorrectGuidance` (`lib/messages/autocorrectGuidance.ts`, `SENTENCE`) produces only for real autocorrect codes: add `FIELD_LABEL_AUTOCORRECTED` to `SYNTH` with `controlsNote: "G note: use Report"` (so the suppression is exercised on a code that HAS a note) and give the G warning an `autocorrect` payload (`{ corrections: [{ detected: "Stge", corrected: "Stage" }] }`, shape per `Autocorrect` in `lib/parser/types.ts`; the `warn` helper at line 44 gains an optional second argument for it). (4) `VARIANTS` (line 50) gains `E: { code: "SYN_E", guidance: true, trigger: false, note: true }`, `F: { code: "SYN_F", guidance: true, trigger: false, note: true }` (F's guidance element renders the note alone, so `guidance: true`), `G: { code: "FIELD_LABEL_AUTOCORRECTED", guidance: true, trigger: false, note: false }`; `expectVariant` (line 57) additionally asserts the guidance element's text ends with the variant's note iff `note`, contains no `Report` iff `!note`, and that `container.querySelector('[data-testid="per-show-actionable-guidance"]')?.closest("[data-motion], [style*=\"transition\"]")` is null. Render every variant with `showControlsNote` (the gate is the prop; the note's presence is the entry's). (5) The `PAIRS` array (line 65) is hardcoded over A-D: replace it with a derivation over every ordered pair of `Object.keys(VARIANTS)` (`KEYS.flatMap((x) => KEYS.filter((y) => y !== x).map((y) => [x, y] as const))`), which covers the ten G pairs both directions and keeps the existing six; the loop body (lines 74-84) is unchanged apart from passing `showControlsNote`. (6) The condensed axis: one more `it.each` over the same derived pairs rendering with `condensed`, asserting through the popover body slot the file already reads for the compound cases (lines 86-92). No `waitFor` anywhere: every assertion is synchronous after `rerender`.

`tests/components/step3SheetCard.test.tsx`, next to the link tests at line 664-695:

```tsx
  test("an UNKNOWN_FIELD wizard row names no Report or Ignore control: the wizard mounts neither (spec 2026-08-27 §4)", () => {
    const FIX = parseResult({
      warnings: [{ severity: "warn" as const, code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Backdrop | ", blockRef: { kind: "timestamp", name: "Backdrop" } }],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q));
    const row = region.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    expect(row.textContent).toMatch(/Rename this row/);
    expect(row.textContent).not.toMatch(/\b(Report|Ignore)\b/);
  });

  test("a non-family UNKNOWN_FIELD anchor renders the row link to that tab and cell; a tab-level anchor renders the tab alone", () => {
    const FIX = parseResult({
      warnings: [
        { severity: "warn" as const, code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Speaker | QSC KLA", blockRef: { kind: "console", name: "Speaker" }, sourceCell: { title: "GEAR", gid: 7, a1: "A12" } },
        { severity: "warn" as const, code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Backdrop | ", blockRef: { kind: "timestamp", name: "Backdrop" }, sourceCell: { title: "INFO", gid: 0 } },
      ],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q));
    expect(region.getByTestId(`wizard-step3-card-${DFID}-warning-0-open`).getAttribute("href")).toMatch(/#gid=7&range=A12$/);
    expect(region.getByTestId(`wizard-step3-card-${DFID}-warning-1-open`).getAttribute("href")).toMatch(/#gid=0$/);
  });
```

(`parseResult(overrides: Partial<ParseResult>)` at line 134; `stagedRow(pr)` at line 154.) The second test is spec pin P1: green on arrival because `buildSheetDeepLink` already handles both shapes; it is cover, not this task's red, and the commit says so.

- [ ] **Step 2: Run it, expect red**

Run: `pnpm vitest run tests/messages/_metaWarningCardCopy.test.ts tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/components/step3SheetCard.test.tsx tests/components/admin/sheetWarningsPanel.test.tsx tests/components/admin/perShowActionableFollowUp.test.tsx tests/admin/showpage/crewUnderRowCards.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx`
Expected: FAIL: the registry assertion lists `PULL_SHEET_PARSE_PARTIAL`, `UNKNOWN_FIELD`, `UNKNOWN_SECTION_HEADER`; the wizard row test matches `Report`; the card tests fail on `NOTE` being undefined.

- [ ] **Step 3: Implement, all five copy sites in this one commit**

(a) `lib/messages/catalog.ts` `MessageCatalogEntry` (after `triggerContext`'s doc comment block, keep alphabetical-ish placement beside the other catalog-internal fields):

```ts
  /**
   * One sentence naming the mutate controls on the published per-show card
   * (Report / Ignore). Catalog-internal, not §12.4 prose. Rendered ONLY where
   * `DataQualityWarningControls` is mounted; every other surface that shows
   * `helpfulContext` (the wizard step-3 row, note cards, help popovers) omits it
   * because it has no such controls. Spec 2026-08-27-wizard-warning-row-links-copy §4.
   */
  controlsNote?: string | null;
```

(b) The three entries:

```ts
  // UNKNOWN_FIELD (:1351)
    helpfulContext:
      "Rename this row in your sheet so it matches the row we show. It isn't showing on the crew page because the label doesn't match one we read.",
    controlsNote: "Use Report to flag it to us, or Ignore to hide this notice.",
  // PULL_SHEET_PARSE_PARTIAL
    helpfulContext:
      "Some pull-sheet rows have a QTY we couldn't read (a word, or a range like '1-2'), so those rows show their original text.",
    controlsNote: "Use Report if you'd like the format supported.",
  // UNKNOWN_SECTION_HEADER
    helpfulContext:
      "A header in your sheet isn't a section we know, so the rows under it aren't shown on the crew page. Rename it to a standard section.",
    controlsNote: "Use Report if this section should be supported.",
```

Rewrite the `UNKNOWN_FIELD` comment paragraph that begins "Impeccable gate dispositions, unchanged: `helpfulContext` documents BOTH card controls (F4)" to: "Impeccable gate dispositions: the card's controls are documented by `controlsNote`, rendered only where the controls mount (spec 2026-08-27-wizard-warning-row-links-copy §4), so F4 holds on the published card and no surface without the buttons names them; every action string leads with the imperative (F5)." Leave the rest of the block as it is.

(c) `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` lines 3255, 3256 and 3269: replace the quoted string on each line with the new `helpfulContext` value, byte for byte. Then `pnpm gen:spec-codes` and stage `lib/messages/__generated__/spec-codes.ts`.

(d) `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` lines 135, 147 and 149: replace the third cell (`helpfulContext`) of rows 15, 27, 29 with the new values, byte for byte. Add one sentence under the §4.2 table: "Amended 2026-08-27: rows 15, 27 and 29 lost their control sentence, which now lives in the catalog-internal `controlsNote` (spec 2026-08-27-wizard-warning-row-links-copy §4)."

(e) `tests/messages/warningCardCopyRegistry.ts` lines 236, 268 and 272: the same three values.

(f) `components/admin/PerShowActionableWarnings.tsx`. Add the prop to the component's props type (line 97-114): `/** Spec 2026-08-27 §4.3: append the catalog controlsNote to catalog guidance. Passed by the per-show ACTIVE list only; the ignored list's controls read Un-ignore. */ showControlsNote?: boolean;` and destructure it (line 90-94). Below `resolveGuidance` (line 67):

```ts
/** Append the catalog's controls note to CATALOG guidance, and only then: an instance
 *  (autocorrect) line is left alone, and a null note leaves the guidance untouched.
 *  Pure + exported so the four-row guard table in spec §4.3 is unit-testable. */
export function withControlsNote(guidance: GuidanceResult, note: string | null): GuidanceResult {
  if (guidance.kind === "instance" || note === null) return guidance;
  const markup = [guidance.markup, note].filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(" ");
  return { kind: "catalog", markup: markup.length > 0 ? markup : null };
}
```

Leave `const controls = ...` at line 355 where it is (it is not part of the gate). Replace line 147:

```ts
        // Gate on the explicit prop ONLY (spec §4.3 as amended in plan review R1): a
        // renderItemControls return of undefined / false / "" renders NOTHING in React, so
        // "returned a non-null node" is not evidence that a control is on the card. The
        // prop is the mount's promise, and only the two active per-show mounts make it.
        const controlsNote =
          showControlsNote === true && typeof entry?.controlsNote === "string" && entry.controlsNote.trim().length > 0
            ? entry.controlsNote.trim()
            : null;
        const guidanceResult = withControlsNote(resolveGuidance(entry, w), controlsNote);
```

Everything downstream (`movedGuidance`, the two guidance spans) reads `guidanceResult` and needs no edit.

(j) T8, the correction sentence follows the cell (spec §2.4). `components/admin/NoteWarningCard.tsx` `notePopoverParts` (line 39): `const sentence = w.sourceCell ? correctionLoopCopy("resync") : null;` becomes `const sentence = typeof w.sourceCell?.a1 === "string" && w.sourceCell.a1.trim().length > 0 ? correctionLoopCopy("resync") : null;`. `components/admin/PerShowActionableWarnings.tsx` `followUp` (line 163): `w.sourceCell && typeof followUpCopy === "string" ...` becomes `typeof w.sourceCell?.a1 === "string" && w.sourceCell.a1.trim().length > 0 && typeof followUpCopy === "string" ...`. Tests: the `notePopoverParts` table in `tests/components/admin/sheetWarningsPanel.test.tsx` (found by `rg -l notePopoverParts tests`) gains rows: `{ title: "INFO", gid: 0, scope: "tab" }` → `sentence: null`; `{ title: "INFO", gid: 0, a1: "A2", scope: "cell" }` and `{ title: "INFO", gid: 0, a1: "A2:D5" }` → the sentence. `tests/components/admin/perShowActionableFollowUp.test.tsx` gains the same three shapes for `followUp` (absent / present / present).

(g) `components/admin/showpage/sectionWarningExtras.tsx`: BOTH active mounts get `showControlsNote`: the crew under-row mount in `renderCrewUnderRowCards` (`renderItemControls` passes `mode="active"` at line 61) and the grouped active mount in `buildSectionWarningExtras` (`mode="active"` at line 228). The ignored mount (`mode="ignored"` at line 294) is NOT changed.

(h) `tests/messages/_metaCatalogCopyHygiene.test.ts` `FIELD_POLICY` (line 189): add `controlsNote: "rendered-prose",` beside `triggerContext`; without it the file no longer typechecks (the record is keyed on `keyof MessageCatalogEntry`).

(i) Mount binding (spec T6(e)). In `tests/admin/showpage/crewUnderRowCards.test.tsx`, following that file's existing model shape, add a case whose `warningsByCrewKey` holds one `UNKNOWN_FIELD` and assert the rendered card's guidance (strip `dq-controls` first) ends with `EXPECTED_CONTROLS_NOTE.UNKNOWN_FIELD`. In `tests/components/admin/showpage/publishedReviewModal.test.tsx` (or through `buildPublishedSurfaceProps` in `tests/helpers/publishedSurfaceProps.tsx`, whichever already mounts `buildSectionWarningExtras` with an ignored partition), add a case with one active and one ignored `UNKNOWN_FIELD` in the same section: the active card's guidance ends with the note, the ignored card's (inside `section-ignored-list-<id>`) does not contain it and matches neither `Report` nor `Ignore`. Red: no mount passes the prop.

- [ ] **Step 4: Run the SAME command green**

Run: `pnpm vitest run tests/messages/_metaWarningCardCopy.test.ts tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/components/step3SheetCard.test.tsx tests/components/admin/sheetWarningsPanel.test.tsx tests/components/admin/perShowActionableFollowUp.test.tsx tests/admin/showpage/crewUnderRowCards.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx`
Expected: PASS.

- [ ] **Step 4b: Regression, the parity gates**

Run: `pnpm typecheck && pnpm vitest run tests/messages/_metaCatalogCopyHygiene.test.ts tests/cross-cutting/codes.test.ts tests/admin/perShowActionableKeyStability.test.tsx tests/components/admin/warningCardFollowUp.test.tsx`
Expected: clean and PASS. `codes.test.ts` is x1 (catalog ↔ §12.4 appendix via the regenerated `spec-codes.ts`); `typecheck` is what makes the `FIELD_POLICY` row load-bearing (vitest does not typecheck).

- [ ] **Step 5: Pre-dispatch mutants for the string-presence guards (record results in the commit body)**

(a) empty `controlsNote` on `UNKNOWN_FIELD` → the frozen-fixture case and the active-list render case fail; (b) `controlsNote + " extra"` in the CATALOG only → the frozen-fixture case fails byte-for-byte AND the render case fails `endsWith` (the expectation is the registry literal); (c) note present but inside the Report button label only (render `controls` = `<span data-testid="dq-controls">{NOTE}</span>`, `controlsNote` removed from the catalog) → the strip-first assertion fails, proving the clone-and-remove is load-bearing; (d) `showControlsNote` toggled → the two cases swap outcomes. Each mutant is applied BY LINE (never by string replace: prettier wraps, and a wrapped target makes the replace a silent no-op), its application PROVED before the run (`git diff --stat` non-empty on the target file, and the target line's hash differs from HEAD), the suite run, the failing line noted, the mutant reverted. A RED result is self-proving (an unapplied mutant cannot fail a passing test); only a GREEN result needs proof, and a GREEN has THREE possible causes, only the last of which is a finding: (1) never applied (the hash check catches it); (2) applied but INERT within the observation window, its effect landing after the assertion read (the hash does NOT catch it; here every assertion is synchronous on the render, so make the mutant's effect land in the same render: a mutated string, a flipped condition, never a deferred write; and for any GREEN ask "could this mutant's effect have happened after I looked?" and, if in doubt, observe the effect independently, e.g. log the composed guidance string from the mutated site during the run); (3) applied, in-window, but on a PATH THE TEST NEVER TAKES (neither hash nor window catches it: prove the mutated line executed in the run, e.g. a temporary `throw` at the mutated site must turn the run red before the real mutant is trusted; here the two branches are `guidanceResult.kind === "instance"` versus catalog markup, and a note mutant must be applied on the branch the test actually renders); (4) applied, in-window, on the taken path, and the assertion genuinely fails to discriminate: the only real finding. Never hold the file list in a shell variable across tool calls; re-derive it per call.

- [ ] **Step 6: Commit**

```bash
git add lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md tests/messages/warningCardCopyRegistry.ts tests/messages/_metaWarningCardCopy.test.ts tests/messages/_metaCatalogCopyHygiene.test.ts components/admin/PerShowActionableWarnings.tsx components/admin/NoteWarningCard.tsx components/admin/showpage/sectionWarningExtras.tsx tests/components/admin/sheetWarningsPanel.test.tsx tests/components/admin/perShowActionableFollowUp.test.tsx tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableTransitions.test.tsx tests/admin/showpage/crewUnderRowCards.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx tests/components/step3SheetCard.test.tsx
git commit -m "feat(admin): move the Report/Ignore sentence to controlsNote, rendered only beside the controls

Three codes, five lockstep sites (catalog, §12.4 appendix + regen, copy-restore §4.2,
copy registry, meta-test). <paste the red line from Step 2; the four mutant results>"
```

### Task 6: file `BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS`

<!-- task: red=`rg -q "^## BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS" BACKLOG.md` red-state=live red-target=`tests/docs/_metaLedgerMintBar.test.ts:86` why=`the row does not exist in BACKLOG.md (a root file the marker grammar cannot cite, hence the walker that will read the row is cited instead), so the heading grep exits 1; it exits 0 once the row is inserted, and the three ledger walkers (sizing, mint bar, in-progress) then hold its field shape` ac=AC-7 -->

**Files:**
- Modify: `BACKLOG.md:9-11` (insert the new row as the first `##` row under the header)

What is red and why: `rg -q "^## BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS" BACKLOG.md` exits 1 (spec T7). The pattern is anchored to the HEADING position (`^## `) on purpose: an id in prose is a reference, an id in a heading is a declaration, and an unanchored grep cannot tell them apart (the fleet's third instance of that class today was an archive script that read a citation as an already-archived row). After insertion the same command exits 0 and the three ledger walkers hold the field shape (`Effort` by sizing, `Filed`/`Facing` by mint bar, flight fields by in-progress). `DB-free`.

- [ ] **Step 1: Observe red**

Run: `rg -q "^## BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS" BACKLOG.md; echo "exit=$?"` Expected: `exit=1`.

- [ ] **Step 2: Insert the row directly under the `---` that follows the "Last reconciled" paragraph**

```markdown
## BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS - the near-miss detector flags rows in blocks that are not field lists, and the card's advice is wrong there

**Status:** OPEN · **Filed:** 2026-08-27 (`fix/wizard-warning-row-links-copy`, owner-directed from the RIA wizard screenshot) · **Facing:** product · **Severity:** LOW-MEDIUM (a wrong instruction on a shipped admin card; nothing is corrupted, the row is simply not one we show) · **Class:** detector candidacy scope · **Effort:** M · **Class-sweep exception:** (a): which block shapes are legitimate near-miss homes is a product decision the link arc could not settle. · **Reachability:** PROBED: the run below, `parseSheet` on `fixtures/shows/raw/2025-06-ria-investment-forum.md` at `66c9857f5`.

`detectFieldNearMisses` (`lib/parser/fieldNearMiss.ts`) treats every pipe-run block as a candidate home for a near-miss row. Two block shapes in the corpus are not field lists at all: a Google-Form response dump on `INFO` whose opener is `Timestamp` (fixture line 314), and the `GEAR` inventory matrix whose opener is `Console` (line 921). The detector reports `Room Diagram` in the form dump as a near-miss of the `DETAILS/ROOM DIAGRAM` section header and `Speaker` in the inventory matrix as a near-miss of `Virtual Speaker`:

```
UNKNOWN_FIELD  blockRef {kind:"timestamp", name:"Room Diagram"}  candidate "DETAILS/ROOM DIAGRAM"
UNKNOWN_FIELD  blockRef {kind:"timestamp", name:"Backdrop"}      candidate "Backdrop / Scenic"
UNKNOWN_FIELD  blockRef {kind:"console",   name:"Speaker"}       candidate "Virtual Speaker"
```

The card then tells Doug to "rename this row in your sheet so it matches the row we show", which is wrong in both blocks: neither row was ever going to show. The link arc gave these rows a working "Open in Sheet" (they were link-less before), which makes the wrong advice easier to follow, not less wrong.

**Two candidate repairs, neither chosen here.** (1) Exclude blocks whose opener is not a known section family or a field-list opener (a `Timestamp` opener is a form dump; a row whose value cells number more than two is a matrix). (2) Require the candidate vocabulary entry's own block family to match the row's block (a `DETAILS` vocabulary entry should not fire in a `timestamp` block). Either moves the 65-row measured baseline (`tests/parser/fieldNearMissBaseline.test.ts`), so the repair is a calibrated detector arc with its own hit/miss table, not a patch on this one.

**Done condition (outside the process):** on the RIA sheet, the wizard's Sheet warnings panel lists no near-miss row for `Room Diagram`, `Backdrop`, or `Speaker`, and the baseline suite's corpus multiset is re-measured and re-ratified.
```

- [ ] **Step 3: Same command green, then the walkers**

Run: `rg -q "^## BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS" BACKLOG.md; echo "exit=$?"` Expected: `exit=0`.
Run: `pnpm vitest run tests/docs/_metaLedgerSizing.test.ts tests/docs/_metaLedgerMintBar.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` (`DB-free`).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add BACKLOG.md
git commit -m "docs(backlog): file BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS (product, probed)"
```

### Task 7: closeout — impeccable pair, full suites, diff review, PR, readiness line

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=live red-target=`docs/superpowers/plans/2026-08-27-wizard-warning-row-links-copy.md:13` why=`this plan names both impeccable gate halves and its stem-named closeout sibling does not exist yet, so the guard reds on this plan until Task 7 writes the sibling with the marker line` ac=AC-8,AC-9 -->

**Files:**
- Create: new file 2026-08-27-wizard-warning-row-links-copy-closeout.md under `docs/superpowers/plans/`
- Create: the base-sha-named .jsonl under `docs/review-rounds/fix/wizard-warning-row-links-copy/` (written by the wrapper) and `.md` only if any stage reaches four rounds

- [ ] **Step 1: Observe red**

Run: `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` (`DB-free`). Expected: FAIL naming this plan (no marker line).

- [ ] **Step 2: Run the impeccable pair on the diff**

`/impeccable critique` then `/impeccable audit` on `components/admin/PerShowActionableWarnings.tsx` (and the wizard row render, whose copy changed): canonical v3 setup (the context.mjs load of PRODUCT.md + DESIGN.md, then register read). P0/P1: fix in-round or `DEFERRED.md` entry. Write the closeout sibling with `## 12. Invariant 8 — the impeccable dual gate`, the marker line `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=recorded`, and the findings table with dispositions (copy the shape of `docs/superpowers/plans/2026-08-27-mi11-removal-fallback-live-row-closeout.md`).

- [ ] **Step 3: Ask bl-orch for the DB slot, then the full suites**

Send bl-orch (`w15:p2`) one line: "fix/wizard-warning-row-links-copy requests the Postgres slot for a full `pnpm heavy pnpm test` + `pnpm heavy pnpm test:e2e` run; DB-free suites are already green." Do NOT run either until named holder. Export the loopback `TEST_DATABASE_URL` before any DB run (the validation project emails Eric on Test Show rows). When named: `pnpm heavy pnpm test` and `pnpm heavy pnpm test:e2e`; also `pnpm heavy:mutation pnpm mutation:guards` and read the `fieldNearMiss` row: score at or above its `scoreFloor` (0.95) with an unchanged unaccepted-survivor set (the only edit there is `export`). Release the slot with one line when done.

- [ ] **Step 4: Live check (AC-1, second half)**

With the slot held, run the onboarding scan for the live `II - RIA Investment Forum - Central 2025` sheet against the local stack (the wizard's re-scan path), and confirm through `pnpm observe` or the wizard UI in a Playwright session that the three `UNKNOWN_FIELD` rows and the hotel row carry `Open in Sheet` links whose `href` names the expected tab and cell. Record the four hrefs in the closeout.

- [ ] **Step 5: Pre-push set, push, PR**

Read `.github/workflows/quality.yml`; run every command its `quality` job runs. Push. `gh pr create` with the PR body ending in the required footer; body states: docs-only branch: no; `pnpm preflight` ran after `pnpm worktree:link-env`; no ledger row closed, one filed. **Do not enable auto-merge.**

- [ ] **Step 6: Whole-diff Codex review, cap four rounds**

`node scripts/codex-guard.mjs review --brief <file> --cwd <worktree> --out <fresh dir> --stage diff --round <n>` (backgrounded). The round-1 brief carries: REVIEWER ONLY; fresh eyes; `EXPLICITLY DO NOT RELITIGATE` = spec §1.1 + plan §1.1; `GUARD SURFACE: none in this diff, CANNOT-EXPRESS: resolvers, decided by tests/drive/synthesizeBlocksEquivalence.test.ts (T1) and tests/drive/unknownFieldAnchors.test.ts (T3, T4)`; CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE as in the spec brief; the `FINDINGS:` and `VERDICT:` line contract. Repair findings by class sweep; `--round` restarts at 1 if the merge base moves. At round four without APPROVE: write the round-economy filing and report to bl-orch; no round five without its word.

- [ ] **Step 7: CI, detached poller, readiness line**

Poll CI via GraphQL from a `nohup` loop writing to a file under the worktree's `.claude/`, never a harness task child. On green: verify `git merge-base origin/main HEAD` equals `origin/main` (otherwise merge `origin/main`, rerun the pre-push set, push, and the review round counter restarts). Then send bl-orch the readiness line: "READY: fix/wizard-warning-row-links-copy PR #<n> at <sha>, CI green, diff review APPROVE at round <k>, merge-base == origin/main. Not merging." Update the marker `stage` to `ready`. **Stop there. Do not merge.**

<!-- tasks: end -->

## 5. Acceptance criteria coverage

| AC | owner |
| --- | --- |
| AC-1 | Task 3 (constructed workbook), Task 7 step 4 (live sheet) |
| AC-2 | Task 1, Task 2 (structure), Task 3 (equivalence suite) |
| AC-3 | Task 3 step 4 |
| AC-4 | Task 3 |
| AC-5 | Task 4 |
| AC-6 | Task 5 |
| AC-7 | Task 6 |
| AC-8 | Task 7 step 2 |
| AC-9 | Task 7 steps 5 and 7 |

## 6. Registry reconciliation, run at plan time

`OPERATOR_ACTIONABLE_ANCHORED`: 24 members before, 24 after (Task 4 adds none; its test asserts the count and the absence of `HOTEL_*`). `CELL_ANCHORED_CODES`: 24 before, 29 after (the five hotel codes). `CELL_ANCHORED_CODES` is no longer the same object as the render gate: `tests/parser/parseWarningDeepLinkRender.test.tsx` flips from identity to superset-plus-exact-difference (Task 4). `WARNING_CARD_COPY_CODES`: unchanged; the three codes carrying `controlsNote` are already members (`tests/messages/warningCardCopyRegistry.ts:35` `UNKNOWN_FIELD`; rows for `PULL_SHEET_PARSE_PARTIAL` and `UNKNOWN_SECTION_HEADER` at lines 88 and 110). `tests/mutation/source/registry.ts`: no row added or edited.

## 7. Sweeps authored and run at plan time

Run 2026-08-27 on `origin/main` at `66c9857f5`; outputs pasted, every hit dispositioned.

- `rg -n "firstNonBlank|nextNonBlankAfter|DETAILS_NON_TERMINATOR_FIELDS" lib tests --glob '*.ts'` → `lib/drive/unknownFieldAnchors.ts` lines 105, 114, 122, 161, 170, 182, 185 (all deleted by Task 3); `lib/drive/exportSheetToMarkdown.ts` lines 210, 216, 223, 225 (`firstNonBlankCol`, a different identifier matched by prefix; untouched); `lib/drive/crewRoleAnchors.ts` lines 49, 79, 105 (`firstNonBlankText`, prefix match; untouched). No other importer of the deleted helpers.
- `rg -n "extractUnknownFieldAnchors" lib tests --glob '*.ts'` → `lib/drive/unknownFieldAnchors.ts:140` (the definition, rewritten); `lib/sync/attachWarningAnchors.ts` lines 7, 50 (caller, signature kept); `tests/parser/fieldNearMissBaseline.test.ts` lines 27, 436, 445 (AC-N9 helper, unchanged and green) and 528 (the `withHeader` pin Task 3 flips); `tests/drive/unknownFieldAnchors.live.test.ts` lines 4, 55, 69 (Task 3 step 4b); `tests/drive/unknownFieldAnchors.test.ts` lines 4, 24, 36, 48, 60, 72, 82, 94, 104, 107, 117, 128, 177, 207, 232 (the suite Task 3 edits; the four reconciled assertions are listed in Task 3 step 1).
- `helpfulContext` values mentioning a control, by a script that reads each catalog entry's `helpfulContext` string and tests `/(Report|Ignore)/` on it (a bare `rg` over the file also hits `followUp`, `dougFacing`, comments and other fields, 16 extra lines, none of them `helpfulContext`) → exactly five codes: `UNKNOWN_FIELD` (entry at line 1321), `PULL_SHEET_PARSE_PARTIAL` (1726), `UNKNOWN_SECTION_HEADER` (2097), `TILE_SERVER_RENDER_FAILED` (2825), `TILE_PROJECTION_FETCH_FAILED` (2844). The first three are Task 5's rows; the last two are alert-surface codes outside `WARNING_CARD_COPY_CODES`, rendered where a Report control exists, and are not this arc's copy, which is why Task 5's assertion is scoped to the registry.
- `rg -n "synthesizeMarkdownFromXlsx\(" lib app scripts tests --glob '*.ts' --glob '*.tsx' --glob '*.mjs'` → production callers `lib/drive/fetch.ts` 491, 494, 622, 625; `lib/sync/runOnboardingScan.ts` 1354; `lib/sync/runScheduledCronSync.ts` 3360, 3386; `app/api/admin/onboarding/pull-sheet-override/route.ts` 60; `app/api/admin/show/pull-sheet-override/route.ts` 49; plus 12 test files. Every caller keeps the same signature and return shape; none needs an edit.
- Exact-object anchor assertions an UNKNOWN_FIELD anchor can reach: listed with dispositions in Task 3 step 1.
- `docs/agents/writing-plans.md` enrolled-plan counts (`tests/specLint/acUnclaimedCorpus.test.ts` AC-11): this plan is enrolled and keeps its criteria in the spec, so the prose moves from "53 of the 113" to "54 of the 114", and the walk re-measured with this plan on disk (a scratch test over `enrolledPlans()` + `acAnalysis`, deleted after) gives `enrolled=114 noCertain=54 declined=1204 plans=103` (this plan contributes 15 declined lines: the `AC-N9` mentions and the §5 coverage table rows); both prose literals set to the measured values, walker untouched, `acUnclaimedCorpus` 7/7 green.

## 8. Handoff

Implementer: a fresh Opus pane under Claude Code, autonomous per AGENTS.md, with the standing fleet rules in the Global constraints block. bl-orch merges.
