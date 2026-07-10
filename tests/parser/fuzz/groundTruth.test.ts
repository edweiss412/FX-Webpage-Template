// tests/parser/fuzz/groundTruth.test.ts
//
// Task 7 — the plant-and-find ORACLE, tested against its SPEC (§4.2), NOT against
// the parser. Every `ParsedSheet` here is HAND-BUILT so the oracle's two-sided
// honesty is exercised directly (anti-tautology): a real parse could not, by
// construction, produce the adversarial signal shapes (bare index, wrong-value
// context, cross-section raw_unrecognized, prefix-collision superstring) that the
// oracle MUST reject. Expected values derive from the model, never a parser run.

import { describe, it, expect } from "vitest";
import {
  checkPlantAndFind,
  containsDelimitedIdentity,
  containsDelimitedDateToken,
} from "./groundTruth";
import { mdToken } from "./model";
import type { ShowModel, CrewModel } from "./model";
import type { DialChoices } from "./dials";
import type {
  ParsedSheet,
  ShowRow,
  CrewMemberRow,
  HotelReservationRow,
  RoomRow,
  ParseWarning,
} from "@/lib/parser/types";

// ---------------------------------------------------------------------------
// Dials + model builders.
// ---------------------------------------------------------------------------

function dials(overrides: Partial<DialChoices> = {}): DialChoices {
  return {
    dateFormat: "slash",
    dimsFormat: "unit",
    crewSectionToken: "CREW",
    crewHeader: "labeled",
    sectionOrder: 0,
    blankPadding: 1,
    headerTypo: null,
    dayRestrictionOn: false,
    ...overrides,
  };
}

// A 2-crew model with one hotel (2 guests), one room, venue, dates. Every planted
// identity embeds a unique serial (Q**/H**/R**/V**), exactly as model.ts generates.
function twoCrewModel(): ShowModel {
  return {
    version: "v4",
    year: 2026,
    dates: {
      travelIn: "2026-03-20",
      showDays: ["2026-03-21", "2026-03-22"],
      travelOut: "2026-03-23",
    },
    crew: [
      {
        name: "Amara QAA Quinn",
        role: "Video Engineer",
        phone: "200-300-4000",
        email: "q0@fuzz.example",
      },
      {
        name: "Boris QAB Stone",
        role: "Audio A2",
        phone: "201-301-4001",
        email: "q1@fuzz.example",
      },
    ],
    hotels: [
      {
        name: "Harborview HAA Hotel",
        address: "483 Main St",
        guests: ["Amara QAA Quinn", "Boris QAB Stone"],
      },
    ],
    rooms: [{ kind: "GENERAL SESSION", name: "ALPINE RAA", dims: { w: 40, d: 30 } }],
    venue: { name: "Vantage VAA Center", address: "12 Oak Ave" },
    sections: ["crew", "dates", "venue", "hotels", "rooms"],
  };
}

// ---------------------------------------------------------------------------
// ParsedSheet builders — full valid default shapes, then targeted overrides.
// ---------------------------------------------------------------------------

function crewRow(m: CrewModel): CrewMemberRow {
  return {
    name: m.name,
    email: m.email ?? null,
    phone: m.phone,
    role: m.role,
    role_flags: [],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function hotelRow(
  ordinal: number,
  name: string,
  address: string,
  guests: string[],
): HotelReservationRow {
  return {
    ordinal,
    hotel_name: name,
    hotel_address: address,
    names: guests,
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
  };
}

function roomRow(kind: RoomRow["kind"], name: string, dimensions: string): RoomRow {
  return {
    kind,
    name,
    dimensions,
    floor: null,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
  };
}

function showRow(model: ShowModel): ShowRow {
  return {
    title: "Fuzz Show",
    client_label: "Fuzz Client",
    client_contact: null,
    template_version: "v4",
    venue: { name: model.venue.name, address: model.venue.address },
    dates: {
      travelIn: model.dates.travelIn,
      set: null,
      showDays: [...model.dates.showDays],
      travelOut: model.dates.travelOut,
    },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: null,
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
  };
}

/** A perfect parse of `model`: every planted entity present, all fields matching. */
function perfectParse(model: ShowModel, d: DialChoices = dials()): ParsedSheet {
  const crewMembers = model.crew.map((c) => {
    const row = crewRow(c);
    if (d.dayRestrictionOn && c.dayRestriction && c.dayRestriction.length > 0) {
      row.date_restriction = { kind: "explicit", days: c.dayRestriction.map(mdToken) };
    }
    return row;
  });
  return {
    show: showRow(model),
    crewMembers,
    hotelReservations: model.hotels.map((h, i) =>
      hotelRow(i + 1, h.name, h.address, [...h.guests]),
    ),
    rooms: model.rooms.map((r) => roomRow("gs", r.name, `${r.dims.w}' x ${r.dims.d}'`)),
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

// ---------------------------------------------------------------------------
// (a) perfect parse → ok
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (a) perfect parse", () => {
  it("a 2-crew model with all fields matching returns ok", () => {
    const model = twoCrewModel();
    expect(checkPlantAndFind(model, dials(), perfectParse(model))).toEqual({ ok: true });
  });

  it("day-restriction round-trips (dial on): explicit M/D multiset matches", () => {
    const model = twoCrewModel();
    model.crew[0]!.dayRestriction = ["2026-03-21", "2026-03-22"];
    const d = dials({ dayRestrictionOn: true });
    expect(checkPlantAndFind(model, d, perfectParse(model, d))).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// (b) deleted crew, no signals → miss naming that serial
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (b) silent drop", () => {
  it("deleting a crew member with no signals is an unattributed miss naming the serial", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.crewMembers = parsed.crewMembers.filter((c) => c.name !== "Boris QAB Stone");
    const res = checkPlantAndFind(model, dials(), parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.misses).toHaveLength(1);
      expect(res.misses[0]).toContain("Boris QAB Stone");
      expect(res.misses[0]).toMatch(/QAB/);
    }
  });
});

// ---------------------------------------------------------------------------
// (c) deleted + unrelated same-section warning (bare index + wrong value) → still a miss
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (c) bare-index / wrong-value cannot absolve", () => {
  it("a crew-section warning with only {kind:crew,index:0} and no matching name stays a miss", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.crewMembers = parsed.crewMembers.filter((c) => c.name !== "Boris QAB Stone");
    const w: ParseWarning = {
      severity: "warn",
      code: "SOME_UNRELATED_CODE",
      message: "Crew row 1 had a problem with Amara QAA Quinn",
      blockRef: { kind: "crew", index: 0 },
    };
    parsed.warnings = [w];
    const res = checkPlantAndFind(model, dials(), parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.misses[0]).toContain("Boris QAB Stone");
  });
});

// ---------------------------------------------------------------------------
// (d) deleted + warning whose message contains the full name → absolved
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (d) identity-value containment absolves", () => {
  it("a same-section warning whose message contains the dropped member's name absolves it", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.crewMembers = parsed.crewMembers.filter((c) => c.name !== "Boris QAB Stone");
    parsed.warnings = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: 'Crew phone for Boris QAB Stone couldn\'t be read as a phone number ("xxx").',
        blockRef: { kind: "crew", index: 1 },
      },
    ];
    expect(checkPlantAndFind(model, dials(), parsed)).toEqual({ ok: true });
  });

  it("blockRef.name exact identity match also absolves", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.crewMembers = parsed.crewMembers.filter((c) => c.name !== "Boris QAB Stone");
    parsed.warnings = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "Crew phone could not be read.",
        blockRef: { kind: "crew", index: 1, name: "Boris QAB Stone" },
      },
    ];
    expect(checkPlantAndFind(model, dials(), parsed)).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// (e) deleted + raw_unrecognized in ANOTHER block containing the name → still a miss
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (e) cross-section scope", () => {
  it("a raw_unrecognized row in a DIFFERENT block containing the name does NOT absolve", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.crewMembers = parsed.crewMembers.filter((c) => c.name !== "Boris QAB Stone");
    // Same name, but block is 'hotels' — not the crew section.
    parsed.raw_unrecognized = [{ block: "hotels", key: "Boris QAB Stone", value: "stray" }];
    const res = checkPlantAndFind(model, dials(), parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.misses[0]).toContain("Boris QAB Stone");
  });

  it("the SAME raw_unrecognized in the crew block DOES absolve (scope control)", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.crewMembers = parsed.crewMembers.filter((c) => c.name !== "Boris QAB Stone");
    parsed.raw_unrecognized = [{ block: "crew", key: "Boris QAB Stone", value: "stray" }];
    expect(checkPlantAndFind(model, dials(), parsed)).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// (f) hotel guests subset (1 of 2), no signal → miss
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (f) guest multiset (subset is not enough)", () => {
  it("a hotel that drops one of two planted guests with no signal is a miss", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.hotelReservations[0]!.names = ["Amara QAA Quinn"]; // dropped Boris
    const res = checkPlantAndFind(model, dials(), parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.misses[0]).toContain("Harborview HAA Hotel");
  });

  it("HOTEL_GUEST_SPLIT_AMBIGUOUS naming the hotel absolves the guest-subset miss", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.hotelReservations[0]!.names = ["Amara QAA Quinn"];
    parsed.warnings = [
      {
        severity: "warn",
        code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
        message: "Guest cell may glue multiple guests together.",
        blockRef: { kind: "hotels", name: "Harborview HAA Hotel", field: "guests" },
      },
    ];
    expect(checkPlantAndFind(model, dials(), parsed)).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// (g) hardErrors → fail regardless
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (g) hardErrors never absolve", () => {
  it("a VERSION_AMBIGUOUS hardError fails even on an otherwise-perfect parse", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.hardErrors = [{ code: "VERSION_AMBIGUOUS", message: "ambiguous version" }];
    const res = checkPlantAndFind(model, dials(), parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.misses).toEqual(["hardError:VERSION_AMBIGUOUS"]);
    }
  });
});

// ---------------------------------------------------------------------------
// (h) zero-rooms model but parsed rooms non-empty → fabrication failure
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (h) zero-fabrication", () => {
  it("a zero-rooms model with a non-empty parsed rooms payload fails (no absolution)", () => {
    const model = twoCrewModel();
    model.rooms = [];
    model.sections = ["crew", "dates", "venue", "hotels"];
    const parsed = perfectParse(model); // rooms payload empty here...
    parsed.rooms = [roomRow("gs", "PHANTOM RZZ", "10' x 10'")]; // ...fabricate one
    // Even a section-structural signal cannot absolve fabrication.
    parsed.warnings = [
      {
        severity: "warn",
        code: "SECTION_HEADER_NO_FIELDS",
        message: "Recognized rooms header but parsed zero fields.",
        blockRef: { kind: "rooms" },
      },
    ];
    const res = checkPlantAndFind(model, dials(), parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.misses.some((m) => m.includes("fabrication"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (i) Ann/Annette boundary control — a superstring must NOT absolve
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (i) boundary-delimited identity match", () => {
  it("a warning containing a superstring of the identity does NOT absolve", () => {
    const model = twoCrewModel();
    // Rename a member so its name is a strict prefix of the warning text token.
    model.crew[1]!.name = "Ann QAB Roe";
    const parsed = perfectParse(model);
    parsed.crewMembers = parsed.crewMembers.filter((c) => c.name !== "Ann QAB Roe");
    parsed.warnings = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "Crew phone for Ann QAB Roeder couldn't be read.", // superstring, not the identity
        blockRef: { kind: "crew", index: 1 },
      },
    ];
    const res = checkPlantAndFind(model, dials(), parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.misses[0]).toContain("Ann QAB Roe");
  });

  it("containsDelimitedIdentity rejects a prefix collision but accepts a delimited match", () => {
    expect(containsDelimitedIdentity("Crew phone for Ann QAB Roeder failed", "Ann QAB Roe")).toBe(
      false,
    );
    expect(containsDelimitedIdentity("Crew phone for Ann QAB Roe failed", "Ann QAB Roe")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// (j) restriction M/D matcher rejects 3/24 inside 3/24/2026
// ---------------------------------------------------------------------------

describe("checkPlantAndFind — (j) domain-aware date matcher", () => {
  it("the M/D token '3/24' is NOT found inside the full date '3/24/2026'", () => {
    expect(containsDelimitedDateToken("check 3/24/2026 in sheet", "3/24")).toBe(false);
  });

  it("but a delimited M/D token IS found", () => {
    expect(containsDelimitedDateToken("restricted to 3/24 only", "3/24")).toBe(true);
  });

  it("a full slash date is found delimited but not when glued to more digits", () => {
    expect(containsDelimitedDateToken("show 3/24/2026 here", "3/24/2026")).toBe(true);
    expect(containsDelimitedDateToken("show 3/24/20261 here", "3/24/2026")).toBe(false);
  });

  it("a dropped show-day absolved by a blockRef.iso match on the dates section", () => {
    const model = twoCrewModel();
    const parsed = perfectParse(model);
    parsed.show.dates.showDays = ["2026-03-21"]; // dropped 2026-03-22
    parsed.warnings = [
      {
        severity: "warn",
        code: "DATE_ORDER_SUGGESTS_DMY",
        message: "Show dates only sort day-first.",
        blockRef: { kind: "dates", iso: "2026-03-22", field: "order" },
      },
    ];
    expect(checkPlantAndFind(model, dials(), parsed)).toEqual({ ok: true });
  });
});
