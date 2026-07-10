// tests/parser/fuzz/render.test.ts
//
// Deterministic anchor tests for render.ts (Task 6, Step 1). NO fast-check — each
// case plants a fixed ShowModel + fixed DialChoices, renders it, feeds the markdown
// to the REAL production parser (`parseSheet`), and asserts the planted entities come
// back. The parser is the oracle: a render-template that misses a gate fails HERE,
// not later as Tier-2 generator overreach.

import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser";
import { classifyVersion } from "@/lib/parser/schema";
import type { ShowModel, SectionKind } from "./model";
import { mdToken } from "./model";
import type { DialChoices } from "./dials";
import { renderCase, renderDims, SCAFFOLD } from "./render";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseDials(overrides: Partial<DialChoices> = {}): DialChoices {
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

const DATES = {
  travelIn: "2025-04-06",
  showDays: ["2025-04-08", "2025-04-09"],
  travelOut: "2025-04-10",
} as const;

function mk(overrides: Partial<ShowModel> & { sections: SectionKind[] }): ShowModel {
  return {
    version: "v4",
    year: 2025,
    dates: { travelIn: DATES.travelIn, showDays: [...DATES.showDays], travelOut: DATES.travelOut },
    crew: [],
    hotels: [],
    rooms: [],
    venue: { name: "Vantage VAA Center", address: "123 Main St" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (a) scaffold-only guard — confident-v4 AND zero rooms/crew/hotels payload
// ---------------------------------------------------------------------------

describe("(a) v4 scaffold", () => {
  it("classifies confident-v4 alone, with zero rooms/crew/hotels payload", () => {
    const verdict = classifyVersion(SCAFFOLD);
    expect(verdict.status).toBe("confident");
    if (verdict.status === "confident") expect(verdict.version).toBe("v4");

    const parsed = parseSheet(SCAFFOLD);
    expect(parsed.hardErrors).toHaveLength(0);
    expect(parsed.crewMembers).toHaveLength(0);
    expect(parsed.hotelReservations).toHaveLength(0);
    expect(parsed.rooms).toHaveLength(0);
  });

  it("every rendered case is confident-v4 (scaffold always present)", () => {
    const model = mk({
      sections: ["crew", "dates", "venue"],
      crew: [{ name: "Amara QAA Quinn", role: "Video Engineer", phone: "216-345-0000" }],
    });
    const md = renderCase(model, baseDials());
    const verdict = classifyVersion(md);
    expect(verdict.status).toBe("confident");
    expect(parseSheet(md).hardErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (b) 2 crew, one restricted (dial ON) — names/roles clean, restriction explicit
// ---------------------------------------------------------------------------

describe("(b) crew round-trip with day restriction", () => {
  it("round-trips names + cleaned roles + explicit day restriction", () => {
    const model = mk({
      sections: ["crew"],
      crew: [
        { name: "Amara QAA Quinn", role: "Video Engineer", phone: "216-345-0000" },
        {
          name: "Boris QAB Stone",
          role: "LED Tech",
          phone: "217-346-0001",
          dayRestriction: ["2025-04-08", "2025-04-09"],
        },
      ],
    });
    const parsed = parseSheet(renderCase(model, baseDials({ dayRestrictionOn: true })));

    expect(parsed.crewMembers.map((c) => c.name)).toEqual(["Amara QAA Quinn", "Boris QAB Stone"]);
    expect(parsed.crewMembers.map((c) => c.role)).toEqual(["Video Engineer", "LED Tech"]);

    const restricted = parsed.crewMembers.find((c) => c.name === "Boris QAB Stone")!;
    expect(restricted.date_restriction).toEqual({
      kind: "explicit",
      days: ["2025-04-08", "2025-04-09"].map(mdToken),
    });
    const unrestricted = parsed.crewMembers.find((c) => c.name === "Amara QAA Quinn")!;
    expect(unrestricted.date_restriction.kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// (c) headerless — CREW_COLUMN_POSITIONAL_FALLBACK + round-trip
// ---------------------------------------------------------------------------

describe("(c) headerless crew", () => {
  it("fires CREW_COLUMN_POSITIONAL_FALLBACK and round-trips name/role positionally", () => {
    const model = mk({
      sections: ["crew"],
      crew: [
        { name: "Amara QAA Quinn", role: "Video Engineer", phone: "216-345-0000" },
        { name: "Boris QAB Stone", role: "LED Tech", phone: "217-346-0001" },
      ],
    });
    const parsed = parseSheet(renderCase(model, baseDials({ crewHeader: "headerless" })));

    expect(parsed.warnings.map((w) => w.code)).toContain("CREW_COLUMN_POSITIONAL_FALLBACK");
    expect(parsed.crewMembers.map((c) => c.name)).toEqual(["Amara QAA Quinn", "Boris QAB Stone"]);
    expect(parsed.crewMembers.map((c) => c.role)).toEqual(["Video Engineer", "LED Tech"]);
  });
});

// ---------------------------------------------------------------------------
// (c2) headerTypo — SECTION_HEADER_AUTOCORRECTED + round-trip
// ---------------------------------------------------------------------------

describe("(c2) crew header typo", () => {
  it("autocorrects the CREW label and round-trips both crew", () => {
    const model = mk({
      sections: ["crew"],
      crew: [
        { name: "Amara QAA Quinn", role: "Video Engineer", phone: "216-345-0000" },
        { name: "Boris QAB Stone", role: "LED Tech", phone: "217-346-0001" },
      ],
    });
    const parsed = parseSheet(
      renderCase(model, baseDials({ headerTypo: { typoedCrewLabel: "CRWE" } })),
    );

    expect(parsed.warnings.map((w) => w.code)).toContain("SECTION_HEADER_AUTOCORRECTED");
    expect(parsed.crewMembers.map((c) => c.name)).toEqual(["Amara QAA Quinn", "Boris QAB Stone"]);
    expect(parsed.crewMembers.map((c) => c.role)).toEqual(["Video Engineer", "LED Tech"]);
  });
});

// ---------------------------------------------------------------------------
// (b'/dial-off) restriction present but dial OFF ⇒ no restriction parsed
// ---------------------------------------------------------------------------

describe("(dial-off) day restriction not emitted when dayRestrictionOn=false", () => {
  it("renders no restriction clause; parsed date_restriction is none", () => {
    const model = mk({
      sections: ["crew"],
      crew: [
        {
          name: "Boris QAB Stone",
          role: "LED Tech",
          phone: "217-346-0001",
          dayRestriction: ["2025-04-08", "2025-04-09"],
        },
      ],
    });
    const md = renderCase(model, baseDials({ dayRestrictionOn: false }));
    expect(md).not.toContain("ONLY");
    const parsed = parseSheet(md);
    const member = parsed.crewMembers.find((c) => c.name === "Boris QAB Stone")!;
    expect(member.date_restriction.kind).toBe("none");
    expect(member.role).toBe("LED Tech");
  });
});

// ---------------------------------------------------------------------------
// (d) dates — travelIn/showDays/travelOut ISO-equal (every date format)
// ---------------------------------------------------------------------------

describe("(d) dates round-trip", () => {
  const formats: DialChoices["dateFormat"][] = ["slash", "dash", "iso", "longMDY", "longDMY"];
  formats.forEach((dateFormat) => {
    it(`round-trips travelIn/showDays/travelOut in ${dateFormat} format`, () => {
      const model = mk({ sections: ["dates"] });
      const parsed = parseSheet(renderCase(model, baseDials({ dateFormat })));
      expect(parsed.show.dates.travelIn).toBe(model.dates.travelIn);
      expect(parsed.show.dates.showDays).toEqual(model.dates.showDays);
      expect(parsed.show.dates.travelOut).toBe(model.dates.travelOut);
    });
  });
});

// ---------------------------------------------------------------------------
// (e) venue — name + address
// ---------------------------------------------------------------------------

describe("(e) venue round-trip", () => {
  it("round-trips venue name + address", () => {
    const model = mk({ sections: ["venue"] });
    const parsed = parseSheet(renderCase(model, baseDials()));
    expect(parsed.show.venue?.name).toBe(model.venue.name);
    expect(parsed.show.venue?.address).toBe(model.venue.address);
  });
});

// ---------------------------------------------------------------------------
// (f) hotel — 1 hotel + 2 guests
// ---------------------------------------------------------------------------

describe("(f) hotel round-trip", () => {
  it("round-trips hotel name/address and both guests", () => {
    const model = mk({
      sections: ["hotels"],
      hotels: [
        {
          name: "Harborview HAA Hotel",
          address: "123 Main St",
          guests: ["Amara QAA Quinn", "Boris QAB Stone"],
        },
      ],
    });
    const parsed = parseSheet(renderCase(model, baseDials()));
    expect(parsed.hotelReservations).toHaveLength(1);
    const res = parsed.hotelReservations[0]!;
    expect(res.hotel_name).toBe("Harborview HAA Hotel");
    expect(res.hotel_address).toBe("123 Main St");
    expect(res.names).toEqual(["Amara QAA Quinn", "Boris QAB Stone"]);
  });
});

// ---------------------------------------------------------------------------
// (g) rooms — one per kind (GENERAL SESSION, BREAKOUT, ADDITIONAL ROOM, LUNCH ROOM)
// ---------------------------------------------------------------------------

describe("(g) rooms — all four kinds round-trip", () => {
  it("round-trips name + dims for each kind, mapping to the parser RoomKind", () => {
    const model = mk({
      sections: ["rooms"],
      rooms: [
        { kind: "GENERAL SESSION", name: "ALPINE RAA", dims: { w: 50, d: 40 } },
        { kind: "BREAKOUT", name: "MERIDIAN RAB", dims: { w: 30, d: 20 } },
        { kind: "ADDITIONAL ROOM", name: "HARBOR RAC", dims: { w: 60, d: 45 } },
        { kind: "LUNCH ROOM", name: "SUMMIT RAD", dims: { w: 25, d: 25 } },
      ],
    });
    const dials = baseDials();
    const parsed = parseSheet(renderCase(model, dials));

    const kindMap: Record<string, "gs" | "breakout" | "additional"> = {
      "GENERAL SESSION": "gs",
      BREAKOUT: "breakout",
      "ADDITIONAL ROOM": "additional",
      "LUNCH ROOM": "breakout",
    };
    for (const room of model.rooms) {
      const parsedRoom = parsed.rooms.find((r) => r.name === room.name);
      expect(parsedRoom, `room ${room.name} (${room.kind}) not parsed`).toBeDefined();
      expect(parsedRoom!.kind).toBe(kindMap[room.kind]);
      expect(parsedRoom!.dimensions).toBe(renderDims(room.dims.w, room.dims.d, dials.dimsFormat));
    }
  });

  it("round-trips dims in every dimsFormat", () => {
    const formats: DialChoices["dimsFormat"][] = ["unit", "bare", "unicode"];
    formats.forEach((dimsFormat) => {
      const model = mk({
        sections: ["rooms"],
        rooms: [{ kind: "GENERAL SESSION", name: "ALPINE RAA", dims: { w: 50, d: 40 } }],
      });
      const parsed = parseSheet(renderCase(model, baseDials({ dimsFormat })));
      const gs = parsed.rooms.find((r) => r.name === "ALPINE RAA")!;
      expect(gs.dimensions).toBe(renderDims(50, 40, dimsFormat));
    });
  });
});

// ---------------------------------------------------------------------------
// (h) determinism
// ---------------------------------------------------------------------------

describe("(h) deterministic render", () => {
  it("two renders of the same input are byte-equal", () => {
    const model = mk({
      sections: ["crew", "dates", "venue", "hotels", "rooms"],
      crew: [
        {
          name: "Amara QAA Quinn",
          role: "Video Engineer",
          phone: "216-345-0000",
          dayRestriction: ["2025-04-08"],
        },
      ],
      hotels: [
        { name: "Harborview HAA Hotel", address: "123 Main St", guests: ["Amara QAA Quinn"] },
      ],
      rooms: [
        { kind: "GENERAL SESSION", name: "ALPINE RAA", dims: { w: 50, d: 40 } },
        { kind: "BREAKOUT", name: "MERIDIAN RAB", dims: { w: 30, d: 20 } },
      ],
    });
    const dials = baseDials({ sectionOrder: 37, blankPadding: 2, dayRestrictionOn: true });
    expect(renderCase(model, dials)).toBe(renderCase(model, dials));
  });
});

// ---------------------------------------------------------------------------
// (i) blankPadding — exactly one blank line between sections when blankPadding=1
// ---------------------------------------------------------------------------

describe("(i) blank padding", () => {
  it("blankPadding=1 emits exactly one blank line between sections (no triple newline)", () => {
    const model = mk({
      sections: ["crew", "dates", "venue"],
      crew: [{ name: "Amara QAA Quinn", role: "Video Engineer", phone: "216-345-0000" }],
    });
    const md = renderCase(model, baseDials({ blankPadding: 1 }));
    expect(md).not.toContain("\n\n\n");
  });

  it("blankPadding=2 emits two blank lines between sections (contains a triple newline)", () => {
    const model = mk({
      sections: ["crew", "dates", "venue"],
      crew: [{ name: "Amara QAA Quinn", role: "Video Engineer", phone: "216-345-0000" }],
    });
    const md = renderCase(model, baseDials({ blankPadding: 2 }));
    expect(md).toContain("\n\n\n");
  });
});
