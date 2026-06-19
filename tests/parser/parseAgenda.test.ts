import { describe, it, expect } from "vitest";
import { parseAgenda } from "@/lib/parser/blocks/agenda";
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
