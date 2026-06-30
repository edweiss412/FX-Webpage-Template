import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";
import { newRoom } from "@/lib/parser/blocks/gear";

const consultants = () =>
  parseSheet(readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8"));

describe("lunch-room dedup (H2)", () => {
  it("merges the GEAR lunch room onto the INFO lunch room without losing INFO data", () => {
    const rooms = consultants().rooms;
    const ballroomC = rooms.filter((r) => /\bBALLROOM C\b/i.test(r.name));
    // Exactly one BALLROOM C room (the INFO breakout), not two.
    expect(ballroomC).toHaveLength(1);
    const lunch = ballroomC[0]!;
    expect(lunch.kind).toBe("breakout");
    // GEAR audio merged in...
    expect(lunch.audio).toBeTruthy();
    // ...AND the INFO room's own data survives (the H2 bug is split-room data
    // loss: a gear-only BALLROOM C room would have null times/setup, so these
    // assertions prove the merge landed ON the INFO room, not a gear stub).
    expect(lunch.setup).toBeTruthy();
    expect(lunch.set_time).toBeTruthy();
    expect(lunch.show_time).toBeTruthy();
    expect(lunch.strike_time).toBeTruthy();
    // No separate GRAND BALLROOM C room remains.
    expect(rooms.some((r) => /^GRAND BALLROOM C$/i.test(r.name))).toBe(false);
  });

  it("leaves GS and FOYER rooms intact", () => {
    const rooms = consultants().rooms;
    expect(rooms.some((r) => r.kind === "gs")).toBe(true);
    expect(rooms.some((r) => /^FOYER$/i.test(r.name))).toBe(true);
  });
});

// Direct newRoom coverage — proves the GRAND strip is scoped to ^LUNCH only.
describe("gear newRoom — GRAND strip is lunch-scoped (H2 collision safety)", () => {
  it("strips leading GRAND from a LUNCH room and sets kind=breakout", () => {
    expect(newRoom("LUNCH SESSION - GRAND BALLROOM C")).toMatchObject({
      kind: "breakout",
      name: "BALLROOM C",
    });
  });
  it("does NOT strip GRAND from a non-lunch additional room (no global strip)", () => {
    expect(newRoom("ADDITIONAL ROOM - GRAND FOYER")).toMatchObject({
      kind: "additional",
      name: "GRAND FOYER",
    });
  });
  it("does NOT strip GRAND from a GS room (a global strip would break GS merge)", () => {
    expect(newRoom("GENERAL SESSION - GRAND BALLROOM A/B")).toMatchObject({
      kind: "gs",
      name: "GRAND BALLROOM A/B",
    });
  });
});

// Integration guard on the real parser path: a global strip would de-merge GS
// (GEAR "GRAND BALLROOM A/B" → "BALLROOM A/B" ≠ INFO GS "GRAND BALLROOM A/B"),
// so the GS room would lose its merged gear.
describe("gear-merge integration — GS gear retained (H2)", () => {
  it("the consultants GS room keeps its merged GEAR audio", () => {
    const gs = consultants().rooms.find((r) => r.kind === "gs");
    expect(gs?.audio).toBeTruthy();
  });
});
