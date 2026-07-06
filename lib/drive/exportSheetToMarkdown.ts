import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

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

function escapeCell(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\|/g, "\\|")
    .replace(/(\\#[A-Z0-9/]+)!/g, "$1\\!");
  return normalizeNewlines(escaped);
}

function normalizeNewlines(value: string): string {
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
  if (lines[1] && /^[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}/.test(lines[1])) return false;
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

function sheetGrid(sheet: XLSX.WorkSheet): CellGrid {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: CellGrid = [];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const outputRow: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      outputRow.push(cellText(sheet[XLSX.utils.encode_cell({ r: row, c: col })]));
    }
    grid.push(outputRow);
  }

  expandMerges(grid, sheet["!merges"]);
  return grid;
}

function rowIsBlank(row: readonly string[]): boolean {
  return row.every(isBlank);
}

function splitBlocks(grid: CellGrid): CellGrid[] {
  const blocks: CellGrid[] = [];
  let current: CellGrid = [];

  for (const row of grid) {
    if (rowIsBlank(row)) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(row);
  }
  if (current.length > 0) blocks.push(current);

  return blocks.map(trimBlock).filter((block) => block.length > 0);
}

function normalizePullSheetGrid(sheetName: string, grid: CellGrid): CellGrid {
  if (!/PULL SHEET/i.test(sheetName)) return grid;
  const firstDataRow = grid.findIndex((row) => {
    const quantity = Number(row[0]);
    return Number.isFinite(quantity) && !isBlank(row[1] ?? "");
  });
  if (firstDataRow <= 0) return grid;

  const titleParts = grid
    .slice(0, firstDataRow)
    .flatMap((row) => row.filter((value) => !isBlank(value)))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (titleParts.length === 0) return grid;

  const width = Math.max(
    1,
    ...grid.slice(firstDataRow).map((row) => {
      for (let col = row.length - 1; col >= 0; col -= 1) {
        if (!isBlank(row[col] ?? "")) return col + 1;
      }
      return 0;
    }),
  );
  return [Array.from({ length: width }, () => titleParts.join("/")), ...grid.slice(firstDataRow)];
}

function normalizeBlock(block: CellGrid): CellGrid {
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

function trimBlock(block: CellGrid): CellGrid {
  const firstNonBlankCol = block.reduce<number | null>((first, row) => {
    for (let col = 0; col < row.length; col += 1) {
      if (!isBlank(row[col] ?? "")) return first === null ? col : Math.min(first, col);
    }
    return first;
  }, null);
  if (firstNonBlankCol === null) return [];

  const lastNonBlankCol = block.reduce((last, row) => {
    for (let col = row.length - 1; col >= 0; col -= 1) {
      if (!isBlank(row[col] ?? "")) return Math.max(last, col);
    }
    return last;
  }, firstNonBlankCol);

  return block.map((row) => row.slice(firstNonBlankCol, lastNonBlankCol + 1));
}

function tableMarkdown(block: CellGrid): string {
  const width = block.reduce((max, row) => Math.max(max, row.length), 0);
  const rows = block.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? "")),
  );
  const delimiter = Array.from({ length: width }, () => ":---:");

  return [
    `| ${rows[0]?.join(" | ") ?? ""} |`,
    `| ${delimiter.join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

/** Split a markdown table row into trimmed cells (mirror of parser `splitRow`). */
function splitMarkdownRow(line: string): string[] {
  const parts = line.split("|");
  return parts.slice(1, parts.length - 1).map((s) => s.trim());
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
    .filter((line) => line.trim().length > 0)
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
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  for (const block of blocks) {
    const headerLine = block.split("\n").find((line) => line.trim().startsWith("|"));
    if (!headerLine) continue;
    if (isPullSheetHeaderCells(splitMarkdownRow(headerLine.trim()))) {
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

export function synthesizeMarkdownFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { markdown: string; archivedPullSheetTabs: ArchivedPullSheetTab[] } {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellText: true,
    cellDates: false,
  });
  const tables: string[] = [];
  const archivedPullSheetTabs: ArchivedPullSheetTab[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    // Archived tabs (e.g. "OLD PULL SHEET") are DROPPED from the synthesized markdown by
    // default. Their body is often a stale PRIOR show's data — Redefining FI's
    // "OLD PULL SHEET" holds RIA-Chicago gear from 4/15/24 — so ingesting it attributes
    // one show's content to another (DEFERRED AUDIT-2026-06-18-PARSE-FIDELITY-DEF-2).
    // We now additionally DETECT any pull-sheet case regions on the tab (building the same
    // markdown parsePullSheet would consume — single source of truth) so the sync layer can
    // surface them for admin review and opt-in re-inclusion via `includePullSheetFromTab`.
    if (/\bOLD\b/i.test(sheetName)) {
      const rawGrid = sheetGrid(sheet);
      const tabMarkdown = splitBlocks(normalizePullSheetGrid(sheetName, rawGrid))
        .map(normalizeBlock)
        .map(tableMarkdown)
        .join("\n\n");
      const regions = collectPullSheetRegionsFromMarkdown(tabMarkdown);
      if (regions.length > 0) {
        const included = opts?.includePullSheetFromTab === sheetName;
        const fingerprint = createHash("sha256")
          .update(regions.map((r) => stripBlankLines(r.regionMarkdown)).join("\n\x00\n"), "utf8")
          .digest("hex");
        const rawPreviews = collectRawPullSheetPreviews(rawGrid);
        archivedPullSheetTabs.push({
          tabName: sheetName,
          headerPreviews: regions.map((_, index) => rawPreviews[index] ?? "(no header text)"),
          fingerprint,
          included,
          contentChangedSinceAccept: false,
        });
        if (included) {
          // Emit EXACTLY the collected region markdown (same bytes hashed); other blocks
          // (rooms, etc.) are discarded (D6, I1).
          tables.push(...regions.map((r) => r.regionMarkdown));
        }
      }
      continue; // non-included OLD tabs (and non-pull-sheet OLD tabs) stay dropped
    }
    const grid = normalizePullSheetGrid(sheetName, sheetGrid(sheet));
    for (const block of splitBlocks(grid).map(normalizeBlock)) {
      tables.push(tableMarkdown(block));
    }
  }

  return { markdown: tables.join("\n\n"), archivedPullSheetTabs };
}
