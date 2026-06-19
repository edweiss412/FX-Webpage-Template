import type { AgendaEntry, ParseWarning, ShowRow } from "../types";
import { clean, normalizeDate, parseTableRows } from "./_helpers";
import { agendaGridMalformed, agendaBlockUnresolved, agendaDayAmbiguous } from "./agendaWarnings";

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

export type AgendaBlock = {
  startCol: number;
  endCol: number; // exclusive
  dateCell: string | undefined;
  dayName: string | undefined; // from day-NAME row OR header prefix
};

// Find the DATE / day-name banner rows BY CONTENT across the WHOLE isolated table
// (R7: position-independent — they may be BELOW the token-header). These are the
// SAME shape-based detectors structuralRowIndices uses (Task 1.3) — ONE source of
// truth, so "what is the DATE banner" is identical for span-resolution and for the
// data-walk skip. They detect the banner by SHAPE (#REF! included, R8), so the
// rows are found even when no value normalizes.
function findDateRow(rows: string[][]): string[] | undefined {
  return rows.find(isDateBannerRow);
}
function findDayNameRow(rows: string[][]): string[] | undefined {
  return rows.find(isDayNameRow);
}

/**
 * Build per-day SHOW blocks. **Spans come from the TOKEN-HEADER's START columns
 * (R8 — value-independent), NOT from DATE-cell validity.** The token-header is the
 * reliably-present anchor (spec §4.1); every show day is the 6-col group
 * `START|FINISH|TRT|TITLE|ROOM|AV`, so each `START` column in the token-header
 * opens exactly one show block `[startCol, startCol+6)`. The DATE banner + day-name
 * banner supply RESOLUTION inputs at each block's start column (whatever their
 * values — `#REF!`/blank tolerated; resolved in Task 1.5). Travel (`NAME|ARRIVAL|
 * FLIGHT#`) and set (`TIME|TITLE|ROOM`) groups have NO `START` column → no block.
 */
function locateBlocks(rows: string[][], header: string[], headerIdx: number): AgendaBlock[] {
  const dateRow = findDateRow(rows);     // whole table, shape-detected (#REF! ok)
  const nameRow = findDayNameRow(rows);  // whole table
  const normHeader = header.map(normHeaderCell);
  const blocks: AgendaBlock[] = [];

  // Prefix-form (e.g. `Wednesday/START`, `#REF!/NAME`): no separate DATE/day-name
  // row; the day-name lives in the header-cell prefix. Detect by ANY header cell
  // carrying a `<prefix>/START`. Otherwise use the plain token-header START columns.
  const prefixForm = header.some((c) => c.includes("/") && normHeaderCell(c) === "START");

  if (prefixForm) {
    for (let c = 0; c < header.length; c++) {
      const cell = header[c] ?? "";
      if (normHeaderCell(cell) !== "START") continue; // START token after prefix-strip
      const slash = cell.indexOf("/");
      const prefix = slash === -1 ? undefined : cell.slice(0, slash).trim();
      // a #REF! prefix is not a usable day-name; leave dayName undefined → resolve fails → UNRESOLVED
      const dayName = prefix && WEEKDAYS.has(prefix.toUpperCase()) ? prefix : undefined;
      blocks.push({ startCol: c, endCol: c + 6, dateCell: undefined, dayName });
    }
  } else {
    // Plain form: one show block per START column in the token-header.
    for (let c = 0; c < normHeader.length; c++) {
      if (normHeader[c] !== "START") continue;
      blocks.push({
        startCol: c,
        endCol: c + 6, // the 6-col START|FINISH|TRT|TITLE|ROOM|AV group
        dateCell: dateRow?.[c]?.trim(),   // may be M/D/YY, #REF!, or undefined — resolved in Task 1.5
        dayName: nameRow?.[c]?.trim(),    // may be a weekday, #REF!, or undefined
      });
    }
  }

  // Confirm each block is a real SHOW-DAY group: its 6-col span has START+FINISH+TRT
  // (guards a stray duplicate `START` label or a truncated tail group).
  return blocks.filter((b) => {
    const span = normHeader.slice(b.startCol, b.endCol);
    return span.includes("START") && span.includes("FINISH") && span.includes("TRT");
  });
}

const ISO_WEEKDAY = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
function weekdayOfIso(iso: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return ISO_WEEKDAY[d.getUTCDay()];
}

type Resolved = { iso: string } | { skip: "ambiguous" | "unresolved" };

// Resolve a block's ISO date (R8: dateCell may be a real M/D/YY, a `#REF!`/error,
// or undefined — all handled here, NOT at detection). Banner value wins when it
// normalizes; otherwise the day-name → showDays-ONLY unique-match fallback (§4.1
// step 3 / R7); zero/multiple matches → skip (never guess — R2).
function resolveBlock(block: AgendaBlock, dates: ShowRow["dates"] | undefined): Resolved {
  const banner = normalizeDate(block.dateCell ?? ""); // `#REF!`/blank → null → fallback
  if (banner) return { iso: banner };
  const dayName = block.dayName?.toUpperCase();
  const showDays = dates?.showDays ?? [];
  if (!dayName || !WEEKDAYS.has(dayName)) return { skip: "unresolved" }; // `#REF!`/missing day-name
  const matches = showDays.filter((iso) => weekdayOfIso(iso) === dayName);
  if (matches.length === 1) return { iso: matches[0]! };
  if (matches.length >= 2) return { skip: "ambiguous" };
  return { skip: "unresolved" };
}

/**
 * Testable entry: isolate the AGENDA table, then locate + classify its show-day
 * blocks. Returns show-day blocks only (travel/set filtered). Returns [] when the
 * grid is unlocatable OR carries no show-day span. (parseAgenda uses the same
 * locateBlocks internally; this thin wrapper pins the boundary/classification
 * contract for Task 1.4's red→green cycle.)
 *
 * R14 — this helper MUST apply the SAME `cleanRows` normalization boundary as
 * parseAgenda (R13): it feeds rows into the post-clean detectors (REF_ERR_RE /
 * weekday / date / token-header), so passing RAW rows would leave escaped fixture
 * cells (`\#REF\!`, `FLIGHT\#`) invisible on the helper path and let a Task-1.4
 * test green while the surface mishandles escaped fixtures. `cleanRows` is
 * idempotent, so cleaning here AND in parseAgenda is safe.
 */
export function locateAgendaShowBlocks(markdown: string): AgendaBlock[] {
  const block = isolateAgendaTable(markdown);
  if (block === undefined) return [];
  const rows = cleanRows(parseTableRows(block)); // SAME normalization boundary as parseAgenda (R13/R14)
  const headerIdx = rows.findIndex(isTokenHeaderRow);
  if (headerIdx === -1) return [];
  return locateBlocks(rows, rows[headerIdx]!, headerIdx);
}

export function parseAgenda(markdown: string, dates?: ShowRow["dates"]): ParseAgendaResult {
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
  const blocks = locateBlocks(rows, rows[headerIdx]!, headerIdx);
  // Data rows = every row that is NOT structural (position-independent — banners
  // may sit above OR below the token-header). Data walk (entries): Task 1.6.
  void structural; // consumed by Task 1.6

  // Step 3 (§4.1) — resolve each block's ISO date. R8: blocks exist at every show-day
  // START column even when the banner is all-`#REF!`, so resolveBlock ALWAYS runs and a
  // degraded banner emits its warning (UNRESOLVED/AMBIGUOUS) instead of a silent drop.
  // Skipped blocks create NO runOfShow key (never guess — R2). Entries are Task 1.6.
  const runOfShow: Record<string, AgendaEntry[]> = {};
  const warnings: ParseWarning[] = [];
  blocks.forEach((b, index) => {
    const resolved = resolveBlock(b, dates);
    if ("iso" in resolved) {
      runOfShow[resolved.iso] = []; // entries populated in Task 1.6
    } else if (resolved.skip === "ambiguous") {
      warnings.push(agendaDayAmbiguous(index));
    } else {
      warnings.push(agendaBlockUnresolved(index));
    }
  });
  return { runOfShow, warnings };
}
