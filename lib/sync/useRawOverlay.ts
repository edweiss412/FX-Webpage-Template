import type { ParseResult, ParseWarning, UseRawResolution } from "@/lib/parser/types";

/**
 * "Use the sheet's raw value" overlay (spec 2026-07-10-structural-transform-use-raw
 * §5, §7).
 *
 * A PURE function: given a freshly-parsed `ParseResult` (whose warnings carry the
 * `resolution` payload, §6) and the show's stored decisions, it returns a NEW
 * `ParseResult` with the raw value substituted onto the entity rows for every
 * matched `preference:"raw"` decision, plus the partition the caller persists:
 *   - `kept`        — a `preference:"raw"` decision that matched ≥1 current warning
 *                     (its replacement was applied; the caller re-stores it applied:true)
 *   - `invalidated` — a `preference:"raw"` decision matching NO current warning
 *                     (dropped; the caller writes a STALE change-log row)
 *   - `reverted`    — a `preference:"transform"` decision (nothing applied — the
 *                     transform the parse already produced stands; the caller GCs it)
 *
 * Decisions match warnings by `(code, resolution.contentHash)` — NEVER by target —
 * so a decision is content-scoped: it governs EVERY current warning sharing that
 * canonical raw cell. No I/O, no clock, no re-parse.
 */

export const USE_RAW_CODES = [
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "DATE_ORDER_SUGGESTS_DMY",
] as const;
export type UseRawCode = (typeof USE_RAW_CODES)[number];

export type UseRawDecision = {
  code: UseRawCode;
  contentHash: string;
  // Display-only locator (the match key is (code, contentHash), NOT target).
  target: { kind: string; name?: string; index?: number; field?: string };
  preference: "raw" | "transform";
  applied: boolean;
  decidedAt: string;
  decidedBy: string;
};

export type ApplyUseRawResult = {
  result: ParseResult;
  kept: UseRawDecision[];
  invalidated: UseRawDecision[];
  reverted: UseRawDecision[];
};

const IN_SCOPE = new Set<string>(USE_RAW_CODES);

/** True when `resolution` is present AND resolvable (a raw value can be substituted). */
function resolvable(
  w: ParseWarning,
): w is ParseWarning & { resolution: Extract<UseRawResolution, { resolvable: true }> } {
  return w.resolution !== undefined && w.resolution.resolvable === true;
}

/**
 * Apply a resolvable warning's `replacement` to the matching entity row(s) of the
 * (already-cloned) result. Rooms match by the transform's parsed identity
 * (name/dimensions/floor from the SAME parse); hotels by `blockRef.index`; dates
 * rewrite exactly the four order-sensitive `show.dates` slots.
 */
function applyReplacement(result: ParseResult, w: ParseWarning, consumedRooms: Set<number>): void {
  if (!resolvable(w)) return;
  const rep = w.resolution.replacement;
  const parsed = w.resolution.parsed;
  if (rep.kind === "rooms" && parsed.kind === "rooms") {
    // Each ROOM_HEADER_SPLIT_AMBIGUOUS warning identifies EXACTLY ONE ambiguous room. Rooms carry
    // no stable per-row hash (only the warnings do), so we locate the room by the transform's parsed
    // identity — but claim the FIRST not-yet-rewritten match and stop, rather than rewriting every
    // row sharing that tuple. Otherwise a distinct room that happens to parse to the same
    // {name, dimensions, floor} from a DIFFERENT raw header (no matching decision hash) would be
    // wrongly overwritten. N matched warnings → N rooms rewritten, never all duplicates (Codex
    // whole-diff review F3-rooms).
    const idx = result.rooms.findIndex(
      (room, i) =>
        !consumedRooms.has(i) &&
        room.name === parsed.name &&
        room.dimensions === parsed.dimensions &&
        room.floor === parsed.floor,
    );
    if (idx !== -1) {
      const room = result.rooms[idx]!;
      room.name = rep.name;
      room.dimensions = rep.dimensions;
      room.floor = rep.floor;
      consumedRooms.add(idx);
    }
  } else if (rep.kind === "hotels") {
    const idx = w.blockRef?.index;
    if (typeof idx === "number" && idx >= 0 && idx < result.hotelReservations.length) {
      const res = result.hotelReservations[idx]!;
      res.names = [...rep.names];
      res.confirmation_no = rep.confirmationNo;
    }
  } else if (rep.kind === "dates") {
    const d = rep.dmyDates;
    result.show.dates.travelIn = d.travelIn;
    result.show.dates.set = d.set;
    result.show.dates.showDays = [...d.showDays];
    result.show.dates.travelOut = d.travelOut;
  }
}

export function applyUseRawDecisions(
  parseResult: ParseResult,
  decisions: UseRawDecision[],
): ApplyUseRawResult {
  // Pure: never mutate the input. structuredClone gives a deep, independent copy
  // (ParseResult is plain data — rows, warnings, scalars).
  const result: ParseResult = structuredClone(parseResult);

  const kept: UseRawDecision[] = [];
  const invalidated: UseRawDecision[] = [];
  const reverted: UseRawDecision[] = [];
  // Rooms rewritten this pass (by result.rooms index) — one room is claimed by at most one warning
  // across ALL decisions, so a duplicate-tuple room is never double-written or wrongly overwritten.
  const consumedRooms = new Set<number>();

  for (const decision of decisions) {
    const matches = result.warnings.filter(
      (w) =>
        w.code === decision.code &&
        resolvable(w) &&
        w.resolution.contentHash === decision.contentHash,
    );

    if (decision.preference === "transform") {
      // Revert: apply nothing — the transform value the parse produced stands.
      reverted.push(decision);
      continue;
    }

    // preference: "raw"
    if (matches.length === 0) {
      invalidated.push(decision);
      continue;
    }
    for (const w of matches) applyReplacement(result, w, consumedRooms);
    kept.push(decision);
  }

  return { result, kept, invalidated, reverted };
}

/**
 * The SINGLE validation boundary for JSONB reads of `use_raw_decisions` (spec §7).
 * jsonb is untyped at the DB boundary, so every read site (UI loaders, Phase2Args
 * builders, both actions) MUST pass raw jsonb through this before use. Non-array →
 * []; drops any entry with an out-of-scope code, a missing/blank contentHash, or an
 * invalid preference/applied shape. NEVER throws.
 */
export function normalizeUseRawDecisions(raw: unknown): UseRawDecision[] {
  if (!Array.isArray(raw)) return [];
  const out: UseRawDecision[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.code !== "string" || !IN_SCOPE.has(e.code)) continue;
    if (typeof e.contentHash !== "string" || e.contentHash.trim() === "") continue; // canonicalize-exempt: contentHash blank-check (SHA-256 hex pin), never an email
    if (e.preference !== "raw" && e.preference !== "transform") continue;
    if (typeof e.applied !== "boolean") continue;
    if (typeof e.decidedAt !== "string" || typeof e.decidedBy !== "string") continue;
    const target =
      e.target !== null && typeof e.target === "object"
        ? (e.target as UseRawDecision["target"])
        : { kind: "" };
    out.push({
      code: e.code as UseRawCode,
      contentHash: e.contentHash,
      target,
      preference: e.preference,
      applied: e.applied,
      decidedAt: e.decidedAt,
      decidedBy: e.decidedBy,
    });
  }
  return out;
}
