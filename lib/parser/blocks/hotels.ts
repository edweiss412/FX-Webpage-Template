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
import {
  type ParseAggregator,
  emitEmptySection,
  emitHotelGuestSplitAmbiguity,
  emitInlineHotelGuestAmbiguity,
  emitHotelAddressSplitAmbiguity,
  emitHotelCardinalityExceeded,
  emitHotelInlineGroupOwnHotel,
  emitHotelInlineGroupHotelSuspected,
} from "@/lib/parser/warnings";
import { clean, presence, normalizeDate, parseTableRows, inferShowYear } from "./_helpers";
import {
  stripConfTokens,
  normalizeHotelCellText,
  looksLikeStreetStart,
  STREET_ADDRESS_RE,
  STREET_ADDRESS_ZIP_RE,
} from "./hotelConfTokens";
import { buildCol0HeaderRe, matchesSectionHeader } from "./_sectionHeaderMatch";
import { log } from "@/lib/log";

// Re-export for external importers that referenced this from `hotels.ts` before the
// conf-token policy moved to its single-source leaf module (tests/parser/blocks/hotels.test.ts).
export { looksLikeStreetStart };

export const SECTION_HEADER_TOKENS = [
  "HOTEL",
  "HOTEL RESERVATION",
  "HOTEL RESERVATIONS",
  "HOTEL STAY",
  "HOTEL STAYS",
] as const;

const MAX_HOTELS = 4; // cardinality cap §10

/** Parse warnings are logged but not threaded through the type at this layer */
function warn(msg: string): void {
  // warnings are surfaced as console.warn in dev; the full ParseResult warnings
  // array is assembled at the top-level parser (Task 1.11).

  log.warn(msg, { source: "parser.hotels", code: "HOTELS_PARSE_WARNING" });
}

export function parseHotels(
  markdown: string,
  _version: "v1" | "v2" | "v4",

  agg?: ParseAggregator,
): HotelReservationRow[] {
  // Try the structured HOTEL table first (v4 + v2 newer layouts)
  const fromTable = parseHotelTable(markdown);
  if (fromTable.length > 0) return commitHotels(fromTable, agg);

  // Inline rows carry yearless "Check In: M/D"; infer the show's year from its
  // dates so we don't hard-code an era (the cell alone lacks the year).
  const contextYear = inferShowYear(markdown);

  // Try the inline "Hotel Reservations" row (v2 older layout, RIA forum, DCI RPAS)
  const fromInline = parseInlineHotelRow(markdown, contextYear);
  if (fromInline.length > 0) return commitHotels(fromInline, agg);

  // Try v1 "Hotel Stays" row (2024-05 east coast family office)
  const fromStays = parseHotelStaysRow(markdown, contextYear);
  if (fromStays.length > 0) return commitHotels(fromStays, agg);

  // D1: a recognized HOTEL / "Hotel Reservations" / "Hotel Stays" header that
  // parsed zero reservations (sub-parsers content-gate to []) is a silent
  // section-drop — fail loud. Match the EXACT first cell (what the sub-parsers'
  // anchored regexes recognize), NOT a substring — else control rows like
  // "Get Hotel Reservations | FALSE" / "Driver Hotel Stays | FALSE" on a genuinely
  // no-hotel show would emit a spurious warning.
  const hasHotelHeader = parseTableRows(markdown).some((r) =>
    matchesSectionHeader(clean(r[0] ?? ""), SECTION_HEADER_TOKENS),
  );
  if (hasHotelHeader) emitEmptySection(agg, "hotels");
  return [];
}

/**
 * An ambiguity STASHED against the reservation that produced it, rather than
 * emitted at the site. Two consequences the emit-at-site shape cannot give:
 *
 *  - a reservation truncated by the cardinality cap never warns about a hotel
 *    the operator will not see (ratified R4);
 *  - a provisional row that `buildInlineReservations` later discards takes its
 *    stash with it, so no rule is needed to suppress it.
 */
type HotelAmbiguity =
  | { kind: "guests"; reasons: string[]; rawCell: string; parsedNames: string[] }
  | { kind: "inline-guests"; rawCell: string; parsedNames: string[] }
  | {
      kind: "address";
      reason: AddressSplitAmbiguity["reason"];
      splitInput: string;
      rawCell: string;
      parsedName: string | null;
      parsedAddress: string | null;
    }
  // Spec 2026-07-27 §6.2: the inline later-group detector's two stashes. Each carries
  // only the row's RAW segment — the envelope needs nothing else, and the detector's
  // normalized text must never reach a persisted field.
  | { kind: "own-hotel"; rawCell: string }
  | { kind: "hotel-suspected"; rawCell: string };

type PendingHotel = { row: HotelReservationRow; ambiguities: HotelAmbiguity[] };

/**
 * The SINGLE commit point for every hotel warning (spec §5.2). Replaces `cap()`
 * and absorbs the per-slot emit loop that `parseHotelTable` used to inline, so
 * the rank gate lives in exactly one place instead of being re-derived per
 * producer.
 *
 * Emission ORDER is load-bearing and observable: all surviving-reservation
 * ambiguities first, THEN the cardinality warning. That is the order the
 * pre-refactor code produced, and warning order is persisted.
 */
function commitHotels(pending: PendingHotel[], agg?: ParseAggregator): HotelReservationRow[] {
  const kept = pending.slice(0, MAX_HOTELS);
  kept.forEach((p, index) => {
    for (const amb of p.ambiguities) {
      if (amb.kind === "address") {
        emitHotelAddressSplitAmbiguity(agg, {
          reason: amb.reason,
          splitInput: amb.splitInput,
          rawCell: amb.rawCell,
          index,
          name: p.row.hotel_name,
          parsedName: amb.parsedName,
          parsedAddress: amb.parsedAddress,
        });
        continue;
      }
      if (amb.kind === "own-hotel") {
        emitHotelInlineGroupOwnHotel(agg, {
          name: p.row.hotel_name,
          rawCell: amb.rawCell,
          index,
        });
        continue;
      }
      if (amb.kind === "hotel-suspected") {
        emitHotelInlineGroupHotelSuspected(agg, {
          name: p.row.hotel_name,
          rawCell: amb.rawCell,
          index,
        });
        continue;
      }
      if (amb.kind === "inline-guests") {
        emitInlineHotelGuestAmbiguity(agg, {
          name: p.row.hotel_name,
          rawCell: amb.rawCell,
          index,
          parsedNames: amb.parsedNames,
        });
        continue;
      }
      emitHotelGuestSplitAmbiguity(agg, {
        name: p.row.hotel_name,
        reasons: amb.reasons,
        rawCell: amb.rawCell,
        // The reservation's position in the FINAL hotels array — the overlay's
        // anchor (spec §5.3). Not its ordinal, and not its pre-filter slot.
        index,
        parsedNames: amb.parsedNames,
        confirmationNo: null, // parsed-but-not-persisted (mirrors the pushed row)
      });
    }
  });
  if (pending.length > MAX_HOTELS) {
    // Log-only telemetry stays (HOTELS_PARSE_WARNING forensic stream); the aggregator
    // emit (§4.2b) promotes the same event to an operator-visible ParseWarning.
    warn(
      `HOTEL_CARDINALITY_EXCEEDED: found ${pending.length} hotels; truncating to ${MAX_HOTELS}.`,
    );
    emitHotelCardinalityExceeded(agg, { found: pending.length, cap: MAX_HOTELS });
  }
  return kept.map((p) => p.row);
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
  // §4.2 (Codex R5): guest-split ambiguities are STASHED per triggering cell during
  // parsing and emitted only for slots that survive the cardinality cap (kept hotels),
  // so a dropped RESERVATION #5+ slot never warns for a hotel that isn't shown.
  guestAmbiguities: Array<{ reasons: string[]; rawCell: string }>;
  // Same stash-then-commit discipline as guestAmbiguities: first split wins.
  addressAmbiguity?:
    | { reason: AddressSplitAmbiguity["reason"]; splitInput: string; rawCell: string }
    | undefined;
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
/**
 * §4.2 fallback-segment ambiguity predicate. Operates on a trimmed guest SEGMENT
 * that the no-token fallback consumed whole (no "<name> <dash> #?<conf>" token
 * matched). Returns a reason string when the segment's shape suggests multiple
 * guests were glued together, else null:
 *   (i)  "fallback-4-tokens" — ≥ 4 name-like tokens (a maximal whitespace-split
 *        run matching /^[\p{L}][\p{L}\p{M}.'-]*$/u; same character class as the
 *        name side of `tokenRe`, minus the space). Threshold 4 because the dominant
 *        glued shape is First Last First Last; an accepted false positive is a
 *        4-token single-person name ("Mary Anne St. Claire") — spec §4.2.
 *   (ii) "interior-digit-run" — a /\d{4,}/ (conf-shaped) run whose match neither
 *        starts at index 0 nor ends at the segment end (a boundary run is a leading
 *        or trailing conf#, not glue).
 */
function fallbackGuestAmbiguityReason(seg: string): string | null {
  const nameLikeRe = /^[\p{L}][\p{L}\p{M}.'-]*$/u;
  const nameLike = seg.split(/\s+/).filter((t) => nameLikeRe.test(t));
  if (nameLike.length >= 4) return "fallback-4-tokens";
  const digitRe = /\d{4,}/g;
  let dm: RegExpExecArray | null;
  while ((dm = digitRe.exec(seg)) !== null) {
    const start = dm.index;
    const end = dm.index + dm[0].length;
    if (start !== 0 && end !== seg.length) return "interior-digit-run";
  }
  return null;
}

export function parseGuestCell(cell: string): {
  names: string[];
  confs: string[];
  ambiguity?: { reasons: string[] };
} {
  // clean() first so a markdown-escaped hash ("\#2069854") becomes "#2069854"
  // before token matching — self-contained even if a caller passes a raw cell
  // (current callers pre-clean col1/col3, but don't depend on that here).
  const flat = clean(cell.replace(/&#10;/g, " ")).replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  if (!flat || flat === "-") return { names: [], confs: [] }; // clean() already unescaped "\-"

  const names: string[] = [];
  const confs: string[] = [];
  // §4.2 ambiguity reasons — which branch(es) flagged a possible glued-guest cell.
  // parseGuestCell stays PURE (no emission): the caller reads `ambiguity.reasons`
  // and emits ONE HOTEL_GUEST_SPLIT_AMBIGUOUS per triggering cell.
  const reasons: string[] = [];
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
      const nm = clean(m[1]!);
      names.push(nm);
      confs.push(m[2]!);
      consumedEnd = m.index + m[0].length;
      matched = true;
      // §4.2: a tokenized guest's NAME can itself be several people glued together
      // before the conf# ("John Smith Jane Doe - #1234") — the token match consumes
      // the whole run as one name, so run the same glued-name predicate on the captured
      // name, else a structured ambiguous cell ships a merged guest with no warning.
      const nameReason = fallbackGuestAmbiguityReason(nm);
      if (nameReason) reasons.push(nameReason);
    }
    if (!matched) {
      names.push(seg); // no conf# tokens in this segment — it is just a guest name
      const reason = fallbackGuestAmbiguityReason(seg);
      if (reason) reasons.push(reason);
    } else {
      const tail = clean(seg.slice(consumedEnd));
      if (/\p{L}/u.test(tail)) {
        names.push(tail); // a trailing un-numbered guest
        reasons.push("tail-guest-appended");
      }
    }
  }
  // Belt-and-suspenders: a conf# must NEVER survive in a persisted name, even on
  // the fallback / unmatched-alphabet path — `names` is also show-wide readable.
  const cleaned = { names: names.map(stripConfTokens).filter((n) => n.length > 0), confs };
  return reasons.length > 0 ? { ...cleaned, ambiguity: { reasons } } : cleaned;
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

/**
 * §3.1 P3 (2026-07-25-hotel-ambiguity-coverage) — the name/address boundary is a
 * judgment, and this reports it WITHOUT changing it. Two disjoint arms:
 *
 *   P3(a) "address-shape-unsplit"      — the splitter produced NO address, yet a
 *                                        padded read finds an address shape.
 *   P3(b) "multiple-street-candidates" — more than one street phrase could have
 *                                        started the address, so the split point
 *                                        was a choice among candidates.
 *
 * Both arms detect against `" " + cleaned` because both regexes require leading
 * whitespace, so a candidate at index 0 is otherwise invisible — the same reason
 * `looksLikeStreetStart` pads. The SPLIT keeps exec'ing the unpadded string, so a
 * position-0 street start still never becomes the boundary (ratified R1: this adds
 * a warning, never a behavior change).
 */
export type AddressSplitAmbiguity = {
  reason: "address-shape-unsplit" | "multiple-street-candidates";
  // The exact cleaned text the splitter judged. The "undo the split"
  // replacement is built from THIS, never from the enclosing booking fragment
  // — a fragment-built replacement persists dates and guest names into
  // crew-readable hotel_name (whole-diff R6 f1).
  splitInput: string;
};

export function splitHotelNameAddress(combined: string | null): {
  name: string | null;
  address: string | null;
  ambiguity?: AddressSplitAmbiguity;
} {
  if (!combined) return { name: null, address: null };
  // Shared with the emitter's replacement path — see normalizeHotelCellText.
  const cleaned = normalizeHotelCellText(combined);
  if (!cleaned) return { name: null, address: null };
  // The address begins at the first street number that starts a SUFFIXED street
  // phrase (see STREET_ADDRESS_RE). Suffix-only by design: a suffixless tail (a
  // bare number + city + ZIP) is ambiguous with a numeric hotel brand ("Hotel 71
  // Chicago, IL 60601"), so it stays glued — a SAFE fallback, never a corrupted
  // name. The regex only LOCATES the boundary; the address runs to the cell end.
  const m = STREET_ADDRESS_RE.exec(cleaned);
  // Detection only — never the split point (R1). Padded so a candidate at index 0
  // is visible; a fresh clone each call because adding `g` to the shared
  // STREET_ADDRESS_RE singleton would give it a persistent lastIndex and make
  // consecutive splitter calls alternate between matching and missing.
  const padded = " " + cleaned;
  if (!m) {
    // P3(a): we produced no address, but the cell looks like it holds one.
    const looksAddressed =
      new RegExp(STREET_ADDRESS_RE.source, STREET_ADDRESS_RE.flags).test(padded) ||
      new RegExp(STREET_ADDRESS_ZIP_RE.source, STREET_ADDRESS_ZIP_RE.flags).test(padded);
    return looksAddressed
      ? {
          name: presence(cleaned),
          address: null,
          ambiguity: { reason: "address-shape-unsplit", splitInput: cleaned },
        }
      : { name: presence(cleaned), address: null };
  }
  const splitAt = m.index;
  const name = cleaned
    .slice(0, splitAt)
    .replace(/[,\-–—\s]+$/, "")
    .trim();
  const address = cleaned.slice(splitAt).trim();
  // P3(b): the boundary was a choice among several street phrases.
  const counter = new RegExp(STREET_ADDRESS_RE.source, STREET_ADDRESS_RE.flags + "g");
  const candidates = [...padded.matchAll(counter)].length;
  const base = { name: presence(name), address: presence(address) };
  return candidates > 1
    ? { ...base, ambiguity: { reason: "multiple-street-candidates", splitInput: cleaned } }
    : base;
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
function parseHotelTable(markdown: string): PendingHotel[] {
  const HOTEL_HEADER_RE = buildCol0HeaderRe(["HOTEL"]);
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
          guestAmbiguities: [],
        });
      }
      if (rightNum > 0 && !slots.has(rightNum)) {
        slots.set(rightNum, {
          ordinal: rightNum,
          hotel_address: null,
          names: [],
          confirmation_no: null,
          notes: null,
          guestAmbiguities: [],
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
        // Track the cell that produced the slot's FINAL value. `??=` kept the
        // FIRST cell's raw while a later repeated Hotel Name row overwrote the
        // value, so "use raw" would restore stale text (whole-diff R1 f3 / R2 f1).
        leftSlot.addressAmbiguity = split.ambiguity
          ? {
              reason: split.ambiguity.reason,
              splitInput: split.ambiguity.splitInput,
              rawCell: col1,
            }
          : undefined;
      }
      if (rightSlot && col3 && col3 !== "\\-" && col3 !== "-") {
        const split = splitHotelNameAddress(stripConfTokens(col3));
        rightSlot.hotel_name = split.name;
        rightSlot.hotel_address = split.address;
        rightSlot.addressAmbiguity = split.ambiguity
          ? {
              reason: split.ambiguity.reason,
              splitInput: split.ambiguity.splitInput,
              rawCell: col3,
            }
          : undefined;
      }
      rowState = "idle";
      continue;
    }

    if (rowState === "names" && col0 === "") {
      if (leftSlot && col1 && col1 !== "\\-" && col1 !== "-") {
        // split the (&#10;- or space-delimited) guest cell into clean names; the
        // conf# is parsed only to strip it out of the names, NOT persisted.
        const parsed = parseGuestCell(col1);
        leftSlot.names.push(...parsed.names);
        // §4.2 (Codex R5): STASH one glue/split ambiguity per triggering cell; it is
        // emitted in the materialization loop below ONLY for a hotel that survives the
        // cardinality cap (single commit point, kept-hotels-only) — a dropped dash-only or
        // over-cap slot must never warn for a hotel that is not shown.
        if (parsed.ambiguity) {
          leftSlot.guestAmbiguities.push({ reasons: parsed.ambiguity.reasons, rawCell: col1 });
        }
      }
      if (rightSlot && col3 && col3 !== "\\-" && col3 !== "-") {
        const parsed = parseGuestCell(col3);
        rightSlot.names.push(...parsed.names);
        if (parsed.ambiguity) {
          rightSlot.guestAmbiguities.push({ reasons: parsed.ambiguity.reasons, rawCell: col3 });
        }
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

  // Materialize ALL name-resolved slots in reservation order so the cardinality cap in
  // cap() sees the TRUE hotel count — a structured RESERVATION #5+ overflow used to be
  // silently dropped by a 1..MAX_HOTELS loop here, before cap() could emit
  // HOTEL_CARDINALITY_EXCEEDED (Codex R5).
  // Stash, never emit: `commitHotels` is the single commit point, so the rank
  // gate that used to be re-derived here (`result.length < MAX_HOTELS`) lives in
  // exactly one place (spec §5.2).
  const result: PendingHotel[] = [];
  for (const i of [...slots.keys()].sort((a, b) => a - b)) {
    const slot = slots.get(i)!;
    // Only include slots that have at minimum a hotel_name (skip dash-only placeholders)
    if (!slot.hotel_name) continue;
    result.push({
      row: {
        ordinal: i,
        hotel_name: slot.hotel_name ?? null,
        hotel_address: slot.hotel_address ?? null,
        names: slot.names,
        confirmation_no: null, // parsed-but-not-persisted — see parseGuestCell
        check_in: slot.check_in ?? null,
        check_out: slot.check_out ?? null,
        notes: null,
      },
      ambiguities: [
        ...slot.guestAmbiguities.map(
          (amb): HotelAmbiguity => ({
            kind: "guests",
            reasons: amb.reasons,
            rawCell: amb.rawCell,
            parsedNames: slot.names,
          }),
        ),
        ...(slot.addressAmbiguity
          ? [
              {
                kind: "address" as const,
                reason: slot.addressAmbiguity.reason,
                splitInput: slot.addressAmbiguity.splitInput,
                rawCell: slot.addressAmbiguity.rawCell,
                parsedName: slot.hotel_name ?? null,
                parsedAddress: slot.hotel_address ?? null,
              },
            ]
          : []),
      ],
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
function parseInlineHotelRow(markdown: string, contextYear: string | null): PendingHotel[] {
  // RAW_HEADER_REGEX_ALLOWLIST: inline capture matcher; col0 token identity is registry-checked via SECTION_HEADER_TOKENS (see tests/parser/_metaKnownSectionsWalker.test.ts).
  const ROW_RE = /^\|\s*Hotel\s*Reservations?\s*\|([^|]+)/im;
  const m = ROW_RE.exec(markdown);
  if (!m) return [];

  const raw = clean(m[1]!);
  if (!raw) return [];

  return buildInlineReservations(raw, contextYear);
}

function parseHotelStaysRow(markdown: string, contextYear: string | null): PendingHotel[] {
  // v1 format: | Hotel Stays | <content> |
  // RAW_HEADER_REGEX_ALLOWLIST: inline capture matcher; col0 token identity is registry-checked via SECTION_HEADER_TOKENS (see tests/parser/_metaKnownSectionsWalker.test.ts).
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
function buildInlineReservations(raw: string, contextYear: string | null): PendingHotel[] {
  const checkInCount = (raw.match(/check\s+in/gi) ?? []).length;
  if (checkInCount < 2) {
    const built = buildInlineHotel(raw, 1, contextYear);
    // First stash wins: only consult the later re-split if the exit had none.
    let addr = built.addressAmbiguity;
    const rows = stripHotelNameConf([built.row], (_i, a) => (addr ??= a));
    return toPending(rows, [built.judgedGuestBoundary], [raw], [addr]);
  }

  const segments = splitInlineReservationGroups(raw);
  const builds = segments.map((seg, i) => buildInlineHotel(seg, i + 1, contextYear));
  const rows = builds.map((b) => b.row);
  // Detection runs for EVERY later segment BEFORE the all-names guard below decides
  // whether the cell collapses to a single reservation (spec §3 ordering): the
  // fallback path needs to know whether any later outcome carried hotel evidence.
  // Group 0 is never classified — it is the hotel every later group inherits from.
  const laterOutcomes = segments.map((seg, i) =>
    i === 0 ? null : classifyLaterSegment(seg, i + 1, contextYear),
  );
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
    // The provisional per-group builds are DISCARDED here, and their verdicts go
    // with them — only the surviving rebuilt reservation is evaluated (spec §3.1
    // row 8). That is what the stash-then-commit shape buys.
    const single = buildInlineHotel(raw, 1, contextYear);
    single.row.check_in = null;
    single.row.check_out = null;
    let addr = single.addressAmbiguity;
    const one = stripHotelNameConf([single.row], (_i, a) => (addr ??= a));
    // Scope B (spec §3): the per-group rows are discarded, but if ANY later segment's
    // outcome carried hotel evidence (tier 1 or tier 2, a D6 abort included), the cell
    // may book another hotel even though the parser could not split it — the operator
    // has to be told. Scope A also applies to the survivor, via the whole cell as its
    // own "segment"; both producers collapse to at most ONE stash.
    const survivorSuspect =
      laterOutcomes.some((o) => o !== null && (o.tier === 1 || o.tier === 2)) ||
      degradedSegmentHasEvidence(raw);
    return toPending(
      one,
      [single.judgedGuestBoundary],
      [raw],
      [addr],
      [survivorSuspect ? "hotel-suspected" : undefined],
    );
  }
  // Each group lists the same hotel once, with guest "Name—conf#" tokens glued in
  // before the first "Check In" (consultants). Strip those guest/confirmation
  // spans so the shared hotel name is the actual hotel/address, then apply it to
  // every group (later groups carry only a divider + guest, not the hotel).
  //
  // Parent spec §3.1 row 7 held that a later group NEVER emits, because its hotel was
  // ALWAYS inherited and no hotel/first-guest boundary was ever judged for it. That is
  // now conditional: §5 of
  // docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md
  // amends row 7 — `classifyLaterSegment` routes each later segment to one of three
  // tiers, and a TIER-1 group carries its OWN hotel (name + postal-complete address).
  // Such a group is standalone-parsed by `buildInlineHotel` over its hotel-free
  // remainder, so its exit DID judge a boundary and its verdict IS evaluated.
  // Tier-2/tier-3 groups still inherit, and for them row 7 stands unchanged: verdict
  // false, address stashes dropped.
  //
  // The earlier carve-out attempts row 7 refuted — group index, leading-divider run,
  // residual-word check — were all OUTPUT-derived proxies and each wrong in both
  // directions (whole-diff R3 finding 1). The detector is not one of those: it reads
  // the segment's own INPUT text through a structural partition that must account for
  // EVERY byte (S9), and any evidence outside that partition demotes to inheritance
  // plus a warning rather than to a silent keep. The pre-existing inheritance clobber
  // filed as BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL is what this closes.
  const verdicts = builds.map((b, i) => {
    if (i === 0) return b.judgedGuestBoundary;
    const outcome = laterOutcomes[i];
    return outcome?.tier === 1 ? outcome.build.judgedGuestBoundary : false;
  });

  // Spec §4 (S7): rows are processed IN ORDER and a tier-2/3 row inherits from the
  // NEAREST PRECEDING row that carries its own hotel — group 0, or the closest earlier
  // tier-1 group. Latching onto group 0 unconditionally hands a guest the wrong hotel
  // whenever an own-hotel group precedes them; latching onto the FIRST tier-1 group
  // makes the same error one hotel later.
  const baseName = sanitizeHotelName(rows[0]?.hotel_name ?? null);
  let inheritedName = baseName;
  rows.forEach((r, i) => {
    const outcome = laterOutcomes[i];
    if (i > 0 && outcome?.tier === 1) {
      // The kept row already carries `hotel_name = hotelText` / `hotel_address = null`;
      // the per-row stripHotelNameConf pass below splits it like any other row, and
      // every following inheriting row takes the SAME unsplit text so its own split
      // lands identically.
      rows[i] = outcome.build.row;
      inheritedName = outcome.hotelText;
      return;
    }
    r.hotel_name = i === 0 ? baseName : inheritedName;
  });

  // Spec §6.1/§4 stash discipline. OWN on every tier-1 kept row. SUSPECTED on every
  // tier-2 row AND on every row that INHERITS a tier-1 predecessor's hotel — whether
  // that guest belongs to the detected hotel or to the line's first one is exactly the
  // judgment the operator has to check, so a tier-3 inheritor is not silent. At most
  // one stash per row (the tier-1 branch returns before the inheritance branch).
  let sawTierOne = false;
  const detectorStashes: Array<"own-hotel" | "hotel-suspected" | undefined> = rows.map((_r, i) => {
    const outcome = laterOutcomes[i];
    if (i === 0) return undefined;
    if (outcome?.tier === 1) {
      sawTierOne = true;
      return "own-hotel";
    }
    if (outcome?.tier === 2 || sawTierOne) return "hotel-suspected";
    return undefined;
  });
  // Scope A applies to EVERY segment, group 0 included — a degraded segment 0 whose
  // post-first-marker region carries evidence has silently absorbed a later booking,
  // and no detector outcome exists for it. Assigned only where no stash exists yet, so
  // the max-one-per-row rule holds however many producers fire.
  segments.forEach((seg, i) => {
    if (detectorStashes[i]) return;
    if (degradedSegmentHasEvidence(seg)) detectorStashes[i] = "hotel-suspected";
  });
  // Address ambiguity follows the same row-7 anchor: only reservation 0's
  // hotel_name is the splitter's own output — every later row holds inherited
  // text. A later-row address warning is incoherent by construction: its parsed
  // payload would describe baseName (text from segment 0) while its raw
  // fragment is a guest-only segment that never contained that text, so its
  // "undo" replacement writes guest names into hotel_name (the R3 finding 2
  // corruption). Keep row 0's build stash; drop later builds' stashes (their
  // fragments were discarded by inheritance — whole-diff R1 finding 2) and
  // ignore later rows' re-split stashes (identical to row 0's by construction,
  // since every row now holds the same baseName).
  // A TIER-1 kept row is the second exception (spec §3 D6): its hotel_name is its OWN
  // segment's text, not inherited, so its re-split stash IS coherent — the "undo"
  // replacement writes back text the row's own raw fragment actually contained. Seed
  // only from the strip pass; the kept build's own stash came from the guest-only
  // remainder and describes no hotel text.
  const addrs = builds.map((b, i) => (i === 0 ? b.addressAmbiguity : undefined));
  const stripped = stripHotelNameConf(rows, (i, a) => {
    if (i === 0 || laterOutcomes[i]?.tier === 1) addrs[i] ??= a;
  });
  return toPending(stripped, verdicts, segments, addrs, detectorStashes);
}

/**
 * Pair each surviving row with a stashed guest ambiguity when its exit judged
 * the hotel/first-guest boundary. `rawCell` is the whole inline cell: no
 * substring of it is provably guest-scoped, which is why the warning is never
 * resolvable (spec R8).
 */
function toPending(
  rows: HotelReservationRow[],
  verdicts: boolean[],
  // Per-ROW raw fragment. Passing the parent cell gave every group the SAME
  // rawSnippet and therefore the same content hash, so ONE use-raw decision
  // rewrote every reservation's hotel_name to the whole booking line — the
  // other hotels, guests and date clauses included. That is crew-readable data
  // corruption on the new write-back path (whole-diff R3 finding 2).
  rawCells: string[],
  addressAmbiguities: Array<AddressSplitAmbiguity | undefined> = [],
  // Per-ROW detector verdict (spec 2026-07-27 §6.2). Slotted BETWEEN the guest and
  // address stashes so the per-row emit order is guest, own-hotel/suspected, address.
  detectorStashes: Array<"own-hotel" | "hotel-suspected" | undefined> = [],
): PendingHotel[] {
  return rows.map((row, i) => {
    const ambiguities: HotelAmbiguity[] = [];
    const rawCell = rawCells[i] ?? rawCells[0] ?? "";
    if (verdicts[i]) {
      ambiguities.push({ kind: "inline-guests", rawCell, parsedNames: row.names });
    }
    const detector = detectorStashes[i];
    if (detector) ambiguities.push({ kind: detector, rawCell });
    const addr = addressAmbiguities[i];
    if (addr) {
      ambiguities.push({
        kind: "address",
        reason: addr.reason,
        splitInput: addr.splitInput,
        rawCell,
        parsedName: row.hotel_name,
        parsedAddress: row.hotel_address,
      });
    }
    return { row, ambiguities };
  });
}

/**
 * Final privacy pass: strip any "<dash> #?<digits>" confirmation token from each
 * row's hotel_name. A "Hotel Stays"/inline cell with no "Check In" marker dumps the
 * whole string (guest conf#s included) into hotel_name, which is rendered + show-wide
 * readable. Runs AFTER sanitizeHotelName (which needs the conf# to locate guests).
 */
function stripHotelNameConf(
  rows: HotelReservationRow[],
  // Per-ROW sink. A single shared slot cannot attribute N rows' ambiguities:
  // every row after the first would either be dropped or misfiled onto row 0,
  // and "use raw" would then rewrite the wrong reservation (whole-diff R1 f1).
  sink?: (rowIndex: number, a: AddressSplitAmbiguity) => void,
): HotelReservationRow[] {
  rows.forEach((r, rowIndex) => {
    if (r.hotel_name) {
      // Strip any conf# (this is the final privacy pass for inline cells), THEN
      // split the venue name from the glued street address (#3). Only overwrite
      // hotel_address when the split actually found one — never clobber a value an
      // upstream path already set with null.
      const split = splitHotelNameAddress(stripConfTokens(r.hotel_name));
      if (split.ambiguity && sink) sink(rowIndex, split.ambiguity);
      r.hotel_name = split.name;
      if (split.address) r.hotel_address = split.address;
    }
  });
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
 * `judgedGuestBoundary` records which EXIT produced this reservation, which is
 * the only ground truth for "did the parser judge where the hotel ends and the
 * first guest begins?". Five successive attempts to infer it from the OUTPUT
 * were each falsified by a reachable input (spec §3.1), because on an unlabeled
 * line the first guest's boundary is exactly the fact nothing else evidences.
 */
type InlineBuild = {
  row: HotelReservationRow;
  judgedGuestBoundary: boolean;
  /** FIRST stash wins: the earliest split is the most specific one. */
  addressAmbiguity?: AddressSplitAmbiguity;
};

function buildInlineHotel(raw: string, ordinal: number, contextYear: string | null): InlineBuild {
  // Normalize HTML entities and line-break escapes
  const text = raw.replace(/&#10;/g, " ").replace(/\r/g, " ").replace(/\s+/g, " ").trim();

  // Extract check-in and check-out if present
  // Handle both "Check In: M/D" (no year) and "Check In: M/D/YY"
  const checkInMatch = /check\s+in[:\s]+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(text);
  const checkOutMatch = /check\s+out[:\s]+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(text);

  // Guest EVIDENCE in this cell: a dash-run + 4+-digit conf# that is NOT a
  // street number, a bare 6+-digit conf, or a #-conf — the same signals the
  // no-Check-In branch's `hasGuest` gate reads. Used by the final-return
  // classification (spec §3.1 rows 5/6): evidence present means a guest region
  // was examined even when every pattern lifted nothing.
  const hasGuestEvidence = (): boolean => {
    if (/\b\d{6,}\b|#\s*\d{4,}/.test(text)) return true;
    const re = /[-–—]{1,3}\s*#?\s*(\d{4,})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const numStart = m.index + m[0].length - m[1]!.length;
      if (!looksLikeStreetStart(" " + text.slice(numStart))) return true;
    }
    return false;
  };

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
            judgedGuestBoundary: true, // learn-K peeled the first guest off the hotel
            ...(split.ambiguity ? { addressAmbiguity: split.ambiguity } : {}),
            row: {
              ordinal,
              hotel_name: split.name,
              hotel_address: split.address,
              names,
              confirmation_no: null,
              check_in: null,
              check_out: null,
              notes: null,
            },
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
          judgedGuestBoundary: false, // no guests present, so no boundary judged
          ...(split.ambiguity ? { addressAmbiguity: split.ambiguity } : {}),
          row: {
            ordinal,
            hotel_name: split.name,
            hotel_address: split.address,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
        };
      }
    }
  }

  const names: string[] = [];
  // Exits 3/4/5 examined a guest region; exit 6 did not (spec §3.1).
  let examinedGuestRegion = false;

  // Pattern 1: "Doug Larson - 7414" style (name dash confirmation)
  const dashNumRe = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[-–—]{1,3}\s*[#]?\d+/g;
  let nm: RegExpExecArray | null;
  while ((nm = dashNumRe.exec(text)) !== null) {
    names.push(nm[1]!.trim());
    examinedGuestRegion = true; // exit 3
  }

  // Pattern 2: "Doug --- 104461566" (RIA forum, multiple dashes)
  if (names.length === 0) {
    const multiDashRe = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*-{2,}\s*\d+/g;
    let nm2: RegExpExecArray | null;
    while ((nm2 = multiDashRe.exec(text)) !== null) {
      names.push(nm2[1]!.trim());
      examinedGuestRegion = true; // exit 4
    }
  }

  // Pattern 3: Names after "Check Out: <date>" — used in 2025-05. Strip up to the
  // FIRST checkout (lazy `.*?`), not the last — a multi-checkout cell would
  // otherwise drop every guest before the final checkout.
  if (names.length === 0) {
    const postCheckout = text.replace(/.*?check\s+out\s*[:\s]+\S+/i, "").trim();
    if (postCheckout) {
      examinedGuestRegion = true; // exit 5 — even if the scan yields no names
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

  // A final return reached WITH guest evidence (a dash-conf delimiter or a
  // bare conf#) examined the guest region even when every pattern lifted
  // nothing — non-ASCII ("José Núñez"), all-caps, or initialed names defeat
  // the ASCII title-case matchers, and the guest silently vanishing with no
  // operator signal is the feature's motivating harm (whole-diff R5 f1; spec
  // §3.1 row 5's rationale: a scan that yields nothing is a guest-loss, not a
  // non-judgment). Row 6 — no warning — requires NO guest evidence at all.
  if (!examinedGuestRegion && hasGuestEvidence()) examinedGuestRegion = true;

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
    // Yearless M/D: back-fill the year from the show context (its DATES), which is
    // the reliable source. A bare 20xx token in the cell is an UNRELIABLE last
    // resort — it may be a street number ("2015 K St") or a 4-digit conf#, not a
    // year — so only fall back to it when the show-context year is unavailable.
    // Return null when no year can be inferred — never hard-code an era, which
    // would silently mis-date non-current shows.
    const year = contextYear ?? /\b(20\d\d)\b/.exec(text)?.[1] ?? null;
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
    judgedGuestBoundary: examinedGuestRegion,
    row: {
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
    },
  };
}

// ── Inline later-group own-hotel detector (spec 2026-07-27 §3) ────────────────
//
// A pure function over ONE later segment as returned by splitInlineReservationGroups.
// It answers a single question: does this group carry its OWN hotel (name + postal-
// complete address) safely enough to keep, or must it inherit group 0's hotel?
//
//   tier 1 — keep the group's own hotel (caller stashes HOTEL_INLINE_GROUP_OWN_HOTEL)
//   tier 2 — inherit as today, but the segment carries hotel evidence the parser
//            cannot safely attribute (caller stashes HOTEL_INLINE_GROUP_HOTEL_SUSPECTED)
//   tier 3 — inherit as today, silently (byte parity with the pre-feature parse)
//
// The pipeline is D1 normalize → D2 divider strip → D3 prefix cut → D4/D4b address
// anchor + tail extension → D5 tier decision (guards, caps, scans) → D6 rebuild.
// Tier 1 is reachable ONLY when the segment's ENTIRE text is accounted for by the
// structural partition (S9): the kept hotel text, a guard-bounded residual, and a
// post-prefix region that scans NEGATIVE for hotel evidence.

/** The three-tier verdict for one later reservation group. */
export type LaterSegmentOutcome =
  | { tier: 1; hotelText: string; build: InlineBuild }
  | { tier: 2 }
  | { tier: 3 };

/** D4b arm 1 — unit tail. The separator before the unit value is MANDATORY: without
 * it ordinary words are consumed through alias prefixes ("Steve" = "Ste"+"ve"). */
const D4B_UNIT_TAIL_RE =
  /^\s*,?\s*(?:Suite|Ste\.?|Unit|Apt\.?|Rm|Room|Floor|Fl)(?:\s+#?|\s*#)\s*[\w-]+/iu;
/** D4b arm 2 — comma-led, postal-anchored city/state/postal tail (city 1-3 words). */
const D4B_COMMA_POSTAL_RE =
  /^\s*,\s*(?:(?:[\p{L}][\p{L}.'-]*\s+){0,2}[\p{L}][\p{L}.'-]*,\s*)?[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u;
/** D4b arm 3 — comma-LESS city/state/postal tail (up to 3 city words). */
const D4B_COMMALESS_POSTAL_RE =
  /^\s+(?:[\p{L}][\p{L}.'-]*\s+){0,3}[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u;
/** Residual guard (b) / scan arm (i): an unconsumed "<ST> <postal>" anchor. The state
 * token is uppercase-only, exactly as the live STREET_ADDRESS_ZIP_RE writes it. */
const POSTAL_EVIDENCE_RE = /\b[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u;
/** Residual guard (a0): a BARE unit alias token. Token equality, so "Stephanie" and
 * "Florence" are not hits, and a dotted "Ste." is left to D6's c0 clause. */
const BARE_UNIT_ALIAS_RE = /^(?:Suite|Ste|Unit|Apt|Rm|Room|Floor|Fl)$/iu;
/** The optional direction token STREET_ADDRESS_RE allows before the street name. */
const STREET_DIRECTION_RE = /^(?:[NSEW]{1,2}|North|South|East|West)\.?$/iu;
const CHECK_IN_RE = /check\s+in/i;
const CHECK_IN_GLOBAL_RE = /check\s+in/gi;
/** D3 dash class: mirrors the stripConfTokens MATCHER — no trailing `\b`, because
 * D3's job is to keep the prefix free of anything the row-level strip pass would
 * later delete or mangle in crew-visible text. */
const D3_DASH_SOURCE = "(\\s*)([-\\u2013\\u2014]{1,3})(\\s*#?\\s*)(\\d{4,})";
const D3_HASH_SOURCE = "#\\s*\\d{4,}";
const D3_BARE_SOURCE = "\\b\\d{6,}\\b";
/** Scan arm (ii) dash family: mirrors hasGuestEvidence, whose dash arm KEEPS its `\b`. */
const ARM_II_DASH_SOURCE = "(\\s*)([-\\u2013\\u2014]{1,3})(\\s*#?\\s*)(\\d{4,})\\b";

/**
 * D1 — normalize. buildInlineHotel's entity rewrite EXTENDED with `&#9;` (the other
 * exporter whitespace entity), then the live `normalizeHotelCellText` semantics:
 * zero-width out, straight/smart double quotes to spaces, whitespace collapsed.
 *
 * Detector-internal and scan-input only — no persisted `rawSnippet` is ever built
 * from this text. Exported so the caller-side scope-A/B scans normalize identically;
 * a scan left on the old `&#10;`-only rewrite misses evidence a tab entity splits.
 */
export function normalizeLaterSegmentText(raw: string): string {
  return normalizeHotelCellText(
    raw.replace(/&#10;/g, " ").replace(/&#9;/g, " ").replace(/\r/g, " "),
  );
}

/** Whitespace word count minus a trailing single-letter initial ("Eric W" → 1) —
 * the same rule the no-Check-In branch applies at hotels.ts:945-948. */
function detectorBaseWords(s: string): number {
  const w = s.split(/\s+/).filter(Boolean);
  return w.length > 1 && /^\p{Lu}\.?$/u.test(w[w.length - 1]!) ? w.length - 1 : w.length;
}

function plainWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * The `stripConfTokens` ZIP+4 predicate, all five clauses: a single ASCII hyphen, no
 * separator, exactly 4 digits, a word-boundary 5-digit run immediately before, and no
 * word character after. A true ZIP+4 hyphen is postal bytes, never a conf delimiter.
 */
function isZip4Hyphen(
  str: string,
  offset: number,
  whole: string,
  ws: string,
  dashes: string,
  sep: string,
  digits: string,
): boolean {
  const afterMatch = str.charAt(offset + whole.length);
  return (
    dashes === "-" &&
    sep.length === 0 &&
    digits.length === 4 &&
    /\b\d{5}$/.test(str.slice(0, offset + ws.length)) &&
    (afterMatch === "" || !/\w/.test(afterMatch))
  );
}

/** First qualifying D3 dash-run delimiter at or after `from`; `null` if none. */
function nextDashDelimiter(
  str: string,
  from: number,
  source: string,
): { start: number; end: number } | null {
  const re = new RegExp(source, "gu");
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const [whole, ws = "", dashes = "", sep = "", digits = ""] = m;
    if (isZip4Hyphen(str, m.index, whole, ws, dashes, sep, digits)) continue;
    return { start: m.index + ws.length, end: m.index + whole.length };
  }
  return null;
}

function nextSimpleMatch(
  str: string,
  from: number,
  source: string,
): { start: number; end: number } | null {
  const re = new RegExp(source, "gu");
  re.lastIndex = from;
  const m = re.exec(str);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/**
 * D6 clauses c1/c2 count D3-class delimiter TOKENS by ONE left-to-right scan, taking
 * at each position the earliest match start (tie: longest span) and CONSUMING it — so
 * overlapping family matches merge into a single token ("- 2035940" is ONE token, not
 * a dash plus a bare run). A per-family count scores the ratified two-guest keep as
 * four delimiters against two names and falsely demotes it.
 */
function countConfDelimiterTokens(region: string): number {
  let pos = 0;
  let count = 0;
  while (pos < region.length) {
    const candidates = [
      nextDashDelimiter(region, pos, D3_DASH_SOURCE),
      nextSimpleMatch(region, pos, D3_HASH_SOURCE),
      nextSimpleMatch(region, pos, D3_BARE_SOURCE),
    ].filter((c): c is { start: number; end: number } => c !== null);
    if (candidates.length === 0) break;
    let best = candidates[0]!;
    for (const c of candidates.slice(1)) {
      if (c.start < best.start || (c.start === best.start && c.end > best.end)) best = c;
    }
    count += 1;
    pos = best.end;
  }
  return count;
}

/**
 * The RESTRICTED dash neutralizer for scan arm (i). Only a dash run IMMEDIATELY
 * followed by a digit is replaced, and never a true ZIP+4 hyphen. It reveals a street
 * number glued to a preceding dash or word ("-1515 Madison Ave", "Hilton-1515 Madison
 * Ave") that defeats the street regex's leading-whitespace anchor while arm (ii)
 * street-start-suppresses the same candidate — evidence otherwise invisible to BOTH
 * arms. Scan-input only: never D3, never persisted text.
 */
function neutralizeGluedDashes(s: string): string {
  return s.replace(/[-–—]+(?=\d)/gu, (run: string, offset: number) => {
    const digits = /^\d+/.exec(s.slice(offset + run.length))?.[0] ?? "";
    const afterMatch = s.charAt(offset + run.length + digits.length);
    const isZip4 =
      run === "-" &&
      digits.length === 4 &&
      /\b\d{5}$/.test(s.slice(0, offset)) &&
      (afterMatch === "" || !/\w/.test(afterMatch));
    return isZip4 ? run : " ";
  });
}

/** Scan arm (i): street/postal evidence in a region, read RAW and dash-neutralized. */
function hasAddressEvidence(region: string): boolean {
  for (const read of [region, neutralizeGluedDashes(region)]) {
    const padded = " " + read;
    if (STREET_ADDRESS_RE.test(padded)) return true;
    if (STREET_ADDRESS_ZIP_RE.test(padded)) return true;
    if (POSTAL_EVIDENCE_RE.test(read)) return true;
  }
  return false;
}

/**
 * Scan arm (ii): a confirmation token of any LIVE family after the region's start.
 * Mirrors `hasGuestEvidence` with ONE normative delta — the dash family carries D3's
 * ZIP+4 exclusion, which live `hasGuestEvidence` lacks. Without it a post-marker
 * ZIP+4 reads as a conf token and falsely demotes a fully-qualifying keep.
 */
function hasConfTokenEvidence(region: string): boolean {
  if (new RegExp(D3_HASH_SOURCE, "u").test(region)) return true;
  if (new RegExp(D3_BARE_SOURCE, "u").test(region)) return true;
  const re = new RegExp(ARM_II_DASH_SOURCE, "gu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(region)) !== null) {
    const [whole, ws = "", dashes = "", sep = "", digits = ""] = m;
    if (isZip4Hyphen(region, m.index, whole, ws, dashes, sep, digits)) continue;
    const numStart = m.index + whole.length - digits.length;
    if (!looksLikeStreetStart(" " + region.slice(numStart))) return true;
  }
  return false;
}

/** Interior word run of a STREET_ADDRESS_RE match: between number/direction and suffix. */
function streetArmInteriorWords(matchText: string): number {
  const m = /^\s*\d{1,5}\s+([\s\S]*)$/u.exec(matchText);
  if (!m) return 0;
  const words = m[1]!.split(/\s+/).filter(Boolean);
  if (words.length > 0 && STREET_DIRECTION_RE.test(words[0]!)) words.shift();
  return Math.max(0, words.length - 1); // the last word is the street suffix
}

/** Interior word run of a STREET_ADDRESS_ZIP_RE match: between number and first comma. */
function zipArmInteriorWords(matchText: string): number {
  const m = /^\s*\d{1,5}\s+([^,]*),/u.exec(matchText);
  return m ? m[1]!.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * D3 — prefix cut at the five-way minimum. Every dash-run candidate is a delimiter,
 * street-shaped or not, hashed or not, subject ONLY to the ZIP+4 exclusion: a street
 * exemption lets a guest between the hotel and a dash-street reach tier 1 and be
 * buried inside the kept `hotel_name`.
 */
function computePrefixEnd(s2: string): number {
  const ends = [s2.length];
  const dash = nextDashDelimiter(s2, 0, D3_DASH_SOURCE);
  if (dash) ends.push(dash.start);
  const hash = nextSimpleMatch(s2, 0, D3_HASH_SOURCE);
  if (hash) ends.push(hash.start);
  const bare = nextSimpleMatch(s2, 0, D3_BARE_SOURCE);
  if (bare) ends.push(bare.start);
  const marker = CHECK_IN_RE.exec(s2);
  if (marker) ends.push(marker.index);
  return Math.min(...ends);
}

type AnchorMatch = { start: number; end: number; text: string; postalAnchored: boolean };

/** D4 — address anchor. Both regexes read against `" " + prefix`; smaller index wins,
 * ties break to the LONGER match (only the ZIP match spans a comma-less city tail). */
function computeAnchor(prefix: string): AnchorMatch | null {
  const padded = " " + prefix;
  const street = STREET_ADDRESS_RE.exec(padded);
  const zip = STREET_ADDRESS_ZIP_RE.exec(padded);
  let winner: RegExpExecArray | null = null;
  let postalAnchored = false;
  if (street && zip) {
    const zipWins =
      zip.index < street.index || (zip.index === street.index && zip[0].length > street[0].length);
    winner = zipWins ? zip : street;
    postalAnchored = zipWins;
  } else if (zip) {
    winner = zip;
    postalAnchored = true;
  } else if (street) {
    winner = street;
  }
  if (!winner) return null;
  // Unpad: the match's leading `\s` is the pad for a position-0 address, so the match
  // index in the padded string IS the address start index in the unpadded prefix.
  return {
    start: winner.index,
    end: winner.index + winner[0].length - 1,
    text: winner[0],
    postalAnchored,
  };
}

/**
 * Scope A (spec §3) — the caller-side degraded-segment evidence scan.
 *
 * A segment holding TWO OR MORE `Check In` markers glued multiple bookings together
 * (an intermediate checkout is missing), and the detector cannot classify what it
 * cannot segment. The scan asks a narrower question the partition cannot: does the
 * region AFTER the segment's first marker carry recognizable booking evidence? That
 * region can only hold later bookings' material, since the segment's own hotel text
 * precedes its first marker.
 *
 * The scan input is D1-NORMALIZED and the first marker is located in that normalized
 * text — raw-byte scanning misses evidence an exporter entity or a quote splits
 * (`200&#10;Oak Ave` matches only after normalization). Only the INPUT is normalized;
 * the stashed `rawSnippet` stays the raw text.
 *
 * The arm definitions are the detector's, deliberately shared: two scan sites reading
 * "conf token" or "street evidence" differently is exactly the drift these oracles pin.
 */
function degradedSegmentHasEvidence(rawSegment: string): boolean {
  const s = normalizeLaterSegmentText(rawSegment);
  if ((s.match(CHECK_IN_GLOBAL_RE) ?? []).length < 2) return false;
  const first = CHECK_IN_RE.exec(s);
  if (!first) return false;
  const region = s.slice(first.index + first[0].length);
  return hasAddressEvidence(region) || hasConfTokenEvidence(region);
}

/**
 * Classify one later reservation group.
 *
 * `rawSegment` is the PRE-D1 segment as returned by `splitInlineReservationGroups`.
 * `ordinal` carries a PRECONDITION, not a runtime check: callers pass the group's
 * positive integer ordinal. The detector never runs on group 0 and never on
 * single-group cells; the scope-A/B degraded scans are the caller's.
 */
export function classifyLaterSegment(
  rawSegment: string,
  ordinal: number,
  contextYear: string | null,
): LaterSegmentOutcome {
  // D1 — normalize.
  const s = normalizeLaterSegmentText(rawSegment);
  if (!s) return { tier: 3 };

  // D2 — divider strip. Later groups in the shared-hotel shape begin with a divider;
  // a hotel name never does.
  const s2 = s.replace(/^[\s\-–—]+/u, "");
  if (!s2) return { tier: 3 };

  // A segment with two or more markers glued multiple bookings together and cannot be
  // attributed — tier 1 is unreachable for it, however well its prefix qualifies.
  const markerCount = (s2.match(CHECK_IN_GLOBAL_RE) ?? []).length;

  // D3 — prefix.
  const prefixEnd = computePrefixEnd(s2);
  const prefix = s2.slice(0, prefixEnd).trim();

  // S9 post-prefix scan. Arm (i) reads everything after the prefix; arm (ii) reads
  // only AFTER the first marker, because a clean multi-guest booking legitimately
  // carries conf delimiters BEFORE its marker.
  const postGuest = s2.slice(prefixEnd);
  const firstMarker = CHECK_IN_RE.exec(s2);
  const postMarker = firstMarker ? s2.slice(firstMarker.index + firstMarker[0].length) : "";
  const postPrefixPositive =
    hasAddressEvidence(postGuest) || (firstMarker !== null && hasConfTokenEvidence(postMarker));

  // D4 — address anchor.
  const anchor = computeAnchor(prefix);

  if (anchor) {
    const qualifies = evaluateTierOneGates(s2, prefix, anchor, ordinal, contextYear);
    if (qualifies && markerCount <= 1 && !postPrefixPositive) return qualifies;
    return { tier: 2 };
  }

  if (postPrefixPositive) return { tier: 2 };
  // D5 word arm: a prefix long enough to hold a hotel plus a guest is evidence of an
  // own hotel the detector could not anchor; 3-word prefixes stay silent because
  // 3-word guest names are common.
  if (detectorBaseWords(prefix) >= 4) return { tier: 2 };
  return { tier: 3 };
}

/**
 * The tier-1 conjuncts that depend on the address anchor: D4b tail extension with the
 * postal stop, S8 postal provenance, the free-run interior caps, the name-region guard
 * (d), the residual-tail guard (a0/a/b/c), and the D6 rebuild (c0/c1/c2). Returns the
 * tier-1 outcome when every conjunct holds, `null` otherwise.
 */
function evaluateTierOneGates(
  s2: string,
  prefix: string,
  anchor: AnchorMatch,
  ordinal: number,
  contextYear: string | null,
): Extract<LaterSegmentOutcome, { tier: 1 }> | null {
  // Free-run interior caps: guest words consumed INSIDE an address match are invisible
  // to guard (d) and the residual guard, so the caps are the only defense there.
  if (anchor.postalAnchored) {
    if (zipArmInteriorWords(anchor.text) > 4) return null;
  } else if (streetArmInteriorWords(anchor.text) > 3) {
    return null;
  }

  // D4b — tail extension, POSTAL-FIRST (arm 2, arm 3, arm 1). The loop TERMINATES the
  // moment a postal-anchored component is consumed: the postal anchor proves the
  // address end, so nothing after it may be consumed. A D4 ZIP match is itself postal-
  // anchored, so no extension follows it.
  let addressEnd = anchor.end;
  let postalTerminated = anchor.postalAnchored;
  while (!postalTerminated) {
    const tail = prefix.slice(addressEnd);
    const comma = D4B_COMMA_POSTAL_RE.exec(tail);
    if (comma) {
      addressEnd += comma[0].length;
      postalTerminated = true;
      break;
    }
    const commaless = D4B_COMMALESS_POSTAL_RE.exec(tail);
    if (commaless) {
      addressEnd += commaless[0].length;
      postalTerminated = true;
      break;
    }
    const unit = D4B_UNIT_TAIL_RE.exec(tail);
    if (!unit) break;
    addressEnd += unit[0].length;
  }
  // S8 provenance: arm 1's `[\w-]+` unit value counterfeits every postal shape
  // ("Suite 12345", "Unit M5V2T6"), so a trailing-SHAPE check is not sufficient.
  if (!postalTerminated) return null;

  // Name-region guard (d) — a DAMAGE BOUND on how much unconfirmed text a kept
  // hotel_name can absorb. Plain count, deliberately NOT baseWords: a trailing initial
  // in the name region is guest evidence, not hotel branding.
  if (plainWords(s2.slice(0, anchor.start).trim()) > 4) return null;

  // Residual-tail guard over the pre-guest residue.
  const remainder = prefix.slice(addressEnd);
  const remainderTrimmed = remainder.trim();
  const firstWord = remainderTrimmed.split(/\s+/).filter(Boolean)[0] ?? "";
  if (BARE_UNIT_ALIAS_RE.test(firstWord)) return null; // (a0) stranded unit designation
  if (/^\s*,/u.test(remainder)) return null; // (a) ZIP-less city tail
  if (POSTAL_EVIDENCE_RE.test(remainder)) return null; // (b) unconsumed postal anchor
  if (detectorBaseWords(remainderTrimmed) > 2) return null; // (c) note text on the guest

  // D6 — rebuild. The existing machinery extracts guests and dates from the hotel-free
  // remainder; the detector only replaces the hotel text.
  const hotelText = s2.slice(0, addressEnd).trim();
  const rest = s2.slice(addressEnd).trim();
  const rebuild = buildInlineHotel(rest, ordinal, contextYear);
  if (rebuild.row.names.length === 0) return null; // (c0)
  const restMarker = CHECK_IN_RE.exec(rest);
  const preMarker = restMarker ? rest.slice(0, restMarker.index) : rest;
  const preMarkerTokens = countConfDelimiterTokens(preMarker);
  // (c1) live Pattern 1 lifts only two-plus-word ASCII title-case guests, so a
  // one-word guest alongside a conforming one vanishes silently.
  if (rebuild.row.names.length < preMarkerTokens) return null;
  // (c2) with two or more delimiters the no-Check-In learn-K path assumes a hotel
  // prefix and eats the first guest's lead words.
  if (!restMarker && preMarkerTokens > 1) return null;

  return {
    tier: 1,
    hotelText,
    build: {
      ...rebuild,
      row: { ...rebuild.row, hotel_name: hotelText, hotel_address: null },
    },
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

// TRANSFORM_SITES (spec 2026-07-07-ambiguity-warnings-v1 §6) — value-producing
// transform sites in this file that rest on a JUDGMENT the parser could get wrong.
export const TRANSFORM_SITES: ReadonlyArray<
  { site: string; code: string } | { site: string; exempt: string }
> = [
  { site: "parseGuestCell structured glue/split", code: "HOTEL_GUEST_SPLIT_AMBIGUOUS" },
  { site: "cardinality cap (MAX_HOTELS truncation)", code: "HOTEL_CARDINALITY_EXCEEDED" },
  { site: "inline guest paths", code: "HOTEL_GUEST_SPLIT_AMBIGUOUS" },
  { site: "splitHotelNameAddress name/address boundary", code: "HOTEL_ADDRESS_SPLIT_AMBIGUOUS" },
  { site: "inline later-group own-hotel detector", code: "HOTEL_INLINE_GROUP_OWN_HOTEL" },
  { site: "inline later-group own-hotel detector", code: "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED" },
];
