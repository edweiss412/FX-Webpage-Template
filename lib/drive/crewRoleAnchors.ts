import * as XLSX from "xlsx";
import { buildAbsGrid, type AbsGrid } from "@/lib/drive/sourceAnchors";
import { clean } from "@/lib/parser/blocks/_helpers";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/** An anchor to a crew member's ROLE cell (new template) or compound name+role
 *  cell (old TECH template), keyed by the member's normalized NAME. */
export type CrewRoleAnchor = { name: string; anchor: SourceAnchor };

// Section labels that bound the CREW/TECH block (mirror of the parser's
// TERMINATING_LABELS, lib/parser/blocks/crew.ts:31-48, plus the INFO labels that
// follow the crew block in the standardized template). A row whose first
// non-blank cell matches one ends the block.
const TERMINATORS = new Set([
  "DRESS",
  "TRANSPORTATION",
  "VENUE",
  "DATES",
  "HOTEL",
  "HOTELS",
  "ROOMS",
  "CONTACTS",
  "SCHEDULE",
  "PULL SHEET",
  "PULL",
  "DIAGRAMS",
  "DETAILS",
  "CONTACT OFFICE",
  "CLIENT",
  "DOCUMENT FOLDER LINK",
  "AGENDA LINK",
  "AGENDA",
]);

/** Normalize a crew name for matching: strip markdown escapes (via clean),
 *  drop any parenthetical (day restriction "(6/24 ONLY)"), collapse whitespace,
 *  lowercase. Applied IDENTICALLY to the grid name and the warning's
 *  blockRef.name so the two sides compare for equality. */
export function normalizeCrewNameKey(s: string): string {
  // The crew NAME match key for deep-link anchoring is a person's name from the
  // CREW grid — NOT an email; it never enters the auth/email boundary (AGENTS.md
  // invariant 3 N/A), so the trim/lowercase below are canonicalize-exempt.
  const collapsed = clean(s)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ");
  return collapsed.trim().toLowerCase(); // canonicalize-exempt: crew name key, not an email
}

function firstNonBlankText(grid: AbsGrid, row: number): string {
  for (let c = grid.minCol; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(row, c));
    if (v) return v;
  }
  return "";
}

function isTerminator(text: string): boolean {
  return TERMINATORS.has(text.toUpperCase());
}

// New template: dedicated ROLE column. Anchor the ROLE cell of each crew row.
function collectCrew(
  grid: AbsGrid,
  headerRow: number,
  crewCol: number,
  sheetName: string,
  gid: number,
  out: CrewRoleAnchor[],
): void {
  let nameCol = -1;
  let roleCol = -1;
  for (let c = crewCol; c <= grid.maxCol; c++) {
    const v = clean(grid.cell(headerRow, c)).toUpperCase();
    if (v === "NAME") nameCol = c;
    else if (v === "ROLE") roleCol = c;
  }
  if (nameCol === -1 || roleCol === -1) return; // no ROLE column → cannot cell-anchor
  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    const first = firstNonBlankText(grid, r);
    if (first && isTerminator(first)) break;
    const nameCell = clean(grid.cell(r, nameCol));
    if (!nameCell) continue; // blank/spacer row
    out.push({
      name: normalizeCrewNameKey(nameCell),
      anchor: { title: sheetName, gid, a1: XLSX.utils.encode_cell({ r, c: roleCol }) },
    });
  }
}

// Old TECH template: name + schedule + role merged in one cell. Mirror
// parseTechBlock (crew.ts:188-194): require " - ", name = segment before it.
function collectTech(
  grid: AbsGrid,
  headerRow: number,
  techCol: number,
  sheetName: string,
  gid: number,
  out: CrewRoleAnchor[],
): void {
  for (let r = headerRow + 1; r <= grid.maxRow; r++) {
    // Terminate on a section label in ANY column (not just techCol) — a TECH
    // block ends when the next section starts, and that label often sits in a
    // different column than the compound cell. Checking only techCol would scan
    // PAST the block and risk a wrong-cell match on a later "X - Y" compound.
    const first = firstNonBlankText(grid, r);
    if (first && isTerminator(first)) break;
    const cell = clean(grid.cell(r, techCol));
    if (!cell) continue;
    const firstDash = cell.indexOf(" - ");
    if (firstDash === -1) continue; // not a "Name - … - role" compound
    out.push({
      name: normalizeCrewNameKey(cell.slice(0, firstDash)),
      anchor: { title: sheetName, gid, a1: XLSX.utils.encode_cell({ r, c: techCol }) },
    });
  }
}

/**
 * Re-scan the RAW workbook to locate each crew member's role cell, keyed by the
 * member's normalized NAME (the synthesis-stable per-row key — the markdown
 * pipeline loses A1, so we reconstruct from the raw grid, mirroring
 * extractShowDayTimeAnchors). Handles BOTH crew-block geometries. A missing gid,
 * absent crew block, or no ROLE column degrades to no anchor — never a wrong one.
 */
export function extractCrewRoleAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): CrewRoleAnchor[] {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: CrewRoleAnchor[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (/\bOLD\b/i.test(sheetName)) continue; // skip archived tabs (mirror synthesis)
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;
    const gid = titleToGid.get(sheetName);
    if (typeof gid !== "number") continue;

    const grid = buildAbsGrid(sheet);
    for (let r = grid.minRow; r <= grid.maxRow; r++) {
      let headerCol = -1;
      let isTech = false;
      for (let c = grid.minCol; c <= grid.maxCol; c++) {
        const v = clean(grid.cell(r, c)).toUpperCase();
        if (v === "CREW") {
          headerCol = c;
          isTech = false;
          break;
        }
        if (v === "TECH") {
          headerCol = c;
          isTech = true;
          break;
        }
      }
      if (headerCol === -1) continue;
      if (isTech) collectTech(grid, r, headerCol, sheetName, gid, out);
      else collectCrew(grid, r, headerCol, sheetName, gid, out);
      break; // one crew block per sheet
    }
  }

  return out;
}

/**
 * Pick the single anchor whose normalized name equals the warning's normalized
 * blockRef.name. EXACTLY ONE match → its anchor; zero or two-or-more → null, so
 * a wrong-cell link is never produced (mirror resolveSourceCell's ambiguity-null).
 */
export function resolveCrewRoleCell(
  anchors: CrewRoleAnchor[],
  name: string | undefined | null,
): SourceAnchor | null {
  if (!name) return null;
  const key = normalizeCrewNameKey(name);
  const matches = anchors.filter((a) => a.name === key);
  return matches.length === 1 ? matches[0]!.anchor : null;
}
