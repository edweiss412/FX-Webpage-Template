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

// The two anchor NAMESPACES a warning's `blockRef.kind` can join on. `UNKNOWN_FIELD` now
// comes from a single emitter — the content-keyed near-miss detector
// (lib/parser/fieldNearMiss.ts), called once at the lib/parser/index.ts document seam —
// and its anchor-namespace mapping (field-near-miss spec §2.2) emits exactly these two
// kinds for venue and DETAILS-family blocks, plus each other block's own normalized
// opener label. Those other kinds match no entry here and resolve null, which is the
// documented-safe outcome: they were never anchorable, since this scan only ever built
// anchors inside VENUE / DETAILS-family blocks.
//
// The two sides are deliberately NOT the same set, and the asymmetry is safe in one
// direction only. The detector's DETAILS family is the five spellings in event.ts's
// SECTION_HEADER_TOKENS (it also carries "DETAILS/ROOM DIAGRAM" and "GS DETAILS (FOR
// BOTH)"); the header regexes below stay narrower for the reason that follows. A block
// this scan does not recognize yields no anchors and the warning degrades to null; a
// detector kind narrower than these would strand rows this scan DID anchor.
//
// Headers mirror REGION_ANCHOR_SPEC (lib/sheet-links/buildSheetDeepLink.ts) but are
// anchored EXACT at both ends ($). REGION_ANCHOR_SPEC's details header is prefix-only,
// which is fine for a whole-block region rect; here a FALSE-EARLY header match (e.g. a
// field row "Details Notes") would start the scan at the wrong row and could, under a
// (kind,label,value) coincidence, yield a wrong-cell link. For the never-wrong-cell
// guarantee (spec §5.1.1) a MISSED header degrades to null (safe) while a false-early
// one does not — so exact matching is strictly safer. The real headers are standalone
// "DETAILS" / "EVENT DETAILS" / "GS DETAILS" cells, which all match exactly.
const BLOCKS: { kind: string; header: RegExp }[] = [
  { kind: "venue", header: /^VENUE$/i },
  { kind: "details", header: /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)$/i },
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

// TERMINATORS entries that are ALSO known EVENT DETAILS field labels
// (lib/parser/blocks/event.ts CANONICAL_KEY_MAP: `diagrams`, `dress`; event.ts
// documents diagrams as a field, NOT a terminator). Inside a 'details' block these
// are FIELD rows, not section openers, so they must not terminate the scan. v4
// template EVENT DETAILS blocks OPEN with a 'DIagrams' row (fixtures/shows/
// exporter-xlsx/{fintech,fixed-income,rpas}.md), so treating DIAGRAMS as a
// terminator broke the scan at headerRow+1 and yielded ZERO details anchors (#217).
// They stay terminators for 'venue'. Over-inclusion past a real DIAGRAMS/DRESS
// section is safe by the module's exactly-one-match guard, so excluding them for
// 'details' can never produce a wrong cell.
const DETAILS_NON_TERMINATOR_FIELDS = new Set(["DIAGRAMS", "DRESS"]);

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
      const rawHeaderLine = grid.cell(r, first.col).split(/\r?\n/)[0] ?? "";
      const firstLine = rawHeaderLine.trim().toUpperCase(); // canonicalize-exempt: sheet section header, not an email
      // DIAGRAMS/DRESS open sections for 'venue' but are field rows for 'details'.
      if (
        TERMINATORS.has(firstLine) &&
        !(kind === "details" && DETAILS_NON_TERMINATOR_FIELDS.has(firstLine))
      )
        break; // next section
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
