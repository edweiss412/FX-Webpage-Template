import type { ParseResult } from "@/lib/parser/types";
import type { OverrideField } from "@/lib/overrides/validateOverrideValue";
import {
  computeHotelDisambiguator,
  HOTEL_DISAMBIGUATOR_SEP,
} from "@/lib/overrides/hotelDisambiguator";
import { matchOverrideTarget, type HotelRow } from "@/lib/overrides/matchOverrideTarget";

// Stage A (spec §3.2 / §5.1 / §5.3) — the PURE, write-time show + hotel override transform. It
// rewrites `parseResult.show.dates/venue` and the hotel rows BEFORE `applyShowSnapshot` persists
// them, and PLANS the `admin_overrides` bookkeeping (sheet_value refresh / deactivations) that
// Stage B (Task 8) commits inside the same locked tx. It performs ZERO DB access — every decision
// is derived from the parsed identity set; crew is handled post-hold by §3.6 (Task 7), never here.

/** The active `admin_overrides` row shape Stage A consumes (subset read by `loadActiveOverrides`). */
export type ActiveOverrideRow = {
  id: string;
  domain: "show" | "crew" | "hotel";
  field: OverrideField;
  match_key: string;
  /** jsonb: a dates/venue OBJECT for show; a JSON string for hotel_name/hotel_address. */
  override_value: unknown;
};

/**
 * A planned `admin_overrides` mutation. Either a `sheet_value` refresh (the override applied; carry
 * the pre-override parsed value) OR a fail-closed deactivation. Committed in Stage B (Task 8);
 * imported by Tasks 7/8. `target_missing` = the (name+disambiguator) match_key no longer resolves
 * to exactly one parsed reservation; `name_conflict` = applying a hotel_name override would make two
 * live rows share a FINAL name (R26/R27).
 */
export type OverrideSideEffect =
  | { overrideId: string; sheetValue: unknown }
  | { overrideId: string; deactivate: "target_missing" | "name_conflict" };

export type OverrideShowHotelResult = {
  overriddenParseResult: ParseResult;
  showHotelSideEffects: OverrideSideEffect[];
};

/** Indices of parsed reservations matching a hotel override's `match_key` (mirrors matchOverrideTarget). */
function matchingHotelIndices(matchKey: string, hotels: HotelRow[]): number[] {
  const sepIdx = matchKey.indexOf(HOTEL_DISAMBIGUATOR_SEP);
  const nameKey = sepIdx === -1 ? matchKey : matchKey.slice(0, sepIdx);
  const disambiguatorKey = sepIdx === -1 ? "" : matchKey.slice(sepIdx + 1);
  const indices: number[] = [];
  hotels.forEach((h, i) => {
    if (h.hotel_name !== nameKey) return;
    if (disambiguatorKey === "" || computeHotelDisambiguator(h) === disambiguatorKey)
      indices.push(i);
  });
  return indices;
}

export function overrideShowHotel(
  parseResult: ParseResult,
  activeOverrides: ActiveOverrideRow[],
): OverrideShowHotelResult {
  const sideEffects: OverrideSideEffect[] = [];

  // --- show (dates / venue) — singleton per field, never deactivates (§5.1). ---
  const showOverrides = activeOverrides.filter((o) => o.domain === "show");
  let show = parseResult.show;
  if (showOverrides.length > 0) {
    const patch: Record<string, unknown> = {};
    for (const o of showOverrides) {
      const field = o.field as "dates" | "venue";
      const prior = parseResult.show[field] ?? null;
      patch[field] = o.override_value;
      sideEffects.push({ overrideId: o.id, sheetValue: prior });
    }
    show = { ...parseResult.show, ...patch } as ParseResult["show"];
  }

  // --- hotel (hotel_name / hotel_address) — matched by parsed name + §5.3 disambiguator. ---
  const parsedHotels = parseResult.hotelReservations;
  const hotelRows: HotelRow[] = parsedHotels.map((h) => ({
    hotel_name: h.hotel_name,
    check_in: h.check_in,
    confirmation_no: h.confirmation_no,
  }));

  // Resolve each hotel override to exactly-one reservation (fail-closed R16). Overrides that do not
  // uniquely resolve are planned `target_missing` here and never applied.
  type ResolvedHotel = { override: ActiveOverrideRow; index: number };
  const resolvedNames: ResolvedHotel[] = [];
  const resolvedAddresses: ResolvedHotel[] = [];
  for (const o of activeOverrides) {
    if (o.domain !== "hotel") continue;
    const outcome = matchOverrideTarget(
      { domain: "hotel", matchKey: o.match_key },
      { hotels: hotelRows },
    );
    if (!outcome.disambiguatorUnique) {
      sideEffects.push({ overrideId: o.id, deactivate: "target_missing" });
      continue;
    }
    const index = matchingHotelIndices(o.match_key, hotelRows)[0]!;
    if (o.field === "hotel_name") resolvedNames.push({ override: o, index });
    else resolvedAddresses.push({ override: o, index });
  }

  // FINAL hotel_name per reservation = its own active hotel_name override output else parsed (R27).
  const nameOutputByIndex = new Map<number, string>();
  for (const r of resolvedNames) nameOutputByIndex.set(r.index, String(r.override.override_value));
  const finalNames = parsedHotels.map((h, i) => nameOutputByIndex.get(i) ?? h.hotel_name);

  // Per-index field patches to apply into a fresh hotel array (purity: never mutate the input).
  const namePatch = new Map<number, string>();
  const addressPatch = new Map<number, string>();

  // hotel_name apply / runtime-collision (R26): a FINAL that coincides with ANOTHER reservation's
  // FINAL strands the override → deactivate name_conflict, do NOT apply.
  for (const { override, index } of resolvedNames) {
    const value = String(override.override_value);
    const collides = finalNames.some((name, j) => j !== index && name === value);
    if (collides) {
      sideEffects.push({ overrideId: override.id, deactivate: "name_conflict" });
      continue;
    }
    namePatch.set(index, value);
    sideEffects.push({ overrideId: override.id, sheetValue: parsedHotels[index]!.hotel_name });
  }

  // hotel_address apply — address is not the resolver key, so it never collides (R30).
  for (const { override, index } of resolvedAddresses) {
    addressPatch.set(index, String(override.override_value));
    sideEffects.push({ overrideId: override.id, sheetValue: parsedHotels[index]!.hotel_address });
  }

  const hotelReservations =
    namePatch.size === 0 && addressPatch.size === 0
      ? parsedHotels
      : parsedHotels.map((h, i) => {
          const nextName = namePatch.get(i);
          const nextAddress = addressPatch.get(i);
          if (nextName === undefined && nextAddress === undefined) return h;
          return {
            ...h,
            ...(nextName !== undefined ? { hotel_name: nextName } : {}),
            ...(nextAddress !== undefined ? { hotel_address: nextAddress } : {}),
          };
        });

  const overriddenParseResult: ParseResult =
    show === parseResult.show && hotelReservations === parsedHotels
      ? parseResult
      : { ...parseResult, show, hotelReservations };

  return { overriddenParseResult, showHotelSideEffects: sideEffects };
}
