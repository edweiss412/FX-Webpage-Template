import {
  HOTEL_DISAMBIGUATOR_SEP,
  computeHotelDisambiguator,
} from "@/lib/overrides/hotelDisambiguator";

// §5.3 / §3.6 — resolve an override's `match_key` against the current parsed identity
// set. Shared by the sync transform and the RPC-adjacent TS (matching is identical
// across apply paths; §7.3). FAIL-CLOSED for hotels: the (name + content disambiguator)
// key MUST resolve to exactly one parsed reservation; zero (removed) or >1 (disambiguator
// no longer unique — group composition changed) yields `disambiguatorUnique:false`, and
// the caller must never apply the override to a guessed row.

/** The subset of a parsed hotel reservation matchOverrideTarget needs. */
export type HotelRow = {
  hotel_name: string | null;
  check_in: string | null;
  confirmation_no: string | null;
};

export type OverrideTarget = {
  domain: "show" | "crew" | "hotel";
  /** The parsed identifier: crew parsed name, hotel name [+ §5.3 disambiguator], or '' for show. */
  matchKey: string;
};

export type ParsedIdentity = {
  crewNames?: string[];
  hotels?: HotelRow[];
};

export type MatchOutcome = {
  /** The target identity is present in the parsed set (≥1 match). */
  matched: boolean;
  /** The target resolves to EXACTLY one parsed reservation (hotels); always true for crew/show. */
  disambiguatorUnique: boolean;
};

export function matchOverrideTarget(
  override: OverrideTarget,
  parsed: ParsedIdentity,
): MatchOutcome {
  if (override.domain === "crew") {
    const names = parsed.crewNames ?? [];
    return { matched: names.includes(override.matchKey), disambiguatorUnique: true };
  }

  if (override.domain === "hotel") {
    const hotels = parsed.hotels ?? [];
    // The name part is everything before the first separator; the disambiguator (if any)
    // is the remainder. A hotel name can never contain the U+001F separator (§5.3).
    const sepIdx = override.matchKey.indexOf(HOTEL_DISAMBIGUATOR_SEP);
    const nameKey = sepIdx === -1 ? override.matchKey : override.matchKey.slice(0, sepIdx);
    const disambiguatorKey = sepIdx === -1 ? "" : override.matchKey.slice(sepIdx + 1);

    const sameName = hotels.filter((h) => h.hotel_name === nameKey);
    // Unique-name mode (no disambiguator in match_key): the name alone must resolve to
    // exactly one — the R20 unconditional gate, so a name unique at creation that later
    // gains a same-name sibling fail-closes rather than retargeting.
    const resolved =
      disambiguatorKey === ""
        ? sameName
        : sameName.filter((h) => computeHotelDisambiguator(h) === disambiguatorKey);

    return { matched: resolved.length >= 1, disambiguatorUnique: resolved.length === 1 };
  }

  // show: singleton per field (match_key === ''); always present, never disambiguated.
  return { matched: true, disambiguatorUnique: true };
}
