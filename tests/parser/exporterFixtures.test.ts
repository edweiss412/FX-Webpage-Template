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

  it("AR R3: yearless inline dates take the year from the SHOW context, not a hard-coded era", () => {
    const make = (yy: string) =>
      [
        "| DATES |  |",
        `| Travel | 3/22/${yy} |`,
        "| Hotel Reservations | Hilton Check In: 3/22 Check Out: 3/26 Doug --- 12345 |",
      ].join("\n");
    const h24 = parseHotels(make("24"), "v1");
    expect([h24[0]!.check_in, h24[0]!.check_out]).toEqual(["2024-03-22", "2024-03-26"]);
    const h26 = parseHotels(make("26"), "v4");
    expect([h26[0]!.check_in, h26[0]!.check_out]).toEqual(["2026-03-22", "2026-03-26"]);
  });

  it("AR R3: yearless inline date with no inferable show year stays null (no guess)", () => {
    const h = parseHotels(
      "| Hotel Reservations | Hilton Check In: 3/22 Check Out: 3/26 Doug --- 12345 |",
      "v1",
    );
    expect(h[0]!.check_in).toBeNull();
    expect(h[0]!.check_out).toBeNull();
  });

  it("AR R6: yearless stay crossing the new year rolls the checkout into the next year", () => {
    const md = [
      "| DATES |  |",
      "| Travel | 12/30/25 |",
      "| Hotel Reservations | Hyatt Check In: 12/31 Check Out: 1/2 Doug --- 999 |",
    ].join("\n");
    const h = parseHotels(md, "v1")[0]!;
    expect(h.check_in).toBe("2025-12-31");
    expect(h.check_out).toBe("2026-01-02"); // NOT 2025-01-02 (which precedes check-in)
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

describe("exporter fidelity — AR R4: multi-stay inline cell splits into per-group reservations", () => {
  it("consultants: Eric Weiss keeps check-out 10/9 while the other guests keep 10/10", () => {
    // One "Hotel Reservations" cell holds two date groups (Doug/John/Alexandre
    // out 10/10; Eric Weiss out 10/9). A single-row parse mis-dated Eric.
    const res = parse("consultants").hotelReservations;
    expect(res.length).toBeGreaterThanOrEqual(2);
    const eric = res.find((r) => r.names.includes("Eric Weiss"));
    expect(eric?.check_in).toBe("2025-10-07");
    expect(eric?.check_out).toBe("2025-10-09");
    const doug = res.find((r) => r.names.includes("Doug Larson"));
    expect(doug?.check_out).toBe("2025-10-10");
    expect(doug?.names).not.toContain("Eric Weiss");
  });

  it("AR R5: multi-stay cell with guests AFTER each checkout keeps all guests (no detach/drop)", () => {
    // Splitting at "Check Out" would strand the post-checkout guests; the splitter
    // only keeps the split when every group attributed guests, else falls back to
    // one reservation with everyone present.
    const md = [
      "| DATES |  |",
      "| Travel | 5/11/25 |",
      "| Hotel Reservations | The Drake Check In: 5/11 Check Out: 5/15 Eric Carroll Connor Hester Check In: 5/16 Check Out: 5/17 Doug Larson |",
    ].join("\n");
    const res = parseHotels(md, "v2");
    const allNames = res.flatMap((r) => r.names);
    expect(allNames).toContain("Eric Carroll");
    expect(allNames).toContain("Connor Hester");
    expect(allNames).toContain("Doug Larson");
    // R13-2: attribution is ambiguous (guests after each checkout, 2 date groups),
    // so dates are NULLED rather than mis-mapped — no guest (e.g. Doug, who belongs
    // to the 5/16-5/17 group) carries the first group's 5/15 checkout.
    for (const r of res) {
      expect(r.check_in, "ambiguous multi-stay must not assign a date").toBeNull();
      expect(r.check_out, "ambiguous multi-stay must not assign a date").toBeNull();
    }
  });

  it("AR R7: split reservation hotel_name is the hotel/address, not glued guest names", () => {
    for (const r of parse("consultants").hotelReservations) {
      expect(r.hotel_name, "hotel_name should not carry guest names").not.toMatch(/Doug Larson|Eric Weiss|\d{6,}/);
      expect(r.hotel_name).toContain("Four Seasons");
    }
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

describe("exporter fidelity — C2/R8 additional room: populated fields kept, empty stubs suppressed", () => {
  it("populated 'Additional Room Name(s)/Setup' fields emit a real room (v2 + v4 shows)", () => {
    const rf = parse("redefining-fi").rooms.filter((r) => r.kind === "additional");
    expect(rf).toHaveLength(1);
    expect(rf[0]!.name).toContain("Lunch in Adorn");
    expect(rf[0]!.setup).toMatch(/Not currently contracted/);

    const cons = parse("consultants").rooms.filter((r) => r.kind === "additional");
    expect(cons).toHaveLength(1);
    expect(cons[0]!.name).toContain("Lunch will be held");

    // rpas is v4 — the field must be captured even though parseV4Rooms short-circuits.
    const rp = parse("rpas").rooms.filter((r) => r.kind === "additional");
    expect(rp).toHaveLength(1);
    expect(rp[0]!.name).toContain("Ballroom C");
  });

  it("empty Additional Room fields stay suppressed — no phantom (ria/fintech/fixed-income)", () => {
    for (const slug of ["ria", "fintech", "fixed-income"]) {
      expect(
        parse(slug).rooms.filter((r) => r.kind === "additional"),
        `${slug} additional rooms`,
      ).toEqual([]);
    }
  });

  it("the emitted room is real content, not the 'Additional Room Name(s)' phantom or a DETAILS leak", () => {
    for (const slug of ["redefining-fi", "consultants", "rpas"]) {
      for (const r of parse(slug).rooms.filter((x) => x.kind === "additional")) {
        expect(r.name).not.toBe("Additional Room Name(s)");
        expect(r.digital_signage ?? "").not.toMatch(/DETAILS/i);
      }
    }
  });
});

describe("exporter fidelity — AR R9: numberless v2 breakout headers are emitted", () => {
  it("redefining emits LASALLE A + WALTON ROOM breakouts (numberless headers, real fields)", () => {
    const bo = parse("redefining-fi").rooms.filter((r) => r.kind === "breakout");
    const lasalle = bo.find((r) => /LASALLE A/i.test(r.name));
    const walton = bo.find((r) => /WALTON ROOM/i.test(r.name));
    expect(lasalle, "LASALLE A breakout").toBeDefined();
    expect(walton, "WALTON ROOM breakout").toBeDefined();
    expect(lasalle!.setup).toMatch(/Theater set up/);
    expect(walton!.set_time).toBe("5/13 @ 6:30 AM");
    // the numberless name must not be the bare word "BREAKOUT"
    expect(lasalle!.name).not.toBe("BREAKOUT");
  });

  it("R10: pull-sheet 'BREAKOUT SESSION N - X' equipment sections are NOT emitted as rooms", () => {
    const bo = parse("consultants").rooms.filter((r) => r.kind === "breakout");
    // No phantom session rooms (they share the bare-BREAKOUT shape but have no BO fields).
    expect(bo.map((r) => r.name).filter((n) => /SESSION/i.test(n))).toEqual([]);
    // The real numbered breakouts survive.
    expect(bo.some((r) => /DELAWARE/i.test(r.name))).toBe(true);
    expect(bo.some((r) => /STATE B/i.test(r.name))).toBe(true);
  });

  it("R11: east-coast MABEL 1 merges its split blocks (dims + fields), not an empty phantom", () => {
    const bo = parse("east-coast").rooms.filter((r) => r.kind === "breakout");
    const mabel = bo.find((r) => /MABEL 1/i.test(r.name));
    expect(mabel, "MABEL 1 breakout").toBeDefined();
    // header dims ("APPROXIMATELY 60' x 45'") + the "DAY 1 & 2" block's fields merge
    expect(mabel!.dimensions).toBe("60' x 45'");
    expect(mabel!.setup ?? mabel!.set_time, "MABEL 1 must carry merged content").not.toBeNull();
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
  it("R2: empty v4 breakout template stubs dropped; real breakouts kept", () => {
    // fintech's "BREAKOUT N BREAKOUT ROOM Dimensions Floor" stubs have no dims/
    // fields; fixed-income (SALON D) / rpas (STATE A/B) carry dims + Setup.
    expect(parse("fintech").rooms.filter((r) => r.kind === "breakout")).toHaveLength(0);
    expect(
      parse("fixed-income").rooms.filter((r) => r.kind === "breakout").length,
    ).toBeGreaterThanOrEqual(1);
    expect(parse("rpas").rooms.filter((r) => r.kind === "breakout").length).toBeGreaterThanOrEqual(2);
  });
  it("AR R7: a real name-only v4 room is kept; only template-named stubs are dropped", () => {
    const md = [
      "| BREAKOUT 1 SALON D | BREAKOUT 1 SALON D |",
      "| :---: | :---: |",
      "| Setup |  |",
      "",
      "| BREAKOUT 2 BREAKOUT ROOM Dimensions Floor | BREAKOUT 2 BREAKOUT ROOM Dimensions Floor |",
      "| :---: | :---: |",
      "| Setup |  |",
    ].join("\n");
    const breakouts = parseRooms(md, "v4").filter((r) => r.kind === "breakout");
    expect(breakouts).toHaveLength(1); // SALON D kept; template stub dropped
    expect(breakouts[0]!.name).toContain("SALON D");
  });
  it("R11: an all-stub v4 sheet stays on the v4 path — no v2 fallback re-emitting phantoms", () => {
    // Only empty placeholder BREAKOUT/ADDITIONAL stubs (no GS): parseV4Rooms gates
    // them all out, but sawV4 keeps us off the v2 path that would re-parse them.
    const md = [
      "| BREAKOUT 1 BREAKOUT ROOM Dimensions Floor | BREAKOUT 1 BREAKOUT ROOM Dimensions Floor |",
      "| :---: | :---: |",
      "| Setup |  |",
      "",
      "| ADDITIONAL ROOM Dimensions Floor | ADDITIONAL ROOM Dimensions Floor |",
      "| :---: | :---: |",
      "| Setup |  |",
    ].join("\n");
    expect(parseRooms(md, "v4")).toEqual([]);
  });
  it("R12: a v4 placeholder stub + real v2 rooms still parses the v2 rooms (no fallback suppression)", () => {
    const md = [
      // v4-shaped placeholder (bare Setup row): detected as v4, gated out, v4Rooms empty
      "| BREAKOUT 1 BREAKOUT ROOM Dimensions Floor | BREAKOUT 1 BREAKOUT ROOM Dimensions Floor |",
      "| :---: | :---: |",
      "| Setup |  |",
      "",
      // real v2 breakout (BO-prefixed field with content)
      "| BREAKOUT 2 SALON D 43' x 24' | BREAKOUT 2 SALON D 43' x 24' |",
      "| :---: | :---: |",
      "| BO Setup | Theater for 50 |",
    ].join("\n");
    const bo = parseRooms(md, "v4").filter((r) => r.kind === "breakout");
    expect(bo).toHaveLength(1); // the real v2 room survives; the v4 stub is not re-emitted
    expect(bo[0]!.name).toContain("SALON D");
    expect(bo[0]!.setup).toBe("Theater for 50");
  });
  it("R13: a real v4 GS + a v2 BO-prefixed breakout coexist — neither shadows the other", () => {
    const md = [
      "| GENERAL SESSION MAIN HALL 40' x 30' | GENERAL SESSION MAIN HALL 40' x 30' |",
      "| :---: | :---: |",
      "| Setup | Theater |",
      "",
      "| BREAKOUT 1 GREEN ROOM | BREAKOUT 1 GREEN ROOM |",
      "| :---: | :---: |",
      "| BO Setup | Lounge seating |",
    ].join("\n");
    const rooms = parseRooms(md, "v4");
    expect(rooms.some((r) => r.kind === "gs" && /MAIN HALL/.test(r.name))).toBe(true);
    const green = rooms.find((r) => r.kind === "breakout" && /GREEN ROOM/.test(r.name));
    expect(green, "v2 BO breakout must survive alongside the v4 GS").toBeDefined();
    expect(green!.setup).toBe("Lounge seating");
  });
});
