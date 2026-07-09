import { describe, expect, it } from "vitest";

import { computeHotelDisambiguator } from "@/lib/overrides/hotelDisambiguator";
import { matchOverrideTarget, type HotelRow } from "@/lib/overrides/matchOverrideTarget";

// §5.3 / §3.6 — matchOverrideTarget resolves a hotel override's (name + content
// disambiguator) `match_key` against the parsed reservation set, FAIL-CLOSED: it must
// resolve to exactly one parsed reservation. Zero (removed) or >1 (disambiguator no
// longer unique) → `disambiguatorUnique:false` and the caller never applies to a guess.
// Every expected key is DERIVED from the fixture via computeHotelDisambiguator — never
// hardcoded — so the test cannot pass by coincidence.

const SEP = "\x1f";

/** Build the hotel `match_key` exactly as the override layer does: name, plus the
 *  content disambiguator when the name is part of a same-name group. */
function hotelMatchKey(name: string, res?: { check_in: string | null; confirmation_no: string | null }): string {
  return res ? `${name}${SEP}${computeHotelDisambiguator(res)}` : name;
}

describe("matchOverrideTarget — hotel domain", () => {
  it("a UNIQUE hotel name matches exactly one reservation (no disambiguator needed)", () => {
    const hotels: HotelRow[] = [
      { hotel_name: "Marriott Downtown", check_in: "2026-04-15", confirmation_no: "M1" },
      { hotel_name: "Hilton Bayfront", check_in: "2026-04-15", confirmation_no: "H1" },
    ];
    const res = matchOverrideTarget({ domain: "hotel", matchKey: hotelMatchKey("Marriott Downtown") }, { hotels });
    expect(res).toEqual({ matched: true, disambiguatorUnique: true });
  });

  it("a same-name pair resolves via the `check_in` disambiguator to exactly one", () => {
    const target: HotelRow = { hotel_name: "Airport Inn", check_in: "2026-04-14", confirmation_no: null };
    const hotels: HotelRow[] = [
      target,
      { hotel_name: "Airport Inn", check_in: "2026-04-20", confirmation_no: null },
    ];
    const matchKey = hotelMatchKey("Airport Inn", target); // derived: name + check_in
    const res = matchOverrideTarget({ domain: "hotel", matchKey }, { hotels });
    expect(res).toEqual({ matched: true, disambiguatorUnique: true });
  });

  it("a same-name pair with SAME check_in but DIFFERENT confirmation_no resolves to exactly one via check_in + \\x1f + confirmation_no (REST2-4)", () => {
    // This is the whole reason the `\x1f` second stage exists: check_in alone collides,
    // so confirmation_no is the tiebreaker and MUST resolve to exactly one row.
    const target: HotelRow = { hotel_name: "Grand Plaza", check_in: "2026-04-15", confirmation_no: "AAA" };
    const hotels: HotelRow[] = [
      target,
      { hotel_name: "Grand Plaza", check_in: "2026-04-15", confirmation_no: "BBB" },
    ];
    const matchKey = hotelMatchKey("Grand Plaza", target); // derived: name + check_in + \x1f + AAA
    expect(matchKey).toContain(SEP);
    expect(matchKey.split(SEP)).toHaveLength(3); // name, check_in, confirmation_no
    const res = matchOverrideTarget({ domain: "hotel", matchKey }, { hotels });
    expect(res).toEqual({ matched: true, disambiguatorUnique: true });
  });

  it("a same-name pair whose disambiguator FULLY collides (equal check_in AND equal confirmation_no) → disambiguatorUnique:false (fail-closed)", () => {
    const target: HotelRow = { hotel_name: "Grand Plaza", check_in: "2026-04-15", confirmation_no: "AAA" };
    const hotels: HotelRow[] = [
      target,
      { hotel_name: "Grand Plaza", check_in: "2026-04-15", confirmation_no: "AAA" }, // fully identical disambiguator
    ];
    const matchKey = hotelMatchKey("Grand Plaza", target);
    const res = matchOverrideTarget({ domain: "hotel", matchKey }, { hotels });
    // Present (matched) but NOT unique → the caller must NOT apply to a guessed row.
    expect(res).toEqual({ matched: true, disambiguatorUnique: false });
  });

  it("a UNIQUE-at-load name that later gains a same-name sibling → disambiguatorUnique:false (R20 unconditional gate)", () => {
    // match_key was created with NO disambiguator (unique at the time); a later parse
    // introduces a same-name reservation, so the name is no longer unique → fail-closed.
    const hotels: HotelRow[] = [
      { hotel_name: "Marriott Downtown", check_in: "2026-04-15", confirmation_no: "M1" },
      { hotel_name: "Marriott Downtown", check_in: "2026-04-18", confirmation_no: "M2" },
    ];
    const res = matchOverrideTarget({ domain: "hotel", matchKey: hotelMatchKey("Marriott Downtown") }, { hotels });
    expect(res).toEqual({ matched: true, disambiguatorUnique: false });
  });

  it("a removed target (name absent) → matched:false, disambiguatorUnique:false", () => {
    const hotels: HotelRow[] = [
      { hotel_name: "Hilton Bayfront", check_in: "2026-04-15", confirmation_no: "H1" },
    ];
    const res = matchOverrideTarget({ domain: "hotel", matchKey: hotelMatchKey("Marriott Downtown") }, { hotels });
    expect(res).toEqual({ matched: false, disambiguatorUnique: false });
  });
});

describe("matchOverrideTarget — crew domain", () => {
  it("matches a parsed crew name", () => {
    const crewNames = ["Alice Smith", "Bob Jones"];
    expect(matchOverrideTarget({ domain: "crew", matchKey: "Alice Smith" }, { crewNames })).toEqual({
      matched: true,
      disambiguatorUnique: true,
    });
  });

  it("a removed crew member → matched:false", () => {
    const crewNames = ["Bob Jones"];
    expect(matchOverrideTarget({ domain: "crew", matchKey: "Alice Smith" }, { crewNames })).toEqual({
      matched: false,
      disambiguatorUnique: true,
    });
  });
});
