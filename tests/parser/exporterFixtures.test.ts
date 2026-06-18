/**
 * Regression suite against the PRODUCTION-exporter markdown fixtures
 * (fixtures/shows/exporter-xlsx/ — real Drive-XLSX -> synthesizeMarkdownFromXlsx
 * output for the 7 live test shows). These pin the fixes for the end-to-end
 * parser-fidelity defects found by the 2026-06-18 grounding audit. Unlike the
 * fixtures/shows/raw/ corpus (Drive-MCP markdown), these are what production
 * actually feeds parseSheet.
 *
 * See docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/sheet-data-grounding-audit-2026-06-18.md
 * and DEFERRED.md AUDIT-2026-06-18-PARSE-FIDELITY.
 */
import { parseSheet } from "@/lib/parser";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { parseRooms } from "@/lib/parser/blocks/rooms";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const DIR = "fixtures/shows/exporter-xlsx";
const parse = (slug: string) => parseSheet(readFileSync(`${DIR}/${slug}.md`, "utf8"), `${slug}.md`);

describe("exporter fidelity — agenda_links label (East Coast bare 'AGENDA')", () => {
  it("captures East Coast's agenda link even though the label is 'AGENDA' not 'AGENDA LINK'", () => {
    // East Coast INFO row: `| AGENDA | https://drive.google.com/file/d/1N0.../view |`
    // parseAgendaLinks previously required the literal label "AGENDA LINK" -> dropped this.
    const r = parse("east-coast");
    expect(r.show.agenda_links.length).toBeGreaterThanOrEqual(1);
    expect(r.show.agenda_links[0]!.fileId).toBe("1N0SNyciz0isLC_a-ivZhEow1-12mm0w0");
  });

  it("still captures the standard 'AGENDA LINK' shows (no regression)", () => {
    expect(parse("fintech").show.agenda_links[0]!.fileId).toBe(
      "1Lfncqubzk9x6gQH5Z7Sz_EQRJ_8BWtPF",
    );
    // Redefining carries two 'AGENDA LINK - RFI/PCF' rows (filename-only, no fileId)
    expect(parse("redefining-fi").show.agenda_links.length).toBeGreaterThanOrEqual(2);
  });

  it("does not over-match: no spurious agenda_links on shows without an INFO agenda row pattern", () => {
    // Sanity: every captured link's label starts with AGENDA (no false positives from the AGENDA tab grid)
    for (const slug of ["east-coast", "fintech", "consultants", "ria", "fixed-income", "rpas"]) {
      for (const link of parse(slug).show.agenda_links) {
        expect(link.label.toUpperCase().startsWith("AGENDA")).toBe(true);
      }
    }
  });
});

describe("exporter fidelity — crew block boundary (East Coast phantom DOCUMENTS row)", () => {
  it("does not parse the merged 'DOCUMENTS - …' banner as a 4th crew member", () => {
    // East Coast uses a v1 TECH block (lines 21-24: 3 crew). parseTechBlock lacked
    // termination and scanned to EOF, picking up the merged banner
    // `| DOCUMENTS - Agendas, Diagrams, Presentations | …` as name="DOCUMENTS".
    const r = parse("east-coast");
    const names = r.crewMembers.map((c) => c.name);
    expect(names).not.toContain("DOCUMENTS");
    expect(names).toEqual(["Doug Larson", "Carl Fenton", "Eric Weiss"]);
  });
});

describe("exporter fidelity — event_details populates (v2 DETAILS col-B preserved)", () => {
  it("redefining-fi: DETAILS values are parsed (was {} when the exporter collapsed col B)", () => {
    const ed = parse("redefining-fi").show.event_details;
    expect(ed.stage_size).toBe("8' x 24' x 2'");
    expect(ed.opening_reel).toBe("YES - LOOP VIDEO");
    expect(ed.polling).toBe("YES");
    expect(Object.keys(ed).length).toBeGreaterThanOrEqual(8);
  });

  it("every v2 'DETAILS'-header show now has a non-empty event_details", () => {
    for (const slug of ["redefining-fi", "consultants", "ria", "east-coast"]) {
      expect(
        Object.keys(parse(slug).show.event_details).length,
        `${slug} event_details should not be empty`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("exporter fidelity — East Coast v1 DATES (label in col 0 + trailing qualifiers)", () => {
  it("parses dates despite the 3-col shape and trailing free-text (was all-null)", () => {
    // East Coast DATES: `| Travel | 5/13/24 | - SAME DAY AS SET |`, `| Set | 5/13/24 - AFTER 8PM |`,
    // `| Show | 5/14/24 …&#10;5/15/24 … |`. detectVersion says v2, but the block is v1-shaped
    // with the label in col 0 + a trailing qualifier column.
    const d = parse("east-coast").show.dates;
    expect(d.travelIn).toBe("2024-05-13");
    expect(d.set).toBe("2024-05-13");
    expect(d.showDays).toEqual(["2024-05-14", "2024-05-15"]);
    expect(d.travelOut).toBe("2024-05-15");
  });
});

describe("exporter fidelity — stale 'OLD PULL SHEET' tab skipped", () => {
  it("redefining-fi no longer ingests the prior show's gear (RIA-Chicago 4/15/24)", () => {
    // Its only pull-sheet-named tab was "OLD PULL SHEET" carrying a DIFFERENT
    // show's data; the exporter now skips OLD tabs, so pullSheet is null rather
    // than a wrong-show pack list.
    const r = parse("redefining-fi");
    expect(r.pullSheet).toBeNull();
    expect(JSON.stringify(r)).not.toContain("RIA - CHICAGO");
  });
});

describe("exporter fidelity — A1 inline hotel dates back-fill year", () => {
  it("redefining + ria resolve yearless 'Check In: M/D' to ISO (was null)", () => {
    // resolveDate's `/\/\d{2,4}$/` guard matched the trailing '/11' of '5/11' and
    // short-circuited the year back-fill -> normalizeDate('5/11') -> null.
    const rf = parse("redefining-fi").hotelReservations[0]!;
    expect(rf.check_in).toBe("2025-05-11");
    expect(rf.check_out).toBe("2025-05-15");
    const ria = parse("ria").hotelReservations[0]!;
    expect(ria.check_in).toBe("2025-06-23");
    expect(ria.check_out).toBe("2025-06-26");
  });
});

describe("exporter fidelity — A2 multi-reservation check-out (own per reservation, not shared)", () => {
  it("rpas: 4 reservations each keep their own check_out; none inverted", () => {
    const h = parse("rpas").hotelReservations;
    expect(h.map((r) => [r.check_in, r.check_out])).toEqual([
      ["2026-03-22", "2026-03-26"],
      ["2026-03-23", "2026-03-25"], // was 2026-03-26 (res#1's checkout, shared)
      ["2026-03-21", "2026-03-22"],
      ["2026-03-25", "2026-03-26"], // was 2026-03-22 (inverted: out < in)
    ]);
  });
  it("fintech: res#2 gets its own 5/6 check-out, not res#1's 5/7", () => {
    const h = parse("fintech").hotelReservations;
    expect([h[0]!.check_in, h[0]!.check_out]).toEqual(["2026-05-02", "2026-05-07"]);
    expect([h[1]!.check_in, h[1]!.check_out]).toEqual(["2026-05-03", "2026-05-06"]);
  });
  it("no returned hotel has check_out < check_in (inversion class)", () => {
    for (const slug of ["rpas", "fintech", "fixed-income", "redefining-fi", "ria", "consultants", "east-coast"]) {
      for (const r of parse(slug).hotelReservations) {
        if (r.check_in && r.check_out) {
          expect(r.check_out >= r.check_in, `${slug} ${r.hotel_name}`).toBe(true);
        }
      }
    }
  });

  it("A2/AR: wide layout with a BLANK right checkout leaves it null (no inherited date)", () => {
    // Wide-layout is detected from the label row's 4th "Check Out Date", not from
    // a value cell — so a blank right checkout stays null instead of inheriting
    // the left reservation's date.
    const md = [
      "| HOTEL | RESERVATION \\#1 | RESERVATION \\#1 | RESERVATION \\#2 | RESERVATION \\#2 |",
      "| :---: | :---: | :---: | :---: | :---: |",
      "|  | Hotel Name / Address | Hotel Name / Address | Hotel Name / Address | Hotel Name / Address |",
      "|  | Hotel A | Hotel A | Hotel B | Hotel B |",
      "|  | Check In Date | Check Out Date | Check In Date | Check Out Date |",
      "|  | 1/1/26 | 1/5/26 | 1/2/26 |  |",
    ].join("\n");
    const h = parseHotels(md, "v4");
    expect(h[0]!.check_out).toBe("2026-01-05");
    expect(h[1]!.check_in).toBe("2026-01-02");
    expect(h[1]!.check_out).toBeNull(); // NOT inherited "2026-01-05"
  });
});

describe("exporter fidelity — B1 transport assigned_names ignores the col0 stage label", () => {
  it("redefining schedule maps real crew (col3), not the stage label (col0)", () => {
    // parseSheet threads crew into transport; redefining rows are
    // `| Pick Up Warehouse | 5/10 @ TBD | | Eric Carroll | $… |`. The scan read
    // col0 first, and isNameLike accepted "Pick Up Warehouse" (3 capitalized words).
    const sched = parse("redefining-fi").transportation!.schedule;
    for (const e of sched) {
      expect(e.assigned_names ?? [], `echoed stage ${e.stage}`).not.toContain(e.stage);
    }
    const byStage = Object.fromEntries(sched.map((e) => [e.stage, e.assigned_names ?? []]));
    expect(byStage["Pick Up Warehouse"]).toEqual(["Eric Carroll"]);
    expect(byStage["Drop Off Venue"]).toEqual(["Eric Weiss"]);
    expect(byStage["Pick Up Venue"]).toEqual(["Connor Hester"]);
  });
});

describe("exporter fidelity — B2 east-coast v1 vehicle", () => {
  it("captures the `| Transportation | Van |` vehicle that sits above the Driver row", () => {
    expect(parse("east-coast").transportation!.vehicle).toBe("Van");
  });
});

describe("exporter fidelity — B3 ria v2 transport (col1='TRANSPORTATION', not 'NAME')", () => {
  it("routes to v2 not v1: vehicle captured + no 'Vehicle' leaks into the schedule", () => {
    // Header is `| TRANSPORTATION | TRANSPORTATION | PHONE |`; v2 required col1='NAME',
    // so ria fell to v1 which has no Vehicle handling -> vehicle lost + 'Vehicle' row
    // leaked in as a schedule stage.
    const t = parse("ria").transportation!;
    expect(t.driver_name).toBe("Connor Hester");
    expect(t.vehicle ?? "").toContain("Mercedes Sprinter Van 2");
    expect(t.schedule.map((e) => e.stage)).not.toContain("Vehicle");
  });
});

describe("exporter fidelity — B4 v4 transport plain header (driver on a body row)", () => {
  it("fintech/fixed-income/rpas parse (were null): driver + vehicle from body rows", () => {
    const fin = parse("fintech").transportation!;
    expect(fin.driver_name).toBe("Carlos Pineda");
    expect(fin.vehicle ?? "").toContain("Mercedes Sprinter Van 3");
    const fx = parse("fixed-income").transportation!;
    expect(fx.driver_name).toBe("Carlos Pineda");
    expect(fx.vehicle ?? "").toContain("16' Box Truck Rental");
    const rp = parse("rpas").transportation!;
    expect(rp.driver_name).toBe("Doug Larson");
    expect(rp.vehicle ?? "").toContain("Mercedes Schnubby Van");
  });
  it("parses the dated schedule legs", () => {
    const loadIn = parse("fixed-income").transportation!.schedule.find((e) =>
      /Load In at Venue/i.test(e.stage),
    );
    expect(loadIn?.date).toBe("2025-10-19");
  });
});

describe("exporter fidelity — C1 v4 General Session captured (was dropped)", () => {
  it("fintech/fixed-income/rpas each yield exactly 1 GS room with name + set_time", () => {
    const cases = [
      ["fintech", "ADLER BALLROOM", "5/3 @ 11:00 AM"],
      ["fixed-income", "SALON ABC", "10/19 @ 12PM"],
      ["rpas", "GRAND BALLROOM", "3/23 @ 8am"],
    ] as const;
    for (const [slug, name, setTime] of cases) {
      const gs = parse(slug).rooms.filter((r) => r.kind === "gs");
      expect(gs.length, `${slug} gs count`).toBe(1);
      expect(gs[0]!.name).toContain(name);
      expect(gs[0]!.set_time).toBe(setTime);
    }
  });
});

describe("exporter fidelity — C2 phantom 'Additional Room Name(s)' suppressed", () => {
  it("v2 shows emit no kind='additional' template stub (mixed-case field is not a block header)", () => {
    // The mixed-case "Additional Room Name(s)" metadata field was matched like a
    // real all-caps ADDITIONAL ROOM block header (case-insensitive regex).
    for (const slug of ["redefining-fi", "consultants", "ria"]) {
      expect(
        parse(slug).rooms.filter((r) => r.kind === "additional"),
        `${slug} additional rooms`,
      ).toEqual([]);
    }
  });
});

describe("exporter fidelity — AR: v4 additional rooms (content-gated, not dropped by short-circuit)", () => {
  it("fintech's empty ADDITIONAL ROOM template stub is not emitted as a room", () => {
    expect(parse("fintech").rooms.filter((r) => r.kind === "additional")).toEqual([]);
  });
  it("a v4 show WITH a real additional room captures it (not lost to the v4 short-circuit)", () => {
    const md = [
      "| GENERAL SESSION MAIN HALL 40' x 30' | GENERAL SESSION MAIN HALL 40' x 30' |",
      "| :---: | :---: |",
      "| Setup | Theater |",
      "",
      "| ADDITIONAL ROOM GREEN ROOM 12' x 12' | ADDITIONAL ROOM GREEN ROOM 12' x 12' |",
      "| :---: | :---: |",
      "| Setup | Lounge seating |",
    ].join("\n");
    const rooms = parseRooms(md, "v4");
    expect(rooms.filter((r) => r.kind === "gs")).toHaveLength(1);
    const add = rooms.filter((r) => r.kind === "additional");
    expect(add).toHaveLength(1);
    expect(add[0]!.setup).toBe("Lounge seating");
  });
});
