/**
 * ParseAggregator — collects warnings and raw_unrecognized entries during parsing.
 *
 * Passed by reference through each block parser so all soft signals accumulate
 * in a single shared object. The orchestrator (Task 1.11) merges these into
 * ParsedSheet.warnings / ParsedSheet.raw_unrecognized after all block parsers run.
 *
 * Pattern: functional (plain object), not a class — per Task 1.10 scope decision.
 */

import type { ParseWarning, RoomKind, UseRawResolution } from "./types";
import { collapse, contentHashForRawSnippet, contentHashForDateTokens } from "./useRawContentHash";
import { normalizeHotelCellText, stripConfirmationTokens } from "./blocks/hotelConfTokens";

export type RawUnrecognized = { block: string; key: string; value: string };

export type ParseAggregator = {
  warnings: ParseWarning[];
  rawUnrecognized: RawUnrecognized[];
  /**
   * Consumption ledger (field-near-miss spec §3.3) — occurrence-keyed record of
   * every row a block parser RESOLVED to a curated canonical key. Keys are the
   * NUL-joined `${blockOpener}\u0000${col0}\u0000${value}` triple (all trimmed);
   * values are occurrence counts, since one document may carry the same resolved
   * row more than once under the same opener.
   *
   * The opener is in the key because label+value alone cannot separate the two
   * byte-identical empty-value `Room Diagram` rows three fixtures carry in BOTH a
   * DETAILS-family block (consumed) and the Timestamp block (must warn): membership
   * suppresses both, and count depletion is document-order-dependent, i.e.
   * position-keyed — the defect class the near-miss detector exists to remove. The
   * opener text moves with its rows under a block swap, so the triple is
   * swap-invariant by construction.
   */
  consumed: Map<string, number>;
};

export function newAggregator(): ParseAggregator {
  return { warnings: [], rawUnrecognized: [], consumed: new Map() };
}

/**
 * Ledger key for one resolved row occurrence. NUL-joined because NUL cannot occur
 * in sheet cell text, so no label or value can forge a key boundary.
 */
export function consumptionKey(blockOpener: string, col0: string, value: string): string {
  return `${blockOpener.trim()}\u0000${col0.trim()}\u0000${value.trim()}`;
}

/**
 * Record that `col0` in the block opened by `blockOpener` RESOLVED to a curated
 * canonical key (spec §3.3, resolution-site semantics).
 *
 * Call this AT the resolution decision, BEFORE any `presence()` / sentinel write
 * filter: a row that resolves to a real field and then writes nothing because its
 * value is empty is still consumed. Write-site marking left those rows unledgered,
 * and the detector then reported a correctly named field as a near-miss of itself.
 *
 * Only CURATED resolutions call this. `parseEventDetails`'s unknown-label fallback
 * stores under a generic self-slug (`toCanonicalKey`) without resolving to any real
 * field, so it must NOT mark — those rows (Stage, Storage) are the corpus's
 * most-confirmed near-miss true positives.
 *
 * No-ops when `agg` is undefined (the aggregator is optional in block-parser
 * signatures), matching `emitEmptySection` above.
 */
export function markConsumed(
  agg: ParseAggregator | undefined,
  blockOpener: string,
  col0: string,
  value: string,
): void {
  if (!agg) return;
  const key = consumptionKey(blockOpener, col0, value);
  agg.consumed.set(key, (agg.consumed.get(key) ?? 0) + 1);
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
    message: `Recognized "${section}" section header but parsed zero fields, so the section was dropped.`,
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
    message: `Crew ${fieldWord} for row ${params.index + 1} couldn't be read as a ${kind} ("${params.rawSnippet}"); check the sheet.`,
    // Carry the crew member's NAME (the synthesis-stable per-row key the crew-role raw-grid
    // scanner also keys on) so attachSourceCellAnchors resolves a per-ROW source cell.
    // Distinct crew rows → distinct anchors → they survive operatorActionableWarnings dedup
    // instead of collapsing to the single crew region anchor. (idx32/#154)
    blockRef: { kind: params.section, index: params.index, name: params.name, field: params.field },
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
    message: `We didn't recognize the section "${headerText}", so its rows were not parsed.`,
    blockRef: { kind: "unknown_section" },
    rawSnippet: headerText,
  });
}

/**
 * Orphaned-crew-rows warning (2026-07-27-export-blank-row-segmentation §3.2) — a
 * table block whose first row carries a crew-role cell but no section header: a
 * blank row was likely inserted mid-CREW-section, severing the tail rows from
 * their header (audit #10 split case). `severity:"warn"` is mandatory (operator
 * StagedReviewCard filter); `blockRef.kind:"crew"` routes the crew region anchor.
 * The 60-char truncation is shared between the message interpolation and
 * rawSnippet (spec §3.2). No-ops when `agg` is undefined.
 */
export const ORPHANED_CREW_ROWS = "ORPHANED_CREW_ROWS";

const ORPHAN_SNIPPET_MAX = 60;

export function emitOrphanedCrewRows(
  agg: ParseAggregator | undefined,
  firstCellText: string,
): void {
  if (!agg) return;
  const snippet = firstCellText.slice(0, ORPHAN_SNIPPET_MAX);
  agg.warnings.push({
    severity: "warn",
    code: "ORPHANED_CREW_ROWS",
    message: `Crew rows starting at "${snippet}" aren't attached to a section header; a blank row may have split the crew section. Those rows were not parsed as crew. Check the sheet.`,
    blockRef: { kind: "crew" },
    rawSnippet: snippet,
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
    // The room's kind — the split consumed the raw header's leading label
    // ("GENERAL SESSION" → "gs") to produce it, so the resolution carries it and
    // the UI can show the label wasn't dropped (2026-07-16 §6 extension).
    roomKind: RoomKind;
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
            roomKind: params.roomKind,
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

/**
 * §3.1 P3 (2026-07-25-hotel-ambiguity-coverage) — the hotel name/address
 * boundary was a judgment. Two arms, one code:
 *
 *   "address-shape-unsplit"      — nothing was split, so there is nothing to
 *                                  undo: `resolvable:false`.
 *   "multiple-street-candidates" — a split happened at one of several
 *                                  candidates, so undoing it is a real state
 *                                  change: `resolvable:true`.
 *
 * `parsed` reports the reservation's ACTUAL current reading (passed in by the
 * caller), never a reconstruction — the overlay reads only `replacement`, so a
 * fabricated `parsed` would show the operator a reading that never existed.
 *
 * The replacement is ALWAYS confirmation-stripped. `hotel_name` is show-wide
 * crew-readable and `stripHotelNameConf` already scrubs conf tokens from it,
 * while this warning's stash deliberately holds the PRE-strip cell — so an
 * unstripped replacement would re-persist a confirmation number the parser had
 * correctly removed (ratified R2).
 */
/**
 * Spec 2026-07-27-inline-later-group-own-hotel §6.1/§6.2 — the inline later-group
 * detector's two warnings, emitted from `commitHotels` like every other hotel stash.
 *
 * `field: "address"` is load-bearing: `FIELD_LABELS` renders it as "hotel name and
 * address" (`lib/admin/step3Buckets.ts:129-135`) — exactly what the operator inspects —
 * whereas `"name"` renders the ROOM label "(room name)" in the wizard title suffix.
 *
 * Neither carries a `resolution`: with the reading already committed to the row there
 * is no raw value to swap back in, and with the key ABSENT the documented discriminator
 * (`lib/parser/types.ts:86-95`) classifies both as non-recoverable, which is what keeps
 * them out of `USE_RAW_CODES`.
 *
 * `rawSnippet` is the row's RAW segment — pre-D1-normalization. The detector's
 * normalized text is internal and must never be persisted or quoted.
 *
 * The `code` property is a LITERAL in each push, never the constant interpolated:
 * `scripts/extract-internal-code-enums.ts:70-73` recognizes parser-warning codes ONLY
 * from literal `code: "..."` properties, and a constant-only emitter would regenerate
 * the enum WITHOUT these codes, after which `serializeParseWarning` blanks them to
 * `code: ""` at the telemetry boundary.
 */
export const HOTEL_INLINE_GROUP_OWN_HOTEL = "HOTEL_INLINE_GROUP_OWN_HOTEL";
export function emitHotelInlineGroupOwnHotel(
  agg: ParseAggregator | undefined,
  params: { name?: string | null; rawCell: string; index: number },
): void {
  if (!agg) return;
  const rawOneLine = collapse(params.rawCell);
  // exactOptionalPropertyTypes: omit the KEY when unresolved, never `undefined`.
  const blockRef: { kind: string; name?: string; field: string; index: number } = {
    kind: "hotels",
    field: "address",
    index: params.index,
  };
  if (params.name) blockRef.name = params.name;
  agg.warnings.push({
    severity: "warn",
    code: "HOTEL_INLINE_GROUP_OWN_HOTEL",
    message: `Hotel line "${rawOneLine}" lists more than one hotel, so this reservation was given its own hotel rather than the line's first hotel; double-check its hotel, guests, and dates. To skip the guesswork, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column.`,
    blockRef,
    rawSnippet: params.rawCell,
  });
}

export const HOTEL_INLINE_GROUP_HOTEL_SUSPECTED = "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED";
export function emitHotelInlineGroupHotelSuspected(
  agg: ParseAggregator | undefined,
  params: { name?: string | null; rawCell: string; index: number },
): void {
  if (!agg) return;
  const rawOneLine = collapse(params.rawCell);
  const blockRef: { kind: string; name?: string; field: string; index: number } = {
    kind: "hotels",
    field: "address",
    index: params.index,
  };
  if (params.name) blockRef.name = params.name;
  agg.warnings.push({
    severity: "warn",
    code: "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
    message: `Hotel line "${rawOneLine}" may put this reservation under the wrong hotel; double-check it. To fix it, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column.`,
    blockRef,
    rawSnippet: params.rawCell,
  });
}

export const HOTEL_ADDRESS_SPLIT_AMBIGUOUS = "HOTEL_ADDRESS_SPLIT_AMBIGUOUS";
export function emitHotelAddressSplitAmbiguity(
  agg: ParseAggregator | undefined,
  params: {
    reason: "address-shape-unsplit" | "multiple-street-candidates";
    // The exact cleaned text the splitter judged — the undo replacement's only
    // legitimate source (whole-diff R6 f1).
    splitInput: string;
    rawCell: string;
    index: number;
    name: string | null;
    parsedName: string | null;
    parsedAddress: string | null;
  },
): void {
  if (!agg) return;
  const rawOneLine = collapse(params.rawCell);
  const blockRef: { kind: string; name?: string; field: string; index: number } = {
    kind: "hotels",
    field: "address",
    index: params.index,
  };
  // exactOptionalPropertyTypes: omit the KEY when unresolved, never `undefined`.
  if (params.name) blockRef.name = params.name;

  const message =
    params.reason === "address-shape-unsplit"
      ? `Hotel line "${rawOneLine}" may hold a street address we did not separate out; double-check the hotel name and address.`
      : `Hotel line "${rawOneLine}" could be split into a name and a street address in more than one place; double-check the hotel name and address.`;

  let resolution: UseRawResolution;
  if (params.reason === "address-shape-unsplit") {
    resolution = { resolvable: false, reason: "no-split-to-undo" };
  } else {
    // The replacement is built from the SPLITTER'S INPUT — the same cleaned
    // text it judged (quotes/zero-width already out) — then conf-stripped. A
    // fragment/raw-cell replacement persists booking metadata (dates, guest
    // names) or quote characters into crew-readable hotel_name (R6 f1, R5 f2).
    // The contentHash below stays on the PRE-strip CELL: the invalidation key
    // must change whenever the sheet text changes, conf-only edits included.
    const strippedRaw = stripConfirmationTokens(normalizeHotelCellText(params.splitInput));
    resolution =
      strippedRaw === ""
        ? { resolvable: false, reason: "empty-raw" }
        : {
            resolvable: true,
            contentHash: contentHashForRawSnippet(params.rawCell),
            parsed: {
              kind: "hotel-name",
              hotelName: params.parsedName,
              hotelAddress: params.parsedAddress,
            },
            replacement: { kind: "hotel-name", hotelName: strippedRaw, hotelAddress: null },
          };
  }

  agg.warnings.push({
    severity: "warn",
    code: "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    message,
    blockRef,
    rawSnippet: params.rawCell,
    resolution,
  });
}

/**
 * §3.1 P1 (2026-07-25-hotel-ambiguity-coverage) — an INLINE hotel line judged
 * where the hotel name ends and the first guest begins. Reuses
 * `HOTEL_GUEST_SPLIT_AMBIGUOUS`: same code, same field, `blockRef.index`
 * discriminates instances.
 *
 * Its `message` is NOT the structured emitter's. That one says the cell "may
 * glue multiple guests together", which is false here — the inline ambiguity is
 * hotel-versus-guest and the line may hold exactly one guest.
 *
 * NEVER resolvable (ratified R8). The raw cell interleaves hotel, address,
 * dates and guests, and no substring is provably guest-scoped: a checkout strip
 * is positional, not semantic, so it can capture note text. Offering it would
 * publish non-guest text into a crew-readable `names` array and could hide a
 * crew member's own lodging from their page.
 */
export function emitInlineHotelGuestAmbiguity(
  agg: ParseAggregator | undefined,
  params: { name: string | null; rawCell: string; index: number; parsedNames: string[] },
): void {
  if (!agg) return;
  const rawOneLine = collapse(params.rawCell);
  const blockRef: { kind: string; name?: string; field: string; index: number } = {
    kind: "hotels",
    field: "guests",
    index: params.index,
  };
  if (params.name) blockRef.name = params.name;
  agg.warnings.push({
    severity: "warn",
    code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
    message: `Hotel line "${rawOneLine}" runs the hotel and the booking details together in one cell, so we had to work out where each part starts; double-check this reservation.`,
    blockRef,
    rawSnippet: params.rawCell,
    resolution: { resolvable: false, reason: "raw-not-guest-scoped" },
  });
}
