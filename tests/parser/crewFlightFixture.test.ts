// tests/parser/crewFlightFixture.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";

describe("crew flight_info parse premise (TECH ARRIVAL/DEPARTURE path)", () => {
  it("east-coast.md → all 3 crew have non-null flight_info as 'arrival | departure'", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const { crewMembers } = parseSheet(md, "east-coast.md");

    expect(crewMembers).toHaveLength(3);
    // Every crew member has a flight (the premise the projection rides).
    expect(crewMembers.every((m) => m.flight_info != null)).toBe(true);

    const doug = crewMembers.find((m) => (m.name ?? "").includes("Doug"));
    expect(doug?.flight_info).toBeTruthy();
    // The TECH path joins arrival + departure with " | "; both legs survive.
    expect(doug?.flight_info).toContain(" | ");
    expect(doug?.flight_info).toContain("EWR-FLL"); // arrival leg (route)
    expect(doug?.flight_info).toContain("FLL-EWR"); // departure leg (route)
  });
});
