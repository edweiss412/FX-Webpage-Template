import type { AgendaEntry, ParseWarning } from "../types";
import { clean, normalizeDate, parseTableRows } from "./_helpers";
import { agendaGridMalformed } from "./agendaWarnings";

export type ParseAgendaResult = {
  runOfShow: Record<string, AgendaEntry[]> | undefined;
  warnings: ParseWarning[];
};

const WEEKDAYS = new Set([
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
]);

// ── SINGLE NORMALIZATION BOUNDARY (R13 — closes the markdown-escape class) ──
// parseTableRows returns cells that are trimmed but NOT unescaped — the live
// exporter emits backslash-escaped cells: `\#REF\!` / `\#N/A` / `\#NUM\!` in DATE
// & day-name banners (fixtures/shows/exporter-xlsx/consultants.md:236-237,
// rpas.md:237, east-coast.md:4) and `FLIGHT\#` in the token-header (consultants:238).
// EVERY downstream detector + value read MUST operate on cells passed through
// `clean()` (strips `\(.)` escapes + trims) so NO detector ever sees a raw escaped
// cell. `cleanRows` is applied ONCE, right after parseTableRows; `normHeaderCell`
// also cleans (it runs on raw LINES during isolation, before cleanRows). This is the
// structural defense for the whole escape class — not a per-token REF_ERR_RE patch.
function cleanCell(cell: string): string {
  return clean(cell); // `s.replace(/\\(.)/g, "$1").trim()` — _helpers.ts:45
}
function cleanRows(rows: string[][]): string[][] {
  return rows.map((r) => r.map(cleanCell));
}

/** Strip a leading `<prefix>/` segment (incl `#REF!/`, `Wednesday/`), unescape, trim, uppercase. */
function normHeaderCell(cell: string): string {
  return clean(cell).replace(/^[^/]*\//, "").trim().toUpperCase();
}

function isTokenHeaderRow(cells: string[]): boolean {
  const norm = cells.map(normHeaderCell);
  const has = (t: string) => norm.includes(t);
  return has("NAME") && has("ARRIVAL") && (has("START") || has("FINISH") || has("TRT"));
}

function isTokenHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  const parts = t.split("|");
  const cells = parts.slice(1, parts.length - 1).map((s) => s.trim());
  return isTokenHeaderRow(cells);
}

/**
 * Isolate the AGENDA table's OWN contiguous markdown block — the run of `|…|`
 * lines that CONTAINS the token-header — bounded above/below by a blank line, a
 * non-pipe line, or EOF. The exporter separates tables with a blank row, so the
 * AGENDA table is the maximal pipe-line run around its token-header. Returns the
 * block's markdown (token-header + DATE/day-name/data rows), or undefined if no
 * token-header line exists. This is what prevents the walk from running INTO the
 * following ROOM DIMENSIONS / PULL SHEET tables (whose absolute-column cells
 * would otherwise emit as bogus AgendaEntry titles).
 */
function isolateAgendaTable(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  const hdr = lines.findIndex(isTokenHeaderLine);
  if (hdr === -1) return undefined;
  const isPipe = (l: string) => l.trim().startsWith("|");
  let start = hdr;
  while (start - 1 >= 0 && isPipe(lines[start - 1]!)) start--;
  let end = hdr; // inclusive
  while (end + 1 < lines.length && isPipe(lines[end + 1]!)) end++;
  return lines.slice(start, end + 1).join("\n");
}

// ── Structural-row identification (R7/R8 — banner rows must NEVER parse as data) ──
// The converter promotes a VARYING banner to the md-table header (filled East
// Coast promotes day-TYPE; other shapes promote DATE), and parseTableRows keeps
// the md-header as just another row — so the DATE / day-name / day-TYPE / token-
// header rows can appear ABOVE OR BELOW each other in `rows`. The data walk must
// therefore skip structural rows BY IDENTITY (content), not by `headerIdx+1`
// position — else a banner row read at absolute columns emits a bogus title.
//
// R8 — DETECTION IS SEPARATED FROM VALUE-VALIDITY. A row is the structural DATE
// banner if its NON-BLANK cells are date-SHAPED — each is `M/D/YY` (normalizes)
// OR a `#REF!`/error token — regardless of whether ANY value normalizes. (Spec
// §4.1: `#REF!` appears in the standardized-template DATE/day-name banner cells.)
// So an all-`#REF!` DATE banner is detected as structural (→ never walked as data
// → no bogus `#REF!` titles) AND still seeds block spans (→ blocks are created →
// resolveBlock runs → AGENDA_BLOCK_UNRESOLVED/AGENDA_DAY_AMBIGUOUS DO emit, never
// a silent drop). The OLD value-only `normalizeDate(...) >= 2` test missed this.

// Spreadsheet error tokens (POST-clean — backslashes already stripped by cleanRows).
// Liberal: covers #REF!, #N/A, #VALUE!, #DIV/0!, #NAME?, #NUM!, #NULL!, with or
// without the trailing !/?. (cleanRows turns `\#REF\!` → `#REF!` before this runs.)
const REF_ERR_RE = /^#(REF|N\/A|VALUE|DIV\/0|NAME|NUM|NULL)[!?]?$/i;
function isDateShapedCell(c: string): boolean {
  const t = c.trim(); // cells already cleaned at the boundary; trim is belt-and-suspenders
  return t === "" || normalizeDate(t) !== null || REF_ERR_RE.test(t);
}
/**
 * Structural DATE-banner detector (shape, NOT value): a row whose non-blank cells
 * are ALL date-shaped (M/D/YY or #REF!/error) AND that carries ≥2 such non-blank
 * cells AND ≥1 that is an actual error/date token (so a fully-blank row or a free-
 * text row is not mistaken for the banner). Cross-checked at the caller against the
 * token-header START columns + the day-name/day-TYPE alignment.
 */
function isDateBannerRow(cells: string[]): boolean {
  const nonBlank = cells.filter((c) => c.trim() !== "");
  if (nonBlank.length < 2) return false;
  if (!nonBlank.every(isDateShapedCell)) return false;
  // must contain at least one date-or-error token (not e.g. all empty handled above)
  return nonBlank.some((c) => normalizeDate(c.trim()) !== null || REF_ERR_RE.test(c.trim()));
}
function isDayNameRow(cells: string[]): boolean {
  // day-NAME banner: ≥2 cells that are a weekday OR a `#REF!`/error (template copies
  // carry #REF! in the day-name banner too) — shape, not pure value.
  const flagged = cells.filter((c) => {
    const t = c.trim();
    return WEEKDAYS.has(t.toUpperCase()) || REF_ERR_RE.test(t);
  });
  // require ≥1 real weekday so a #REF!-only row isn't double-counted as the day-name
  // banner (it's the DATE banner); the date-banner detector already covers all-#REF!.
  return flagged.length >= 2 && cells.some((c) => WEEKDAYS.has(c.trim().toUpperCase()));
}
const DAY_TYPE_RE = /^(TRAVEL DAY|SET DAY|DAY\s+\d+)$/i;
function isDayTypeRow(cells: string[]): boolean {
  return cells.filter((c) => DAY_TYPE_RE.test(c.trim())).length >= 2;
}

/** Indices in `rows` that are STRUCTURAL (token-header, DATE banner, day-name, day-TYPE) — never data. */
function structuralRowIndices(rows: string[][]): Set<number> {
  const s = new Set<number>();
  rows.forEach((cells, i) => {
    if (
      isTokenHeaderRow(cells) || isDateBannerRow(cells) ||
      isDayNameRow(cells) || isDayTypeRow(cells)
    ) {
      s.add(i);
    }
  });
  return s;
}

export function parseAgenda(markdown: string): ParseAgendaResult {
  const block = isolateAgendaTable(markdown);
  if (block === undefined) {
    return { runOfShow: undefined, warnings: [agendaGridMalformed(0)] };
  }
  // THE normalization boundary (R13): clean ONCE here. Everything below — structural
  // detection, span location, date resolution, the data walk — consumes `rows`, so
  // no detector ever sees a raw escaped cell (`\#REF\!` → `#REF!`, `FLIGHT\#` → `FLIGHT#`).
  const rows = cleanRows(parseTableRows(block)); // ONLY the AGENDA table's rows, cleaned
  const headerIdx = rows.findIndex(isTokenHeaderRow);
  const structural = structuralRowIndices(rows); // token-header + DATE banner + day-name + day-TYPE
  // Data rows = every row that is NOT structural (position-independent — banners
  // may sit above OR below the token-header). Day resolution + data walk: Tasks 1.4–1.6.
  void headerIdx; void structural; // used by Tasks 1.4–1.6
  return { runOfShow: {}, warnings: [] };
}
