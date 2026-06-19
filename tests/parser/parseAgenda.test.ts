import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseAgenda, locateAgendaShowBlocks } from "@/lib/parser/blocks/agenda";
import {
  agendaGridMalformed, agendaBlockUnresolved, agendaDayAmbiguous,
  agendaDayTruncated, agendaDayEmptied,
} from "@/lib/parser/blocks/agendaWarnings";

describe("parseAgenda — step 1: grid location (fail-soft)", () => {
  it("no token-header anywhere → undefined + AGENDA_GRID_MALFORMED (never throws)", () => {
    const md = "| FOO | BAR |\n| :-: | :-: |\n| a | b |\n";
    const r = parseAgenda(md);
    expect(r.runOfShow).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_GRID_MALFORMED");
    expect(r.warnings[0]!.severity).toBe("warn");
    expect(r.warnings[0]!.blockRef).toEqual({ kind: "agenda", index: 0 });
  });

  it("empty markdown → undefined + AGENDA_GRID_MALFORMED (no throw)", () => {
    expect(() => parseAgenda("")).not.toThrow();
    expect(parseAgenda("").runOfShow).toBeUndefined();
  });

  it("locates a plain token-header table (returns a Record, not undefined)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/3/25 | 9/3/25 | 9/3/25 | 9/4/25 | 9/4/25 | 9/4/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Wed | Wed | Wed | Thu | Thu | Thu | Fri | Fri | Fri | Fri | Fri | Fri |",
    ].join("\n");
    // grid located → not undefined (day resolution is later tasks; here just "located")
    expect(parseAgenda(md).runOfShow).not.toBeUndefined();
  });

  it("locates a prefix-form token-header (#REF!/NAME, Wednesday/START) after prefix-strip", () => {
    const md = "| #REF!/NAME | Tuesday/ARRIVAL | Tuesday/FLIGHT# | Wednesday/START | Wednesday/FINISH | Wednesday/TRT |";
    expect(parseAgenda(md).runOfShow).not.toBeUndefined();
  });

  it("a following table (after a blank line) is OUTSIDE the located AGENDA block — grid still located, no crash", () => {
    // Location-only smoke: a PULL SHEET table after a blank line must not change WHERE
    // the grid is located. The no-bleed-into-entries assertion is the Task 1.6 regression
    // test (it needs the data walk). Here we only confirm isolation does not throw / lose the grid.
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:00 AM | 9:00 AM | 1:00 | Real Session | Hall | LAV |",
      "", // blank line ends the AGENDA table (exporter block separator)
      "| PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET |",
      "| FALSE | 1 | FOH Rack | FOH |",
    ].join("\n");
    expect(() => parseAgenda(md)).not.toThrow();
    expect(parseAgenda(md).runOfShow).not.toBeUndefined();
  });
});

describe("parseAgenda — step 2: locateAgendaShowBlocks (boundaries + show-day classification)", () => {
  const synthetic = [
    "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | SET DAY | SET DAY | SET DAY | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 |",
    "| 5/13/24 | 5/13/24 | 5/13/24 | 5/14/24 | 5/14/24 | 5/14/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 |",
    "| Monday | Monday | Monday | Tuesday | Tuesday | Tuesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday |",
    "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START  | FINISH | TRT | TITLE | ROOM | AV |",
    "|  |  |  |  |  |  | 7:15 AM | 7:30 AM | 0:15 | Opening Keynote | Mabel 1 | LAV |",
  ].join("\n");

  it("returns EXACTLY one show-day block at startCol 6; TRAVEL(0)/SET(3) are filtered out", () => {
    const blocks = locateAgendaShowBlocks(synthetic);
    expect(blocks.map((b) => b.startCol)).toEqual([6]); // NOT [0,3,6] — travel/set excluded
    expect(blocks[0]!.dateCell).toBe("5/15/24");
    expect(blocks[0]!.dayName).toBe("Wednesday");
  });

  it("East Coast fixture: show-day blocks start at cols 6 and 12 (DAY 1, DAY 2); 5 banner dates → 2 show blocks", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const blocks = locateAgendaShowBlocks(md);
    // 5 dated banner columns (TRAVEL 5/13, SET 5/14, DAY1 5/15, DAY2 5/16, TRAVEL 5/17)
    // → exactly the two DAY blocks survive classification, at the absolute START columns.
    expect(blocks.map((b) => b.startCol)).toEqual([6, 12]);
    expect(blocks.map((b) => b.dateCell)).toEqual(["5/15/24", "5/16/24"]);
  });

  it("a grid with NO show-day span (only TRAVEL/SET) → empty block list (no false show day)", () => {
    const md = [
      "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | SET DAY | SET DAY | SET DAY |",
      "| 5/13/24 | 5/13/24 | 5/13/24 | 5/14/24 | 5/14/24 | 5/14/24 |",
      "| Monday | Monday | Monday | Tuesday | Tuesday | Tuesday |",
      "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM |",
    ].join("\n");
    expect(locateAgendaShowBlocks(md)).toEqual([]);
  });

  it("R14: the EXPORTED helper applies cleanRows — escaped \\#REF\\! banner + FLIGHT\\# token-header still locate blocks; escaped banner is not a block row", () => {
    // The exported testable path must clean EXACTLY like parseAgenda — else escaped
    // fixture cells stay invisible to the post-clean detectors on the helper path.
    const md = [
      "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 |",
      "| \\#REF\\! | \\#REF\\! | \\#REF\\! | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 |",
      "| Monday | Monday | Monday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday |",
      "| NAME | ARRIVAL | FLIGHT\\# | TIME | TITLE | ROOM | START  | FINISH | TRT |",
      "|  |  |  |  |  |  | 7:15 AM | 7:30 AM | 0:15 |",
    ].join("\n");
    const blocks = locateAgendaShowBlocks(md);
    // (a) token-header located post-clean (FLIGHT\# → FLIGHT#) → the DAY-1 block exists at START col 6
    expect(blocks.map((b) => b.startCol)).toEqual([6]);
    // (b) the cleaned date-banner cell at the block start is read as the real date (not "\#REF\!")
    expect(blocks[0]!.dateCell).toBe("5/15/24");
    // (c) no block carries an escaped-REF dateCell (the escaped banner cells are travel cols, no START → no block)
    expect(blocks.every((b) => !/#?REF!?/i.test(b.dateCell ?? ""))).toBe(true);
  });
});

describe("agendaWarnings — all 5 AGENDA_* codes are lib/parser code: literals", () => {
  it("each factory carries its code + warn severity + agenda blockRef", () => {
    expect(agendaGridMalformed(0).code).toBe("AGENDA_GRID_MALFORMED");
    expect(agendaBlockUnresolved(1).code).toBe("AGENDA_BLOCK_UNRESOLVED");
    expect(agendaDayAmbiguous(2).code).toBe("AGENDA_DAY_AMBIGUOUS");
    expect(agendaDayTruncated(3).code).toBe("AGENDA_DAY_TRUNCATED");
    expect(agendaDayEmptied(4, "2025-09-05").code).toBe("AGENDA_DAY_EMPTIED");
    for (const w of [
      agendaGridMalformed(0), agendaBlockUnresolved(1), agendaDayAmbiguous(2),
      agendaDayTruncated(3), agendaDayEmptied(4, "2025-09-05"),
    ]) {
      expect(w.severity).toBe("warn");
      expect(w.blockRef!.kind).toBe("agenda");
    }
  });
});
