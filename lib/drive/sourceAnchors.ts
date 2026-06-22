import * as XLSX from "xlsx";
import {
  type SourceAnchor,
  type RegionId,
  SOURCE_LINK_ALLOWLIST,
  REGION_IDS,
  REGION_ANCHOR_SPEC,
} from "@/lib/sheet-links/buildSheetDeepLink";

// ── helpers ──────────────────────────────────────────────────────────────────

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t === "z") return "";
  const value = cell.w ?? cell.v;
  if (value === null || value === undefined) return "";
  return String(value);
}

function isBlank(s: string): boolean {
  return !/\S/.test(s);
}

type AbsGrid = {
  cell: (r: number, c: number) => string;
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

/** Build an absolute-coordinate grid (row/col indices match the sheet's actual
 *  A1-notation). Merges are expanded so the top-left cell's value fills all
 *  cells in the merged region. */
function buildAbsGrid(sheet: XLSX.WorkSheet): AbsGrid {
  const ref = sheet["!ref"];
  if (!ref) {
    return { cell: () => "", minRow: 0, maxRow: -1, minCol: 0, maxCol: -1 };
  }
  const range = XLSX.utils.decode_range(ref);
  const {
    s: { r: minRow, c: minCol },
    e: { r: maxRow, c: maxCol },
  } = range;

  // Build flat storage indexed [absRow][absCol]
  const data: Record<number, Record<number, string>> = {};
  for (let r = minRow; r <= maxRow; r++) {
    data[r] = {};
    for (let c = minCol; c <= maxCol; c++) {
      data[r]![c] = cellText(sheet[XLSX.utils.encode_cell({ r, c })]);
    }
  }

  // Expand merges (copy top-left value to all cells in the merged region)
  for (const merge of sheet["!merges"] ?? []) {
    const src = data[merge.s.r]?.[merge.s.c] ?? "";
    if (isBlank(src)) continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (data[r] && isBlank(data[r]![c] ?? "")) {
          data[r]![c] = src;
        }
      }
    }
  }

  return {
    cell: (r, c) => data[r]?.[c] ?? "",
    minRow,
    maxRow,
    minCol,
    maxCol,
  };
}

/** Last non-blank column in a row (absolute). Returns minCol-1 if row is blank. */
function lastNonBlankCol(grid: AbsGrid, row: number): number {
  let last = grid.minCol - 1;
  for (let c = grid.minCol; c <= grid.maxCol; c++) {
    if (!isBlank(grid.cell(row, c))) last = c;
  }
  return last;
}

/** First non-blank cell text in a row. */
function firstCell(grid: AbsGrid, row: number): string {
  for (let c = grid.minCol; c <= grid.maxCol; c++) {
    const v = grid.cell(row, c);
    if (!isBlank(v)) return v;
  }
  return "";
}

/** `true` if every cell in the row is blank. */
function rowIsBlank(grid: AbsGrid, row: number): boolean {
  for (let c = grid.minCol; c <= grid.maxCol; c++) {
    if (!isBlank(grid.cell(row, c))) return false;
  }
  return true;
}

// ── strategy implementations ─────────────────────────────────────────────────

/** row-label-union: collect rows whose first non-blank cell matches any label
 *  regex; return the bounding rect across all matched rows. */
function rowLabelUnion(
  grid: AbsGrid,
  labels: RegExp[],
): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
  let foundMinRow = Infinity;
  let foundMaxRow = -Infinity;
  let foundMinCol = Infinity;
  let foundMaxCol = -Infinity;

  for (let r = grid.minRow; r <= grid.maxRow; r++) {
    const first = firstCell(grid, r);
    if (labels.some((re) => re.test(first))) {
      foundMinRow = Math.min(foundMinRow, r);
      foundMaxRow = Math.max(foundMaxRow, r);
      foundMinCol = Math.min(foundMinCol, grid.minCol);
      const lnbc = lastNonBlankCol(grid, r);
      if (lnbc >= grid.minCol) foundMaxCol = Math.max(foundMaxCol, lnbc);
    }
  }

  if (foundMaxRow === -Infinity) return null;
  // If no cell had a non-blank col beyond minCol, still use minCol
  if (foundMaxCol < foundMinCol) foundMaxCol = foundMinCol;
  return { minRow: foundMinRow, maxRow: foundMaxRow, minCol: foundMinCol, maxCol: foundMaxCol };
}

/** header-block: find the header row, include it, then scan from the NEXT row
 *  downward until a terminator exact-matches or we hit a blank run or sheet end. */
function headerBlock(
  grid: AbsGrid,
  header: RegExp,
  terminators: RegExp[],
): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
  // Find header row
  let headerRow = -1;
  for (let r = grid.minRow; r <= grid.maxRow; r++) {
    const first = firstCell(grid, r);
    if (header.test(first)) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return null;

  // Scan from the row AFTER the header
  let lastIncluded = headerRow;
  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    if (rowIsBlank(grid, r)) break;
    const first = firstCell(grid, r);
    // Exact full-cell match against terminators (terminators already anchored with $)
    if (terminators.some((re) => re.test(first))) break;
    lastIncluded = r;
  }

  // Compute bounding rect
  const minCol = grid.minCol;
  let maxCol = grid.minCol;
  for (let r = headerRow; r <= lastIncluded; r++) {
    const lnbc = lastNonBlankCol(grid, r);
    if (lnbc >= grid.minCol) maxCol = Math.max(maxCol, lnbc);
  }

  return { minRow: headerRow, maxRow: lastIncluded, minCol, maxCol };
}

// ── main export ───────────────────────────────────────────────────────────────

export function extractSourceAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): Record<string, SourceAnchor> {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });

  const result: Record<string, SourceAnchor> = {};

  // First pass: everything except alias-of
  for (const regionId of REGION_IDS as readonly RegionId[]) {
    const spec = REGION_ANCHOR_SPEC[regionId];
    if (spec.strategy === "alias-of") continue;

    // Pick first tab in spec.tabs that exists in titleToGid AND is allowlisted
    let chosenTitle: string | null = null;
    let chosenGid: number | null = null;
    for (const tab of spec.tabs) {
      if (titleToGid.has(tab) && (SOURCE_LINK_ALLOWLIST as readonly string[]).includes(tab)) {
        chosenTitle = tab;
        chosenGid = titleToGid.get(tab)!;
        break;
      }
    }
    if (chosenTitle === null || chosenGid === null) continue;

    const sheet = workbook.Sheets[chosenTitle];
    if (!sheet || !sheet["!ref"]) continue;

    const grid = buildAbsGrid(sheet);

    let rect: { minRow: number; maxRow: number; minCol: number; maxCol: number } | null = null;

    if (spec.strategy === "whole-tab") {
      rect = { minRow: grid.minRow, maxRow: grid.maxRow, minCol: grid.minCol, maxCol: grid.maxCol };
    } else if (spec.strategy === "row-label-union") {
      rect = rowLabelUnion(grid, spec.labels);
    } else if (spec.strategy === "header-block") {
      rect = headerBlock(grid, spec.header, spec.terminators);
    }

    if (!rect) continue;
    if (rect.maxRow < rect.minRow) continue;

    const a1 = XLSX.utils.encode_range({
      s: { r: rect.minRow, c: rect.minCol },
      e: { r: rect.maxRow, c: rect.maxCol },
    });

    result[regionId] = { title: chosenTitle, gid: chosenGid, a1 };
  }

  // Second pass: alias-of
  for (const regionId of REGION_IDS as readonly RegionId[]) {
    const spec = REGION_ANCHOR_SPEC[regionId];
    if (spec.strategy !== "alias-of") continue;
    const referent = result[spec.region];
    if (referent) {
      result[regionId] = { ...referent };
    }
  }

  return result;
}
