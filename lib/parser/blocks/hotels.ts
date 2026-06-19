/**
 * HOTEL block parser (§2.6).
 *
 * Supports three layout variants observed in the corpus:
 *
 * 1. v4/v2 HOTEL table — labeled | HOTEL | RESERVATION #1 | ... | RESERVATION #2 | ...
 *    Up to 4 reservations in a 2-wide grid (cols 1+3 for odd reservations, cols
 *    1+3 for even; middle col is the shared "Check Out Date" for the left pair).
 *    Each reservation group has rows:
 *      - "Hotel Name / Address"  — cell value is the hotel name+address
 *      - "Names on Reservation"  — cell value is the names list
 *      - "Check In Date" / "Check Out Date" — date values
 *
 * 2. v2 inline "Hotel Reservations" row — single cell containing all info
 *    (hotel name, address, check-in, check-out, guest names + confirmation #s).
 *
 * 3. v1 "Hotel Stays" row — same inline format (hotel name + guest lines).
 *
 * Hotel cardinality cap: 4 per show (§10). If more than 4 are found (unlikely),
 * a HOTEL_CARDINALITY_EXCEEDED warning is emitted and results are truncated to 4.
 */

import type { HotelReservationRow } from "../types";
import type { ParseAggregator } from "@/lib/parser/warnings";
import { clean, presence, normalizeDate } from "./_helpers";

const MAX_HOTELS = 4; // cardinality cap §10

/** Parse warnings are logged but not threaded through the type at this layer */
function warn(msg: string): void {
  // warnings are surfaced as console.warn in dev; the full ParseResult warnings
  // array is assembled at the top-level parser (Task 1.11).
   
  console.warn(`[hotels] ${msg}`);
}

export function parseHotels(
  markdown: string,
  _version: "v1" | "v2" | "v4",
   
  _agg?: ParseAggregator,
): HotelReservationRow[] {
  // Try the structured HOTEL table first (v4 + v2 newer layouts)
  const fromTable = parseHotelTable(markdown);
  if (fromTable.length > 0) return cap(fromTable);

  // Inline rows carry yearless "Check In: M/D"; infer the show's year from its
  // dates so we don't hard-code an era (the cell alone lacks the year).
  const contextYear = inferShowYear(markdown);

  // Try the inline "Hotel Reservations" row (v2 older layout, RIA forum, DCI RPAS)
  const fromInline = parseInlineHotelRow(markdown, contextYear);
  if (fromInline.length > 0) return cap(fromInline);

  // Try v1 "Hotel Stays" row (2024-05 east coast family office)
  const fromStays = parseHotelStaysRow(markdown, contextYear);
  if (fromStays.length > 0) return cap(fromStays);

  return [];
}

function cap(hotels: HotelReservationRow[]): HotelReservationRow[] {
  if (hotels.length > MAX_HOTELS) {
    warn(`HOTEL_CARDINALITY_EXCEEDED: found ${hotels.length} hotels; truncating to ${MAX_HOTELS}.`);
    return hotels.slice(0, MAX_HOTELS);
  }
  return hotels;
}

// ── v4/v2 Structured HOTEL table ─────────────────────────────────────────────

type SlotData = {
  ordinal: number;
  hotel_name?: string | null;
  hotel_address: null;
  names: string[];
  confirmation_no: null;
  check_in?: string | null;
  check_out?: string | null;
  notes: null;
};

/**
 * Parse the structured HOTEL block used in v4 (2026+) and later v2 (2025) sheets.
 *
 * The table has the shape:
 *   | HOTEL | RESERVATION #1 |   | RESERVATION #2 |
 *   |       | Hotel Name / Address |   | Hotel Name / Address |
 *   |       | <name+address> |   | <name+addr2> |
 *   |       | Names on Reservation |   | Names on Reservation |
 *   |       | <names1> |   | <names2> |
 *   |       | Check In Date | Check Out Date | Check In Date |
 *   |       | <date1> | <checkout> | <date2> |
 *   |       | RESERVATION #3 |   | RESERVATION #4 |  (optional)
 *   ... repeat for res 3+4
 */
function parseHotelTable(markdown: string): HotelReservationRow[] {
  const HOTEL_HEADER_RE = /^\|\s*HOTEL\s*\|/m;
  const headerMatch = HOTEL_HEADER_RE.exec(markdown);
  if (!headerMatch) return [];

  // Extract the table section starting from HOTEL header
  const section = markdown.slice(headerMatch.index);
  const lines = section.split("\n");
  const tableLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (tableLines.length > 0) break;
      continue;
    }
    tableLines.push(trimmed);
  }

  const rows = parseLinesIntoRows(tableLines);
  if (rows.length === 0) return [];

  // slots indexed by reservation number (1..4)
  const slots = new Map<number, SlotData>();
  let currentGroupLeft = 0;
  let checkoutDate: string | null = null;
  let wideCheckInLayout = false;
  // track what the last non-blank row type was for value-row detection
  type RowState = "idle" | "hotel_name" | "names" | "check_in";
  let rowState: RowState = "idle";

  for (const row of rows) {
    const col0 = clean(row[0] ?? "");
    const col1 = clean(row[1] ?? "");
    const col2 = clean(row[2] ?? "");
    const col3 = clean(row[3] ?? "");

    // Check if this row contains RESERVATION #N markers
    // Note: the HOTEL header row itself may carry the first RESERVATION labels
    // e.g. | HOTEL | RESERVATION \#1 | | RESERVATION \#2 |
    const leftResMatch = /RESERVATION\s*[\\#]*\s*(\d)/i.exec(col1);
    const rightResMatch = /RESERVATION\s*[\\#]*\s*(\d)/i.exec(col3);

    // Skip the pure HOTEL label row only if it has no reservation labels
    if (/^HOTEL$/i.test(col0) && !leftResMatch && !rightResMatch) continue;

    if (leftResMatch ?? rightResMatch) {
      const leftNum = leftResMatch ? parseInt(leftResMatch[1]!, 10) : 0;
      const rightNum = rightResMatch ? parseInt(rightResMatch[1]!, 10) : 0;
      currentGroupLeft = leftNum;
      checkoutDate = null;
      rowState = "idle";

      if (leftNum > 0 && !slots.has(leftNum)) {
        slots.set(leftNum, {
          ordinal: leftNum,
          hotel_address: null,
          names: [],
          confirmation_no: null,
          notes: null,
        });
      }
      if (rightNum > 0 && !slots.has(rightNum)) {
        slots.set(rightNum, {
          ordinal: rightNum,
          hotel_address: null,
          names: [],
          confirmation_no: null,
          notes: null,
        });
      }
      continue;
    }

    if (currentGroupLeft === 0) continue;
    const currentGroupRight = currentGroupLeft + 1;
    const leftSlot = slots.get(currentGroupLeft);
    const rightSlot = slots.get(currentGroupRight);

    // "Hotel Name / Address" label row
    if (/hotel\s+name/i.test(col1)) {
      rowState = "hotel_name";
      continue;
    }

    // "Names on Reservation" label row — value comes next row (when col0 is blank)
    if (/names?\s+on\s+reservation/i.test(col1)) {
      rowState = "names";
      continue;
    }

    // "Check In Date" / "Check Out Date" label row
    if (/check\s+in\s+date/i.test(col1) || /check\s+in\s+date/i.test(col0)) {
      rowState = "check_in";
      // Detect the 5-col layout from the HEADER shape (the label row carries a
      // 4th "Check Out Date" for the right reservation), NOT from a value cell —
      // so a blank right checkout stays null instead of inheriting the left date.
      wideCheckInLayout = /check\s+out/i.test(clean(row[4] ?? ""));
      continue;
    }

    // Value rows based on current rowState
    if (rowState === "hotel_name" && col0 === "") {
      if (leftSlot && col1 && col1 !== "\\-" && col1 !== "-") {
        leftSlot.hotel_name = presence(col1);
      }
      if (rightSlot && col3 && col3 !== "\\-" && col3 !== "-") {
        rightSlot.hotel_name = presence(col3);
      }
      rowState = "idle";
      continue;
    }

    if (rowState === "names" && col0 === "") {
      if (leftSlot && col1 && col1 !== "\\-" && col1 !== "-") {
        leftSlot.names.push(clean(col1));
      }
      if (rightSlot && col3 && col3 !== "\\-" && col3 !== "-") {
        rightSlot.names.push(clean(col3));
      }
      rowState = "idle";
      continue;
    }

    if (rowState === "check_in" && col0 === "") {
      const col4 = clean(row[4] ?? "");
      const col4Present = col4 !== "" && col4 !== "\\-" && col4 !== "-";
      if (leftSlot && col1 && col1 !== "\\-" && col1 !== "-") {
        leftSlot.check_in = normalizeDate(col1);
      }
      if (col2 && col2 !== "\\-" && col2 !== "-") {
        checkoutDate = normalizeDate(col2);
        if (leftSlot) leftSlot.check_out = checkoutDate;
      }
      if (rightSlot && col3 && col3 !== "\\-" && col3 !== "-") {
        rightSlot.check_in = normalizeDate(col3);
        // 5-col (wide, from header shape): the right reservation has its OWN
        // checkout (col4); when that cell is blank, leave it null rather than
        // inheriting the left reservation's date. 4-col legacy: the single
        // shared checkout column (col2).
        rightSlot.check_out = wideCheckInLayout
          ? col4Present
            ? normalizeDate(col4)
            : null
          : checkoutDate;
      }
      rowState = "idle";
      continue;
    }
  }

  const result: HotelReservationRow[] = [];
  for (let i = 1; i <= MAX_HOTELS; i++) {
    const slot = slots.get(i);
    if (!slot) continue;
    // Only include slots that have at minimum a hotel_name (skip dash-only placeholders)
    if (!slot.hotel_name) continue;
    result.push({
      ordinal: i,
      hotel_name: slot.hotel_name ?? null,
      hotel_address: null,
      names: slot.names,
      confirmation_no: null,
      check_in: slot.check_in ?? null,
      check_out: slot.check_out ?? null,
      notes: null,
    });
  }

  return result;
}

// ── v2 / v1 inline "Hotel Reservations" row ──────────────────────────────────

/**
 * Parse the older inline "Hotel Reservations" (or "Hotel Stays") row format.
 *
 * Examples from corpus:
 * - 2025-03: `| Hotel Reservations | Westin Michigan Ave ... Check In: 3/23 Check Out: 3/27 Doug Larson - 7414 ... |`
 * - 2025-04: `| Hotel Reservations | Four Seasons Chicago Eric Weiss 2004173 In on the 6th out on the 10th ... |`
 * - 2025-05: `| Hotel Reservations | The Drake Hotel ... Check In: 5/11 Check Out: 5/15 Eric Carroll Eric Weiss Connor Hester |`
 * - 2025-06: `| Hotel Reservations | Park Hyatt Chicago&#10;"800 N Michigan Ave...&#10;Check In: 6/23 Check Out: 6/26 Doug --- 104461566 Eric---104461567 |`
 */
function parseInlineHotelRow(
  markdown: string,
  contextYear: string | null,
): HotelReservationRow[] {
  const ROW_RE = /^\|\s*Hotel\s*Reservations?\s*\|([^|]+)/im;
  const m = ROW_RE.exec(markdown);
  if (!m) return [];

  const raw = clean(m[1]!);
  if (!raw) return [];

  return buildInlineReservations(raw, contextYear);
}

function parseHotelStaysRow(
  markdown: string,
  contextYear: string | null,
): HotelReservationRow[] {
  // v1 format: | Hotel Stays | <content> |
  const ROW_RE = /^\|\s*Hotel\s*Stays?\s*\|([^|]+)/im;
  const m = ROW_RE.exec(markdown);
  if (!m) return [];

  const raw = clean(m[1]!);
  if (!raw) return [];

  return buildInlineReservations(raw, contextYear);
}

/**
 * A single inline hotel cell can hold multiple stays with DIFFERENT dates (e.g.
 * consultants: three guests check out 10/10, one checks out 10/9). Split into
 * per-group reservations when the cell carries 2+ "Check In" markers so each
 * guest group keeps its own check-out; otherwise return one reservation. Groups
 * after the first don't repeat the hotel name, so they inherit group 1's.
 */
function buildInlineReservations(raw: string, contextYear: string | null): HotelReservationRow[] {
  const checkInCount = (raw.match(/check\s+in/gi) ?? []).length;
  if (checkInCount < 2) return [buildInlineHotel(raw, 1, contextYear)];

  const segments = splitInlineReservationGroups(raw);
  const rows = segments.map((seg, i) => buildInlineHotel(seg, i + 1, contextYear));
  // The split cuts at "Check Out: <date>", which only attributes guests correctly
  // when they PRECEDE their checkout (the consultants shape). If a group came out
  // with no guests, the cell lists guests AFTER each checkout (the redefining
  // shape) and splitting here would detach/mis-attribute them — fall back to a
  // single reservation rather than corrupt the guest↔date mapping.
  if (rows.length < 2 || !rows.every((r) => r.names.length > 0)) {
    return [buildInlineHotel(raw, 1, contextYear)];
  }
  // Each group lists the same hotel once, with guest "Name—conf#" tokens glued in
  // before the first "Check In" (consultants). Strip those guest/confirmation
  // spans so the shared hotel name is the actual hotel/address, then apply it to
  // every group (later groups carry only a divider + guest, not the hotel).
  const baseName = sanitizeHotelName(rows[0]?.hotel_name ?? null);
  for (const r of rows) r.hotel_name = baseName;
  return rows;
}

function sanitizeHotelName(name: string | null): string | null {
  if (!name) return null;
  const cleaned = name
    .replace(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*[-–—]{1,3}\s*#?\d+/g, "") // "Doug Larson—2035940"
    .replace(/-{2,}/g, " ") // residual divider runs
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function splitInlineReservationGroups(raw: string): string[] {
  // Each reservation group ends at its own "Check Out: <date>".
  const re = /check\s+out\s*[:\s]+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/gi;
  const segments: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const end = m.index + m[0].length;
    const seg = raw.slice(last, end).trim();
    if (seg) segments.push(seg);
    last = end;
  }
  const tail = raw.slice(last).trim();
  if (tail) segments.push(tail);
  return segments.length > 0 ? segments : [raw];
}

/**
 * Infer the show's calendar year from the first parseable date in the markdown
 * (the DATES / travel block). Used to back-fill yearless inline hotel dates so
 * the era is taken from the show context, not hard-coded.
 */
function inferShowYear(markdown: string): string | null {
  const m = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.exec(markdown);
  if (!m) return null;
  const iso = normalizeDate(m[0]);
  return iso ? iso.slice(0, 4) : null;
}

function buildInlineHotel(
  raw: string,
  ordinal: number,
  contextYear: string | null,
): HotelReservationRow {
  // Normalize HTML entities and line-break escapes
  const text = raw.replace(/&#10;/g, " ").replace(/\r/g, " ").replace(/\s+/g, " ").trim();

  // Extract check-in and check-out if present
  // Handle both "Check In: M/D" (no year) and "Check In: M/D/YY"
  const checkInMatch = /check\s+in[:\s]+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(text);
  const checkOutMatch = /check\s+out[:\s]+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(text);

  const names: string[] = [];

  // Pattern 1: "Doug Larson - 7414" style (name dash confirmation)
  const dashNumRe = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[-–—]{1,3}\s*[#]?\d+/g;
  let nm: RegExpExecArray | null;
  while ((nm = dashNumRe.exec(text)) !== null) {
    names.push(nm[1]!.trim());
  }

  // Pattern 2: "Doug --- 104461566" (RIA forum, multiple dashes)
  if (names.length === 0) {
    const multiDashRe = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*-{2,}\s*\d+/g;
    let nm2: RegExpExecArray | null;
    while ((nm2 = multiDashRe.exec(text)) !== null) {
      names.push(nm2[1]!.trim());
    }
  }

  // Pattern 3: Names after "Check Out: <date>" — used in 2025-05. Strip up to the
  // FIRST checkout (lazy `.*?`), not the last — a multi-checkout cell would
  // otherwise drop every guest before the final checkout.
  if (names.length === 0) {
    const postCheckout = text.replace(/.*?check\s+out\s*[:\s]+\S+/i, "").trim();
    if (postCheckout) {
      // Split by whitespace runs; grab consecutive title-cased word pairs
      const tokens = postCheckout.split(/\s+/);
      let i = 0;
      while (i < tokens.length - 1) {
        const t1 = tokens[i] ?? "";
        const t2 = tokens[i + 1] ?? "";
        if (/^[A-Z][a-z]+$/.test(t1) && /^[A-Z][a-z]+$/.test(t2)) {
          names.push(`${t1} ${t2}`);
          i += 2;
        } else {
          i += 1;
        }
      }
    }
  }

  // Extract hotel name: strip any "Check In" suffix first
  const hotelNameRaw = text
    .replace(/\s*Check\s+In[:\s].*$/i, "")
    .replace(/\s+In\s+on\s+the.*$/i, "")
    .trim();

  // Determine year from inline text context (crude: grab year from check-in if present)
  // normalizeDate handles M/D/YY but not M/D — supply current-era year suffix when absent
  function resolveDate(raw2: string | undefined): string | null {
    if (!raw2) return null;
    // Year present only when there are TWO slashes (M/D/YY). The old `/\/\d{2,4}$/`
    // test matched the trailing "/11" of a yearless "5/11" and skipped back-fill.
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw2)) return normalizeDate(raw2);
    // Yearless M/D: back-fill the year from a 4-digit year in the cell, else from
    // the show context (its DATES). Return null when no year can be inferred —
    // never hard-code an era, which would silently mis-date non-current shows.
    const cellYear = /\b(20\d\d)\b/.exec(text);
    const year = cellYear ? cellYear[1] : contextYear;
    if (!year) return null;
    return normalizeDate(`${raw2}/${year}`);
  }

  const check_in = resolveDate(checkInMatch?.[1]);
  let check_out = resolveDate(checkOutMatch?.[1]);
  // Year rollover: a yearless checkout that resolves BEFORE check-in crossed the
  // new year (e.g. "Check In: 12/31 Check Out: 1/2"). Re-resolve it with +1 year.
  const checkOutHadYear = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(checkOutMatch?.[1] ?? "");
  if (check_in && check_out && check_out < check_in && !checkOutHadYear) {
    const rolled = normalizeDate(`${checkOutMatch![1]}/${Number(check_in.slice(0, 4)) + 1}`);
    if (rolled) check_out = rolled;
  }

  return {
    ordinal,
    hotel_name: presence(hotelNameRaw),
    hotel_address: null,
    names,
    confirmation_no: null,
    check_in,
    check_out,
    notes: null,
  };
}

// ── Row-level helper (works on already-split lines) ───────────────────────────

function parseLinesIntoRows(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const parts = trimmed.split("|");
    const segments = parts.slice(1, parts.length - 1);
    const isSeparator = segments.every((seg) => /^[\s:|*-]*$/.test(seg));
    if (isSeparator) continue;
    const cells = segments.map((s) => s.trim());
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}
