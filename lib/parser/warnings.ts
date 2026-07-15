/**
 * ParseAggregator — collects warnings and raw_unrecognized entries during parsing.
 *
 * Passed by reference through each block parser so all soft signals accumulate
 * in a single shared object. The orchestrator (Task 1.11) merges these into
 * ParsedSheet.warnings / ParsedSheet.raw_unrecognized after all block parsers run.
 *
 * Pattern: functional (plain object), not a class — per Task 1.10 scope decision.
 */

import type { ParseWarning, UseRawResolution } from "./types";
import { collapse, contentHashForRawSnippet, contentHashForDateTokens } from "./useRawContentHash";
import { stripConfirmationTokens } from "./blocks/_helpers";

export type RawUnrecognized = { block: string; key: string; value: string };

export type ParseAggregator = {
  warnings: ParseWarning[];
  rawUnrecognized: RawUnrecognized[];
};

export function newAggregator(): ParseAggregator {
  return { warnings: [], rawUnrecognized: [] };
}

/**
 * D1 — fail-loud "recognized section header but parsed zero fields" code. Exported
 * for tests; the emit site below uses the STRING LITERAL (matching every other
 * parser warning code) so `scripts/extract-internal-code-enums.ts`'s `code: "..."`
 * scanner records it in the internal-code manifest (x2 no-raw-codes). The literal
 * is also registered in §12.4 as admin-log-only + `lib/messages/catalog.ts` (all-null
 * row) so the x1 orphan-code guard passes — every active-style code literal must be
 * in §12.4. The test pins `SECTION_HEADER_NO_FIELDS === the literal`.
 */
export const SECTION_HEADER_NO_FIELDS = "SECTION_HEADER_NO_FIELDS";

/**
 * Emit a `severity:"warn"` warning when a block parser recognized a section
 * header but extracted no fields (a silent section-drop). `severity:"warn"` is
 * mandatory — `warningSummary()` filters to "warn" for the operator-facing
 * StagedReviewCard, so an "info" emit would never surface. No-ops when `agg` is
 * undefined (the aggregator is optional in block-parser signatures).
 */
export function emitEmptySection(agg: ParseAggregator | undefined, section: string): void {
  if (!agg) return;
  agg.warnings.push({
    severity: "warn",
    code: "SECTION_HEADER_NO_FIELDS",
    message: `Recognized "${section}" section header but parsed zero fields — section dropped.`,
    blockRef: { kind: section },
  });
}

/**
 * Data-quality warning codes (parse-data-quality-warnings, §5). Each is its own
 * exported string-literal const so tests can pin it, but every EMIT site below
 * uses the STRING LITERAL (matching `emitEmptySection`) so
 * `scripts/extract-internal-code-enums.ts`'s `code: "..."` scanner records them
 * in the internal-code manifest (x2 no-raw-codes). Each is also registered in
 * §12.4 as admin-log-only + `lib/messages/catalog.ts` (all-null row) so the x1
 * orphan-code guard passes — every active-style code literal must be in §12.4.
 * They render via the inline `.message` at operator surfaces, NOT via
 * `lib/messages/lookup.ts`.
 */
export const FIELD_UNREADABLE = "FIELD_UNREADABLE";
export const UNKNOWN_SECTION_HEADER = "UNKNOWN_SECTION_HEADER";
export const BLOCK_DISAPPEARED = "BLOCK_DISAPPEARED";

/**
 * Class A (§5.1) — emit a `severity:"warn"` warning when a field carried a
 * non-empty value that produced nothing usable: a crew phone with no digits → no
 * `tel:` link, or a crew email with no "@" → no `mailto:` link. Scope = crew
 * phone + email (the two PersonRow tap-targets). No-ops when `agg` is undefined
 * (the aggregator is optional in block-parser signatures).
 */
export function emitFieldUnreadable(
  agg: ParseAggregator | undefined,
  params: { section: string; field: string; rawSnippet: string; index: number; name: string },
): void {
  if (!agg) return;
  // OUTCOME-NEUTRAL wording (whole-diff review R2): describe the SHEET problem — the
  // cell value isn't a usable phone/email — NOT a claim about the rendered crew page.
  // The parser can't promise "no link will appear": on the MI-11 hold path an existing
  // member's prior (valid) value is pinned back pending approval, so the OLD link can
  // still render. Naming the data problem is true on every apply path. Field-specific
  // only in the noun; same sentence shape so the panel reads uniformly.
  const isEmail = params.field === "email";
  const fieldWord = isEmail ? "email" : "phone";
  const kind = isEmail ? "email address" : "phone number";
  agg.warnings.push({
    severity: "warn",
    code: "FIELD_UNREADABLE",
    message: `Crew ${fieldWord} for row ${params.index + 1} couldn't be read as a ${kind} ("${params.rawSnippet}") — check the sheet.`,
    // Carry the crew member's NAME (the synthesis-stable per-row key the crew-role raw-grid
    // scanner also keys on) so attachSourceCellAnchors resolves a per-ROW source cell.
    // Distinct crew rows → distinct anchors → they survive operatorActionableWarnings dedup
    // instead of collapsing to the single crew region anchor. (idx32/#154)
    blockRef: { kind: params.section, index: params.index, name: params.name },
    rawSnippet: params.rawSnippet,
  });
}

/**
 * Class B (§5.2) — emit a `severity:"warn"` warning for a section-header-shaped
 * row whose col0 matches no known-section-header in the registry (its rows were
 * silently dropped). No-ops when `agg` is undefined.
 */
export function emitUnknownSection(agg: ParseAggregator | undefined, headerText: string): void {
  if (!agg) return;
  agg.warnings.push({
    severity: "warn",
    code: "UNKNOWN_SECTION_HEADER",
    message: `Unrecognized section "${headerText}" — its rows were not parsed.`,
    blockRef: { kind: "unknown_section" },
    rawSnippet: headerText,
  });
}

/**
 * Emit an UNKNOWN_FIELD operator-review warning + a structured raw_unrecognized
 * entry for a row whose label resolved to no known field inside a block scope.
 * `block` names the source (diagnostic message + raw_unrecognized.block); `kind`
 * is the deep-link RegionId (usually == block; event-details uses 'details').
 * Mirrors emitFieldUnreadable/emitUnknownSection. (unknown-label coverage)
 */
/**
 * §4.1 (2026-07-07-ambiguity-warnings-v1) — emit a `severity:"warn"` warning when
 * `splitRoomHeader` had to CHOOSE between plausible name/dims readings while still
 * producing a room (an AMBIGUITY_CODES member — never blocks publish). The room is
 * KEPT; the warning flags a judgment call. Emission is centralized here (callers
 * attach `ambiguity` metadata to the room object; parseRooms emits once per kept
 * room at its single commit point) so no call site can go dark or double-emit.
 *
 * `blockRef.kind` is ALWAYS the literal `"rooms"` (KIND_TO_SECTION maps "rooms" only;
 * a RoomKind-valued kind would misroute). `field` names the ambiguous side
 * ("dims" | "name"). `message` is inline (mirrors the sibling emitters above), NOT
 * routed through lib/messages/lookup — the code is registered in §12.4 + catalog.ts
 * so the x1 orphan-code guard passes. No-ops when `agg` is undefined.
 */
export const ROOM_HEADER_SPLIT_AMBIGUOUS = "ROOM_HEADER_SPLIT_AMBIGUOUS";
export function emitRoomSplitAmbiguity(
  agg: ParseAggregator | undefined,
  params: {
    name: string;
    field: "dims" | "name";
    rawHeader: string;
    // The transform's split values, captured so the "use raw" resolution can show
    // parsed-vs-raw and the overlay can restore the parsed side (spec §6).
    dimensions: string | null;
    floor: string | null;
    // Room position in the FINAL rooms array — the overlay locates the row to rewrite
    // via `blockRef.index` (spec §6/§7), the same anchor hotels use. Required because
    // two distinct rooms can parse to the same {name, dimensions, floor} from different
    // raw headers; tuple-match alone cannot disambiguate them (Codex R3 F1/F2).
    index: number;
  },
): void {
  if (!agg) return;
  const fieldWord = params.field === "dims" ? "dimensions" : "name";
  const rawOneLine = collapse(params.rawHeader);
  const forName = params.name ? ` for "${params.name}"` : "";
  // §6 resolution: `parsed` = the transform's split; `replacement` = the raw
  // header as the room name with dims/floor cleared. Empty-raw guard when the
  // collapsed header is blank (nothing to substitute).
  const resolution: UseRawResolution =
    rawOneLine === ""
      ? { resolvable: false, reason: "empty-raw" }
      : {
          resolvable: true,
          contentHash: contentHashForRawSnippet(params.rawHeader),
          parsed: {
            kind: "rooms",
            name: params.name,
            dimensions: params.dimensions,
            floor: params.floor,
          },
          replacement: { kind: "rooms", name: rawOneLine, dimensions: null, floor: null },
        };
  agg.warnings.push({
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: `Room line "${rawOneLine}" could be split into name and dimensions more than one way, so we picked the most likely reading; double-check the ${fieldWord}${forName}.`,
    blockRef: { kind: "rooms", name: params.name, field: params.field, index: params.index },
    rawSnippet: params.rawHeader,
    resolution,
  });
}

/**
 * §4.2 (2026-07-07-ambiguity-warnings-v1) — emit a `severity:"warn"` warning when
 * `parseGuestCell` had to guess whether a structured hotel guest cell glued
 * multiple guests together while still PRODUCING names (an AMBIGUITY_CODES member
 * — never blocks publish). Exactly ONE warning per triggering guest CELL: the
 * pure `parseGuestCell` returns `ambiguity.reasons` (which branch(es) fired) and
 * the caller emits once with the whole raw cell as `rawSnippet`.
 *
 * `blockRef.kind` is ALWAYS `"hotels"` (KIND_TO_SECTION routes on it). `field` is
 * always `"guests"`. `name` is the caller's parsed `hotel_name` when it is already
 * resolved at emit time (structured left/right-slot path); when the slot's
 * `hotel_name` is null/unresolved, `name` is OMITTED (exactOptional — the key is
 * absent, never `undefined`) — `kind` alone routes; `name` only sharpens the
 * callout. `message` is inline (mirrors the sibling emitters); the code is
 * registered in §12.4 + catalog.ts so the x1 orphan-code guard passes. No-ops when
 * `agg` is undefined.
 */
export const HOTEL_GUEST_SPLIT_AMBIGUOUS = "HOTEL_GUEST_SPLIT_AMBIGUOUS";
export function emitHotelGuestSplitAmbiguity(
  agg: ParseAggregator | undefined,
  params: {
    name?: string | null;
    reasons: string[];
    rawCell: string;
    // Reservation position in the final hotels array — the overlay locates the row
    // to rewrite via `blockRef.index` (spec §6/§7).
    index: number;
    // The transform's split, captured for the "use raw" resolution (spec §6).
    parsedNames: string[];
    confirmationNo: string | null;
  },
): void {
  if (!agg) return;
  const rawOneLine = collapse(params.rawCell);
  // The crew-readable raw replacement value: the raw guest cell as ONE names entry, but
  // with confirmation-number tokens stripped — `hotel_reservations.names` is crew-readable
  // and the normal parse removes conf#s, so the "use raw" value must too (Codex R10 HIGH).
  const strippedRaw = stripConfirmationTokens(params.rawCell);
  const count = params.reasons.length;
  const spots = count === 1 ? "spot" : "spots";
  // Build blockRef with a conditionally-present `name` (exactOptionalPropertyTypes:
  // never assign `undefined` — omit the key entirely when the hotel is unresolved).
  const blockRef: { kind: string; name?: string; field: string; index: number } = {
    kind: "hotels",
    field: "guests",
    index: params.index,
  };
  if (params.name) blockRef.name = params.name;
  // §6 resolution: `parsed` = the transform's split; `replacement` = the raw cell as a
  // SINGLE names entry with confirmation tokens stripped (crew-privacy — see strippedRaw).
  // Empty-raw guard when the cell is blank OR reduces to nothing but conf tokens (an
  // all-conf cell has no crew-safe name to show, so use-raw is not offered).
  const resolution: UseRawResolution =
    strippedRaw === ""
      ? { resolvable: false, reason: "empty-raw" }
      : {
          resolvable: true,
          contentHash: contentHashForRawSnippet(params.rawCell),
          parsed: {
            kind: "hotels",
            names: params.parsedNames,
            confirmationNo: params.confirmationNo,
          },
          replacement: { kind: "hotels", names: [strippedRaw], confirmationNo: null },
        };
  agg.warnings.push({
    severity: "warn",
    code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
    message: `Guest cell "${rawOneLine}" may glue multiple guests together (${count} ${spots}), so we picked the most likely split; double-check the guest list.`,
    blockRef,
    rawSnippet: params.rawCell,
    resolution,
  });
}

/**
 * §4.2b (2026-07-07-ambiguity-warnings-v1) — emit a `severity:"warn"` warning when
 * the hotel-cardinality cap truncated the reservation list (more than `cap` hotels
 * found). This is a DETECTED PROBLEM (dropped hotels), NOT a judgment call — it is
 * a GAP_CLASSES code but is deliberately NOT in AMBIGUITY_CODES. `blockRef` is
 * section-scoped (`{ kind: "hotels" }`) with NO `field` — it is not a per-field
 * judgment. The log-only `HOTELS_PARSE_WARNING` telemetry emit stays alongside
 * (log + aggregator are not mutually exclusive). No-ops when `agg` is undefined.
 */
export const HOTEL_CARDINALITY_EXCEEDED = "HOTEL_CARDINALITY_EXCEEDED";
export function emitHotelCardinalityExceeded(
  agg: ParseAggregator | undefined,
  params: { found: number; cap: number },
): void {
  if (!agg) return;
  agg.warnings.push({
    severity: "warn",
    code: "HOTEL_CARDINALITY_EXCEEDED",
    message: `Found ${params.found} hotels; only the first ${params.cap} are shown; the rest were dropped.`,
    blockRef: { kind: "hotels" },
  });
}

/**
 * §4.3 (2026-07-07-ambiguity-warnings-v1) — emit a `severity:"warn"` warning when
 * the DATES-block sequence check found the show dates only sort into chronological
 * order if re-read day-first (DMY), while our month-first (MDY) reading has them
 * decreasing somewhere (an AMBIGUITY_CODES member — never blocks publish; the dates
 * are KEPT as parsed). This is a JUDGMENT call: the sheet was likely written
 * day-first. `blockRef` is `{ kind: "dates", field: "order" }` (block-level, not a
 * per-row anchor). `rawSnippet` is the FIRST out-of-order raw date token (the token
 * at the first MDY-decreasing position). `message` is inline (mirrors the sibling
 * emitters); the code is registered in §12.4 + catalog.ts so the x1 orphan-code
 * guard passes. No-ops when `agg` is undefined.
 */
export const DATE_ORDER_SUGGESTS_DMY = "DATE_ORDER_SUGGESTS_DMY";
export function emitDateOrderSuggestsDmy(
  agg: ParseAggregator | undefined,
  // `resolution` is built by the caller (dates.ts) — it owns DateToken + the
  // slot→date mapping and the block token list needed for the content hash, so
  // building it there avoids a warnings.ts ↔ dates.ts import cycle (spec §6).
  params: { rawSnippet: string; resolution: UseRawResolution },
): void {
  if (!agg) return;
  agg.warnings.push({
    severity: "warn",
    code: "DATE_ORDER_SUGGESTS_DMY",
    message: `Show dates in the DATES section only sort in order if read day-first (e.g. "${params.rawSnippet}"); we read them month-first, so every parsed date may be wrong; double-check the date order in the sheet.`,
    blockRef: { kind: "dates", field: "order" },
    rawSnippet: params.rawSnippet,
    resolution: params.resolution,
  });
}

export function emitUnknownField(
  agg: ParseAggregator | undefined,
  opts: { block: string; kind: string; key: string; value: string },
): void {
  if (!agg) return;
  const key = opts.key.trim();
  const value = opts.value ?? "";
  agg.warnings.push({
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `Unrecognized ${opts.block} row label: '${key}'`,
    blockRef: { kind: opts.kind, name: key },
    rawSnippet: `${key} | ${value}`,
  });
  agg.rawUnrecognized.push({ block: opts.block, key, value });
}
