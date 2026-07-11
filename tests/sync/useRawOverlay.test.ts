import { describe, it, expect } from "vitest";
import {
  applyUseRawDecisions,
  normalizeUseRawDecisions,
  type UseRawDecision,
} from "@/lib/sync/useRawOverlay";
import { buildParseResult } from "../components/admin/wizard/_step3ReviewFixture";
import type { ParseWarning, RoomRow, HotelReservationRow } from "@/lib/parser/types";

// Task 3 (spec §5, §7): the PURE post-parse overlay. Matches decisions to current
// warnings by (code, contentHash) — NEVER by target — applies the raw replacement
// for matched preference:"raw" decisions, and partitions kept/invalidated/reverted.
// Anti-tautology: assert the mutated result fields against the warning's own
// resolution.replacement, not a container that renders both.

const HASH_ROOM = "hash-room-1";
const HASH_HOTEL = "hash-hotel-1";
const HASH_DATE = "hash-date-1";

function roomRow(name: string, dimensions: string | null, floor: string | null): RoomRow {
  return {
    kind: "gs",
    name,
    dimensions,
    floor,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
  } as RoomRow;
}

function hotelRow(names: string[], confirmation_no: string | null): HotelReservationRow {
  return {
    ordinal: 1,
    hotel_name: "Grand Plaza",
    hotel_address: "1 Main St",
    names,
    confirmation_no,
    check_in: "2026-01-01",
    check_out: "2026-01-02",
    notes: "keep-me",
  };
}

function roomWarning(
  hash: string,
  parsed: { name: string; dimensions: string | null; floor: string | null },
  rawName: string,
): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "m",
    blockRef: { kind: "rooms", name: parsed.name, field: "dims" },
    resolution: {
      resolvable: true,
      contentHash: hash,
      parsed: { kind: "rooms", ...parsed },
      replacement: { kind: "rooms", name: rawName, dimensions: null, floor: null },
    },
  };
}

function hotelWarning(
  hash: string,
  index: number,
  parsedNames: string[],
  rawCell: string,
): ParseWarning {
  return {
    severity: "warn",
    code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
    message: "m",
    blockRef: { kind: "hotels", field: "guests", index },
    resolution: {
      resolvable: true,
      contentHash: hash,
      parsed: { kind: "hotels", names: parsedNames, confirmationNo: null },
      replacement: { kind: "hotels", names: [rawCell], confirmationNo: null },
    },
  };
}

function dateWarning(hash: string): ParseWarning {
  return {
    severity: "warn",
    code: "DATE_ORDER_SUGGESTS_DMY",
    message: "m",
    blockRef: { kind: "dates", field: "order" },
    resolution: {
      resolvable: true,
      contentHash: hash,
      parsed: {
        kind: "dates",
        dates: {
          travelIn: "2026-10-03",
          set: null,
          showDays: ["2026-01-04", "2026-11-03"],
          travelOut: null,
        },
      },
      replacement: {
        kind: "dates",
        dmyDates: {
          travelIn: "2026-03-10",
          set: null,
          showDays: ["2026-03-11", "2026-04-01"],
          travelOut: null,
        },
      },
    },
  };
}

function decision(over: Partial<UseRawDecision>): UseRawDecision {
  return {
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    contentHash: HASH_ROOM,
    target: { kind: "rooms" },
    preference: "raw",
    applied: false,
    decidedAt: "2026-07-10T00:00:00.000Z",
    decidedBy: "admin@x.com",
    ...over,
  };
}

describe("applyUseRawDecisions — match by content hash, not target", () => {
  it("rooms: a preference:raw decision matched by hash rewrites name/dims/floor from replacement", () => {
    const room = roomRow("LASALLE", "50x40", "2");
    const pr = buildParseResult({
      rooms: [room],
      warnings: [
        roomWarning(
          HASH_ROOM,
          { name: "LASALLE", dimensions: "50x40", floor: "2" },
          "LASALLE 50x40 30x20",
        ),
      ],
    });
    const out = applyUseRawDecisions(pr, [decision({})]);
    // Anti-tautology: assert against the warning's replacement, not the room fixture
    const rep = (pr.warnings[0]!.resolution as { replacement: { name: string } }).replacement;
    expect(out.result.rooms[0]!.name).toBe(rep.name);
    expect(out.result.rooms[0]!.dimensions).toBeNull();
    expect(out.result.rooms[0]!.floor).toBeNull();
    expect(out.kept).toHaveLength(1);
    expect(out.invalidated).toHaveLength(0);
    expect(out.reverted).toHaveLength(0);
  });

  it("rooms: a decision whose hash matches NO current warning is invalidated (not applied)", () => {
    const room = roomRow("LASALLE", "50x40", "2");
    const pr = buildParseResult({
      rooms: [room],
      warnings: [
        roomWarning("some-other-hash", { name: "LASALLE", dimensions: "50x40", floor: "2" }, "RAW"),
      ],
    });
    const out = applyUseRawDecisions(pr, [decision({ contentHash: HASH_ROOM })]);
    expect(out.result.rooms[0]!.name).toBe("LASALLE"); // untouched
    expect(out.result.rooms[0]!.dimensions).toBe("50x40");
    expect(out.invalidated).toHaveLength(1);
    expect(out.kept).toHaveLength(0);
  });

  it("hotels: rewrites the reservation at blockRef.index — names=[raw], confirmation cleared, other fields untouched", () => {
    const hotel = hotelRow(["John Smith", "Jane Doe"], "CONF123");
    const pr = buildParseResult({
      hotelReservations: [hotel],
      warnings: [hotelWarning(HASH_HOTEL, 0, ["John Smith", "Jane Doe"], "John Smith Jane Doe")],
    });
    const out = applyUseRawDecisions(pr, [
      decision({
        code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
        contentHash: HASH_HOTEL,
        target: { kind: "hotels", index: 0 },
      }),
    ]);
    expect(out.result.hotelReservations[0]!.names).toEqual(["John Smith Jane Doe"]);
    expect(out.result.hotelReservations[0]!.confirmation_no).toBeNull();
    // untouched fields
    expect(out.result.hotelReservations[0]!.hotel_name).toBe("Grand Plaza");
    expect(out.result.hotelReservations[0]!.check_in).toBe("2026-01-01");
    expect(out.result.hotelReservations[0]!.notes).toBe("keep-me");
    expect(out.kept).toHaveLength(1);
  });

  it("dates: rewrites ONLY dates.{travelIn,set,showDays,travelOut} from dmyDates; clock fields untouched", () => {
    const pr = buildParseResult({
      warnings: [dateWarning(HASH_DATE)],
    });
    pr.show.dates.travelIn = "2026-10-03";
    pr.show.dates.showDays = ["2026-01-04", "2026-11-03"];
    pr.show.dates.loadIn = "8:00 AM";
    const out = applyUseRawDecisions(pr, [
      decision({
        code: "DATE_ORDER_SUGGESTS_DMY",
        contentHash: HASH_DATE,
        target: { kind: "dates" },
      }),
    ]);
    expect(out.result.show.dates.travelIn).toBe("2026-03-10");
    expect(out.result.show.dates.showDays).toEqual(["2026-03-11", "2026-04-01"]);
    expect(out.result.show.dates.travelOut).toBeNull();
    expect(out.result.show.dates.loadIn).toBe("8:00 AM"); // clock field untouched
    expect(out.kept).toHaveLength(1);
  });
});

describe("applyUseRawDecisions — content-scoped equivalence class", () => {
  it("two warnings share one contentHash → one decision keeps BOTH; both rooms rewritten", () => {
    const r1 = roomRow("LASALLE", "50x40", "2");
    const r2 = roomRow("LASALLE", "50x40", "2"); // identical content → same hash
    const pr = buildParseResult({
      rooms: [r1, r2],
      warnings: [
        roomWarning(HASH_ROOM, { name: "LASALLE", dimensions: "50x40", floor: "2" }, "LASALLE RAW"),
        roomWarning(HASH_ROOM, { name: "LASALLE", dimensions: "50x40", floor: "2" }, "LASALLE RAW"),
      ],
    });
    const out = applyUseRawDecisions(pr, [decision({})]);
    expect(out.result.rooms[0]!.name).toBe("LASALLE RAW");
    expect(out.result.rooms[1]!.name).toBe("LASALLE RAW");
    expect(out.kept).toHaveLength(1); // ONE decision, not two
    expect(out.invalidated).toHaveLength(0);
  });
});

describe("applyUseRawDecisions — reverted partition", () => {
  it("preference:transform matched → applies NOTHING (transform kept), decision in reverted", () => {
    const room = roomRow("LASALLE", "50x40", "2");
    const pr = buildParseResult({
      rooms: [room],
      warnings: [
        roomWarning(HASH_ROOM, { name: "LASALLE", dimensions: "50x40", floor: "2" }, "RAW"),
      ],
    });
    const out = applyUseRawDecisions(pr, [decision({ preference: "transform" })]);
    expect(out.result.rooms[0]!.name).toBe("LASALLE"); // transform value kept
    expect(out.result.rooms[0]!.dimensions).toBe("50x40");
    expect(out.reverted).toHaveLength(1);
    expect(out.kept).toHaveLength(0);
    expect(out.invalidated).toHaveLength(0);
  });

  it("preference:transform matching no warning → also reverted (silently dropped)", () => {
    const pr = buildParseResult({ rooms: [roomRow("A", null, null)], warnings: [] });
    const out = applyUseRawDecisions(pr, [
      decision({ preference: "transform", contentHash: "ghost" }),
    ]);
    expect(out.reverted).toHaveLength(1);
    expect(out.kept).toHaveLength(0);
    expect(out.invalidated).toHaveLength(0);
  });
});

describe("applyUseRawDecisions — purity", () => {
  it("does not mutate the input parseResult (returns a fresh result)", () => {
    const room = roomRow("LASALLE", "50x40", "2");
    const pr = buildParseResult({
      rooms: [room],
      warnings: [
        roomWarning(HASH_ROOM, { name: "LASALLE", dimensions: "50x40", floor: "2" }, "RAW"),
      ],
    });
    applyUseRawDecisions(pr, [decision({})]);
    expect(pr.rooms[0]!.name).toBe("LASALLE"); // input unchanged
    expect(pr.rooms[0]!.dimensions).toBe("50x40");
  });
});

describe("normalizeUseRawDecisions — the single JSONB validation boundary", () => {
  const valid = decision({});
  it("non-array input → []", () => {
    expect(normalizeUseRawDecisions(null)).toEqual([]);
    expect(normalizeUseRawDecisions(undefined)).toEqual([]);
    expect(normalizeUseRawDecisions({})).toEqual([]);
    expect(normalizeUseRawDecisions("[]")).toEqual([]);
  });
  it("drops an out-of-scope code", () => {
    expect(normalizeUseRawDecisions([{ ...valid, code: "SOMETHING_ELSE" }])).toEqual([]);
  });
  it("drops a missing/blank contentHash", () => {
    expect(normalizeUseRawDecisions([{ ...valid, contentHash: "" }])).toEqual([]);
    const { contentHash: _c, ...noHash } = valid;
    expect(normalizeUseRawDecisions([noHash])).toEqual([]);
  });
  it("drops a bad preference or applied shape", () => {
    expect(normalizeUseRawDecisions([{ ...valid, preference: "maybe" }])).toEqual([]);
    expect(normalizeUseRawDecisions([{ ...valid, applied: "yes" }])).toEqual([]);
  });
  it("passes a valid array through", () => {
    expect(normalizeUseRawDecisions([valid])).toEqual([valid]);
  });
  it("never throws on garbage", () => {
    expect(() => normalizeUseRawDecisions([1, "x", null, { code: 5 }])).not.toThrow();
    expect(normalizeUseRawDecisions([1, "x", null, { code: 5 }])).toEqual([]);
  });
});
