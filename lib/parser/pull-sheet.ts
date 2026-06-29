/**
 * Pull-sheet parser (§6.10, AC-4.7..4.11)
 *
 * Detection signature:
 *   - Pull sheet: header row cells all contain literal "PULL SHEET" (case-insensitive).
 *   - GEAR (excluded): header row contains BOTH "PULLED" AND "INITAL" (typo deliberate).
 *
 * Column layout variants (corpus-verified):
 *   Variant A (2024-05): [packed_flag, qty, item, sub_cat, cat]  — packed_flag FIRST
 *   Variant B (2025-05): [qty, item, sub_cat, cat, packed_flag]  — packed_flag LAST
 *
 * Detection: if col[0] matches /^(TRUE|FALSE)$/i -> variant A; if col[4] matches -> variant B.
 * If neither, default to variant A (best-effort).
 *
 * IMPORTANT: &#10; HTML-encoded newlines appear inside cells in the raw markdown.
 * Do NOT expand them before splitting lines — that would break the pipe-delimited structure.
 * Expand them only when reading cell content (for extractCaseLabel).
 *
 * Returns { pullSheet: PullSheetCase[] | null; warnings: ParseWarning[] }.
 * Caller (Task 1.11 orchestrator) merges warnings into ParsedSheet.warnings.
 */

import type { PullSheetCase, PullSheetItem, ParseWarning } from "./types";
import { splitRow } from "./blocks/_helpers";

// ---- Public API --------------------------------------------------------------

export type PullSheetParseResult = {
  pullSheet: PullSheetCase[] | null;
  warnings: ParseWarning[];
};

export function parsePullSheet(markdown: string): PullSheetParseResult {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");
  const pullSheetCases: PullSheetCase[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed.startsWith("|")) {
      i++;
      continue;
    }

    const cells = splitRow(trimmed);

    // GEAR rejection: header contains both "PULLED" and "INITAL" (typo deliberate)
    const cellsUpper = cells.map((c) => c.toUpperCase());
    if (cellsUpper.includes("PULLED") && cellsUpper.includes("INITAL")) {
      i = skipTableBlock(lines, i);
      continue;
    }

    // Pull-sheet detection: ALL cells contain "PULL SHEET" (case-insensitive)
    // Cell content may include &#10; sequences — test against the raw cell value.
    const isPullSheetHeader =
      cells.length > 0 && cells.every((c) => c.toUpperCase().includes("PULL SHEET"));

    if (!isPullSheetHeader) {
      i++;
      continue;
    }

    // Extract caseLabel from first cell
    // Expand &#10; only here, for content reading
    const firstCell = (cells[0] ?? "").replace(/&#10;/g, "\n");
    const caseLabel = extractCaseLabel(firstCell);

    // Advance past the header row
    i++;

    // Skip the alignment/separator row
    if (i < lines.length) {
      const nextTrimmed = (lines[i] ?? "").trim();
      if (isSeparatorRow(nextTrimmed)) {
        i++;
      }
    }

    // Collect the data rows for this case. Modern exporter pull-sheets interleave the
    // header with a sub-header + summary-count rows (each its own blank/separator-
    // bounded block) before the real item rows, so we scan forward — within this
    // case's region, up to the next PULL SHEET header — for the FIRST contiguous block
    // that carries a recognizable packed-flag row (TRUE/FALSE in col0 or col4). Block
    // boundaries are unchanged (blank OR separator), so the legacy raw shape (items
    // directly under the header, trailing TOTAL-COUNT junk after a blank) is collected
    // exactly as before. Falls back to the first non-empty block when no packed-flag is
    // present (legacy unknown-variant shape, pinned by Test 8).
    const block = collectDataBlock(lines, i);
    i = block.nextIndex;

    const result = parseDataRows(block.dataRows, caseLabel, warnings);
    pullSheetCases.push(result);
  }

  if (pullSheetCases.length === 0) {
    return { pullSheet: null, warnings };
  }

  return { pullSheet: pullSheetCases, warnings };
}

// ---- Internal helpers -------------------------------------------------------

function isSeparatorRow(trimmed: string): boolean {
  if (!trimmed.startsWith("|")) return false;
  const parts = trimmed.split("|");
  const segments = parts.slice(1, parts.length - 1);
  return segments.length > 0 && segments.every((seg) => /^[\s:|*-]*$/.test(seg));
}

/**
 * Locate the item-bearing data block for a pull-sheet case (§6.10, gear-parser-fidelity).
 *
 * Scans forward from `start` (just past the header + alignment row). A "block" is a
 * maximal run of pipe rows bounded by a blank line OR a separator row (identical to the
 * legacy collection boundary). Returns the FIRST block containing a packed-flag row
 * (TRUE/FALSE in col0 or col4) — skipping leading sub-header / summary-count blocks the
 * modern exporter emits. Stops at the next PULL SHEET header so multi-sub-tab sheets keep
 * one case per header. Falls back to the first non-empty block when no packed flag exists.
 */
function collectDataBlock(
  lines: string[],
  start: number,
): { dataRows: string[]; nextIndex: number } {
  let i = start;
  let fallback: string[] | null = null;
  let fallbackEnd = start;

  while (i < lines.length) {
    // Skip leading blank / non-pipe lines and separator rows.
    while (i < lines.length) {
      const t = (lines[i] ?? "").trim();
      if (!t.startsWith("|")) {
        i++;
        continue;
      }
      if (isSeparatorRow(t)) {
        i++;
        continue;
      }
      break;
    }
    if (i >= lines.length) break;

    // Stop at the next PULL SHEET header — that belongs to the next case.
    const firstCells = splitRow((lines[i] ?? "").trim());
    if (firstCells.length > 0 && firstCells.every((c) => c.toUpperCase().includes("PULL SHEET"))) {
      break;
    }

    // Gather one contiguous block (ends at a blank line or separator row).
    const blockRows: string[] = [];
    let hasFlag = false;
    while (i < lines.length) {
      const t = (lines[i] ?? "").trim();
      if (!t.startsWith("|")) break;
      if (isSeparatorRow(t)) break;
      blockRows.push(t);
      const cells = splitRow(t);
      if (PACKED_FLAG_RE.test(cells[0] ?? "") || PACKED_FLAG_RE.test(cells[4] ?? ""))
        hasFlag = true;
      i++;
    }

    if (hasFlag) return { dataRows: blockRows, nextIndex: i };
    if (fallback === null && blockRows.length > 0) {
      fallback = blockRows;
      fallbackEnd = i;
    }
  }

  if (fallback) return { dataRows: fallback, nextIndex: fallbackEnd };
  return { dataRows: [], nextIndex: i };
}

function skipTableBlock(lines: string[], startIdx: number): number {
  let j = startIdx;
  while (j < lines.length && (lines[j] ?? "").trim().startsWith("|")) {
    j++;
  }
  return j;
}

function extractCaseLabel(cell: string): string {
  // Cell text (after &#10; expansion) is "PULL SHEET/<title>\n<rest of multi-line content>"
  const match = /PULL\s+SHEET\/(.+)/i.exec(cell);
  if (!match) return "Pull Sheet";
  const afterSlash = match[1] ?? "";
  const title = afterSlash.split("\n")[0] ?? "";
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : "Pull Sheet";
}

type ColumnVariant = "A" | "B" | "unknown";

const PACKED_FLAG_RE = /^(TRUE|FALSE)$/i;

function detectVariant(cells: string[]): ColumnVariant {
  if (cells.length >= 1 && PACKED_FLAG_RE.test(cells[0] ?? "")) return "A";
  if (cells.length >= 5 && PACKED_FLAG_RE.test(cells[4] ?? "")) return "B";
  return "unknown";
}

function extractFields(
  cells: string[],
  variant: ColumnVariant,
): { qtyRaw: string; item: string; subCat: string; cat: string } | null {
  if (variant === "A") {
    // [packed_flag, qty, item, sub_cat, cat]
    if (cells.length < 5) return null;
    return {
      qtyRaw: cells[1] ?? "",
      item: cells[2] ?? "",
      subCat: cells[3] ?? "",
      cat: cells[4] ?? "",
    };
  } else if (variant === "B") {
    // [qty, item, sub_cat, cat, packed_flag]
    if (cells.length < 5) return null;
    return {
      qtyRaw: cells[0] ?? "",
      item: cells[1] ?? "",
      subCat: cells[2] ?? "",
      cat: cells[3] ?? "",
    };
  }
  return null;
}

function parseDataRows(
  dataRows: string[],
  caseLabel: string,
  warnings: ParseWarning[],
): PullSheetCase {
  // Check for ambiguous format: any row with TOO FEW columns (< 5). Wide rows (>= 5)
  // are tolerated — the exporter shape carries 16 columns and the structured path reads
  // the leading 5 (extractFields cells[0..4]); empty-item summary rows are dropped below
  // (gear-parser-fidelity Task 5). A row with fewer than 5 columns cannot be mapped to
  // the [flag, qty, item, sub_cat, cat] layout, so it still triggers the raw fallback.
  const nonFiveColumnRow = dataRows.find((row) => {
    const cells = splitRow(row);
    return cells.length < 5;
  });

  if (nonFiveColumnRow !== undefined) {
    warnings.push({
      severity: "warn",
      code: "PULL_SHEET_AMBIGUOUS_FORMAT",
      message:
        `Pull sheet case "${caseLabel}" has rows with unexpected column count ` +
        `(expected 5). Falling back to raw-snippet rendering.`,
      blockRef: { kind: "pull_sheet" },
      rawSnippet: nonFiveColumnRow,
    });

    // Raw-snippet fallback for entire case
    const items: PullSheetItem[] = dataRows
      .filter((row) => row.trim().length > 0)
      .map((row) => ({
        qty: null,
        cat: null,
        subCat: null,
        item: row,
        rawSnippet: row,
      }));

    return { caseLabel, items };
  }

  // Detect column variant by scanning ALL data rows until one disambiguates.
  // Assumption: real data rows always have a populated packed_flag cell that
  // matches /^(TRUE|FALSE)$/i in either col[0] (Variant A) or col[4] (Variant B).
  // If NO row matches across the entire case, we default to Variant A (best-effort)
  // and emit a warning so the caller can investigate.
  let variant: ColumnVariant = "unknown";
  for (const row of dataRows) {
    const cells = splitRow(row);
    const v = detectVariant(cells);
    if (v !== "unknown") {
      variant = v;
      break;
    }
  }
  if (variant === "unknown") {
    variant = "A";
    if (dataRows.length > 0) {
      warnings.push({
        severity: "warn",
        code: "PULL_SHEET_UNKNOWN_VARIANT",
        message:
          `Pull sheet case "${caseLabel}" has data rows but no row with a recognisable ` +
          `packed_flag cell (TRUE/FALSE in col[0] or col[4]). Defaulting to Variant A.`,
        blockRef: { kind: "pull_sheet" },
      });
    }
  }

  let emittedPartialWarning = false;
  const items: PullSheetItem[] = [];

  for (const row of dataRows) {
    const cells = splitRow(row);
    const fields = extractFields(cells, variant);
    if (!fields) continue;

    const { qtyRaw, item: itemRaw, subCat: subCatRaw, cat: catRaw } = fields;

    // Drop rows with empty item
    const itemClean = itemRaw.trim();
    if (itemClean.length === 0) continue;

    // Parse qty
    const qtyStr = qtyRaw.trim();
    let qty: number | null = null;
    let hasQtyError = false;

    if (qtyStr.length > 0) {
      const parsed = Number(qtyStr);
      if (Number.isFinite(parsed)) {
        qty = parsed;
      } else {
        qty = null;
        hasQtyError = true;
      }
    }

    // subCat: null when blank/empty
    const subCatClean = subCatRaw.trim();
    const subCat: string | null = subCatClean.length > 0 ? subCatClean : null;

    // cat: null when blank/empty
    const catClean = catRaw.trim();
    const cat: string | null = catClean.length > 0 ? catClean : null;

    if (hasQtyError) {
      if (!emittedPartialWarning) {
        warnings.push({
          severity: "warn",
          code: "PULL_SHEET_PARSE_PARTIAL",
          message:
            `Pull sheet case "${caseLabel}" has a row with unparseable qty. ` +
            `Row preserved with qty:null and rawSnippet.`,
          blockRef: { kind: "pull_sheet" },
          rawSnippet: row,
        });
        emittedPartialWarning = true;
      }
      items.push({
        qty: null,
        cat,
        subCat,
        item: itemClean,
        rawSnippet: row,
      });
    } else {
      items.push({
        qty,
        cat,
        subCat,
        item: itemClean,
      });
    }
  }

  return { caseLabel, items };
}
