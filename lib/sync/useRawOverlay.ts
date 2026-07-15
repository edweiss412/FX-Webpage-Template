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

/**
 * Coerce a raw jsonb `target` to the display-only locator shape, dropping any
 * bad-typed field. `target` is NEVER the match key (that is `(code, contentHash)`),
 * but it flows into stale change-log formatting + UI metadata, so the single
 * validation boundary must not let a malformed shape through (Codex R3 F3).
 */
function normalizeTarget(raw: unknown): UseRawDecision["target"] {
  if (raw === null || typeof raw !== "object") return { kind: "" };
  const t = raw as Record<string, unknown>;
  const out: UseRawDecision["target"] = { kind: typeof t.kind === "string" ? t.kind : "" };
  if (typeof t.name === "string") out.name = t.name;
  // A row index is a non-negative integer; negatives (and fractionals) are corrupt.
  if (typeof t.index === "number" && Number.isInteger(t.index) && t.index >= 0) out.index = t.index;
  if (typeof t.field === "string") out.field = t.field;
  return out;
}

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
    // Each ROOM_HEADER_SPLIT_AMBIGUOUS warning identifies EXACTLY ONE ambiguous room, anchored by
    // `blockRef.index` (its position in the fresh parse's rooms array — the same anchor hotels use).
    // We locate by that index because two DISTINCT rooms can parse to the same {name, dimensions,
    // floor} from different raw headers; tuple-match alone cannot tell them apart and would rewrite
    // the wrong row when only one of them has a matching decision (Codex R3 F1). The tuple guard
    // confirms the indexed row is the one that produced the warning (same-parse invariant); if the
    // index is absent or has drifted, fall back to the first not-yet-consumed tuple match so a
    // legacy/index-less warning still resolves to ONE room, never every duplicate (Codex F3-rooms).
    const bi = w.blockRef?.index;
    let idx = -1;
    if (
      typeof bi === "number" &&
      bi >= 0 &&
      bi < result.rooms.length &&
      result.rooms[bi]!.name === parsed.name &&
      result.rooms[bi]!.dimensions === parsed.dimensions &&
      result.rooms[bi]!.floor === parsed.floor
    ) {
      idx = bi;
    } else {
      idx = result.rooms.findIndex(
        (room, i) =>
          !consumedRooms.has(i) &&
          room.name === parsed.name &&
          room.dimensions === parsed.dimensions &&
          room.floor === parsed.floor,
      );
    }
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
 * []; drops any entry with an out-of-scope code, a missing/blank contentHash, an
 * invalid preference/applied shape, OR the structurally-impossible
 * `{preference:"transform", applied:true}` combo (spec §3/§9: a settled revert is
 * written as a row-DELETION, never persisted — so its presence in jsonb is corrupt).
 * NEVER throws.
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
    // A `transform` decision only ever persists as `applied:false` (§3: `{transform,true}`
    // is GC'd to a row-deletion). An `applied:true` transform row is corrupt jsonb → drop.
    if (e.preference === "transform" && e.applied === true) continue;
    if (typeof e.decidedAt !== "string" || typeof e.decidedBy !== "string") continue;
    out.push({
      code: e.code as UseRawCode,
      contentHash: e.contentHash,
      target: normalizeTarget(e.target),
      preference: e.preference,
      applied: e.applied,
      decidedAt: e.decidedAt,
      decidedBy: e.decidedBy,
    });
  }
  return out;
}
