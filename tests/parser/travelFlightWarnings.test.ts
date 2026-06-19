import { describe, it, expect } from "vitest";
import {
  travelFlightNameUnmatched, travelFlightUnparseable, travelFlightAmbiguousTable,
} from "@/lib/parser/blocks/travelFlightWarnings";

describe("travelFlight warning factories", () => {
  it("nameUnmatched → warn, code, blockRef travel, rawSnippet=name, message names the crew", () => {
    const w = travelFlightNameUnmatched("John Carleo");
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("TRAVEL_FLIGHT_NAME_UNMATCHED");
    expect(w.blockRef).toEqual({ kind: "travel", index: 0 });
    expect(w.rawSnippet).toBe("John Carleo");
    expect(w.message).toContain("John Carleo");
  });
  it("unparseable → warn, code, rawSnippet=raw cell, message names the crew", () => {
    const w = travelFlightUnparseable("John Carleo", "Mar 22 note");
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("TRAVEL_FLIGHT_UNPARSEABLE");
    expect(w.rawSnippet).toBe("Mar 22 note");
    expect(w.message).toContain("John Carleo");
  });
  it("ambiguousTable → warn, code, blockRef travel (table-level)", () => {
    const w = travelFlightAmbiguousTable();
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("TRAVEL_FLIGHT_AMBIGUOUS_TABLE");
    expect(w.blockRef).toEqual({ kind: "travel", index: 0 });
  });
});
