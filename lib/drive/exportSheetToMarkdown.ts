import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { isMidBlockSectionStart } from "@/lib/parser/knownSections";
import { stripZeroWidth } from "@/lib/parser/zeroWidth";

type CellGrid = string[][];

/**
 * A pull-sheet case region discovered on an ARCHIVED ("OLD …") tab. Archived tabs are
 * dropped from the synthesized markdown by default (DEF-2 anti-contamination), but their
 * pull-sheet regions are surfaced here so the sync layer can offer admins an opt-in
 * re-inclusion + change-detection flow (§5.1, D5/D6, I1/I2).
 */
export type ArchivedPullSheetTab = {
  tabName: string;
  /** One preview per emitted case region — the show-identity line, ≤120 chars. */
  headerPreviews: string[];
  /** SHA-256 hex over all emitted region markdown (blank-line-normalized). */
  fingerprint: string;
  /** True only when this tab was opted-in via `opts.includePullSheetFromTab`. */
  included: boolean;
  /** Exporter always emits false; the sync layer sets true on auto-clear (§5.2). */
  contentChangedSinceAccept: boolean;
};

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t === "z") return "";
  const value = cell.w ?? cell.v;
  if (value === null || value === undefined) return "";
  return String(value);
}

function isBlank(value: string): boolean {
  return !/\S/.test(value);
}

function stripEdgeWhitespace(value: string): string {
  return value.replace(/^\s+|\s+$/g, "");
}

export function escapeCell(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\|/g, "\\|")
    .replace(/(\\#[A-Z0-9/]+)!/g, "$1\\!");
  return normalizeNewlines(escaped);
}

export function normalizeNewlines(value: string): string {
  if (!/[\r\n]/.test(value)) return value;
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (shouldPreserveNewlines(normalized)) return normalized.replace(/\n/g, "&#10;");
  return normalized
    .split("\n")
    .map(stripEdgeWhitespace)
    .filter((line) => line.length > 0)
    .join(" ");
}

function shouldPreserveNewlines(value: string): boolean {
  if (value.startsWith("PULL SHEET/")) return true;
  if (/\*GETS RESET/.test(value)) return true;
  const lines = value.split("\n").map(stripEdgeWhitespace);
  // Fused room/section HEADER cells (GENERAL SESSION / BREAKOUT / ADDITIONAL ROOM /
  // LUNCH ROOM) must arrive SPACE-JOINED so rooms.ts splitRoomHeader can read
  // name/dims/floor. A SHORT (2-line) header — a room named but with dims + floor not
  // yet recorded — would otherwise hit the <3-line default-preserve below and be emitted
  // with `&#10;`; rooms.ts's v4 GS guard (`!col0.includes("&#10;")`) then SKIPS it,
  // silently dropping the entire General Session room (exporter-gap audit, HIGH). The
  // canonical 3-4 line headers already flatten via the `>= 3` rule, so this only rescues
  // the short-header case. Breakouts have a `&#10;`-tolerant boBlockRe fallback; GS does
  // not, so GS is the room actually lost — but flatten all fused headers for consistency.
  // Case-SENSITIVE (uppercase) — matching rooms.ts boBlockRe — so a mixed-case AGENDA
  // title like "Breakout Session 2␊<title>" is NOT treated as a room header (it must keep
  // its `&#10;` for the agenda grid).
  if (/^(?:GENERAL SESSION|BREAKOUT|ADDITIONAL ROOM|LUNCH ROOM)\b/.test(lines[0] ?? "")) {
    return false;
  }
  if (lines.some((line) => /^\(\d+\)\s+/.test(line))) return false;
  if (lines.length >= 3) return false;
  if (
    lines[1] &&
    /^[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+(?:\d{5}|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)/.test(lines[1])
  )
    return false;
  if (lines[1]?.startsWith("(")) return false;
  if (lines[1]?.startsWith("<")) return false;
  if (lines.slice(1).some((line) => /^[A-Z][A-Za-z ]+:\s/.test(line))) return false;
  return true;
}

function expandMerges(grid: CellGrid, merges: readonly XLSX.Range[] = []): void {
  for (const merge of merges) {
    const source = grid[merge.s.r]?.[merge.s.c] ?? "";
    if (isBlank(source)) continue;
    grid[merge.s.r] ??= [];
    const targetRow = grid[merge.s.r];
    for (let col = merge.s.c; col <= merge.e.c; col += 1) {
      if (targetRow && isBlank(targetRow[col] ?? "")) {
        targetRow[col] = source;
      }
    }
  }
}

/**
 * A grid row that remembers where it came from. `absRow` is the row's absolute 0-based
 * sheet row; `null` marks a row this pipeline SYNTHESIZED (the pull-sheet title row),
 * which has no cell to link to. Spec 2026-08-27-wizard-warning-row-links-copy §2.2.
 */
export type GridBlockRow = { absRow: number | null; cells: string[] };
type TrackedGrid = GridBlockRow[];
type TrackedBlock = { absCol0: number; rows: GridBlockRow[] };

/** One block of the exporter's own segmentation, with the coordinates the markdown loses. */
/** `sheetHidden` is the tab's OOXML visibility (`<sheet state="hidden"|"veryHidden">`), which
 *  Google's xlsx export carries for a tab hidden in the Sheets UI and SheetJS surfaces as
 *  `Workbook.Sheets[i].Hidden` (0 visible, 1 hidden, 2 very hidden). Read from the bytes both
 *  ingestion paths already hold, so no extra Sheets API round-trip. A workbook with no
 *  visibility metadata reads every tab as visible. */
export type GridBlock = {
  kind: "grid";
  sheetName: string;
  sheetHidden: boolean;
  absCol0: number;
  rows: GridBlockRow[];
};
/** An included OLD-tab pull-sheet region: collected from rendered markdown, so it has no grid. */
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
  return { grid: cells.map((c, i) => ({ absRow: range.s.r + i, cells: c })), firstCol: range.s.c };
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
    // Header-aware split (spec 2026-07-27-export-blank-row-segmentation §2.2): a
    // mid-block row whose first non-blank cell is an uppercase known section header
    // starts a new block, so a stray value in a spacer row can no longer fuse two
    // sections (audit #10). The corpus round-trip fixtures pin zero live hits.
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

  return blocks
    .map((block) => trimBlock(block, firstCol))
    .filter((block): block is TrackedBlock => block !== null);
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
  // The title row is SYNTHESIZED from the rows above the data, so it is not any one
  // sheet row: absRow null, and the anchor scanner never links to it.
  return [
    { absRow: null, cells: Array.from({ length: width }, () => titleParts.join("/")) },
    ...grid.slice(firstDataRow),
  ];
}

function normalizeBlock(block: TrackedBlock): TrackedBlock {
  // NOTE: a bare "DETAILS" block was previously collapsed to label-only
  // (`block.map((row) => [row[0]])`) on the premise that v2 DETAILS sections
  // carry no values. The 2026-06-18 grounding audit disproved that premise:
  // the live source sheets (incl. originals outside the test folder, e.g.
  // Asset-Mgmt INFO!B53-72) populate col B (Stage Size, Opening Reel, Polling,
  // Power, ...). The "label-only" shape was an artifact of the old Drive-MCP
  // markdown converter, not the source. The value column is now preserved so
  // parseEventDetails populates event_details + openingReel.
  // See DEFERRED.md AUDIT-2026-06-18-PARSE-FIDELITY-DEF-1.
  //
  // A v2 GS block's first row is the fused header
  // `GENERAL SESSION␊<NAME>␊<DIMS>␊<FLOOR>` (INFO cell), followed by a
  // `GS Setup` value row. This row was previously DROPPED (`block.slice(1)`) as
  // a pre-parser workaround — at the time the parser could not read the fused
  // header, so the header was discarded and the room name recovered from the
  // GEAR/DIAGRAMS representation, which silently LOST the INFO dims + floor (and,
  // for ria/redefining, the room NAME → generic "General Session"). Since #1a the
  // parser's `parseGsRoom` + `splitRoomHeader` read that fused header directly,
  // so dropping it is now pure data loss (3 corpus shows: consultants GRAND
  // BALLROOM A/B, redefining LAKEVIEW BALLROOM, ria SALON ABCD). Preserve it.
  return block;
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

  // Columns are sliced, rows never are, so a row's absRow survives the trim and the
  // block records where its first column sits on the sheet.
  return {
    absCol0: firstCol + firstNonBlankCol,
    rows: block.map((row) => ({
      absRow: row.absRow,
      cells: row.cells.slice(firstNonBlankCol, lastNonBlankCol + 1),
    })),
  };
}

/** One table row exactly as `tableMarkdown` emits it: padded to `width`, each cell escaped. */
export function renderRow(cells: readonly string[], width: number): string {
  const padded = Array.from({ length: width }, (_, index) => escapeCell(cells[index] ?? ""));
  return `| ${padded.join(" | ")} |`;
}

function tableMarkdown(block: readonly (readonly string[])[]): string {
  const width = block.reduce((max, row) => Math.max(max, row.length), 0);
  const delimiter = Array.from({ length: width }, () => ":---:");

  return [
    renderRow(block[0] ?? [], width),
    `| ${delimiter.join(" | ")} |`,
    ...block.slice(1).map((row) => renderRow(row, width)),
  ].join("\n");
}

/** One block's markdown, exactly as `synthesizeMarkdownFromXlsx` emits it inside the joined
 *  document. The anchor replay renders through this same function (spec 2026-08-29 §2.2), so
 *  the text a scanner sees per block is byte for byte the text it sees in the document. */
export function blockMarkdown(block: SynthesizedBlock): string {
  return block.kind === "grid" ? tableMarkdown(block.rows.map((r) => r.cells)) : block.markdown;
}

/** Split a markdown table row into trimmed cells (mirror of parser `splitRow`). */
function splitMarkdownRow(line: string): string[] {
  const parts = line.split("|");
  return parts.slice(1, parts.length - 1).map((s) => s.trim()); // canonicalize-exempt: markdown cell whitespace, not an email
}

/**
 * A markdown table header row is a pull-sheet header when it has cells and EVERY cell
 * contains "PULL SHEET" (mirror `lib/parser/pull-sheet.ts:60`). The synthetic
 * `PULL SHEET/<title>` cell that `normalizePullSheetGrid` produces satisfies this.
 */
function isPullSheetHeaderCells(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => c.toUpperCase().includes("PULL SHEET"));
}

/** Drop fully-blank lines so a cosmetic extra blank row is fingerprint-stable (D5). */
function stripBlankLines(md: string): string {
  return md
    .split("\n")
    .filter((line) => line.trim().length > 0) // canonicalize-exempt: markdown line whitespace, not an email
    .join("\n");
}

/**
 * Split the per-tab synthesized markdown into pull-sheet case regions. Each region is a
 * table block whose first pipe row is a pull-sheet header (through its own data rows).
 * Non-pull-sheet blocks (ROOMS, etc.) are excluded so opt-in re-inclusion never leaks
 * unrelated content (D6, I1).
 */
function collectPullSheetRegionsFromMarkdown(md: string): { regionMarkdown: string }[] {
  const regions: { regionMarkdown: string }[] = [];
  const blocks = md
    .split(/\n{2,}/)
    .map((block) => block.trim()) // canonicalize-exempt: markdown block whitespace, not an email
    .filter((block) => block.length > 0);
  for (const block of blocks) {
    const headerLine = block.split("\n").find((line) => line.trim().startsWith("|")); // canonicalize-exempt: markdown pipe-row detection, not an email
    if (!headerLine) continue;
    const headerCells = splitMarkdownRow(headerLine.trim()); // canonicalize-exempt: markdown header-cell whitespace, not an email
    if (isPullSheetHeaderCells(headerCells)) {
      regions.push({ regionMarkdown: block });
    }
  }
  return regions;
}

/**
 * Derive one show-identity preview per pull-sheet region from the RAW grid. The preview
 * is the first non-blank row after a pull-sheet header row (its non-empty cells joined,
 * ≤120 chars) — the show identity an admin reviews (I2). Derived from the raw grid, not
 * the synthetic `PULL SHEET/<title>` cell, because `normalizePullSheetGrid` collapses the
 * first case's identity/title/column-header rows together and never collapses subsequent
 * cases' identity rows at all.
 */
function collectRawPullSheetPreviews(grid: CellGrid): string[] {
  const previews: string[] = [];
  for (let row = 0; row < grid.length; row += 1) {
    const nonEmpty = (grid[row] ?? []).filter((c) => !isBlank(c));
    if (nonEmpty.length === 0 || !isPullSheetHeaderCells(nonEmpty)) continue;
    let preview = "";
    for (let next = row + 1; next < grid.length; next += 1) {
      const cells = (grid[next] ?? []).map(stripEdgeWhitespace).filter((c) => !isBlank(c));
      if (cells.length > 0) {
        preview = cells.join(" / ").slice(0, 120);
        break;
      }
    }
    previews.push(preview.length > 0 ? preview : "(no header text)");
  }
  return previews;
}

/**
 * A fault converting already-fetched bytes into markdown: a corrupt or truncated
 * xlsx, an unreadable grid, anything the workbook reader refuses.
 *
 * Why this type exists: this function is called from INSIDE the Drive dependency
 * (`fetchSheetMarkdownWithBinding` and `fetchSheetMarkdownAndBytesAtRevision`), so
 * a workbook fault throws after Drive has already succeeded. Callers that classify
 * failures by call site therefore reported "we couldn't fetch this sheet from
 * Google Drive" and told Doug to check his share settings, when the truth was that
 * his workbook could not be read. Tagging the throw lets those callers classify by
 * error identity instead (spec 2026-07-24-test-safety-hardening-batch §4.2).
 */
export class WorkbookSynthesisError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = "WorkbookSynthesisError";
  }
}

/**
 * The exporter's block segmentation as a VALUE, coordinates included.
 *
 * `synthesizeMarkdownFromXlsx` is a renderer over this (the markdown is unchanged byte
 * for byte, pinned by tests/drive/round-trip-fixture.test.ts). The second consumer is
 * the raw-workbook anchor scanner (`lib/drive/unknownFieldAnchors.ts`), which needs the
 * A1 coordinates the markdown throws away and, more importantly, needs the SAME notion
 * of "which block is this row in" that the detector gets from the markdown. Two
 * implementations of that question were the defect this replaces
 * (spec 2026-08-27-wizard-warning-row-links-copy §2.1/§2.2).
 */
export function synthesizeBlocksFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { blocks: SynthesizedBlock[]; archivedPullSheetTabs: ArchivedPullSheetTab[] } {
  try {
    return synthesizeBlocksFromXlsxUnguarded(buffer, opts);
  } catch (cause) {
    // Idempotent, defensively: nothing inside the body can currently raise this type
    // (the reader throws its own errors), so this branch guards a future nested caller.
    if (cause instanceof WorkbookSynthesisError) throw cause;
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new WorkbookSynthesisError(`workbook could not be read: ${detail}`, { cause });
  }
}

export function synthesizeMarkdownFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { markdown: string; archivedPullSheetTabs: ArchivedPullSheetTab[] } {
  // No second guard: synthesizeBlocksFromXlsx already wraps the body, and rendering a
  // block list cannot throw a workbook fault.
  const { blocks, archivedPullSheetTabs } = synthesizeBlocksFromXlsx(buffer, opts);
  const tables = blocks.map(blockMarkdown);
  return { markdown: tables.join("\n\n"), archivedPullSheetTabs };
}

function synthesizeBlocksFromXlsxUnguarded(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { blocks: SynthesizedBlock[]; archivedPullSheetTabs: ArchivedPullSheetTab[] } {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellText: true,
    cellDates: false,
  });
  const blocks: SynthesizedBlock[] = [];
  const archivedPullSheetTabs: ArchivedPullSheetTab[] = [];

  for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    // `Workbook.Sheets` is index-aligned with `SheetNames` (both come from workbook.xml's
    // `<sheets>` in document order); 1 = hidden, 2 = veryHidden, absent/0 = visible.
    const sheetHidden = (workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden ?? 0) !== 0;
    // Archived tabs (e.g. "OLD PULL SHEET") are DROPPED from the synthesized markdown by
    // default. Their body is often a stale PRIOR show's data — Redefining FI's
    // "OLD PULL SHEET" holds RIA-Chicago gear from 4/15/24 — so ingesting it attributes
    // one show's content to another (DEFERRED AUDIT-2026-06-18-PARSE-FIDELITY-DEF-2).
    // We now additionally DETECT any pull-sheet case regions on the tab (building the same
    // markdown parsePullSheet would consume — single source of truth) so the sync layer can
    // surface them for admin review and opt-in re-inclusion via `includePullSheetFromTab`.
    if (/\bOLD\b/i.test(sheetName)) {
      const rawGrid = sheetGrid(sheet);
      const tabMarkdown = splitBlocks(
        normalizePullSheetGrid(sheetName, rawGrid.grid),
        rawGrid.firstCol,
      )
        .map(normalizeBlock)
        .map((b) => tableMarkdown(b.rows.map((r) => r.cells)))
        .join("\n\n");
      const regions = collectPullSheetRegionsFromMarkdown(tabMarkdown);
      if (regions.length > 0) {
        // Drive-string payload boundary (spec 2026-08-09-m-wave-2 §2.2): the OOXML tab
        // name + raw-grid previews enter the persisted payload here, bypassing
        // parseSheet's strip. The stored override round-trips the STRIPPED name back as
        // `includePullSheetFromTab`, so the inclusion match compares stripped forms on
        // both sides — a legacy override captured pre-strip still matches its tab.
        const cleanTabName = stripZeroWidth(sheetName);
        const included =
          opts?.includePullSheetFromTab !== undefined &&
          stripZeroWidth(opts.includePullSheetFromTab) === cleanTabName;
        const fingerprint = createHash("sha256")
          .update(regions.map((r) => stripBlankLines(r.regionMarkdown)).join("\n\x00\n"), "utf8")
          .digest("hex");
        const rawPreviews = collectRawPullSheetPreviews(rawGrid.grid.map((r) => r.cells));
        archivedPullSheetTabs.push({
          tabName: cleanTabName,
          headerPreviews: regions.map((_, index) =>
            stripZeroWidth(rawPreviews[index] ?? "(no header text)"),
          ),
          fingerprint,
          included,
          contentChangedSinceAccept: false,
        });
        if (included) {
          // Emit EXACTLY the collected region markdown (same bytes hashed); other blocks
          // (rooms, etc.) are discarded (D6, I1). Opaque: collected from rendered
          // markdown, so there is no grid behind it and it never anchors.
          blocks.push(
            ...regions.map((r) => ({ kind: "opaque" as const, markdown: r.regionMarkdown })),
          );
        }
      }
      continue; // non-included OLD tabs (and non-pull-sheet OLD tabs) stay dropped
    }
    const { grid, firstCol } = sheetGrid(sheet);
    for (const block of splitBlocks(normalizePullSheetGrid(sheetName, grid), firstCol).map(
      normalizeBlock,
    )) {
      blocks.push({
        kind: "grid",
        sheetName,
        sheetHidden,
        absCol0: block.absCol0,
        rows: block.rows,
      });
    }
  }

  return { blocks, archivedPullSheetTabs };
}
