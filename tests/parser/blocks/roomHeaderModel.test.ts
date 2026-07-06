import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import {
  roomHeaderNameShape,
  headerDayMarker,
  isRoomHeaderShape,
  roomBaseName,
  dayRangeOf,
  roomGroupKey,
  hasRoomFieldBlock,
  precededByBoundary,
  isRoomHeader,
  computeRoomHeaderModel,
} from "@/lib/parser/blocks/rooms";

describe("room shape predicates (spec §2.2/§2.3)", () => {
  it("roomHeaderNameShape: proper name yes; dims-leading/field-label/day-only no", () => {
    expect(roomHeaderNameShape("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(roomHeaderNameShape("LAUDERDALE 1, 2, 3 DAY 1 & 2")).toBe(true); // commas (R21)
    expect(roomHeaderNameShape("Hotel Ballroom DAY 1 & 2")).toBe(true); // compound (R33)
    expect(roomHeaderNameShape("4' X 8' RISER")).toBe(false); // dims-leading
    expect(roomHeaderNameShape("HOTEL DAY 1 & 2")).toBe(false); // exact section token (R33)
    expect(roomHeaderNameShape("FOYER DAY 1 & 2")).toBe(false); // FOYER token via base (R32)
    expect(roomHeaderNameShape("Grand Foyer DAY 1 & 2")).toBe(true); // compound ≠ FOYER
    expect(roomHeaderNameShape("BO Setup")).toBe(false); // field label (item 3)
    expect(roomHeaderNameShape("DAY 1")).toBe(false); // empty base (R36)
    expect(roomHeaderNameShape("DAYS 1 & 2")).toBe(false);
  });
  it("headerDayMarker: trailing-last-content only", () => {
    expect(headerDayMarker("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(headerDayMarker("LAUDERDALE 1, 2, 3 DAY 1 & 2")).toBe(true);
    expect(headerDayMarker("MERIDIAN&#10;DAY 1 & 2&#10;60' x 45'")).toBe(true); // dims after DAY ok
    expect(headerDayMarker("SPECIAL DAY 1 NOTES")).toBe(false); // word after number (R26)
    expect(headerDayMarker("SPECIAL DAY 1&#10;NOTES")).toBe(false); // prose line after (R35)
    expect(headerDayMarker("FOH POSITION&#10;Downstage")).toBe(false);
  });
  it("isRoomHeaderShape composes both", () => {
    expect(isRoomHeaderShape("MABEL 1&#10;DAY 1 & 2")).toBe(true);
    expect(isRoomHeaderShape("PROJECTION SCREEN&#10;5' x 9'")).toBe(false);
  });
  it("roomBaseName strips trailing inline DAY, uppercases", () => {
    expect(roomBaseName("SALON ABCD DAY 1 & 2")).toBe("SALON ABCD");
    expect(roomBaseName("MABEL 1")).toBe("MABEL 1");
    expect(roomBaseName("DAY 1")).toBe("");
  });
  it("dayRangeOf normalizes the trailing range from any line", () => {
    expect(dayRangeOf("MABEL 1&#10;DAY 1 & 2")).toBe("1&2");
    expect(dayRangeOf("SALON ABCD DAY 1")).toBe("1");
  });
  it("roomGroupKey merges same name+day, splits distinct days", () => {
    const k = (c: string) => roomGroupKey(c, c.replace(/&#10;/g, "\n").split("\n")[0]!.trim());
    expect(k("SALON ABCD DAY 1 & 2")).toBe(k("SALON ABCD&#10;DAY 1 & 2")); // R27 merge
    expect(k("SALON ABCD DAY 1")).not.toBe(k("SALON ABCD DAY 2")); // R34 split
  });
});

const T = (s: string[]) => s;
describe("room block-context predicates (spec §2.2 c2 — R37/R38)", () => {
  const room = T([
    "| MABEL 1&#10;DAY 1 & 2 |",
    "| :---: | :---: |",
    "| BO Setup | TBD |",
    "| BO Audio | NONE |",
  ]);
  it("hasRoomFieldBlock true when a BO field row is immediately beneath (skipping separator)", () => {
    expect(hasRoomFieldBlock(room, 0)).toBe(true);
  });
  it("hasRoomFieldBlock false for an agenda note (schedule rows beneath)", () => {
    expect(
      hasRoomFieldBlock(T(["| WELCOME RECEPTION DAY 1 |", "| 6:00 PM | Cocktails |"]), 0),
    ).toBe(false);
  });
  it("precededByBoundary: blank/separator/all-empty row above, or i===0", () => {
    expect(precededByBoundary(T(["", "| MABEL 1&#10;DAY 1 & 2 |"]), 1)).toBe(true); // blank
    expect(precededByBoundary(T(["| | | |", "| LAUDERDALE 1, 2, 3 DAY 1 & 2 |"]), 1)).toBe(true); // all-empty
    expect(precededByBoundary(T(["| BO Setup | TBD |", "| WELCOME RECEPTION DAY 1 |"]), 1)).toBe(
      false,
    ); // field row above
  });
  it("isRoomHeader: interleaved note fails boundary even with a BO row beneath (R38)", () => {
    const inter = T([
      "| MABEL 1&#10;DAY 1 & 2 |",
      "| :---: | :---: |",
      "| BO Setup | TBD |",
      "| WELCOME RECEPTION DAY 1 |",
      "| BO Audio | L-Acoustics |",
    ]);
    expect(isRoomHeader(inter, 0)).toBe(true); // MABEL is a room
    expect(isRoomHeader(inter, 3)).toBe(false); // the note is NOT
  });
});

describe("computeRoomHeaderModel + corpus no-op (spec §2.4/§8)", () => {
  const eastCoast = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  it("admits exactly MABEL 1 and LAUDERDALE from the east-coast fixture", () => {
    const m = computeRoomHeaderModel(eastCoast);
    const names = [...m.groups.values()]
      .flat()
      .map((c) => c.displayName)
      .sort();
    expect(names).toEqual(["LAUDERDALE 1, 2, 3 DAY 1 & 2", "MABEL 1"]);
  });
  it("east-coast rooms parse byte-identically (both emitted with BO Setup)", () => {
    const rooms = parseSheet(eastCoast).rooms;
    const mabel = rooms.find((r) => r.name === "MABEL 1");
    const laud = rooms.find((r) => r.name === "LAUDERDALE 1, 2, 3 DAY 1 & 2");
    expect(mabel?.setup).toBe("TBD");
    expect(laud?.setup).toBe("TBD");
  });
});

describe("isRoomHeader exhaustive truth-table (spec §8 — R30–R38 structural closure)", () => {
  const cases: Array<[string, string[], string, boolean]> = [
    // [col0, rowsBelow, rowAbove, expected]
    ["MABEL 1&#10;DAY 1 & 2", ["| :---: |", "| BO Setup | TBD |"], "", true],
    ["LAUDERDALE 1, 2, 3 DAY 1 & 2", ["| BO Setup | TBD |"], "| | |", true],
    ["WELCOME RECEPTION DAY 1", ["| 6:00 PM | X |"], "", false], // agenda note, no field
    ["WELCOME RECEPTION DAY 1", ["| BO Audio | L |"], "| BO Setup | TBD |", false], // interleaved (R38)
    ["WELCOME RECEPTION DAY 1", ["| BO Setup | 5PM |"], "", true], // titled table w/ BO
    ["SPECIAL DAY 1 NOTES", ["| BO Setup | TBD |"], "", false], // DAY-note (R26)
    ["DAY 1", ["| BO Setup | TBD |"], "", false], // empty base (R36)
    ["4' X 8' RISER", ["| BO Setup | TBD |"], "", false], // dims, no DAY (R30)
    ["HOTEL DAY 1 & 2", ["| BO Setup | TBD |"], "", false], // exact token (R33)
    ["Hotel Ballroom DAY 1 & 2", ["| BO Setup | TBD |"], "", true], // compound (R33)
  ];
  it.each(cases)("%s → %s", (col0, below, above, expected) => {
    const lines = [above || "", `| ${col0} |`, ...below];
    const i = 1;
    expect(isRoomHeader(lines, i)).toBe(expected);
  });
});

// CORPUS NO-OP MECHANISM (documented per Task A4): deep-equal against an explicit
// origin/main baseline (tests/parser/blocks/__baselines__/origin-main-rooms.json),
// captured by running `parseSheet(...).rooms` on every committed fixture in BOTH
// renderer families (fixtures/shows/raw + fixtures/shows/exporter-xlsx) at the
// origin/main tree BEFORE the Task A3 source change. De-literalization MUST be
// byte-identical to that baseline — a fabricated/dropped/mis-extracted room on ANY
// fixture fails. (Deep-equal, NOT toMatchSnapshot — the baseline is the origin/main
// contract, not whatever the branch happens to emit.)
describe("corpus-wide rooms no-op (spec §2.4 — the primary structural defense)", () => {
  const baseline = JSON.parse(
    readFileSync("tests/parser/blocks/__baselines__/origin-main-rooms.json", "utf8"),
  ) as Record<string, unknown[]>;
  it.each(Object.keys(baseline))("%s rooms unchanged (no fabricated/dropped room)", (path) => {
    const rooms = parseSheet(readFileSync(path, "utf8")).rooms;
    // No bogus room: every emitted room name is a real header (non-empty).
    for (const r of rooms) expect(r.name.trim().length).toBeGreaterThan(0);
    expect(rooms).toEqual(baseline[path]);
  });
});
