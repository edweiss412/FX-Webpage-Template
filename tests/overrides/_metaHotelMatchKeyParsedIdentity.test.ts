import { describe, expect, it } from "vitest";
import { loadShowOverrides } from "@/lib/overrides/loadShowOverrides";
import {
  HOTEL_DISAMBIGUATOR_SEP,
  computeHotelDisambiguator,
} from "@/lib/overrides/hotelDisambiguator";

/**
 * STRUCTURAL META-TEST — §5.3 hotel matchKey parsed-identity invariant.
 *
 * Shipped as the same-vector structural defense after THREE adversarial rounds on the
 * hotel-name matching vector (R1 stale disambiguator, R2 name-only-goes-ambiguous, R3/G1
 * uniqueness-counted-over-live-names). Per AGENTS.md "same-vector recurrence" +
 * "structural-defense calibration", the convergence path is no longer per-instance patching
 * but a checklist audit of the FULL §5.3 surface pinned at CI time.
 *
 * THE INVARIANT (single source of truth for hotel matchKey derivation):
 *   A reservation's matchKey uniqueness (i.e. whether it needs a `\x1f`-disambiguator) is
 *   determined SOLELY by how many reservations share its PARSED name — where a row's parsed
 *   name is the name-part of the ACTIVE hotel_name override that renamed it (the override
 *   records the parsed identity it was created against), else the live hotel_name. It is NEVER
 *   determined by live DISPLAY names, because an active rename mutates the display name and
 *   would make a same-name sibling look spuriously unique (G1).
 *
 * DERIVED STRUCTURAL PROPERTY (what this test enforces):
 *   Whenever ≥2 reservations share a parsed name, EVERY one of them receives a matchKey that
 *   carries the disambiguator separator — none may fall back to the bare parsed name. A bare
 *   key inside a same-parsed-name group cannot identify its row once overrides churn or the
 *   next full-replace re-sync re-derives keys from parsed names.
 *
 * Any future edit that reintroduces live-name counting fails here for EVERY same-name fixture,
 * not just the one adversarial reproduction — that is the point of the table sweep.
 */

type Row = Record<string, unknown>;

function fakeSupabase(byTable: Record<string, Row[]>) {
  function builder(table: string) {
    const result = { data: byTable[table] ?? [], error: null as null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      returns: () => chain,
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
    return chain;
  }
  return { from: (table: string) => builder(table) } as unknown as Parameters<
    typeof loadShowOverrides
  >[0];
}

function res(id: string, ordinal: number, liveName: string, checkIn: string, conf: string): Row {
  return {
    id,
    ordinal,
    hotel_name: liveName,
    hotel_address: `${id} St`,
    check_in: checkIn,
    confirmation_no: conf,
  };
}

const PARSED = "Grand Marriott";
// Two reservations that PARSE to the same name (a same-parsed-name group of 2).
const RA = res("res-A", 1, PARSED, "2026-07-01", "AAA");
const RB = res("res-B", 2, PARSED, "2026-08-01", "BBB");
type BookingCols = { check_in: string | null; confirmation_no: string | null };
const disambA = computeHotelDisambiguator(RA as BookingCols);
const disambB = computeHotelDisambiguator(RB as BookingCols);
const keyA = `${PARSED}${HOTEL_DISAMBIGUATOR_SEP}${disambA}`;
const keyB = `${PARSED}${HOTEL_DISAMBIGUATOR_SEP}${disambB}`;

function nameOv(match_key: string, override_value: string, active: boolean): Row {
  return {
    domain: "hotel",
    field: "hotel_name",
    match_key,
    override_value,
    sheet_value: PARSED,
    active,
    deactivation_code: active ? null : "target_missing",
    version: 1,
  };
}

// The full §5.3 same-name matrix. Each case keeps BOTH reservations parsing to `PARSED`; the
// override configuration varies. In EVERY case both rows must stay disambiguated.
const SAME_NAME_MATRIX: Array<{ name: string; overrides: Row[]; liveNames?: [string, string] }> = [
  { name: "no overrides at all", overrides: [] },
  {
    name: "one ACTIVE rename on A (G1: B must not look unique)",
    overrides: [nameOv(keyA, "Marriott Downtown", true)],
    liveNames: ["Marriott Downtown", PARSED],
  },
  {
    name: "both ACTIVELY renamed to distinct display names",
    overrides: [nameOv(keyA, "Downtown A", true), nameOv(keyB, "Downtown B", true)],
    liveNames: ["Downtown A", "Downtown B"],
  },
  {
    name: "one STALE (paused) disambiguated override on A",
    overrides: [nameOv(keyA, "Downtown A", false)],
  },
  {
    name: "both STALE disambiguated overrides",
    overrides: [nameOv(keyA, "Downtown A", false), nameOv(keyB, "Downtown B", false)],
  },
];

describe("META §5.3 — hotel matchKey uniqueness keys on PARSED identity, never live display name", () => {
  for (const cse of SAME_NAME_MATRIX) {
    it(`same-parsed-name group stays disambiguated: ${cse.name}`, async () => {
      const [liveA, liveB] = cse.liveNames ?? [PARSED, PARSED];
      const supabase = fakeSupabase({
        admin_overrides: cse.overrides,
        hotel_reservations: [
          { ...RA, hotel_name: liveA },
          { ...RB, hotel_name: liveB },
        ],
      });
      const view = await loadShowOverrides(supabase, {
        showId: "show-1",
        crew: [],
        showDates: null,
        showVenue: null,
      });
      const hotelA = view.hotels.find((h) => h.id === "res-A")!;
      const hotelB = view.hotels.find((h) => h.id === "res-B")!;

      // The structural property: neither row in a same-parsed-name group may carry a
      // bare (disambiguator-less) matchKey.
      expect(hotelA.matchKey).toContain(HOTEL_DISAMBIGUATOR_SEP);
      expect(hotelB.matchKey).toContain(HOTEL_DISAMBIGUATOR_SEP);
      expect(hotelA.matchKey).not.toBe(PARSED);
      expect(hotelB.matchKey).not.toBe(PARSED);
      // And the two keys are distinct (each identifies exactly one reservation).
      expect(hotelA.matchKey).not.toBe(hotelB.matchKey);
      // Both keys share the parsed name-part (the group identity) — proving the disambiguator
      // is what separates them, not a divergent name.
      expect(hotelA.matchKey.split(HOTEL_DISAMBIGUATOR_SEP)[0]).toBe(PARSED);
      expect(hotelB.matchKey.split(HOTEL_DISAMBIGUATOR_SEP)[0]).toBe(PARSED);
    });
  }

  it("control: a genuinely-unique parsed name gets a BARE matchKey (no over-disambiguation)", async () => {
    // Guards the opposite failure — the invariant must not force disambiguators on singletons.
    const solo = res("res-solo", 1, "Hyatt Regency", "2026-07-01", "ZZZ");
    const supabase = fakeSupabase({ admin_overrides: [], hotel_reservations: [solo] });
    const view = await loadShowOverrides(supabase, {
      showId: "show-1",
      crew: [],
      showDates: null,
      showVenue: null,
    });
    expect(view.hotels[0]!.matchKey).toBe("Hyatt Regency");
    expect(view.hotels[0]!.matchKey).not.toContain(HOTEL_DISAMBIGUATOR_SEP);
  });
});
