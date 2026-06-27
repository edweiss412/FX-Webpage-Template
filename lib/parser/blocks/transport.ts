/**
 * TRANSPORTATION block parser (§2.8).
 *
 * Returns TransportationRow | null.
 *
 * Three layout variants in the corpus:
 *
 * 1. v4 (2026+): header row | TRANSPORTATION/Equipment Transporter | TRANSPORTATION/<name> | PHONE/<phone> | EMAIL/<email> | LICENSE |
 *    Followed by: Vehicle, License Plate, Color, Parking, then schedule rows with DATE/TIME columns.
 *    Schedule rows: label in col0, date in col1, time in col2. Any passengers/assigned names
 *    appear in a col that matches a comma-separated name list.
 *
 * 2. v2 (2025): header row | TRANSPORTATION | NAME | PHONE |
 *    Followed by: Driver, Vehicle, Parking, schedule rows (Pick Up Warehouse, Drop Off Venue, etc.)
 *    with date+time combined in col1.
 *
 * 3. v1 (2024): header row | Driver | <name> | <phone> |
 *    Followed by: Parking, and schedule-like rows.
 *
 * assigned_names (§6.7 / Round-50/51 amendment): EVERY schedule entry MUST have
 * `assigned_names: string[]`. Empty array when no passenger names are found.
 * The extractor scans each row for a cell that looks like a comma-/&-separated list
 * of crew-name tokens and uses it to populate assigned_names.
 *
 * Email canonicalization (AGENTS.md §1.3): driver_email routes through canonicalize().
 */

import type { TransportationRow, TransportScheduleEntry, CrewMemberRow } from "../types";
import { type ParseAggregator, emitEmptySection } from "@/lib/parser/warnings";
import { clean, presence, normalizeDate, splitRow, inferShowYear } from "./_helpers";
import { canonicalize } from "@/lib/email/canonicalize";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";

/**
 * Non-transport block labels that signal the transport schedule has ended.
 * When the v4 parser encounters a row whose first cell matches one of these
 * (case-insensitive), it stops appending to schedule.
 */
const TRANSPORT_BLOCK_TERMINATORS = new Set([
  "coi",
  "proposal",
  "invoice",
  "invoice notes",
  "po#",
  "po #",
  "venue contact info",
  "hotel contact info",
  "hotal contact info",
  "in house av",
  "event details",
  "event name:",
  "title of event",
  "additional event names if applicable",
  "main",
  "secondary",
  "equipment",
  "agenda link",
  "diagrams",
  "diagram",
  "opening reel",
  "virtual audience",
  "gooseneck",
  "led",
  "backdrop / scenic",
  "backdrop/scenic",
  "stage size",
  "venue notes",
]);

/**
 * Regex patterns that a valid transport schedule stage must match.
 * Rows that pass terminator detection but don't match any of these are skipped.
 */
const TRANSPORT_STAGE_PATTERNS = [
  /pick\s*up/i,
  /drop\s*off/i,
  /transport/i,
  /travel/i,
  /load\s*(in|out|at)?/i,
  /unload/i,
  /\bset\b/i,
  /\bshow\b/i,
  /\bstrike\b/i,
  /rental\s*(pickup|return)/i,
  /day\s*\d+/i,
  /\b\d{1,2}\/\d{1,2}/, // date-like stage
];

function isTransportStage(stage: string): boolean {
  return TRANSPORT_STAGE_PATTERNS.some((re) => re.test(stage));
}

// v2/v1 combined date+time schedule labels
const V2_SCHEDULE_LABELS = new Set([
  "rental pickup",
  "load at warehouse",
  "pick up warehouse",
  "load in at venue",
  "pick up venue",
  "drop off venue",
  "drop off warehouse",
  "unload at warehouse",
  "rental return",
]);

// Uppercase schedule labels the v2 fuzzy fallback recognizes toward — DERIVED from
// V2_SCHEDULE_LABELS (single source of truth; lib/parser/typoVocabRegistry.ts imports this
// exact const so the registry can't drift). All members are long (>=13 chars), so minLen:5
// never trips; it is passed for convention + robustness.
export const TRANSPORT_SCHEDULE_VOCAB: readonly string[] = [...V2_SCHEDULE_LABELS].map((s) =>
  s.toUpperCase(),
);
const TRANSPORT_SCHEDULE_GATE_OPTS = { minLen: 5, tieAbort: true } as const;

export function parseTransportation(
  markdown: string,
  _version: "v1" | "v2" | "v4",
  crewMembers?: CrewMemberRow[],

  agg?: ParseAggregator,
): TransportationRow | null {
  // A sub-parser returns a row ONLY when its header matched (else null), so the
  // first non-null result is the recognized section. `??` is lazy — later parsers
  // run only if the earlier header didn't match.
  const row =
    parseV4Transport(markdown, crewMembers) ??
    parseV2Transport(markdown, crewMembers, agg) ??
    parseV1Transport(markdown, crewMembers);

  // D1: a non-null-but-all-empty row means the header was recognized yet no field
  // parsed (e.g. the v4 [label,value,PHONE,EMAIL,LICENSE] shape went unmapped) —
  // fail loud. null = no header matched → not an empty section, no warning.
  if (row && isEmptyTransport(row)) emitEmptySection(agg, "transportation");
  return row;
}

function isEmptyTransport(row: TransportationRow): boolean {
  return (
    row.driver_name === null &&
    row.driver_phone === null &&
    row.driver_email === null &&
    row.vehicle === null &&
    row.license_plate === null &&
    row.color === null &&
    row.parking === null &&
    row.notes === null &&
    row.schedule.length === 0
  );
}

// ── v4 parser ─────────────────────────────────────────────────────────────────

function parseV4Transport(
  markdown: string,
  crewMembers?: CrewMemberRow[],
): TransportationRow | null {
  // Accept BOTH the slash header (raw: `TRANSPORTATION/<name> | PHONE/<phone> |
  // EMAIL/<email>`) AND the exporter's plain column-duplicated header
  // (`| TRANSPORTATION | TRANSPORTATION | PHONE | EMAIL | …`). The EMAIL column
  // is REQUIRED so this never claims ria's no-email 3-col header (B3 routes that
  // to v2). Capture groups carry the slash content (undefined in the plain form).
  const headerRe =
    /^\|\s*TRANSPORTATION(?:\/[^|]*)?\s*\|\s*TRANSPORTATION(?:\/([^|]*?))?\s*\|\s*PHONE(?:\/([^|]*?))?\s*\|\s*EMAIL(?:\/([^|]*?))?\s*\|/im;
  const hm = headerRe.exec(markdown);
  if (!hm) return null;

  // Extract the table block starting from header
  const section = markdown.slice(hm.index);
  const lines = section.split("\n");
  const tableLines: string[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|") && tableLines.length > 0) break;
    if (line.trim().startsWith("|")) tableLines.push(line.trim());
  }

  // Driver, two sources: the slash header encodes it inline (hm[1] defined);
  // the plain (exporter) header leaves it on the first Equipment Transporter /
  // Load In: / Driver body row.
  let driverName: string | null = null;
  let driverPhone: string | null = null;
  let driverEmail: string | null = null;
  if (hm[1] !== undefined) {
    driverName = presence(clean(hm[1]));
    driverPhone = hm[2] !== undefined ? presence(clean(hm[2])) : null;
    driverEmail = canonicalize(hm[3] !== undefined ? clean(hm[3]) : "");
  } else {
    for (const line of tableLines) {
      const c = splitRow(line);
      if (/^(?:equipment transporter|load in:?|driver)$/i.test(clean(c[0] ?? ""))) {
        driverName = presence(clean(c[1] ?? ""));
        driverPhone = presence(clean(c[2] ?? ""));
        driverEmail = canonicalize(clean(c[3] ?? ""));
        break;
      }
    }
  }

  // Detect column positions from the header row itself
  // Header: | TRANSPORTATION/... | TRANSPORTATION/Name | PHONE/xxx | EMAIL/xxx | LICENSE |
  const dateColIdx = detectDateColIdx(tableLines);
  const timeColIdx = dateColIdx + 1;
  const passengersColIdx = detectPassengersColIdx(tableLines);

  // Now parse rows
  let vehicle: string | null = null;
  let licensePlate: string | null = null;
  let color: string | null = null;
  let parking: string | null = null;
  let notes: string | null = null;
  const schedule: TransportScheduleEntry[] = [];

  // Track if we've seen the DATE/TIME subheader
  let seenDateHeader = false;

  for (let i = 1; i < tableLines.length; i++) {
    const line = tableLines[i]!;
    const cells = splitRow(line);
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue; // separator

    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    // DATE subheader row
    if (/^DATE$/i.test(col1) || /^DATE$/i.test(cells[dateColIdx] ?? "")) {
      seenDateHeader = true;
      continue;
    }

    const label = col0.toLowerCase();

    // Metadata rows
    if (label === "vehicle") {
      vehicle = presence(col1);
      continue;
    }
    if (label === "license plate") {
      licensePlate = presence(col1);
      continue;
    }
    if (label === "color") {
      color = presence(col1);
      continue;
    }
    if (label === "parking") {
      parking = presence(col1);
      continue;
    }
    if (label === "notes") {
      notes = presence(col1);
      continue;
    }

    // Skip load-out secondary driver row (col0 like "Load Out:")
    if (/^load\s+out\s*:/i.test(col0)) continue;

    // Skip blank rows
    if (!col0 && !col1) continue;

    // Skip the header itself
    if (/^TRANSPORTATION\//i.test(col0)) continue;

    // Block-boundary detection: stop when we hit a known non-transport section label
    if (seenDateHeader && TRANSPORT_BLOCK_TERMINATORS.has(col0.toLowerCase())) break;

    // Schedule rows: after seeing DATE header, or when col0 matches known stage labels
    if (seenDateHeader || V2_SCHEDULE_LABELS.has(label)) {
      // Skip rows that don't look like transport stages (allowlist guard)
      if (seenDateHeader && col0 && !isTransportStage(col0)) continue;

      const dateVal = cells[dateColIdx] !== undefined ? clean(cells[dateColIdx]!) : col1;
      const timeVal = cells[timeColIdx] !== undefined ? clean(cells[timeColIdx]!) : "";

      const date = normalizeDate(dateVal);
      const time = presence(timeVal);

      const assignedNames = extractAssignedNames(cells, passengersColIdx, crewMembers);

      if (col0) {
        schedule.push({ stage: col0, date, time, assigned_names: assignedNames });
      }
    }
  }

  return {
    driver_name: driverName,
    driver_phone: driverPhone,
    driver_email: driverEmail,
    vehicle,
    license_plate: licensePlate,
    color,
    parking,
    schedule,
    notes,
  };
}

// ── v2 parser ─────────────────────────────────────────────────────────────────

function parseV2Transport(
  markdown: string,
  crewMembers?: CrewMemberRow[],
  agg?: ParseAggregator,
): TransportationRow | null {
  // Match: | TRANSPORTATION | NAME | PHONE | (older) OR
  //        | TRANSPORTATION | TRANSPORTATION | PHONE | (exporter column-dup, ria).
  // Superset of the NAME form. Routing ria here (not v1) also captures its
  // Vehicle row and stops the `| Vehicle | … |` row leaking in as a schedule stage.
  const headerRe = /^\|\s*TRANSPORTATION\s*\|\s*(?:NAME|TRANSPORTATION)\s*\|\s*PHONE\s*\|/im;
  const hm = headerRe.exec(markdown);
  if (!hm) return null;

  const contextYear = inferShowYear(markdown);
  const section = markdown.slice(hm.index);
  const lines = section.split("\n");
  const tableLines: string[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|") && tableLines.length > 0) break;
    if (line.trim().startsWith("|")) tableLines.push(line.trim());
  }

  let driverName: string | null = null;
  let driverPhone: string | null = null;
  let vehicle: string | null = null;
  let parking: string | null = null;
  let notes: string | null = null;
  const schedule: TransportScheduleEntry[] = [];

  for (let i = 1; i < tableLines.length; i++) {
    const line = tableLines[i]!;
    const cells = splitRow(line);
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue;

    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");
    const col2 = clean(cells[2] ?? "");
    const label = col0.toLowerCase();

    if (label === "driver") {
      driverName = presence(col1);
      if (!driverPhone && col2) driverPhone = presence(col2);
      continue;
    }
    if (label === "vehicle") {
      vehicle = presence(col1);
      continue;
    }
    if (label === "parking") {
      parking = presence(col1);
      continue;
    }
    if (label === "notes") {
      notes = presence(col1);
      continue;
    }

    if (V2_SCHEDULE_LABELS.has(label)) {
      // v2 format: col1 = "date @ time" or just a date
      const { date, time } = parseV2DateTime(col1, contextYear);
      schedule.push({
        stage: col0,
        date,
        time,
        assigned_names: extractAssignedNames(cells, -1, crewMembers),
      });
    } else if (col0) {
      // Fuzzy recovery: a near-miss of a schedule label (Damerau<=1, tie-abort) is recognized
      // as a schedule row so the leg isn't dropped. Keep the operator's RAW label as `stage`
      // (we recover the entry, we don't rewrite crew-facing text) and warn. Metadata typos
      // (driver/vehicle/parking/notes) were already consumed above, and unrelated labels are
      // far from these long phrases, so this stays tight.
      const fix = gatedVocabCorrect(
        col0.toUpperCase(),
        TRANSPORT_SCHEDULE_VOCAB,
        TRANSPORT_SCHEDULE_GATE_OPTS,
      );
      if (fix?.corrected) {
        const { date, time } = parseV2DateTime(col1, contextYear);
        schedule.push({
          stage: col0,
          date,
          time,
          assigned_names: extractAssignedNames(cells, -1, crewMembers),
        });
        agg?.warnings.push({
          severity: "warn",
          code: "FIELD_LABEL_AUTOCORRECTED",
          message: `Read likely-misspelled transport schedule label '${col0}' as '${fix.match}'`,
          blockRef: { kind: "transportation" },
          rawSnippet: col0,
        });
      }
    }
  }

  return {
    driver_name: driverName,
    driver_phone: driverPhone,
    driver_email: null,
    vehicle,
    license_plate: null,
    color: null,
    parking,
    schedule,
    notes,
  };
}

// ── v1 parser ─────────────────────────────────────────────────────────────────

function parseV1Transport(
  markdown: string,
  _crewMembers?: CrewMemberRow[],
): TransportationRow | null {
  // Match: | Driver | <name> | <phone> |  (v1 has no TRANSPORTATION header)
  const headerRe = /^\|\s*Driver\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/im;
  const hm = headerRe.exec(markdown);
  if (!hm) return null;

  const contextYear = inferShowYear(markdown);
  const driverName = presence(clean(hm[1]!));
  const driverPhone = presence(clean(hm[2]!));

  // The exporter emits a `| Transportation | <vehicle> |` row just above the
  // Driver row (e.g. east-coast "Van"). The Driver-anchored slice below can't
  // see it, so look back from the Driver row, skipping blanks/separators, for
  // the first table row; capture col1 when its col0 is "Transportation". (Raw
  // v1 fixtures lack this row, so vehicle stays null there.)
  let vehicle: string | null = null;
  const aboveLines = markdown.slice(0, hm.index).split("\n");
  for (let i = aboveLines.length - 1; i >= 0; i--) {
    const t = (aboveLines[i] ?? "").trim();
    if (!t) continue;
    if (!t.startsWith("|")) break;
    const aboveCells = splitRow(t);
    if (aboveCells.every((c) => /^[\s:|*-]*$/.test(c))) continue; // separator row
    if (/^transportation$/i.test(clean(aboveCells[0] ?? ""))) {
      vehicle = presence(clean(aboveCells[1] ?? ""));
    }
    break;
  }

  const section = markdown.slice(hm.index);
  const lines = section.split("\n");
  const tableLines: string[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|") && tableLines.length > 0) break;
    if (line.trim().startsWith("|")) tableLines.push(line.trim());
  }

  let parking: string | null = null;
  let notes: string | null = null;
  const schedule: TransportScheduleEntry[] = [];

  for (let i = 1; i < tableLines.length; i++) {
    const line = tableLines[i]!;
    const cells = splitRow(line);
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue;

    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");
    const label = col0.toLowerCase();

    if (label === "parking") {
      parking = presence(col1);
      continue;
    }
    if (label === "notes") {
      notes = presence(col1);
      continue;
    }
    // Hotel Stays is a different block; stop if we hit it
    if (label === "hotel stays" || label === "hotel reservations" || label === "coi") break;

    if (col0 && col0 !== "Driver") {
      // Could be a schedule-like row
      const { date, time } = parseV2DateTime(col1, contextYear);
      schedule.push({
        stage: col0,
        date,
        time,
        assigned_names: [],
      });
    }
  }

  return {
    driver_name: driverName,
    driver_phone: driverPhone,
    driver_email: null,
    vehicle,
    license_plate: null,
    color: null,
    parking,
    schedule,
    notes,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Detect which column index holds the DATE value in a v4 transport table. */
function detectDateColIdx(tableLines: string[]): number {
  // Scan for a row where one cell is exactly "DATE"
  for (const line of tableLines) {
    const cells = splitRow(line);
    for (let i = 0; i < cells.length; i++) {
      if (/^DATE$/i.test(clean(cells[i] ?? ""))) return i;
    }
  }
  // Fallback: col1 (index 1)
  return 1;
}

/** Detect which column index holds passenger names (if any). */
function detectPassengersColIdx(tableLines: string[]): number {
  for (const line of tableLines) {
    const cells = splitRow(line);
    for (let i = 0; i < cells.length; i++) {
      if (/^passengers?$/i.test(clean(cells[i] ?? ""))) return i;
    }
  }
  return -1;
}

/**
 * Extract assigned_names from a row's cells.
 * Strategy:
 * 1. If passengersColIdx >= 0, use that cell.
 * 2. Otherwise, scan all cells for comma-/&-separated name-shaped tokens.
 * Always returns string[] (never null/undefined).
 */
function extractAssignedNames(
  cells: string[],
  passengersColIdx: number,
  crewMembers?: CrewMemberRow[],
): string[] {
  if (passengersColIdx >= 0) {
    // passengers column exists — use it exclusively (empty = no names)
    const raw = clean(cells[passengersColIdx] ?? "");
    if (!raw || raw === "-" || raw === "\\-") return [];
    return splitNames(raw, crewMembers);
  }

  // Scan all cells for name-shaped content.
  // Only use crew-context-validated matches (without context, stage labels like
  // "Pick Up Warehouse" would false-positive as names).
  if (crewMembers && crewMembers.length > 0) {
    // Skip col0 — it is the stage label ("Pick Up Warehouse" etc.), which
    // isNameLike would accept as a multi-word Title-Case "name" and return
    // before reaching the real assigned-crew column.
    for (let ci = 1; ci < cells.length; ci++) {
      const raw = clean(cells[ci] ?? "");
      if (!raw) continue;
      // Skip cells that look like dates, times, or single-word tokens
      if (/^\d{1,2}\/\d{1,2}/.test(raw)) continue;
      if (/^\d{1,2}:\d{2}/.test(raw)) continue;
      if (/^(AM|PM|TBD|N\/A|SENT)$/i.test(raw)) continue;
      const names = splitNames(raw, crewMembers);
      if (names.length > 0) return names;
    }
  }

  return [];
}

/**
 * Split a cell value into individual crew names.
 * Handles: "Alice Smith, Bob Jones", "Alice Smith & Bob Jones", "Carol White"
 */
function splitNames(raw: string, crewMembers?: CrewMemberRow[]): string[] {
  if (!raw) return [];

  const candidates = raw
    .split(/,\s*|&\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Validate: each segment should look like a name (Title Case, 2+ words)
  const names: string[] = [];
  for (const candidate of candidates) {
    if (isNameLike(candidate, crewMembers)) {
      names.push(candidate);
    }
  }

  return names;
}

function isNameLike(s: string, crewMembers?: CrewMemberRow[]): boolean {
  // If we have crew context, validate against known names first
  if (crewMembers && crewMembers.some((c) => c.name === s)) return true;

  // Otherwise: must be 2+ space-separated words, each capitalized
  const words = s.split(/\s+/);
  if (words.length < 2) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'-]+$/.test(w));
}

/**
 * Parse v2-style "date @ time" combined cell.
 * e.g. "10/6 @ TBD", "10/6 @ AM", "10/6/25 @ 12:00 PM", "TBD", "4/6"
 */
function parseV2DateTime(
  raw: string,
  contextYear: string | null,
): { date: string | null; time: string | null } {
  if (!raw || /^TBD$/i.test(raw)) return { date: null, time: null };

  // Resolve a date part: year-present → as-is; yearless → back-fill from a 4-digit
  // year in the cell, else the show's context year, else null. Never hard-code an
  // era (the old `+ "/25"` silently mis-dated 2026+ shows). Mirrors hotels.ts.
  const resolveDate = (datePart: string): string | null => {
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(datePart)) return normalizeDate(datePart);
    const cellYear = /\b(20\d\d)\b/.exec(raw);
    const year = cellYear ? cellYear[1] : contextYear;
    if (!year) return null;
    return normalizeDate(`${datePart}/${year}`);
  };

  const atIdx = raw.indexOf("@");
  if (atIdx >= 0) {
    const datePart = raw.slice(0, atIdx).trim();
    const timePart = raw.slice(atIdx + 1).trim();
    const time = /^TBD$/i.test(timePart) ? null : presence(timePart);
    return { date: resolveDate(datePart), time };
  }

  // Date only (no time)
  return { date: resolveDate(raw.trim()), time: null };
}
