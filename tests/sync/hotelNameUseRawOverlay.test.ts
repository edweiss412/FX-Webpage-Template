// tests/sync/hotelNameUseRawOverlay.test.ts
//
// Whole-diff review R1 finding 6: the `hotel-name` write-back path had no
// integration oracle. Deleting the applyReplacement branch, routing it to the
// wrong index, or writing `rawSnippet` instead of the sanitized replacement all
// left every emitter-level test green — and that last variant puts a
// confirmation number back into crew-readable `hotel_name`, which is the P0
// this feature is under standing orders never to reintroduce.
import { describe, it, expect } from "vitest";
import { applyUseRawDecisions, type UseRawDecision } from "@/lib/sync/useRawOverlay";
import { newAggregator, emitHotelAddressSplitAmbiguity } from "@/lib/parser/warnings";
import { buildParseResult } from "../components/admin/wizard/_step3ReviewFixture";
import type { UseRawResolution } from "@/lib/parser/types";

const RAW_WITH_CONF = "Hotel #9999 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601";

function hotelRow(over: Partial<{ hotel_name: string | null; hotel_address: string | null }>) {
  return {
    ordinal: 1,
    hotel_name: "Hotel",
    hotel_address: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
    names: ["Eric Weiss"],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
    ...over,
  };
}

/** Emit a real P3(b) warning at `index`, then drive its decision through. */
function applyAt(index: number, rowCount: number) {
  const agg = newAggregator();
  emitHotelAddressSplitAmbiguity(agg, {
    reason: "multiple-street-candidates",
    rawCell: RAW_WITH_CONF,
    splitInput: RAW_WITH_CONF,
    index,
    name: "Hotel",
    parsedName: "Hotel",
    parsedAddress: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
  });
  const warning = agg.warnings[0]!;
  const res = warning.resolution as Extract<UseRawResolution, { resolvable: true }>;
  const hotelReservations = Array.from({ length: rowCount }, (_, i) =>
    hotelRow({ hotel_name: `Hotel ${i}` }),
  );
  const decision: UseRawDecision = {
    code: "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    contentHash: res.contentHash,
    target: { kind: "hotels", index },
    preference: "raw",
    applied: false,
    decidedAt: "2026-07-26T00:00:00.000Z",
    decidedBy: "test",
  };
  const before = buildParseResult({ hotelReservations, warnings: agg.warnings });
  return { before, after: applyUseRawDecisions(before, [decision]).result };
}

describe("hotel-name use-raw overlay", () => {
  it("undoes the split on the anchored reservation", () => {
    const { after } = applyAt(0, 1);
    const row = after.hotelReservations[0]!;
    // Kills a missing applyReplacement branch: without it nothing changes.
    expect(row.hotel_address).toBeNull();
    expect(row.hotel_name).not.toBe("Hotel 0");
  });

  it("NEVER writes a confirmation number into crew-readable hotel_name (P0)", () => {
    const { after } = applyAt(0, 1);
    const name = after.hotelReservations[0]!.hotel_name ?? "";
    // Kills writing `rawSnippet` instead of the sanitized replacement.
    expect(name).not.toMatch(/9999/);
    expect(name).not.toMatch(/#/);
    // ...while still restoring the rest of the line, so the undo is real.
    expect(name).toContain("Wacker");
  });

  it("rewrites ONLY the anchored row when several reservations exist", () => {
    const { before, after } = applyAt(1, 3);
    // Kills an overlay branch hardcoded to index 0, which the emitter-level
    // tests cannot see at all.
    expect(after.hotelReservations[0]).toEqual(before.hotelReservations[0]);
    expect(after.hotelReservations[2]).toEqual(before.hotelReservations[2]);
    expect(after.hotelReservations[1]!.hotel_address).toBeNull();
  });
});
