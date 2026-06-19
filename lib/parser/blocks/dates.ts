/**
 * DATES block parser (§2.3).
 *
 * Extracts travelIn, set, showDays[], and travelOut from a raw markdown string.
 * Returns ISO 'YYYY-MM-DD' strings for all date values.
 *
 * Supported template versions:
 *   v4  — DATES table has 5 columns: [DATES, label, DAY, DATE, TIME/AGENDA].
 *          Labels: TRAVEL IN, SET, SHOW DAY N, TRAVEL OUT
 *   v2  — Same 5-col structure but labels may be: TRAVEL (first = in, last = out),
 *          SET, SHOW DAY N, TRAVEL / SET (combined travel+set day)
 *   v1  — 2-col DATES table: [label, date+extra-text].
 *          Labels: Travel, Set, Show, Travel
 *
 * All date parsing is pure regex + Date construction — no date library dependency.
 */

import { parseTableRows, clean, presence, normalizeDate } from "./_helpers";
import type { ShowRow } from "@/lib/parser/types";
import { type ParseAggregator, emitEmptySection } from "@/lib/parser/warnings";

// ── Label classification ──────────────────────────────────────────────────────

type DateRowKind =
  | "travel_in"
  | "travel_out"
  | "set"
  | "travel_set" // combined "TRAVEL / SET" row
  | "show_day"
  | "unknown";

function classifyLabel(label: string): DateRowKind {
  const u = label.toUpperCase().trim();

  if (/TRAVEL\s*\/\s*SET/.test(u)) return "travel_set";
  if (/^SHOW/.test(u)) return "show_day";
  if (/TRAVEL\s+IN/.test(u)) return "travel_in";
  if (/TRAVEL\s+OUT/.test(u)) return "travel_out";
  // Plain "TRAVEL" — caller disambiguates first vs. last occurrence
  if (/^TRAVEL$/.test(u)) return "travel_out"; // sentinel overridden below
  if (/^SET$/.test(u)) return "set";

  return "unknown";
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseDates(
  markdown: string,
  version: "v1" | "v2" | "v4",
   
  agg?: ParseAggregator,
): ShowRow["dates"] {
  const result: ShowRow["dates"] = {
    travelIn: null,
    set: null,
    showDays: [],
    travelOut: null,
    loadIn: null,
  };

  // v2 can still have a 2-col DATES table (e.g. 2024-05-east-coast-family-office),
  // detected by whether the first DATES data row has only 2 cells.
  const out =
    version === "v1" || isV1ShapedDatesBlock(markdown)
      ? parseV1Dates(markdown, result)
      : parseV2V4Dates(markdown, result);

  // D1: the dates object is fixed-shape (never null), so an absent DATES block and
  // a present-but-unparsed one look identical to the caller. Re-probe for a DATES
  // header row and fail loud when one exists but no date resolved (e.g. trailing
  // free-text qualifiers like "- AFTER 8PM" defeated every row).
  const datesEmpty = !out.travelIn && !out.set && out.showDays.length === 0 && !out.travelOut;
  const hasDatesHeader = parseTableRows(markdown).some(
    (r) => clean(r[0] ?? "").toUpperCase() === "DATES",
  );
  if (datesEmpty && hasDatesHeader) emitEmptySection(agg, "dates");
  return out;
}

// ── Shape detection ───────────────────────────────────────────────────────────

/**
 * Returns true if the DATES block in this markdown uses the 2-col shape
 * (label | date+text) rather than the 5-col shape (DATES | label | DAY | DATE | agenda).
 *
 * Used to handle the 2024-05-east-coast fixture which detectVersion() correctly
 * classifies as v2 (it has "Hotal Contact Info") but whose DATES table predates
 * the 5-col structure introduced in later v2 sheets.
 */
function isV1ShapedDatesBlock(markdown: string): boolean {
  const rows = parseTableRows(markdown);
  let found = false;
  for (const row of rows) {
    if (!found) {
      if (clean(row[0] ?? "").toUpperCase() === "DATES") found = true;
      continue;
    }
    // First non-empty data row after DATES header.
    if (row.length === 0) continue;
    // v1 shape: the date LABEL sits in col 0 (e.g. "Travel"/"Set"/"Show").
    // Don't gate on an exact 2-col width — the exporter emits a trailing
    // qualifier column (e.g. `| Travel | 5/13/24 | - SAME DAY AS SET |`), so a
    // v1 block can be 3 cells wide. Gate on col 0 being a date label instead.
    const col0 = clean(row[0] ?? "").toUpperCase();
    if (/^(TRAVEL|SET|SHOW)\b/.test(col0)) return true;
    // 5-col (v2/v4) shape: cell[0] is empty, cell[1] is the label.
    return false;
  }
  return false;
}

// ── v1 parser ─────────────────────────────────────────────────────────────────

function parseV1Dates(markdown: string, result: ShowRow["dates"]): ShowRow["dates"] {
  const rows = parseTableRows(markdown);
  let inDatesBlock = false;
  let travelCount = 0;

  for (const row of rows) {
    if (!inDatesBlock) {
      if (clean(row[0] ?? "").toUpperCase() === "DATES") {
        inDatesBlock = true;
      }
      continue;
    }

    if (row.length < 2) continue;

    const label = clean(row[0] ?? "");
    const rawValue = clean(row[1] ?? "");
    if (!label && !rawValue) continue;

    const labelU = label.toUpperCase();
    // Non-dates label in column 0 = left the DATES block
    if (label && !["TRAVEL", "SET", "SHOW", "DATES"].includes(labelU) && !/^SHOW/.test(labelU)) {
      break;
    }

    if (!label || !rawValue) continue;

    if (labelU === "TRAVEL") {
      travelCount++;
      const iso = normalizeDate(rawValue);
      if (travelCount === 1) {
        result.travelIn = iso;
      } else {
        result.travelOut = iso;
      }
    } else if (labelU === "SET") {
      result.set = normalizeDate(rawValue);
    } else if (/^SHOW/.test(labelU)) {
      const allDates = extractAllDates(rawValue);
      for (const iso of allDates) {
        if (!result.showDays.includes(iso)) {
          result.showDays.push(iso);
        }
      }
    }
  }

  result.showDays.sort();
  return result;
}

// ── v2/v4 parser ──────────────────────────────────────────────────────────────

function parseV2V4Dates(markdown: string, result: ShowRow["dates"]): ShowRow["dates"] {
  const rows = parseTableRows(markdown);
  let inDatesBlock = false;
  const plainTravelRows: Array<string | null> = [];

  for (const row of rows) {
    if (!inDatesBlock) {
      if (clean(row[0] ?? "").toUpperCase() === "DATES") {
        inDatesBlock = true;
      }
      continue;
    }

    const firstCell = clean(row[0] ?? "");
    if (firstCell && firstCell.toUpperCase() !== "DATES") {
      break;
    }

    if (row.length < 4) continue;

    const label = clean(row[1] ?? "");
    const rawDate = clean(row[3] ?? "");
    if (!label) continue;

    const kind = classifyLabel(label);

    switch (kind) {
      case "travel_in":
        result.travelIn = presence(rawDate) ? normalizeDate(rawDate) : null;
        break;

      case "travel_out":
        if (label.toUpperCase() === "TRAVEL") {
          plainTravelRows.push(presence(rawDate) ? normalizeDate(rawDate) : null);
        } else {
          result.travelOut = presence(rawDate) ? normalizeDate(rawDate) : null;
        }
        break;

      case "travel_set": {
        const iso = presence(rawDate) ? normalizeDate(rawDate) : null;
        result.set = iso;
        if (!result.travelIn) result.travelIn = iso;
        const t = extractClockTime(row[4] ?? "");
        if (t && !result.loadIn) result.loadIn = t; // travel_set fills loadIn only if unset
        break;
      }

      case "set": {
        result.set = presence(rawDate) ? normalizeDate(rawDate) : null;
        const t = extractClockTime(row[4] ?? "");
        if (t) result.loadIn = t; // explicit SET row overrides any travel_set value
        break;
      }

      case "show_day": {
        const iso = presence(rawDate) ? normalizeDate(rawDate) : null;
        if (iso && !result.showDays.includes(iso)) {
          result.showDays.push(iso);
        }
        break;
      }

      case "unknown":
        break;
    }
  }

  // Disambiguate plain "TRAVEL" rows: first = travelIn, last = travelOut.
  // If travelIn is already set (e.g. from a TRAVEL / SET combined row), ALL
  // plain TRAVEL rows are treated as travelOut (take the last one).
  if (plainTravelRows.length >= 1) {
    if (!result.travelIn) {
      // No explicit travelIn yet: first plain TRAVEL = in, last = out
      result.travelIn = plainTravelRows[0] ?? null;
      if (plainTravelRows.length >= 2) {
        result.travelOut = plainTravelRows[plainTravelRows.length - 1] ?? null;
      }
    } else {
      // travelIn already known (explicit TRAVEL IN or TRAVEL/SET): last plain TRAVEL = out
      result.travelOut = plainTravelRows[plainTravelRows.length - 1] ?? null;
    }
  }

  result.showDays.sort();
  return result;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Extract a clock time (HH:MM with optional AM/PM) from a free-text TIME cell.
 * Position-independent: "12:30 PM LOAD IN" and "Load In: 7:00 PM" both match;
 * cells with no HH:MM ("LOAD IN", "AFTER 8PM") → null. §4.4 / §9 test 4.
 */
function extractClockTime(raw: string): string | null {
  const c = clean(raw);
  if (!c) return null;
  const m = c.match(/\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/);
  if (!m) return null;
  return m[0].replace(/\s+/g, " ").replace(/([AaPp][Mm])$/, (s) => s.toUpperCase()).trim();
}

function extractAllDates(text: string): string[] {
  const results: string[] = [];
  const re =
    /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s*)?(\d{1,2})\/(\d{1,2})\/(\d{2,4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Route through normalizeDate to enforce calendar-validity (rejects Feb 30, Apr 31, etc.)
    const iso = normalizeDate(m[0]);
    if (iso !== null) {
      results.push(iso);
    }
  }
  return results;
}
