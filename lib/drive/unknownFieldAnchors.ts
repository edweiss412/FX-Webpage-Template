import * as XLSX from "xlsx";
import { buildAbsGrid, type AbsGrid } from "@/lib/drive/sourceAnchors";
import { clean } from "@/lib/parser/blocks/_helpers";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/** An anchor to a venue/details row's LABEL cell, keyed by (kind, normalized
 *  label, normalized value). value participates in the key so resolution
 *  identifies the specific row (provenance), not merely a unique label. */
export type UnknownFieldAnchor = {
  kind: string;
  label: string;
  value: string;
  anchor: SourceAnchor;
};

// The two blocks whose parsers call emitUnknownField (venue.ts, event.ts). Headers
// mirror REGION_ANCHOR_SPEC (lib/sheet-links/buildSheetDeepLink.ts) exactly.
const BLOCKS: { kind: string; header: RegExp }[] = [
  { kind: "venue", header: /^VENUE$/i },
  { kind: "details", header: /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i },
];

// A row whose first non-blank cell (upper-cased) is one of these ENDS the block.
// Mirror of the crew TERMINATORS / region BLOCK_TERMINATORS. Over-inclusion is
// safe (spec §5.1.1), so this only needs to catch real section openers.
const TERMINATORS = new Set([
  "CREW",
  "TECH",
  "VENUE",
  "DATES",
  "HOTEL",
  "HOTELS",
  "ROOMS",
  "TRANSPORTATION",
  "CONTACTS",
  "SCHEDULE",
  "PULL SHEET",
  "PULL",
  "DIAGRAMS",
  "EVENT DETAILS",
  "DETAILS",
  "GS DETAILS",
  "DRESS",
  "GENERAL SESSION",
  "CONTACT OFFICE",
  "CLIENT",
  "DOCUMENT FOLDER LINK",
  "AGENDA LINK",
  "AGENDA",
  "FORM",
  "GEAR",
  "TO DO",
]);

/** Normalize a sheet cell for matching. canonicalize-exempt: sheet field text,
 *  not an email (AGENTS.md invariant 3 N/A). Applied identically to grid cells
 *  and to the label/value from the warning, so the two sides compare equal. */
export function normalizeCellKey(s: string): string {
  return clean(s).replace(/\s+/g, " ").trim().toLowerCase(); // canonicalize-exempt: sheet label, not an email
}

function firstNonBlank(grid: AbsGrid, r: number): { col: number; text: string } | null {
  for (let c = grid.minCol; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(r, c));
    if (v) return { col: c, text: v };
  }
  return null;
}

function nextNonBlankAfter(grid: AbsGrid, r: number, afterCol: number): string {
  for (let c = afterCol + 1; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(r, c));
    if (v) return v;
  }
  return "";
}

/**
 * Re-scan the RAW workbook to locate each venue/details row's LABEL cell, keyed by
 * (kind, normalized label, normalized value). The parser runs on synthesized
 * markdown (which loses A1 coordinates), so we reconstruct from the raw grid,
 * mirroring extractCrewRoleAnchors. OVER-INCLUSIVE by design: the scan continues
 * past internal blank rows to the next section terminator, so it is a superset of
 * the parser's emitting rows (under-inclusion is the only wrong-cell risk;
 * over-inclusion degrades to null via the exactly-one guard). Any edge → fewer/no
 * anchors, never a wrong one.
 */
export function extractUnknownFieldAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): UnknownFieldAnchor[] {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: UnknownFieldAnchor[] = [];

  const sheetName = workbook.SheetNames.find(
    (n) => n.toUpperCase() === "INFO" && !/\bOLD\b/i.test(n),
  );
  if (!sheetName) return out;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return out;
  const gid = titleToGid.get(sheetName);
  if (typeof gid !== "number") return out;

  const grid = buildAbsGrid(sheet);

  for (const { kind, header } of BLOCKS) {
    let headerRow = -1;
    for (let r = grid.minRow; r <= grid.maxRow; r++) {
      const first = firstNonBlank(grid, r);
      if (first && header.test(first.text)) {
        headerRow = r;
        break;
      }
    }
    if (headerRow === -1) continue;

    for (let r = headerRow + 1; r <= grid.maxRow; r++) {
      const first = firstNonBlank(grid, r);
      if (!first) continue; // internal blank row — over-inclusive: keep scanning
      // Terminate on the FIRST LINE of the raw cell: section headers like
      // "GENERAL SESSION\nGRAND BALLROOM A/B\n8th Floor" are merged multi-line title
      // cells, so the collapsed text never exact-matches. First-line-exact-match
      // catches them without prefix false-positives (a "VENUE NAME" field row's
      // first line is "VENUE NAME", not "VENUE"). (live-sheet fidelity, 2026-07-01)
      const firstLine = (grid.cell(r, first.col).split(/\r?\n/)[0] ?? "").trim().toUpperCase();
      if (TERMINATORS.has(firstLine)) break; // next section
      const value = nextNonBlankAfter(grid, r, first.col);
      out.push({
        kind,
        label: normalizeCellKey(first.text),
        value: normalizeCellKey(value),
        anchor: { title: sheetName, gid, a1: XLSX.utils.encode_cell({ r, c: first.col }) },
      });
    }
  }

  return out;
}

/**
 * Pick the single anchor whose (kind, normalized label, normalized value) equals
 * the warning's. EXACTLY ONE match → its anchor; zero or ≥2 → null, so a wrong-cell
 * link is never produced (mirror resolveCrewRoleCell). value gives provenance: a
 * same-label impostor with a different value cannot become the single match.
 */
export function resolveUnknownFieldCell(
  anchors: UnknownFieldAnchor[],
  kind: string | undefined | null,
  label: string | undefined | null,
  value: string | undefined | null,
): SourceAnchor | null {
  if (!kind || !label) return null;
  const lk = normalizeCellKey(label);
  const vk = normalizeCellKey(value ?? "");
  const matches = anchors.filter((a) => a.kind === kind && a.label === lk && a.value === vk);
  return matches.length === 1 ? matches[0]!.anchor : null;
}
