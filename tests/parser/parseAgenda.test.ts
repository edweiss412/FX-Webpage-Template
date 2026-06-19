import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { ShowRow } from "@/lib/parser/types";
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

const datesOf = (showDays: string[]): ShowRow["dates"] => ({
  travelIn: null, set: null, showDays, travelOut: null, loadIn: null,
});

describe("parseAgenda — step 3: ISO resolution + ambiguity guard", () => {
  const hdr = "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |";
  const mk = (dateRow: string, nameRow: string, dataRow: string) =>
    [
      "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 |",
      dateRow, nameRow, hdr, dataRow,
    ].join("\n");

  it("resolves from the banner date (M/D/YY → ISO)", () => {
    const md = mk(
      "| 9/3/25 | 9/3/25 | 9/3/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Wed | Wed | Wed | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(Object.keys(r.runOfShow ?? {})).toContain("2025-09-05");
  });

  it("#REF! banner + day-name matching EXACTLY ONE showDay → resolves via fallback", () => {
    const md = mk(
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // only one Friday
    expect(Object.keys(r.runOfShow ?? {})).toEqual(["2025-09-05"]);
  });

  it("#REF! banner + day-name matching TWO same-weekday showDays → SKIP + AGENDA_DAY_AMBIGUOUS (never guess)", () => {
    const md = mk(
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-03", "2025-09-10"])); // two Wednesdays
    expect(r.runOfShow).toEqual({});
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_DAY_AMBIGUOUS");
  });

  it("#REF! banner + NO day-name match → SKIP + AGENDA_BLOCK_UNRESOLVED", () => {
    const md = mk(
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Monday | Monday | Monday | Monday | Monday | Monday | Monday | Monday | Monday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // a Friday, no Monday
    expect(r.runOfShow).toEqual({});
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_BLOCK_UNRESOLVED");
  });
});

describe("parseAgenda — steps 4-5: data walk + TITLE-real gate (real fixtures, clone-and-read)", () => {
  it("East Coast Day 1 entries match the fixture rows IN ORDER (derived, not hardcoded)", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const r = parseAgenda(md, datesOf(["2024-05-15", "2024-05-16"]));
    const day1 = r.runOfShow?.["2024-05-15"];
    expect(day1).toBeDefined();
    // Derive the expected FIRST entry by re-reading the grid the same way a human would:
    // the token-header row's first show-day START is col 6; first data row's col 6..11.
    // We assert the parser reproduced the fixture's first session verbatim.
    expect(day1![0]).toEqual({
      start: "7:15 AM", finish: "7:30 AM", trt: "0:15",
      title: "Family Office Only Breakfast", av: "NONE",
      // no `room` — the fixture cell is blank
    });
    // titles appear in sheet order
    const titles = day1!.map((e) => e.title);
    expect(titles.slice(0, 3)).toEqual([
      "Family Office Only Breakfast",
      "Welcome and Introductory Remarks",
      "Opening Keynote",
    ]);
    // times are DISPLAY STRINGS, never Date
    for (const e of day1!) {
      expect(typeof e.start).toBe("string");
      expect(e.start).not.toMatch(/GMT|T\d\d:\d\d/); // not a Date.toString()
    }
    // crew/TRAVEL/SET never bleed in: no entry title is a crew NAME or a travel cell
    expect(titles).not.toContain("NAME");
    expect(titles).not.toContain("ARRIVAL");
  });

  it("RIA fixture (the OTHER real filled production shape) → keys both show days; Day-1 first session derived from the fixture", () => {
    // Spec §6 test 1 requires positive extraction on BOTH filled current-converter fixtures.
    // RIA banner (ria.md:316-318): TRAVEL 6/23, SET 6/24, DAY1 6/25/25 (Wed), DAY2 6/26/25 (Thu).
    const md = readFileSync("fixtures/shows/exporter-xlsx/ria.md", "utf8");
    const r = parseAgenda(md, datesOf(["2025-06-25", "2025-06-26"]));
    // keys both show days (reconciled from the DATE + day-name rows), NOT the travel/set dates
    expect(Object.keys(r.runOfShow ?? {}).sort()).toEqual(["2025-06-25", "2025-06-26"]);
    const day1 = r.runOfShow?.["2025-06-25"];
    expect(day1?.length).toBeGreaterThan(0);
    // first Day-1 entry — clone-and-read from ria.md:320 (NOT hardcoded blind): the DAY-1
    // block START is col 6, so col 6..11 = start/finish/trt/title/room/av.
    expect(day1![0]).toEqual({
      start: "7:30 AM", finish: "8:30 AM", trt: "1:00",
      title: "Attendee Registration and Breakfast", room: "Foyer",
      // av blank in this row
    });
    // times stay display strings, no Date coercion
    expect(day1!.every((e) => typeof e.start === "string")).toBe(true);
    // the SET-DAY title column (idx 4) must never bleed in as a session
    expect(day1!.map((e) => e.title)).not.toContain("TITLE");
  });

  it("right-pads short rows; a row with only START+TITLE yields a title row (no finish/room/av)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:00 AM |  |  | Title Only Session |", // short row — trailing trimmed
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow!["2025-09-05"]).toEqual([{ start: "8:00 AM", title: "Title Only Session" }]);
  });

  it("sentinel TITLE (TBD/N/A/blank) → NO entry; all-sentinel day → [] (not confirmed)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:00 AM | 9:00 AM | 1:00 | TBD | Hall | LAV |",
      "|  |  |  | 9:00 AM | 9:30 AM | 0:30 |  | Hall | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow!["2025-09-05"]).toEqual([]); // resolved-but-empty (CONFIRMED-ONLY → not stored later)
  });
});

describe("parseAgenda — R7/R8/R13: structural banner rows (incl. all-#REF! and ESCAPED \\#REF\\!) never become entries", () => {
  // The bug this catches: the walk used rows.slice(headerIdx+1). When the converter
  // promotes the TOKEN-HEADER to the md-table header row, the DATE / day-name / day-TYPE
  // banners follow it as BODY rows — a positional slice reads them at absolute columns and
  // emits "5/15/24" / "Wednesday" / "DAY 1" as bogus AgendaEntry titles. The structural-skip
  // (skip DATE/day-name/day-TYPE/token-header rows BY IDENTITY) must exclude them.

  it("token-header FIRST, then DATE + day-name + day-TYPE as body rows → those banners emit NO entry", () => {
    // Markdown order: token-header (md-header), DATE, day-name, day-TYPE, then real data.
    // After parseTableRows (separator dropped): rows = [token-hdr, DATE, day-name, day-TYPE, data].
    // headerIdx=0; the OLD slice(1) would emit DATE/day-name/day-TYPE rows as titles.
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 5/13/24 | 5/13/24 | 5/13/24 | 5/14/24 | 5/14/24 | 5/14/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 |",
      "| Monday | Monday | Monday | Tuesday | Tuesday | Tuesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday |",
      "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | SET DAY | SET DAY | SET DAY | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 |",
      "|  |  |  |  |  |  | 8:30 AM | 9:30 AM | 1:00 | Opening Keynote | Mabel 1 | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2024-05-15"]));
    const day = r.runOfShow?.["2024-05-15"] ?? [];
    const titles = day.map((e) => e.title);
    // ONLY the real session — no banner cell leaked as a title.
    expect(titles).toEqual(["Opening Keynote"]);
    expect(titles).not.toContain("5/15/24");
    expect(titles).not.toContain("Wednesday");
    expect(titles).not.toContain("DAY 1");
  });

  it("real East Coast (day-TYPE-header promotion) still parses correctly — banners above header", () => {
    // East Coast promotes the day-TYPE row to md-header; DATE/day-name/token-header are body
    // rows ABOVE the data. Confirms the structural-skip handles BOTH promotion shapes.
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const titles = (parseAgenda(md, datesOf(["2024-05-15", "2024-05-16"])).runOfShow?.["2024-05-15"] ?? [])
      .map((e) => e.title);
    expect(titles).toContain("Family Office Only Breakfast");
    expect(titles).not.toContain("5/15/24");
    expect(titles).not.toContain("DAY 1");
    expect(titles).not.toContain("Wednesday");
  });

  it("empty fixture (day-TYPE-header promotion, blank TITLEs) → all-[] keys, no banner-as-entry", () => {
    // The OTHER promotion shape with empty titles: still must not emit DATE/day-name banners.
    // Assert with inline patterns (the parser's WEEKDAYS/DAY_TYPE_RE are module-internal).
    const md = readFileSync("fixtures/shows/exporter-xlsx/rpas.md", "utf8");
    const r = parseAgenda(md, datesOf([
      "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27",
    ]));
    const WEEKDAY_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
    const DAYTYPE_RE = /^(travel day|set day|day\s+\d+)$/i;
    const MDY_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    for (const day of Object.values(r.runOfShow ?? {})) {
      for (const e of day) {
        expect(MDY_RE.test(e.title.trim())).toBe(false);     // no M/D/YY banner as title
        expect(WEEKDAY_RE.test(e.title.trim())).toBe(false); // no weekday banner as title
        expect(DAYTYPE_RE.test(e.title.trim())).toBe(false); // no TRAVEL DAY/DAY N as title
      }
    }
  });

  it("R8: an all-#REF! DATE banner emits ZERO entries from the banner AND still creates a block (warning, not silent drop)", () => {
    // The R8 bug: a value-only isDateRow missed an all-#REF! banner → (a) NO block created
    // → resolveBlock never ran → NO warning (silent drop); (b) the #REF! row walked as data
    // → "#REF!" emitted as a title. Both must be closed: block exists, warning fires, no #REF! title.
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // unique Friday → resolves
    const titles = (r.runOfShow?.["2025-09-05"] ?? []).map((e) => e.title);
    expect(titles).toContain("Keynote");          // real session parsed
    expect(titles).not.toContain("#REF!");         // banner NOT walked as data
    expect(titles.some((t) => /#REF/i.test(t))).toBe(false);
  });

  it("R8: all-#REF! DATE banner with NO resolvable day-name → block created → AGENDA_BLOCK_UNRESOLVED (NOT a silent no-op)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |", // day-name also #REF!
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow).toEqual({});  // unresolved → absent (not stored → anchors)
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_BLOCK_UNRESOLVED"); // warning DID emit
  });

  it("R13 REAL FIXTURE: consultants.md ESCAPED \\#REF\\! DATE/day-name banners are structural — no banner cell becomes a title", () => {
    // consultants.md:235-238 — day-TYPE header, DATE banner `\#REF\! | … | 10/8/25 …`,
    // day-name banner `\#REF\! | … | Wednesday …`, token-header `NAME|ARRIVAL|FLIGHT\#|…`.
    // Without clean() normalization the escaped banners stay in dataRows → 10/8/25 / weekday
    // cells emit as bogus titles. After clean() they are structural-skipped.
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    // consultants is an EMPTY-agenda fixture (blank TITLE cells) → all-[] days, no entries.
    const r = parseAgenda(md, datesOf(["2025-10-08", "2025-10-09", "2025-10-10"]));
    const MDY_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    const WEEKDAY_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
    for (const day of Object.values(r.runOfShow ?? {})) {
      for (const e of day) {
        expect(MDY_RE.test(e.title.trim())).toBe(false);     // no 10/8/25 banner as a title
        expect(WEEKDAY_RE.test(e.title.trim())).toBe(false); // no Wednesday banner as a title
        expect(/#?REF!?/i.test(e.title)).toBe(false);        // no (escaped) #REF! as a title
      }
    }
  });

  it("R13 SYNTHETIC: escaped \\#REF\\! DATE cells are detected as the date-banner (cleaned) → block + warning, no escaped-REF title", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT\\# | START  | FINISH | TRT | TITLE | ROOM | AV |", // escaped FLIGHT\#
      "| \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! |",
      "| Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // unique Friday → resolves via day-name
    const titles = (r.runOfShow?.["2025-09-05"] ?? []).map((e) => e.title);
    expect(titles).toContain("Keynote");                 // real session parsed
    expect(titles.some((t) => /#?REF!?/i.test(t))).toBe(false); // escaped banner NOT a title
  });
});

describe("parseAgenda — LOAD-BEARING: post-AGENDA tables never leak as run-of-show entries", () => {
  // The bug this catches: parseTableRows flattens the WHOLE doc; without isolating the
  // AGENDA table's contiguous block, the absolute-column walk reads PULL SHEET / ROOM
  // DIMENSIONS rows (which follow after a blank line) at the TITLE column (idx 9/15/21)
  // and emits them as bogus AgendaEntry titles → persisted → shown to crew.

  it("dedicated fixture: a PULL SHEET row with a value at the DAY-1 TITLE column (idx 9) does NOT become an entry", () => {
    const md = readFileSync(
      "fixtures/shows/parser-units/agenda-followed-by-pullsheet.md",
      "utf8",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    const titles = (r.runOfShow?.["2025-09-05"] ?? []).map((e) => e.title);
    // Exactly the agenda rows — derive the count by reading the fixture's agenda block,
    // NOT the doc. The PULL SHEET sentinel title must be absent.
    expect(titles).toContain("Real Agenda Session");
    expect(titles).not.toContain("LEAKED_FROM_PULLSHEET");
    expect(titles.every((t) => !t.startsWith("LEAKED"))).toBe(true);
  });

  it("real East Coast fixture: Day-1 titles are exactly the agenda block's sessions — no PULL SHEET / ROOM bleed", () => {
    // East Coast's AGENDA ends at "Loop video", then a blank line, then ROOM DIMENSIONS
    // + a large PULL SHEET (equipment rows with FALSE/counts/"FOH Rack"/etc.). Assert NONE
    // of those equipment strings appear as a Day-1 title. (Clone-and-read: titles derived
    // from the agenda block; the equipment strings are read from the PULL SHEET region.)
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const r = parseAgenda(md, datesOf(["2024-05-15", "2024-05-16"]));
    const day1 = (r.runOfShow?.["2024-05-15"] ?? []).map((e) => e.title);
    // Pull-sheet equipment tokens that live below the AGENDA block must never be titles.
    for (const leak of ["FOH Rack", "Batteries", "Allen & Heath QU32 Mixer", "FALSE", "TOTAL COUNT CORP & INS SALON 1"]) {
      expect(day1).not.toContain(leak);
    }
    // and the real last agenda session is present (the block's actual tail, not a pull-sheet row)
    expect(day1).toContain("Family Office Perspectives:");
  });
});

describe("parseAgenda — robustness (stale raw/ fixtures + empty skeletons, fail-soft only)", () => {
  const datesAny = datesOf([
    "2025-03-26", "2025-03-27", "2025-04-15", "2025-04-16",
    "2025-10-14", "2025-10-15", "2025-09-05",
  ]);

  it.each([
    "fixtures/shows/raw/2025-03-dci-rpas-central.md",
    "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
    "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  ])("stale/variant %s parses fail-soft (Record or undefined, never throws, no EVENT/DAY garbage)", (path) => {
    const md = readFileSync(path, "utf8");
    let r!: ReturnType<typeof parseAgenda>;
    expect(() => { r = parseAgenda(md, datesAny); }).not.toThrow();
    expect(r.runOfShow === undefined || typeof r.runOfShow === "object").toBe(true);
    // never mis-parse a normalized EVENT/DAY side-table as a session title
    for (const day of Object.values(r.runOfShow ?? {})) {
      for (const e of day) {
        expect(e.title.toUpperCase()).not.toBe("EVENT");
        expect(e.title.toUpperCase()).not.toBe("DAY");
      }
    }
  });

  it("empty production skeleton (auto-times, blank TITLEs) → all-[] Record, no invented entries", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/rpas.md", "utf8");
    const r = parseAgenda(md, datesAny);
    // located grid → object (not undefined); every present day is [] (no real titles)
    if (r.runOfShow) for (const day of Object.values(r.runOfShow)) expect(day).toEqual([]);
  });
});

describe("parseAgenda — step 6: storage caps + AGENDA_DAY_TRUNCATED", () => {
  const dayHeader = "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |";
  const dateRow = "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |";
  const nameRow = "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |";

  it("title>300 truncates to 300; room/av>120 to 120; time>40 to 40", () => {
    const longTitle = "T".repeat(10_000), longRoom = "R".repeat(500), longTime = "8".repeat(100);
    const md = [dayHeader, dateRow, nameRow,
      `|  |  |  | ${longTime} | 9:00 AM | 1:00 | ${longTitle} | ${longRoom} | ${longRoom} |`,
    ].join("\n");
    const e = parseAgenda(md, datesOf(["2025-09-05"])).runOfShow!["2025-09-05"]![0]!;
    expect(e.title.length).toBe(300);
    expect(e.room!.length).toBe(120);
    expect(e.av!.length).toBe(120);
    expect(e.start.length).toBe(40);
  });

  it(">200 filled rows in one day → capped at 200 + AGENDA_DAY_TRUNCATED (NOT 20)", () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      `|  |  |  | 8:00 AM | 9:00 AM | 1:00 | Session ${i} | Hall | LAV |`);
    const md = [dayHeader, dateRow, nameRow, ...rows].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow!["2025-09-05"]!.length).toBe(200);
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_DAY_TRUNCATED");
  });

  it("a day exceeding 32KB serialized → tail entries dropped to ≤32KB + AGENDA_DAY_TRUNCATED", () => {
    // ~250 chars of title each * 200 entries ≈ 50KB > 32KB
    const rows = Array.from({ length: 200 }, (_, i) =>
      `|  |  |  | 8:00 AM | 9:00 AM | 1:00 | ${"X".repeat(250)} ${i} | Hall | LAV |`);
    const md = [dayHeader, dateRow, nameRow, ...rows].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    const day = r.runOfShow!["2025-09-05"]!;
    expect(Buffer.byteLength(JSON.stringify(day), "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(day.length).toBeLessThan(200);
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_DAY_TRUNCATED");
  });
});
