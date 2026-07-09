import { describe, expect, it } from "vitest";
import { loadShowOverrides } from "@/lib/overrides/loadShowOverrides";
import {
  HOTEL_DISAMBIGUATOR_SEP,
  computeHotelDisambiguator,
} from "@/lib/overrides/hotelDisambiguator";

// Adversarial R1 (Codex round 1, HIGH): inactive/paused hotel_name overrides in a
// same-name duplicate group were matched by NAME ONLY (ignoring the disambiguator),
// so two paused overrides for two same-name reservations both bound to whichever row
// rendered first — a discard/repoint would then act on the WRONG override row.
//
// Failure mode this catches: the stale-branch match `hotelNamePart(match_key) === name`
// (no disambiguator comparison). Each reservation must receive ITS OWN paused override.

type Row = Record<string, unknown>;

// Minimal chainable Supabase fake: `.from(t).select(...).eq(...).order(...).returns()` /
// awaited. Returns per-table rows; every terminal resolves { data, error:null }.
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

describe("loadShowOverrides — duplicate hotel-name paused overrides bind by disambiguator (R1)", () => {
  it("two same-name reservations each receive their OWN inactive hotel_name override", async () => {
    // Two reservations, identical hotel_name, DIFFERENT booking cols → different disamb.
    const resA = {
      id: "res-A",
      ordinal: 1,
      hotel_name: "Grand Marriott",
      hotel_address: "1 A St",
      check_in: "2026-07-01",
      confirmation_no: "AAA",
    };
    const resB = {
      id: "res-B",
      ordinal: 2,
      hotel_name: "Grand Marriott",
      hotel_address: "2 B St",
      check_in: "2026-08-01",
      confirmation_no: "BBB",
    };
    const disambA = computeHotelDisambiguator(resA);
    const disambB = computeHotelDisambiguator(resB);
    expect(disambA).not.toBe(disambB); // fixture sanity — the two rows are distinguishable

    // Two PAUSED (active:false) hotel_name overrides, one per reservation, keyed by
    // name + its own disambiguator.
    const keyA = `Grand Marriott${HOTEL_DISAMBIGUATOR_SEP}${disambA}`;
    const keyB = `Grand Marriott${HOTEL_DISAMBIGUATOR_SEP}${disambB}`;
    const overrides = [
      {
        domain: "hotel",
        field: "hotel_name",
        match_key: keyA,
        override_value: "Marriott Downtown A",
        sheet_value: "Grand Marriott",
        active: false,
        deactivation_code: "target_missing",
        version: 2,
      },
      {
        domain: "hotel",
        field: "hotel_name",
        match_key: keyB,
        override_value: "Marriott Downtown B",
        sheet_value: "Grand Marriott",
        active: false,
        deactivation_code: "target_missing",
        version: 2,
      },
    ];

    const supabase = fakeSupabase({
      admin_overrides: overrides,
      hotel_reservations: [resA, resB],
    });

    const view = await loadShowOverrides(supabase, {
      showId: "show-1",
      crew: [],
      showDates: null,
      showVenue: null,
    });

    const hotelA = view.hotels.find((h) => h.id === "res-A");
    const hotelB = view.hotels.find((h) => h.id === "res-B");
    expect(hotelA).toBeDefined();
    expect(hotelB).toBeDefined();

    // The crux: each reservation binds to its OWN paused override, distinguished by the
    // disambiguator — NOT both to the first-rendered one.
    expect(hotelA!.matchKey).toBe(keyA);
    expect(hotelB!.matchKey).toBe(keyB);
    expect(hotelA!.hotel_name.override?.overrideValue).toBe("Marriott Downtown A");
    expect(hotelB!.hotel_name.override?.overrideValue).toBe("Marriott Downtown B");
    // Anti-tautology: the two must be DISTINCT (the bug bound both to the same row).
    expect(hotelA!.matchKey).not.toBe(hotelB!.matchKey);
  });

  // Adversarial R2 (Codex round 2, MEDIUM): a NAME-ONLY inactive override (created
  // when the hotel name was unique) must NOT attach to every duplicate once a later
  // sync introduces a second same-name reservation — it can no longer identify one row.
  it("a name-only inactive override does NOT bind to any reservation once the name is a duplicate", async () => {
    const resA = {
      id: "res-A",
      ordinal: 1,
      hotel_name: "Grand Marriott",
      hotel_address: "1 A St",
      check_in: "2026-07-01",
      confirmation_no: "AAA",
    };
    const resB = {
      id: "res-B",
      ordinal: 2,
      hotel_name: "Grand Marriott",
      hotel_address: "2 B St",
      check_in: "2026-08-01",
      confirmation_no: "BBB",
    };
    // A single paused override with a NAME-ONLY key (created while "Grand Marriott" was unique).
    const overrides = [
      {
        domain: "hotel",
        field: "hotel_name",
        match_key: "Grand Marriott", // no \x1f disambiguator
        override_value: "Marriott Downtown",
        sheet_value: "Grand Marriott",
        active: false,
        deactivation_code: "target_missing",
        version: 2,
      },
    ];
    const supabase = fakeSupabase({
      admin_overrides: overrides,
      hotel_reservations: [resA, resB],
    });
    const view = await loadShowOverrides(supabase, {
      showId: "show-1",
      crew: [],
      showDates: null,
      showVenue: null,
    });
    const hotelA = view.hotels.find((h) => h.id === "res-A");
    const hotelB = view.hotels.find((h) => h.id === "res-B");
    // Neither duplicate binds the ambiguous name-only override — it would otherwise
    // attach to BOTH and let Doug act on the wrong reservation.
    expect(hotelA!.hotel_name.override).toBeNull();
    expect(hotelB!.hotel_name.override).toBeNull();
  });
});
