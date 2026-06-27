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
import { type ParseAggregator, emitEmptySection } from "@/lib/parser/warnings";
import { clean, presence, normalizeDate, parseTableRows, inferShowYear } from "./_helpers";

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

  agg?: ParseAggregator,
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

  // D1: a recognized HOTEL / "Hotel Reservations" / "Hotel Stays" header that
  // parsed zero reservations (sub-parsers content-gate to []) is a silent
  // section-drop — fail loud. Match the EXACT first cell (what the sub-parsers'
  // anchored regexes recognize), NOT a substring — else control rows like
  // "Get Hotel Reservations | FALSE" / "Driver Hotel Stays | FALSE" on a genuinely
  // no-hotel show would emit a spurious warning.
  const hasHotelHeader = parseTableRows(markdown).some((r) => {
    const c = clean(r[0] ?? "").toUpperCase();
    return c === "HOTEL" || /^HOTEL\s+RESERVATIONS?$/.test(c) || /^HOTEL\s+STAYS?$/.test(c);
  });
  if (hasHotelHeader) emitEmptySection(agg, "hotels");
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
  hotel_address?: string | null;
  names: string[];
  confirmation_no: null;
  check_in?: string | null;
  check_out?: string | null;
  notes: null;
};

/**
 * Split a "Names on Reservation" cell into per-guest names (with their trailing
 * "<dash> #?<digits>" confirmation numbers stripped OUT of the name). Guests may
 * be `&#10;`- OR space-delimited (e.g. "Douglas Larson - #2069854&#10;John Carleo
 * - #2069855"); both yield two clean names.
 *
 * The conf# is parsed only to remove it from the name + count guests — it is NOT
 * persisted: `hotel_reservations` is show-wide crew-readable (RLS `crew_read` uses
 * `can_read_show`, SELECT granted to `authenticated`), so a row-level conf# would
 * be readable by any crew member on the show via direct PostgREST, bypassing the
 * `getShowForViewer` name filter. Re-enabling crew-facing conf# needs a per-guest
 * schema + per-viewer access (per-name RLS or an RPC) — see DEFERRED.md
 * AUDIT-2026-06-18-PARSE-FIDELITY round 3.
 */
function parseGuestCell(cell: string): { names: string[]; confs: string[] } {
  // clean() first so a markdown-escaped hash ("\#2069854") becomes "#2069854"
  // before token matching — self-contained even if a caller passes a raw cell
  // (current callers pre-clean col1/col3, but don't depend on that here).
  const flat = clean(cell.replace(/&#10;/g, " ")).replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  if (!flat || flat === "-") return { names: [], confs: [] }; // clean() already unescaped "\-"

  const names: string[] = [];
  const confs: string[] = [];
  // A " / " separates DISTINCT guests in one cell ("David Johnson / Jeffrey
  // Justice") — split FIRST so each guest (and its own conf#) is parsed
  // independently, then run the per-guest token extraction over each segment.
  for (const segment of flat.split(/\s*\/\s*/)) {
    const seg = segment.trim();
    if (!seg || seg === "-") continue;
    // Every "<name> <dash> #?<conf>" token. Guests may be &#10;- OR space-delimited
    // (the exporter flattens in-cell line breaks; raw sheets glue guests with a
    // space), so match GLOBALLY rather than per-&#10;-line — otherwise a space-only
    // multi-guest cell collapses to one "guest". Unicode-aware (\p{L}\p{M}) so
    // accented names ("José Núñez") match instead of falling through.
    const tokenRe = /([\p{L}][\p{L}\p{M}.'\- ]*?)\s*[-–—]{1,3}\s*#?\s*(\d{4,})/gu;
    let consumedEnd = 0;
    let matched = false;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(seg)) !== null) {
      names.push(clean(m[1]!));
      confs.push(m[2]!);
      consumedEnd = m.index + m[0].length;
      matched = true;
    }
    if (!matched) {
      names.push(seg); // no conf# tokens in this segment — it is just a guest name
    } else {
      const tail = clean(seg.slice(consumedEnd));
      if (/\p{L}/u.test(tail)) names.push(tail); // a trailing un-numbered guest
    }
  }
  // Belt-and-suspenders: a conf# must NEVER survive in a persisted name, even on
  // the fallback / unmatched-alphabet path — `names` is also show-wide readable.
  return { names: names.map(stripConfTokens).filter((n) => n.length > 0), confs };
}

/**
 * Remove any confirmation number from a string, alphabet-agnostic. Covers all
 * inline shapes in the corpus: dash/#-prefixed ("Doug--- 103317", "Eric - #2069853")
 * AND the legacy BARE form ("Eric Weiss 2004173 In on the 6th"). Bare runs are
 * gated at 6+ digits so a US ZIP (5) or street number survives.
 */
function stripConfTokens(name: string): string {
  return name
    .replace(/\s*[-–—]{1,3}\s*#?\s*\d{4,}/g, " ") // dash-prefixed (#optional)
    .replace(/\s*#\s*\d{4,}/g, " ") // #-prefixed, no dash
    .replace(/\b\d{6,}\b/g, " ") // bare 6+ digit run (conf#; longer than any ZIP)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a flattened "<hotel name> <street address>" string into the venue name
 * and the street address (§2.6 / BL-PARSER #3). The production exporter flattens
 * the source cell's `name⏎street⏎city` newlines to spaces, so the boundary is
 * recovered by PATTERN: the address begins at the FIRST street NUMBER that
 * actually starts a street PHRASE. Live-MCP grounding of all 7 fxav-test sheets
 * (2026-06-26) confirmed every hotel name ends at that number and no hotel name
 * in the corpus contains such a number; on the live cell this boundary is also
 * the in-cell newline.
 *
 * Also strips artifacts the live cells carry that the exporter preserves so the
 * crew render stays clean (hotel_name = bold line, hotel_address = subtle line,
 * TravelSection): ria wraps its address in literal double-quotes; fintech's
 * Holiday Inn embeds U+200C ZWNJ. Conf# removal is the caller's job — run
 * stripConfTokens FIRST so a "<dash> #<digits>" run can't masquerade as a street
 * number (the leading-\s anchor below already rejects a "#5001397" with no
 * preceding space, but stripping first is belt-and-suspenders).
 *
 * The boundary requires a full STREET SHAPE — `<1–5 digit number> [direction]
 * <0–4 name words, letter-word OR ordinal like "37th"> <street suffix>` — NOT
 * merely "a number followed by a word". Two-sided robustness:
 *   • Too-loose (Codex R1) — a numeric-branded name is NOT mis-split: `Hotel 71`
 *     (no address) stays whole; `Hotel 71 71 E Wacker Dr …` splits at the SECOND
 *     71 (the one that begins a street phrase) → name `Hotel 71`, not `Hotel`.
 *   • Too-strict (Codex R2) — common shapes still split: a 1-digit street number
 *     (`1 Newbury St`, `1 Bellevue Ave`) and an ordinal street name (`38 E 37th
 *     St`, `485 5th Ave`) both match.
 * When no street shape is found the cell stays intact as hotel_name (the pre-#3
 * behavior) — a SAFE failure, never a corrupted name. Exotic shapes intentionally
 * left glued (safe): alphanumeric house numbers (`123A Main St`), PO boxes.
 *
 * A SUFFIXLESS street (e.g. "1515 Broadway New York, NY 10036") is also recognized
 * via its trailing US ZIP tail ("…, <ST> <ZIP>") — a confirmation number is never
 * followed by a state+ZIP, so this can't false-split a hotel name or a guest conf#.
 */
const STREET_ADDRESS_RE =
  /\s(\d{1,5})\s+(?:(?:[NSEW]{1,2}|North|South|East|West)\.?\s+)?(?:(?:\d{1,3}(?:st|nd|rd|th)|\p{L}[\p{L}.'-]*)\s+){0,4}(?:St|Street|Ave|Avenue|Av|Blvd|Boulevard|Dr|Drive|Rd|Road|Pl|Place|Ln|Lane|Way|Ct|Court|Pkwy|Parkway|Sq|Square|Ter|Terrace|Cir|Circle|Hwy|Highway|Pike|Row|Walk|Trl|Trail|Loop|Path|Plaza)\b/iu;

// Suffixless street: "<1–5 digit number> <words…>, <2-letter state> <5-digit ZIP>".
// The interior (street name + city) is digit-free so it can't run past a conf# or a
// second number; the comma+state+ZIP tail is what marks it as an address.
const STREET_ADDRESS_ZIP_RE =
  /\s(\d{1,5})\s+\p{L}[\p{L}\p{M}\s.'#/-]*?,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/u;

/** True iff `" " + s.slice(i)` begins a street phrase by SUFFIX or by US ZIP tail.
 * Used ONLY by the Hotel-Stays discriminator to tell a dash-STREET-number from a
 * dash-CONF#. NOT used to SPLIT (splitHotelNameAddress stays strictly suffix-only,
 * so a numeric hotel brand like "Hotel 71 Chicago, IL 60601" is never corrupted —
 * the ZIP tail would otherwise treat "71 Chicago, IL …" as an address, Codex R5). */
function looksLikeStreetStart(s: string): boolean {
  const a = STREET_ADDRESS_RE.exec(s);
  if (a && a.index === 0) return true;
  const b = STREET_ADDRESS_ZIP_RE.exec(s);
  return b !== null && b.index === 0;
}

function splitHotelNameAddress(combined: string | null): {
  name: string | null;
  address: string | null;
} {
  if (!combined) return { name: null, address: null };
  const cleaned = combined
    .replace(/[​-‍﻿]/g, "") // zero-width: ZWSP / ZWNJ / ZWJ / BOM
    .replace(/["“”]/g, " ") // straight + smart double-quotes → space
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { name: null, address: null };
  // The address begins at the first street number that starts a SUFFIXED street
  // phrase (see STREET_ADDRESS_RE). Suffix-only by design: a suffixless tail (a
  // bare number + city + ZIP) is ambiguous with a numeric hotel brand ("Hotel 71
  // Chicago, IL 60601"), so it stays glued — a SAFE fallback, never a corrupted
  // name. The regex only LOCATES the boundary; the address runs to the cell end.
  const m = STREET_ADDRESS_RE.exec(cleaned);
  if (!m) return { name: presence(cleaned), address: null };
  const splitAt = m.index;
  const name = cleaned
    .slice(0, splitAt)
    .replace(/[,\-–—\s]+$/, "")
    .trim();
  const address = cleaned.slice(splitAt).trim();
  return { name: presence(name), address: presence(address) };
}

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
      // The "Hotel Name / Address" cell glues the venue name and street address
      // (the exporter flattened the in-cell newline to a space); split them so the
      // crew render shows the venue on the bold line and the address on its own
      // subtle line. stripConfTokens first (defensive — conf# lives in the
      // separate "Names" row here, not the address cell).
      if (leftSlot && col1 && col1 !== "\\-" && col1 !== "-") {
        const split = splitHotelNameAddress(stripConfTokens(col1));
        leftSlot.hotel_name = split.name;
        leftSlot.hotel_address = split.address;
      }
      if (rightSlot && col3 && col3 !== "\\-" && col3 !== "-") {
        const split = splitHotelNameAddress(stripConfTokens(col3));
        rightSlot.hotel_name = split.name;
        rightSlot.hotel_address = split.address;
      }
      rowState = "idle";
      continue;
    }

    if (rowState === "names" && col0 === "") {
      if (leftSlot && col1 && col1 !== "\\-" && col1 !== "-") {
        // split the (&#10;- or space-delimited) guest cell into clean names; the
        // conf# is parsed only to strip it out of the names, NOT persisted.
        leftSlot.names.push(...parseGuestCell(col1).names);
      }
      if (rightSlot && col3 && col3 !== "\\-" && col3 !== "-") {
        rightSlot.names.push(...parseGuestCell(col3).names);
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
      hotel_address: slot.hotel_address ?? null,
      names: slot.names,
      confirmation_no: null, // parsed-but-not-persisted — see parseGuestCell
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
function parseInlineHotelRow(markdown: string, contextYear: string | null): HotelReservationRow[] {
  const ROW_RE = /^\|\s*Hotel\s*Reservations?\s*\|([^|]+)/im;
  const m = ROW_RE.exec(markdown);
  if (!m) return [];

  const raw = clean(m[1]!);
  if (!raw) return [];

  return buildInlineReservations(raw, contextYear);
}

function parseHotelStaysRow(markdown: string, contextYear: string | null): HotelReservationRow[] {
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
  if (checkInCount < 2) return stripHotelNameConf([buildInlineHotel(raw, 1, contextYear)]);

  const segments = splitInlineReservationGroups(raw);
  const rows = segments.map((seg, i) => buildInlineHotel(seg, i + 1, contextYear));
  // The split cuts at "Check Out: <date>", which only attributes guests correctly
  // when they PRECEDE their checkout (the consultants shape). If a group came out
  // with no guests, the cell lists guests AFTER each checkout (the redefining
  // shape) and splitting here would detach/mis-attribute them — fall back to a
  // single reservation rather than corrupt the guest↔date mapping.
  if (rows.length < 2 || !rows.every((r) => r.names.length > 0)) {
    // The cell has MULTIPLE date groups but names can't be cleanly attributed to
    // each. A single buildInlineHotel keeps only the FIRST Check In/Out, so later
    // guests would carry the first group's dates — wrong data. Preserve all names
    // but NULL the dates rather than mis-map them (ambiguous → no date is safer
    // than a wrong date).
    const single = buildInlineHotel(raw, 1, contextYear);
    single.check_in = null;
    single.check_out = null;
    return stripHotelNameConf([single]);
  }
  // Each group lists the same hotel once, with guest "Name—conf#" tokens glued in
  // before the first "Check In" (consultants). Strip those guest/confirmation
  // spans so the shared hotel name is the actual hotel/address, then apply it to
  // every group (later groups carry only a divider + guest, not the hotel).
  const baseName = sanitizeHotelName(rows[0]?.hotel_name ?? null);
  for (const r of rows) r.hotel_name = baseName;
  return stripHotelNameConf(rows);
}

/**
 * Final privacy pass: strip any "<dash> #?<digits>" confirmation token from each
 * row's hotel_name. A "Hotel Stays"/inline cell with no "Check In" marker dumps the
 * whole string (guest conf#s included) into hotel_name, which is rendered + show-wide
 * readable. Runs AFTER sanitizeHotelName (which needs the conf# to locate guests).
 */
function stripHotelNameConf(rows: HotelReservationRow[]): HotelReservationRow[] {
  for (const r of rows) {
    if (r.hotel_name) {
      // Strip any conf# (this is the final privacy pass for inline cells), THEN
      // split the venue name from the glued street address (#3). Only overwrite
      // hotel_address when the split actually found one — never clobber a value an
      // upstream path already set with null.
      const split = splitHotelNameAddress(stripConfTokens(r.hotel_name));
      r.hotel_name = split.name;
      if (split.address) r.hotel_address = split.address;
    }
  }
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

  // v1 "Hotel Stays" / no-Check-In dash-delimited shape (east-coast):
  // "<hotel name+address> <Guest>[ <Initial>] <dash-run> #?<conf> ...". With no
  // "Check In:" marker to separate hotel from guests, the weak Pattern 1/2/3
  // below miss single-word guests + middle initials + mixed dash styles (---, –-)
  // AND leave every guest first-name glued into hotel_name. Extract each
  // "<short name> <dash> <conf>" guest and take the hotel as the prefix before the
  // FIRST guest. names[] is load-bearing — getShowForViewer filters hotels by the
  // viewer's name appearing in res.names (lib/data/getShowForViewer.ts:644). Gate
  // on !checkInMatch so the dated inline shapes (ria / redefining / consultants),
  // whose guests sit AFTER the dates, keep their existing "strip Check In" path.
  if (!checkInMatch) {
    // ── v1 "Hotel Stays" / no-Check-In shape ──────────────────────────────────
    // The cell is "<hotel name+address> name1 <dash> conf1 name2 <dash> conf2 …"
    // (east-coast) OR a guest-less "<hotel> - <streetnum> <street> …". With no
    // "Check In:" to separate hotel from guests, the legacy Pattern 1/2 below miss
    // single-word / en-dash / middle-initial guests, leave guest names glued in
    // hotel_name, and mis-read a dash before a street number as a "Name - conf#".
    // names[] is load-bearing — getShowForViewer filters hotels by viewer-name ∈
    // res.names (lib/data/getShowForViewer.ts:644).
    //
    // A STREET number begins a street phrase (suffix OR ZIP tail); a confirmation
    // number does not — so looksLikeStreetStart is the discriminator (prepend a
    // space so the regexes' leading \s anchors match right at the number). Used
    // only to classify a dash-number as street-vs-conf — never to SPLIT.
    const streetStartsAt = (i: number): boolean => looksLikeStreetStart(" " + text.slice(i));
    // base word count = words minus a trailing single-letter initial ("Eric W" → 1).
    const baseWords = (s: string): number => {
      const w = s.split(/\s+/).filter(Boolean);
      return w.length > 1 && /^\p{Lu}\.?$/u.test(w[w.length - 1]!) ? w.length - 1 : w.length;
    };

    // Confirmation delimiters: a dash run + 4+ digit conf# that is NOT a street
    // number. They cut the cell into "<hotel> name1 | name2 | … | nameN".
    const delimRe = /[-–—]{1,3}\s*#?\s*(\d{4,})\b/g;
    const delims: Array<{ start: number; end: number }> = [];
    let dm: RegExpExecArray | null;
    while ((dm = delimRe.exec(text)) !== null) {
      const numStart = dm.index + dm[0].length - dm[1]!.length;
      if (!streetStartsAt(numStart)) delims.push({ start: dm.index, end: dm.index + dm[0].length });
    }

    if (delims.length >= 2) {
      // names 2..N are UNAMBIGUOUSLY delimited (each is the text before its conf#);
      // only the FIRST guest's name length is ambiguous (how many leading words are
      // the hotel). Learn that length from the later guests, then peel it off seg0.
      const segs: string[] = [];
      let prev = 0;
      for (const d of delims) {
        segs.push(text.slice(prev, d.start));
        prev = d.end;
      }
      const later = segs
        .slice(1)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      // Trust learn-K ONLY when the later guests AGREE on a name shape (same base
      // word count). A MIXED row ("Eric - … John Smith - …": counts 1 and 2) gives
      // no reliable k for the ambiguous first guest, so fall through to legacy
      // rather than guess (Codex R6) — moving a first-name into hotel_name would
      // hide that reservation from the guest (names[] is the per-viewer filter).
      const counts = later.map(baseWords);
      const consistent = counts.length > 0 && counts.every((c) => c === counts[0]);
      if (consistent) {
        const k = counts[0]!;
        // name1 = the last k base-words of seg0 (a trailing initial rides with its word).
        const toks = segs[0]!.trim().split(/\s+/).filter(Boolean);
        let i = toks.length;
        let counted = 0;
        while (i > 0 && counted < k) {
          i--;
          if (!/^\p{Lu}\.?$/u.test(toks[i]!)) counted++;
        }
        const name1 = toks.slice(i).join(" ");
        const hotelPart = toks.slice(0, i).join(" ");
        const names = [name1, ...later]
          .map(stripConfTokens)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (names.length >= 2 && hotelPart.length > 0) {
          const split = splitHotelNameAddress(hotelPart);
          return {
            ordinal,
            hotel_name: split.name,
            hotel_address: split.address,
            names,
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          };
        }
      }
    }

    // No clean multi-guest list. If there are NO guests at all (no non-street dash
    // conf#, no bare 6+ / #-conf), it's a plain hotel(+address) cell ("Hyatt Regency
    // - 1515 Madison Ave …", "Marriott Downtown 555 Main St …"): splitHotelNameAddress
    // owns the name/address. Otherwise (a single dash-conf guest, or the 2025-04
    // bare-conf# "In on the …" prose) fall through to the legacy Pattern 1/2/3, which
    // surfaces the guest (the first-guest/hotel boundary for a lone multi-word name
    // is the legacy greedy capture — a documented bound, see BACKLOG).
    const hasGuest = delims.length >= 1 || /\b\d{6,}\b|#\s*\d{4,}/.test(text);
    if (!hasGuest) {
      // No guests ⇒ any " - " is a name/address SEPARATOR, not a conf delimiter.
      // Collapse spaced dash runs to a space FIRST so the downstream stripConfTokens
      // pass can't later eat a dash-separated street number ("Hyatt Regency - 1515
      // Broadway …" → "… 1515 Broadway …"). Intra-word hyphens ("Ritz-Carlton", no
      // surrounding spaces) are untouched. A suffixed street still splits; a
      // suffixless one stays glued-but-preserved (the #3 safe fallback).
      const noSepDash = text.replace(/\s+[-–—]{1,3}\s+/g, " ");
      const split = splitHotelNameAddress(noSepDash);
      if (split.name !== null || split.address !== null) {
        return {
          ordinal,
          hotel_name: split.name,
          hotel_address: split.address,
          names: [],
          confirmation_no: null,
          check_in: null,
          check_out: null,
          notes: null,
        };
      }
    }
  }

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
    // hotel_name's conf# is stripped LATER, in buildInlineReservations — after
    // sanitizeHotelName, which needs the "Name—conf#" pattern to locate + remove
    // glued guest spans (stripping the conf# here would defeat it).
    hotel_name: presence(hotelNameRaw),
    hotel_address: null,
    // strip any conf# suffix from each name too — `names` is show-wide readable.
    names: names.map(stripConfTokens).filter((n) => n.length > 0),
    // confirmation_no is intentionally NOT persisted — see parseGuestCell / the
    // DEFERRED.md privacy note: hotel_reservations is show-wide crew-readable, so a
    // row-level conf# would be readable by any crew member on the show.
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
