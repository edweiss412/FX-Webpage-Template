import { describe, expect, test } from "vitest";
import type { HotelReservationRow, ParseResult, ShowRow } from "@/lib/parser/types";
import { HOTEL_DISAMBIGUATOR_SEP } from "@/lib/overrides/hotelDisambiguator";
import {
  overrideShowHotel,
  type ActiveOverrideRow,
  type OverrideSideEffect,
} from "@/lib/sync/overrideShowHotel";

// ---- fixtures -------------------------------------------------------------

const PARSED_DATES: ShowRow["dates"] = {
  travelIn: "2026-05-07",
  set: "2026-05-08",
  showDays: ["2026-05-09"],
  travelOut: "2026-05-10",
};

const PARSED_VENUE: ShowRow["venue"] = {
  name: "Parsed Venue",
  address: "1 Parsed St",
};

function makeHotel(
  ordinal: number,
  hotel_name: string | null,
  extra: Partial<HotelReservationRow> = {},
): HotelReservationRow {
  return {
    ordinal,
    hotel_name,
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
    ...extra,
  };
}

function makeParse(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "Show Title",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: PARSED_VENUE,
      dates: PARSED_DATES,
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [makeHotel(1, "Hotel A")],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
    ...overrides,
  };
}

let idSeq = 0;
function mkOverride(row: Omit<ActiveOverrideRow, "id"> & { id?: string }): ActiveOverrideRow {
  return { id: row.id ?? `ov-${++idSeq}`, ...row };
}

function findSheetValue(effects: OverrideSideEffect[], overrideId: string): unknown {
  const eff = effects.find((e) => e.overrideId === overrideId);
  if (eff && "sheetValue" in eff) return eff.sheetValue;
  throw new Error(`no sheetValue side effect for ${overrideId}`);
}

// ---- show -----------------------------------------------------------------

describe("overrideShowHotel — show domain", () => {
  test("replaces show.dates + venue; sheetValue = original parsed value", () => {
    const overrideDates: ShowRow["dates"] = {
      travelIn: "2026-06-01",
      set: "2026-06-02",
      showDays: ["2026-06-03"],
      travelOut: "2026-06-04",
    };
    const overrideVenue: ShowRow["venue"] = { name: "Override Hall", address: "9 New Ave" };
    const pr = makeParse();
    const ovD = mkOverride({
      domain: "show",
      field: "dates",
      match_key: "",
      override_value: overrideDates,
    });
    const ovV = mkOverride({
      domain: "show",
      field: "venue",
      match_key: "",
      override_value: overrideVenue,
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ovD, ovV]);

    // failure mode: snapshot writer would persist the PARSED dates/venue, not the override.
    expect(overriddenParseResult.show.dates).toBe(overrideDates);
    expect(overriddenParseResult.show.venue).toBe(overrideVenue);
    // sheetValue derived from the fixture, never hardcoded.
    expect(findSheetValue(showHotelSideEffects, ovD.id)).toBe(PARSED_DATES);
    expect(findSheetValue(showHotelSideEffects, ovV.id)).toBe(PARSED_VENUE);
    // never a deactivation for show.
    expect(showHotelSideEffects.every((e) => !("deactivate" in e))).toBe(true);
  });

  test("parsed-null dates → sheetValue:null, override still applied", () => {
    const overrideDates: ShowRow["dates"] = {
      travelIn: "2026-07-01",
      set: null,
      showDays: [],
      travelOut: null,
    };
    const pr = makeParse();
    (pr.show as { dates: unknown }).dates = null; // parser emitted null for this field
    const ov = mkOverride({
      domain: "show",
      field: "dates",
      match_key: "",
      override_value: overrideDates,
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ov]);

    expect(overriddenParseResult.show.dates).toBe(overrideDates);
    expect(findSheetValue(showHotelSideEffects, ov.id)).toBeNull();
  });

  test("is pure — does not mutate the input parseResult (no DB-side effect)", () => {
    const pr = makeParse();
    const beforeShow = JSON.parse(JSON.stringify(pr.show));
    const beforeHotels = JSON.parse(JSON.stringify(pr.hotelReservations));
    const ov = mkOverride({
      domain: "show",
      field: "venue",
      match_key: "",
      override_value: { name: "X", address: "Y" },
    });

    const { overriddenParseResult } = overrideShowHotel(pr, [ov]);

    // input untouched (a mutation here would be the "wrote through the input" failure mode).
    expect(pr.show).toEqual(beforeShow);
    expect(pr.hotelReservations).toEqual(beforeHotels);
    // and the result is a distinct object.
    expect(overriddenParseResult.show).not.toBe(pr.show);
  });
});

// ---- hotel ----------------------------------------------------------------

describe("overrideShowHotel — hotel domain", () => {
  test("unique-name apply; sheetValue = parsed hotel_name", () => {
    const pr = makeParse({
      hotelReservations: [makeHotel(1, "Hotel A", { hotel_address: "Addr A" })],
    });
    const ov = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Hotel A",
      override_value: "Hotel Z",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ov]);

    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Hotel Z");
    expect(findSheetValue(showHotelSideEffects, ov.id)).toBe("Hotel A");
  });

  test("hotel_address apply; sheetValue = parsed hotel_address; name untouched", () => {
    const pr = makeParse({
      hotelReservations: [makeHotel(1, "Hotel A", { hotel_address: "Addr A" })],
    });
    const ov = mkOverride({
      domain: "hotel",
      field: "hotel_address",
      match_key: "Hotel A",
      override_value: "999 Override Blvd",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ov]);

    expect(overriddenParseResult.hotelReservations[0]!.hotel_address).toBe("999 Override Blvd");
    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Hotel A");
    expect(findSheetValue(showHotelSideEffects, ov.id)).toBe("Addr A");
  });

  test("matched across a reorder (name-keyed, R16)", () => {
    const pr = makeParse({
      hotelReservations: [makeHotel(1, "Hotel B"), makeHotel(2, "Hotel A")],
    });
    const ov = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Hotel A",
      override_value: "Hotel Z",
    });

    const { overriddenParseResult } = overrideShowHotel(pr, [ov]);

    expect(overriddenParseResult.hotelReservations[1]!.hotel_name).toBe("Hotel Z");
    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Hotel B");
  });

  test("dup-name resolved by check_in disambiguator", () => {
    const checkInA = "2026-01-10";
    const checkInB = "2026-02-20";
    const pr = makeParse({
      hotelReservations: [
        makeHotel(1, "Dup", { check_in: checkInA }),
        makeHotel(2, "Dup", { check_in: checkInB }),
      ],
    });
    const ov = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: `Dup${HOTEL_DISAMBIGUATOR_SEP}${checkInA}`,
      override_value: "Resolved",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ov]);

    // only the check_in-A reservation is retargeted.
    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Resolved");
    expect(overriddenParseResult.hotelReservations[1]!.hotel_name).toBe("Dup");
    expect(findSheetValue(showHotelSideEffects, ov.id)).toBe("Dup");
  });

  test("dup-name disambiguator non-unique → deactivate target_missing, rows NOT mutated", () => {
    const sameCheckIn = "2026-03-03";
    const pr = makeParse({
      hotelReservations: [
        makeHotel(1, "Dup", { check_in: sameCheckIn }),
        makeHotel(2, "Dup", { check_in: sameCheckIn }),
      ],
    });
    const ov = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: `Dup${HOTEL_DISAMBIGUATOR_SEP}${sameCheckIn}`,
      override_value: "Resolved",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ov]);

    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Dup");
    expect(overriddenParseResult.hotelReservations[1]!.hotel_name).toBe("Dup");
    expect(showHotelSideEffects).toContainEqual({
      overrideId: ov.id,
      deactivate: "target_missing",
    });
  });

  test("target absent → deactivate target_missing", () => {
    const pr = makeParse({ hotelReservations: [makeHotel(1, "Present")] });
    const ov = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Gone",
      override_value: "X",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ov]);

    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Present");
    expect(showHotelSideEffects).toContainEqual({
      overrideId: ov.id,
      deactivate: "target_missing",
    });
  });

  test("R27 multi-hotel composition — distinct FINALs, both applied, NEITHER deactivates", () => {
    const pr = makeParse({
      hotelReservations: [makeHotel(1, "Marriott"), makeHotel(2, "Hilton")],
    });
    const ovA = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Marriott",
      override_value: "Hilton",
    });
    const ovB = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Hilton",
      override_value: "Hyatt",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ovA, ovB]);

    // FINALs Hilton / Hyatt are distinct → both survive (failure mode: collision-over-raw-parsed
    // would falsely deactivate A because B is *parsed* Hilton).
    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Hilton");
    expect(overriddenParseResult.hotelReservations[1]!.hotel_name).toBe("Hyatt");
    expect(showHotelSideEffects.some((e) => "deactivate" in e)).toBe(false);
    expect(findSheetValue(showHotelSideEffects, ovA.id)).toBe("Marriott");
    expect(findSheetValue(showHotelSideEffects, ovB.id)).toBe("Hilton");
  });

  test("R26 runtime collision — override FINAL coincides with an un-overridden parse → name_conflict", () => {
    const pr = makeParse({
      hotelReservations: [makeHotel(1, "Marriott"), makeHotel(2, "Hilton")],
    });
    const ovA = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Marriott",
      override_value: "Hilton",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ovA]);

    // A NOT applied (stays parsed), planned name_conflict; B keeps its parsed Hilton — no two live Hiltons.
    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Marriott");
    expect(overriddenParseResult.hotelReservations[1]!.hotel_name).toBe("Hilton");
    expect(showHotelSideEffects).toContainEqual({
      overrideId: ovA.id,
      deactivate: "name_conflict",
    });
  });

  test("both name overrides collide (both override-derived) → BOTH deactivate name_conflict", () => {
    const pr = makeParse({
      hotelReservations: [makeHotel(1, "Alpha"), makeHotel(2, "Beta")],
    });
    const ovA = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Alpha",
      override_value: "Same",
    });
    const ovB = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Beta",
      override_value: "Same",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ovA, ovB]);

    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Alpha");
    expect(overriddenParseResult.hotelReservations[1]!.hotel_name).toBe("Beta");
    expect(showHotelSideEffects).toContainEqual({
      overrideId: ovA.id,
      deactivate: "name_conflict",
    });
    expect(showHotelSideEffects).toContainEqual({
      overrideId: ovB.id,
      deactivate: "name_conflict",
    });
  });

  test("sibling hotel_address survives a name-override name_conflict (R30)", () => {
    const pr = makeParse({
      hotelReservations: [
        makeHotel(1, "Marriott", { hotel_address: "Addr M" }),
        makeHotel(2, "Hilton"),
      ],
    });
    const ovName = mkOverride({
      domain: "hotel",
      field: "hotel_name",
      match_key: "Marriott",
      override_value: "Hilton",
    });
    const ovAddr = mkOverride({
      domain: "hotel",
      field: "hotel_address",
      match_key: "Marriott",
      override_value: "New Addr",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ovName, ovAddr]);

    // name override conflicts (reverts to parsed Marriott), but the address override still applies.
    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Marriott");
    expect(overriddenParseResult.hotelReservations[0]!.hotel_address).toBe("New Addr");
    expect(showHotelSideEffects).toContainEqual({
      overrideId: ovName.id,
      deactivate: "name_conflict",
    });
    expect(findSheetValue(showHotelSideEffects, ovAddr.id)).toBe("Addr M");
  });

  test("crew overrides are ignored by the show/hotel transform", () => {
    const pr = makeParse();
    const ov = mkOverride({
      domain: "crew",
      field: "name",
      match_key: "Alice",
      override_value: "Alicia",
    });

    const { overriddenParseResult, showHotelSideEffects } = overrideShowHotel(pr, [ov]);

    expect(showHotelSideEffects).toEqual([]);
    expect(overriddenParseResult.hotelReservations[0]!.hotel_name).toBe("Hotel A");
  });
});
