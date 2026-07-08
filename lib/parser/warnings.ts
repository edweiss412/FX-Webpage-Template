/**
 * ParseAggregator — collects warnings and raw_unrecognized entries during parsing.
 *
 * Passed by reference through each block parser so all soft signals accumulate
 * in a single shared object. The orchestrator (Task 1.11) merges these into
 * ParsedSheet.warnings / ParsedSheet.raw_unrecognized after all block parsers run.
 *
 * Pattern: functional (plain object), not a class — per Task 1.10 scope decision.
 */

import type { ParseWarning } from "./types";

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
  params: { name: string; field: "dims" | "name"; rawHeader: string },
): void {
  if (!agg) return;
  const fieldWord = params.field === "dims" ? "dimensions" : "name";
  const rawOneLine = params.rawHeader.replace(/\s+/g, " ").trim();
  const forName = params.name ? ` for "${params.name}"` : "";
  agg.warnings.push({
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: `Room line "${rawOneLine}" could be split into name and dimensions more than one way — picked the most likely reading; double-check the ${fieldWord}${forName}.`,
    blockRef: { kind: "rooms", name: params.name, field: params.field },
    rawSnippet: params.rawHeader,
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
