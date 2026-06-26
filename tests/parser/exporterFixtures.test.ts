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
    expect(parse("fintech").show.agenda_links[0]!.fileId).toBe("1Lfncqubzk9x6gQH5Z7Sz_EQRJ_8BWtPF");
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
    for (const slug of [
      "rpas",
      "fintech",
      "fixed-income",
      "redefining-fi",
      "ria",
      "consultants",
      "east-coast",
    ]) {
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
      expect(r.hotel_name, "hotel_name should not carry guest names").not.toMatch(
        /Doug Larson|Eric Weiss|\d{6,}/,
      );
      expect(r.hotel_name).toContain("Four Seasons");
    }
  });
});

describe("exporter fidelity — #3 hotel name / address split (live-grounded, all 7 sheets)", () => {
  // The production exporter flattens the in-cell `name⏎street⏎city` newlines to
  // spaces, so the parser must split the venue name from the street address by
  // PATTERN, not by the (lost) line break. Live-MCP grounding of all 7
  // fxav-test sheets (2026-06-26) confirmed: the hotel name ends at the first
  // standalone 2+ digit STREET NUMBER, no hotel name in the corpus contains such
  // a number, ria wraps its address in literal double-quotes, and fintech's
  // Holiday Inn embeds U+200C ZWNJ — quotes + zero-width chars are stripped.
  type Expect = { find: string; name: string; address: string | null };
  const GROUND_TRUTH: Record<string, Expect[]> = {
    // structured HOTEL table
    fintech: [
      { find: "Kimpton", name: "Kimpton Gray", address: "122 W Monroe St Chicago, IL 60603" },
      {
        find: "Holiday Inn",
        name: "Holiday Inn Express",
        address: "13330 Cicero Avenue, Crestwood, IL 60418 United States",
      },
    ],
    "fixed-income": [
      {
        find: "Park Hyatt",
        name: "Park Hyatt Chicago",
        address: "800 N Michigan Ave Chicago, IL 60611",
      },
    ],
    rpas: [
      {
        find: "Four Seasons",
        name: "Four Seasons Hotel Chicago",
        address: "120 E Delaware Pl Chicago, IL 60611",
      },
      {
        find: "Holiday Inn",
        name: "Holiday Inn Express",
        address: "1705 Tollgate Drive Maumee, Ohio 43537",
      },
    ],
    // inline "Hotel Reservations" cell
    consultants: [
      {
        find: "Four Seasons",
        name: "Four Seasons Chicago",
        address: "120 E Delaware Pl Chicago, IL 60611",
      },
    ],
    "redefining-fi": [
      { find: "Drake", name: "The Drake Hotel", address: "140 E Walton Pl Chicago, IL 60611" },
    ],
    ria: [
      {
        find: "Park Hyatt",
        name: "Park Hyatt Chicago",
        address: "800 N Michigan Ave Chicago, IL 60611",
      },
    ],
    // v1 "Hotel Stays": no street address glued into the reservation cell (the
    // address lives in a separate sheet row the reservation parser doesn't
    // harvest), so hotel_address stays null and the name keeps its as-is shape.
    "east-coast": [{ find: "Four Seasons", name: "Four Seasons Fort Lauderdale", address: null }],
  };

  for (const [slug, expects] of Object.entries(GROUND_TRUTH)) {
    for (const e of expects) {
      it(`${slug}: "${e.find}" → name "${e.name}" / address ${e.address === null ? "null" : `"${e.address}"`}`, () => {
        const res = parse(slug).hotelReservations;
        const hit = res.find(
          (r) => (r.hotel_name ?? "").includes(e.find) || (r.hotel_address ?? "").includes(e.find),
        );
        expect(hit, `no reservation matching "${e.find}" in ${slug}`).toBeDefined();
        if (e.address === null) {
          // tolerate the pre-existing v1 Hotel-Stays guest-name glue; assert only
          // that no street address was split out and the venue name is present.
          expect(hit!.hotel_name).toContain(e.find);
          expect(hit!.hotel_address).toBeNull();
        } else {
          expect(hit!.hotel_name).toBe(e.name);
          expect(hit!.hotel_address).toBe(e.address);
        }
      });
    }
  }

  it("no hotel_name retains a glued street address, and no field carries a ZWNJ/quote (every show)", () => {
    for (const slug of Object.keys(GROUND_TRUTH)) {
      for (const r of parse(slug).hotelReservations) {
        const n = r.hotel_name ?? "";
        // a street address is "<2-5 digit number> <Street word>"; after the split
        // it must live in hotel_address, never on the prominent name line.
        expect(n, `${slug} hotel_name "${n}" still glues a street address`).not.toMatch(
          /\b\d{2,5}\s+[A-Z]/,
        );
        for (const v of [r.hotel_name, r.hotel_address]) {
          // U+200B ZWSP / U+200C ZWNJ / U+200D ZWJ / U+FEFF BOM
          expect(v ?? "", `${slug} field "${v}" carries a zero-width char`).not.toMatch(/[​-‍﻿]/);
          // straight " plus smart “ ” double-quotes
          expect(v ?? "", `${slug} field "${v}" carries a stray double-quote`).not.toMatch(/["“”]/);
        }
      }
    }
  });

  it("ria: address is unwrapped from its literal double-quotes", () => {
    const ria = parse("ria").hotelReservations.find((r) =>
      (r.hotel_name ?? "").includes("Park Hyatt"),
    );
    expect(ria!.hotel_address).toBe("800 N Michigan Ave Chicago, IL 60611");
    expect(ria!.hotel_address).not.toContain('"');
  });

  // Negative-regression: the boundary requires a real STREET SHAPE, so a hotel
  // whose BRANDING carries a number is not corrupted. The naive "number + word"
  // predicate would have split "Hotel 71" → name "Hotel" / address "71...".
  const numericHotel = (cell: string) =>
    parseHotels(
      [
        "| HOTEL | RESERVATION \\#1 |  |  |",
        "| :---: | :---: | :---: | :---: |",
        "|  | Hotel Name / Address |  |  |",
        `|  | ${cell} |  |  |`,
        "|  | Names on Reservation |  |  |",
        "|  | Alice Smith |  |  |",
        "|  | Check In Date | Check Out Date |  |",
        "|  | 1/1/26 | 1/2/26 |  |",
      ].join("\n"),
      "v4",
    )[0]!;

  it("numeric-branded hotel name with NO street address is left whole (no false split)", () => {
    const h = numericHotel("Hotel 71");
    expect(h.hotel_name).toBe("Hotel 71");
    expect(h.hotel_address).toBeNull();
  });

  it("numeric-branded hotel name splits at the REAL street number, not the branding", () => {
    // "Hotel 71 71 E Wacker Dr Chicago, IL 60601" — the first 71 is branding (no
    // street phrase follows); the second 71 begins "71 E Wacker Dr".
    const h = numericHotel("Hotel 71 71 E Wacker Dr Chicago, IL 60601");
    expect(h.hotel_name).toBe("Hotel 71");
    expect(h.hotel_address).toBe("71 E Wacker Dr Chicago, IL 60601");
  });

  // Coverage for common address shapes the street-shape gate must NOT reject
  // (1-digit street numbers + ordinal street names) — else those venues silently
  // regress to a glued name/address on the crew page.
  const splitCases: Array<[string, string, string]> = [
    // cell, expected name, expected address
    [
      "The Newbury Boston 1 Newbury St Boston, MA 02116",
      "The Newbury Boston",
      "1 Newbury St Boston, MA 02116",
    ],
    [
      "Hotel Viking 1 Bellevue Ave Newport, RI 02840",
      "Hotel Viking",
      "1 Bellevue Ave Newport, RI 02840",
    ],
    [
      "Union League Club 38 E 37th St New York, NY 10016",
      "Union League Club",
      "38 E 37th St New York, NY 10016",
    ],
    ["The Langham 485 5th Ave New York, NY 10017", "The Langham", "485 5th Ave New York, NY 10017"],
  ];
  for (const [cell, name, address] of splitCases) {
    it(`splits "${name}" off its address "${address}" (1-digit / ordinal street shapes)`, () => {
      const h = numericHotel(cell);
      expect(h.hotel_name).toBe(name);
      expect(h.hotel_address).toBe(address);
    });
  }
});

describe("exporter fidelity — v1 Hotel-Stays guest extraction (#3 follow-up)", () => {
  // east-coast's "Hotel Stays" cell has NO "Check In" marker, so guests sit glued
  // after the hotel name with mixed dash styles + a middle initial:
  //   "Four Seasons Fort Lauderdale Doug--- 103317 Carl –- 103316 Eric W--- 110525"
  // The weak inline name patterns missed Carl (en-dash "–-") + Eric W (middle
  // initial) and—because there is no "Check In" suffix to strip—left every guest
  // first-name glued into hotel_name. names[] is load-bearing: getShowForViewer
  // filters hotels by the viewer's name appearing in res.names.
  it("east-coast: hotel_name is the venue only; all guests extracted into names[]", () => {
    const h = parse("east-coast").hotelReservations;
    expect(h).toHaveLength(1);
    expect(h[0]!.hotel_name).toBe("Four Seasons Fort Lauderdale");
    expect(h[0]!.hotel_address).toBeNull();
    expect(h[0]!.names).toEqual(["Doug", "Carl", "Eric W"]);
  });

  it("east-coast: no guest first-name is glued into hotel_name; no conf# anywhere", () => {
    const h = parse("east-coast").hotelReservations[0]!;
    for (const guest of ["Doug", "Carl", "Eric"]) {
      expect(h.hotel_name ?? "", `"${guest}" glued into hotel_name`).not.toMatch(
        new RegExp(`\\b${guest}\\b`),
      );
    }
    for (const conf of ["103317", "103316", "110525"]) {
      expect(h.hotel_name ?? "").not.toContain(conf);
      expect(h.names.join(" ")).not.toContain(conf);
    }
  });

  // synthetic: the hotel's LAST word must not bleed into the first guest name (the
  // "Lauderdale Doug" failure class). Drive through the Hotel Stays path.
  it("does not bleed the hotel's last word into the first guest", () => {
    const md = "| Hotel Stays | Hilton Garden Inn Carl –- 999888 Doug--- 777666 |";
    const h = parseHotels(md, "v1");
    expect(h).toHaveLength(1);
    expect(h[0]!.hotel_name).toBe("Hilton Garden Inn");
    expect(h[0]!.names).toEqual(["Carl", "Doug"]);
  });

  // no-regression (Codex R2): a no-Check-In cell with a 2-word name + a 4–5 digit
  // dash conf ("Doug Larson - 7414") is NOT the east-coast 1-word/6-digit shape, so
  // it must FALL THROUGH to legacy Pattern 1, which SURFACES the guest — it must NOT
  // be dropped to names:[] by the guest-less shortcut. The shortcut fires only when
  // a dash-number is a STREET number (street phrase), not a conf#. (Pattern 1 greedy-
  // captures the leading hotel word too — "Westin Doug Larson" — a pre-existing bleed
  // out of this fix's scope; what matters here is the guest is present, not dropped.)
  it("a no-Check-In 2-word + 4-digit dash conf still SURFACES the guest, not dropped", () => {
    const h = parseHotels("| Hotel Stays | Westin Doug Larson - 7414 |", "v1");
    expect(h).toHaveLength(1);
    expect(h[0]!.names.length).toBeGreaterThan(0); // NOT dropped to []
    expect(h[0]!.names.join(" ")).toContain("Doug Larson");
    expect(h[0]!.names.join(" ")).not.toContain("7414"); // conf# stripped from names
    expect(h[0]!.hotel_name ?? "").not.toContain("7414"); // and from hotel_name
  });

  // no-regression: the legacy BARE-conf# shape (no dash, "In on the Nth" prose) is
  // intentionally NOT handled by the dash extractor — it must fall through to the
  // existing path with the conf# stripped (privacy) and the venue still present.
  it("legacy bare-conf# Hotel Reservations falls through, conf# still stripped", () => {
    const md =
      "| Hotel Reservations | Four Seasons Chicago Eric Weiss 2004173 In on the 6th out on the 10th Jeffrey Justice 2004172 In on the 6th out on the 10th |";
    const h = parseHotels(md, "v1");
    expect(h).toHaveLength(1);
    expect(h[0]!.hotel_name).toContain("Four Seasons Chicago");
    for (const conf of ["2004173", "2004172"]) {
      expect(h[0]!.hotel_name ?? "").not.toContain(conf);
      expect(h[0]!.names.join(" ")).not.toContain(conf);
    }
  });

  // no-regression: a DATED inline cell (ria/redefining shape) keeps the existing
  // path — guests after the dates, hotel name unaffected by the new extractor.
  it("dated inline cell is unaffected by the dash extractor (ria/redefining path)", () => {
    expect(parse("ria").hotelReservations[0]!.hotel_name).toBe("Park Hyatt Chicago");
    expect(parse("redefining-fi").hotelReservations[0]!.hotel_name).toBe("The Drake Hotel");
  });

  // false-positive guard (Codex R1): a dash-separated ADDRESS must not be read as a
  // "Name - conf#" guest. A street number is ≤5 digits; a hotel conf# is ≥6, so the
  // dash extractor can't fire on "Hyatt Regency - 1515 Madison Ave" — the cell
  // routes through splitHotelNameAddress instead. The hotel name + address are
  // preserved and — critically — NO hotel word leaks into names[] (which gates
  // per-viewer hotel visibility). (A suffixless street like "Broadway" would stay
  // glued per the #3 street-shape gate; that safe fallback is unchanged here.)
  it("a dash-separated address is preserved, not extracted as a guest", () => {
    const h = parseHotels(
      "| Hotel Stays | Hyatt Regency - 1515 Madison Ave New York, NY 10036 |",
      "v1",
    );
    expect(h).toHaveLength(1);
    expect(h[0]!.hotel_name).toBe("Hyatt Regency");
    expect(h[0]!.hotel_address).toBe("1515 Madison Ave New York, NY 10036");
    expect(h[0]!.names).toEqual([]);
  });

  // a plain no-Check-In hotel+address cell with no guests also splits cleanly.
  it("a guest-less hotel+address Hotel-Stays cell splits name/address, no guests", () => {
    const h = parseHotels(
      "| Hotel Stays | Marriott Downtown 555 Main St Chicago, IL 60601 |",
      "v1",
    );
    expect(h).toHaveLength(1);
    expect(h[0]!.hotel_name).toBe("Marriott Downtown");
    expect(h[0]!.hotel_address).toBe("555 Main St Chicago, IL 60601");
    expect(h[0]!.names).toEqual([]);
  });
});

describe("exporter fidelity — AR R14: GS Digital Signage scoped to the GS block", () => {
  it("consultants GS does NOT inherit a DETAILS-section Digital Signage sentence", () => {
    const gs = parse("consultants").rooms.find((r) => r.kind === "gs");
    expect(gs!.digital_signage).toBeNull(); // ~300-char DETAILS leak removed
  });
  it("a GS block WITH an adjacent Digital Signage row keeps it (redefining / ria)", () => {
    expect(parse("redefining-fi").rooms.find((r) => r.kind === "gs")!.digital_signage).toBe("N/A");
    expect(parse("ria").rooms.find((r) => r.kind === "gs")!.digital_signage).toBe("NONE");
  });
  it("synthetic: the GS block's own DS wins over a later DETAILS Digital Signage row", () => {
    const md = [
      "| GS Setup | Theater |",
      "| GS Other | Podium |",
      "",
      "| Digital Signage | 3 monitors at registration |",
      "",
      "| DETAILS | DETAILS |",
      "| Digital Signage | A long DETAILS sentence that must not leak onto the GS room |",
    ].join("\n");
    const gs = parseRooms(md, "v2").find((r) => r.kind === "gs");
    expect(gs!.digital_signage).toBe("3 monitors at registration");
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
  it("populated intake-form 'Additional Room Name(s)/Setup' fields emit ONE 'Additional rooms' card with the prose in notes (not the name)", () => {
    // These come from the client INTAKE FORM tab (free-text answers), not Doug's INFO room
    // blocks — so the value is usually meal/social PROSE. It must NOT become the room name
    // (a paragraph-as-name card); it goes into `notes` (rendered as a Today callout) behind
    // a clean generic "Additional rooms" label. The "Additional Room Setup" value stays in
    // setup. (Owner decision 2026-06-23: reformat, keep info, fix the name.)
    const rf = parse("redefining-fi").rooms.filter((r) => r.kind === "additional");
    expect(rf).toHaveLength(1);
    expect(rf[0]!.name).toBe("Additional rooms");
    expect(rf[0]!.notes).toContain("Lunch in Adorn");
    expect(rf[0]!.setup).toMatch(/Not currently contracted/);

    const cons = parse("consultants").rooms.filter((r) => r.kind === "additional");
    expect(cons).toHaveLength(1);
    expect(cons[0]!.name).toBe("Additional rooms");
    expect(cons[0]!.notes).toContain("Lunch will be held");

    // rpas is v4 — the field must be captured even though parseV4Rooms short-circuits.
    const rp = parse("rpas").rooms.filter((r) => r.kind === "additional");
    expect(rp).toHaveLength(1);
    expect(rp[0]!.name).toBe("Additional rooms");
    expect(rp[0]!.notes).toContain("Ballroom C");
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

  it("R11: east-coast's venue-headed GS block becomes the GS room MABEL 1 (dims + GS fields); the distinct day-1&2 breakout is kept losslessly", () => {
    const rooms = parse("east-coast").rooms;
    const mabelRooms = rooms.filter((r) => /MABEL 1/i.test(r.name));
    // The GS block is headed by the venue cell "MABEL 1\nAPPROXIMATELY 60' x 45'"
    // (no GENERAL SESSION label) → the GS room adopts that name + dims + GS fields.
    const gs = mabelRooms.find((r) => r.kind === "gs");
    expect(gs, "MABEL 1 GS room").toBeDefined();
    expect(gs!.dimensions).toBe("60' x 45'");
    expect(gs!.setup, "GS room carries the GS Setup").toContain("18 Tables");
    expect(gs!.video, "GS room keeps the GS Eiki rig").toContain("Eiki");
    // The same-named MABEL 1 breakout (day-1&2 reuse) has a DISTINCT BO Video, so it is
    // kept as a separate room — Codex adversarial regression: that value must survive,
    // not be lost to a same-name merge.
    const bo = mabelRooms.find((r) => r.kind === "breakout");
    expect(bo, "MABEL 1 day-1&2 breakout is kept (distinct AV)").toBeDefined();
    expect(bo!.video, "breakout's BO Video survives").toBe("Projector & Screen");
  });

  it("R15: adjacent breakout blocks (NO blank separator) don't bleed fields into each other", () => {
    const md = [
      "| BREAKOUT 1 ROOM A | BREAKOUT 1 ROOM A |",
      "| :---: | :---: |",
      "| BO Setup | Setup A |",
      "| BO Set Time | 1/1 @ 9am |",
      "| BREAKOUT 2 ROOM B | BREAKOUT 2 ROOM B |",
      "| :---: | :---: |",
      "| BO Setup | Setup B |",
      "| BO Set Time | 1/2 @ 10am |",
    ].join("\n");
    const bo = parseRooms(md, "v2").filter((r) => r.kind === "breakout");
    const a = bo.find((r) => /ROOM A/.test(r.name));
    const b = bo.find((r) => /ROOM B/.test(r.name));
    expect(a, "ROOM A").toBeDefined();
    expect(b, "ROOM B").toBeDefined();
    expect(a!.setup).toBe("Setup A"); // NOT "Setup B" — the over-read would have leaked it
    expect(a!.set_time).toBe("1/1 @ 9am");
    expect(b!.setup).toBe("Setup B");
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
    expect(parse("rpas").rooms.filter((r) => r.kind === "breakout").length).toBeGreaterThanOrEqual(
      2,
    );
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

describe("exporter fidelity — audit-followup: HTML-entity decode (#8) + hotel conf# (#4)", () => {
  const SLUGS = [
    "redefining-fi",
    "consultants",
    "fintech",
    "east-coast",
    "ria",
    "fixed-income",
    "rpas",
  ];

  it("#8: no parsed field surfaces a raw '&#10;' (or '&#9;') HTML entity, any show", () => {
    const hits: string[] = [];
    const scan = (o: unknown, path: string): void => {
      if (o == null) return;
      if (typeof o === "string") {
        if (/&#1?0;|&#9;/.test(o)) hits.push(`${path} = ${JSON.stringify(o.slice(0, 40))}`);
        return;
      }
      if (Array.isArray(o)) o.forEach((v, i) => scan(v, `${path}[${i}]`));
      else if (typeof o === "object")
        for (const k of Object.keys(o)) scan((o as never)[k], `${path}.${k}`);
    };
    for (const s of SLUGS) scan(parse(s), s);
    expect(hits, `raw entity at:\n${hits.join("\n")}`).toEqual([]);
  });

  it("#4: guest cells split into clean names — conf# stripped out of the name (rpas)", () => {
    const rpas = parse("rpas").hotelReservations;
    // "Douglas Larson - \#2069854&#10;John Carleo - \#2069855" → two clean names,
    // no raw entity, no escape, no conf# digits glued in.
    const shared = rpas.find((h) => h.names.length > 1);
    expect(shared?.names).toEqual(["Douglas Larson", "John Carleo"]);
    for (const h of rpas)
      for (const n of h.names) expect(n, `rpas name "${n}"`).not.toMatch(/&#1?0;|[\\#]|\d{4,}/);
  });

  it("#4 PRIVACY/DEFERRED: confirmation_no is null for ALL reservations (show-wide table read)", () => {
    // hotel_reservations is show-wide crew-readable (RLS crew_read = can_read_show,
    // SELECT granted to authenticated), so ANY crew member on the show could read a
    // row-level conf# via direct PostgREST, bypassing the getShowForViewer name
    // filter. Conf# delivery is deferred until per-viewer access exists — the parser
    // must never persist one. (Includes single-guest rows.)
    for (const s of SLUGS) {
      for (const h of parse(s).hotelReservations) {
        expect(h.confirmation_no, `${s} reservation [${h.names.join(", ")}]`).toBeNull();
      }
    }
  });

  it("#4 PRIVACY: SPACE-delimited multi-guest cells (no &#10;) also split + suppress the conf#", () => {
    // The raw RPAS fixture glues guests with a space: "Douglas Larson - #2069854
    // John Carleo - #2069855" — parsing only on &#10; would keep it one "guest" and
    // leak a row-level conf#. It must split into 2 guests with no conf#.
    const raw = parseSheet(
      readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8"),
      "raw.md",
    );
    const shared = raw.hotelReservations.find((h) => h.names.length > 1);
    expect(shared, "the space-delimited multi-guest reservation").toBeDefined();
    expect(shared!.names).toEqual(["Douglas Larson", "John Carleo"]);
    expect(shared!.confirmation_no).toBeNull();

    // synthetic single-line, space-separated guests → split into 2 clean names
    const synth = parseHotels(
      [
        "| HOTEL | RESERVATION \\#1 |  |",
        "| :---: | :---: | :---: |",
        "|  | Names on Reservation |  |",
        "|  | Ann Lee - #111111 Bob Fox - #222222 |  |",
        "|  | Hotel Name / Address |  |",
        "|  | The Drake |  |",
        "|  | Check In Date | Check Out Date |",
        "|  | 1/1/26 | 1/3/26 |",
      ].join("\n"),
      "v4",
    );
    expect(synth[0]!.names).toEqual(["Ann Lee", "Bob Fox"]);
    expect(synth[0]!.confirmation_no).toBeNull();
  });

  it("#4 PRIVACY: a conf# never survives in a name — accented + unmatched-alphabet fallback", () => {
    const mk = (cell: string) =>
      parseHotels(
        [
          "| HOTEL | RESERVATION \\#1 |  |",
          "| :---: | :---: | :---: |",
          "|  | Names on Reservation |  |",
          `|  | ${cell} |  |`,
          "|  | Hotel Name / Address |  |",
          "|  | The Drake |  |",
          "|  | Check In Date | Check Out Date |",
          "|  | 1/1/26 | 1/3/26 |",
        ].join("\n"),
        "v4",
      );
    // accented name — Unicode-aware matcher splits the conf# out of the name
    const accented = mk("José Núñez - #123456");
    expect(accented[0]!.names).toEqual(["José Núñez"]);
    // a name with a character outside the matcher (slash) still must not keep the conf#
    const slashy = mk("A/B Group - #987654");
    for (const n of slashy[0]!.names) expect(n, `name "${n}"`).not.toMatch(/[#]|\d{4,}/);
    for (const h of [...accented, ...slashy]) expect(h.confirmation_no).toBeNull();
  });

  it("#4 PRIVACY (meta): no conf# survives in ANY show-wide-readable lodging field, exporter + raw corpora", () => {
    // Structural defense for the conf#-leak vector: every string lodging field
    // (hotel_name / hotel_address / notes / names) on EVERY reservation, across the
    // exporter AND raw fixtures, must be free of a confirmation token, and
    // confirmation_no must be null. A token is a "<dash> #?<4+ digits>" run; ZIPs
    // ("Chicago, IL 60611") aren't dash-prefixed so they don't trip it. Names also
    // carry no bare digit-run (people names).
    // dash/#-prefixed conf token OR a bare 6+ digit run (the legacy
    // "Eric Weiss 2004173 In on the 6th" shape) — a US ZIP is 5 digits, so it survives.
    const confTok = /[-–—]{1,3}\s*#?\s*\d{4,}|#\s*\d{4,}|\b\d{6,}\b/;
    const rawFile = (name: string) =>
      parseSheet(readFileSync(`fixtures/shows/raw/${name}`, "utf8"), "raw.md");
    const all = [
      ...SLUGS.map((s) => parse(s)),
      rawFile("2026-03-rpas-central-four-seasons.md"), // space-delimited multi-guest
      rawFile("2024-05-east-coast-family-office.md"), // Hotel Stays, no Check-In marker
      rawFile("2025-04-asset-mgmt-cfo-coo.md"), // legacy BARE conf# ("Eric Weiss 2004173")
    ];
    for (const r of all) {
      for (const h of r.hotelReservations) {
        expect(h.confirmation_no).toBeNull();
        for (const n of h.names) expect(n, `name "${n}"`).not.toMatch(/[#]|\d{4,}/);
        for (const v of [h.hotel_name, h.hotel_address, h.notes]) {
          expect(v ?? "", `lodging field "${v}"`).not.toMatch(confTok);
        }
      }
    }
  });

  it("#4 PRIVACY: east-coast 'Hotel Stays' hotel_name carries no guest confirmation number", () => {
    // "Four Seasons Fort Lauderdale Doug--- 103317 Carl –- 103316 Eric W--- 110525"
    // has no Check-In marker, so the whole cell becomes hotel_name — the conf#s
    // (103317 / 103316 / 110525) must be stripped out before persisting.
    const hn = parse("east-coast").hotelReservations[0]?.hotel_name ?? "";
    expect(hn).toContain("Four Seasons");
    for (const conf of ["103317", "103316", "110525"]) expect(hn).not.toContain(conf);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// BL-PARSER-PRODUCTION-FIDELITY-RESIDUAL fix #1a — room header name/dims/floor
// split. The exporter flattens the source's "LABEL\nNAME\nDIMS\nFLOOR" cell to a
// single space-joined header line, so the parser was surfacing the whole fused
// string as `name` (rpas/fintech/fixed-income GS, consultants/ria breakouts) or a
// leftover separator dash ("- GRAND BALLROOM A/B"). After the fix, every room whose
// name + dimensions + floor live in ONE header cell is split: name = venue room
// only (kind already records gs/breakout), dimensions/floor in their own fields.
//
// Failure modes this locks: (1) fused names leaking dims/floor into `name`;
// (2) dropped semantic dim prefixes (rpas TOTAL:/A/B:) or two-segment dims;
// (3) the leading "- " separator on consultants' GS; (4) template placeholder
// words ("Dimensions"/"Floor") surviving in a real name (ria DRAWING ROOM A/B,
// consultants LUNCH BALLROOM C). Expected values are derived from the committed
// exporter-xlsx fixtures (creds-free), NOT the live sheet.
//
// 1b (DEFERRED): the v2 shows whose venue dims/floor live in a SEPARATE
// "<NAME> - <Nth Floor> ROOM DIMENSIONS: <dims>" / "<NAME>\n<dims>" row
// (redefining/ria GS) + east-coast's MABEL/GS tangle keep name "General Session"
// with null dims/floor here — a future 1b will intentionally update those rows.
describe("exporter fidelity — #1a room header name/dims/floor split", () => {
  type RoomTriple = { kind: string; name: string; dimensions: string | null; floor: string | null };
  const triples = (slug: string): RoomTriple[] =>
    parse(slug)
      .rooms.filter((r) => r.kind !== "additional")
      .map((r) => ({ kind: r.kind, name: r.name, dimensions: r.dimensions, floor: r.floor }));

  const EXPECTED: Record<string, RoomTriple[]> = {
    // v4 fused GS + breakout headers (the egregious cases)
    fintech: [
      { kind: "gs", name: "ADLER BALLROOM", dimensions: "75' x 37' x", floor: "15th Floor" },
    ],
    "fixed-income": [
      { kind: "gs", name: "SALON ABC", dimensions: "43' x 49' x 12'", floor: null },
      { kind: "breakout", name: "SALON D", dimensions: "43' x 24' x 12'", floor: null },
    ],
    rpas: [
      {
        kind: "gs",
        name: "GRAND BALLROOM A/B",
        dimensions: "TOTAL: 82' x 94' x 14' A/B: 82' x 63' x 14'",
        floor: "8th Floor",
      },
      { kind: "breakout", name: "STATE A", dimensions: "38' x 29' x 12'", floor: "8th Floor" },
      { kind: "breakout", name: "STATE B", dimensions: "38' x 29' x 12'", floor: "8th Floor" },
    ],
    // v2 numbered-breakout headers carrying a trailing floor / placeholder words
    consultants: [
      { kind: "gs", name: "GRAND BALLROOM A/B", dimensions: null, floor: null },
      { kind: "breakout", name: "DELAWARE", dimensions: null, floor: "7th Floor" },
      { kind: "breakout", name: "LASALLE", dimensions: null, floor: "7th Floor" },
      { kind: "breakout", name: "WALTON", dimensions: null, floor: "7th Floor" },
      { kind: "breakout", name: "STATE B", dimensions: null, floor: "8th Floor" },
      { kind: "breakout", name: "BALLROOM C", dimensions: null, floor: null },
    ],
    // ria / redefining-fi: these STALE 2026-06-18 fixtures predate Doug adding an
    // inline GENERAL SESSION header — their GS venue only lives in a separate row, so
    // they correctly stay "General Session". The LIVE sheets now use the inline header
    // (locked by the "#1a inline GENERAL SESSION header" suite below), which is why the
    // separate-ROOM-DIMENSIONS-row "#1b" is obsolete. Breakouts are already clean.
    ria: [
      { kind: "gs", name: "General Session", dimensions: null, floor: null },
      { kind: "breakout", name: "DRAWING ROOM A", dimensions: null, floor: null },
      { kind: "breakout", name: "DRAWING ROOM B", dimensions: null, floor: null },
    ],
    "redefining-fi": [
      { kind: "gs", name: "General Session", dimensions: null, floor: null },
      { kind: "breakout", name: "LASALLE A", dimensions: null, floor: null },
      { kind: "breakout", name: "WALTON ROOM", dimensions: null, floor: null },
    ],
    // east-coast (v1 legacy): the GS block is headed by the venue cell
    // "MABEL 1\nAPPROXIMATELY 60' x 45'" (no GENERAL SESSION label), so the GS room
    // ADOPTS that name + dims. The same-named MABEL 1 BREAKOUT (the day-1&2 reuse) has
    // DISTINCT AV (BO Video "Projector & Screen" ≠ the GS Eiki rig), so it is KEPT as a
    // separate room — losslessly — rather than absorbed into the GS room. LAUDERDALE stays.
    "east-coast": [
      { kind: "gs", name: "MABEL 1", dimensions: "60' x 45'", floor: null },
      { kind: "breakout", name: "MABEL 1", dimensions: "60' x 45'", floor: null },
      { kind: "breakout", name: "LAUDERDALE 1, 2, 3", dimensions: null, floor: null },
    ],
  };

  for (const [slug, expected] of Object.entries(EXPECTED)) {
    it(`${slug}: gs/breakout rooms split into venue name + dimensions + floor`, () => {
      expect(triples(slug)).toEqual(expected);
    });
  }
});

// Regression lock — the LIVE v2 sheets (redefining/ria/consultants) have since moved
// their GS venue into an inline "GENERAL SESSION\nNAME\nDIMS\nFLOOR" header cell
// (verified against the live INFO tabs 2026-06-23 via gsheets MCP) — a format NO
// committed fixture exercises (those are stale 2026-06-18 snapshots), but which #1a's
// parseGsRoom + splitRoomHeader MUST keep parsing. This pins it so a future refactor
// can't silently regress live parsing. It's also why the separate-ROOM-DIMENSIONS-row
// "#1b" is obsolete: no live sheet uses that shape anymore. The exporter flattens the
// cell's newlines to spaces and column-duplicates it.
describe("exporter fidelity — #1a inline GENERAL SESSION header (live v2 format)", () => {
  const cases: Array<
    [string, string, { name: string; dimensions: string | null; floor: string | null }]
  > = [
    [
      "redefining",
      "GENERAL SESSION LAKEVIEW BALLROOM 61' x 55' x 11' 7th Floor",
      { name: "LAKEVIEW BALLROOM", dimensions: "61' x 55' x 11'", floor: "7th Floor" },
    ],
    [
      "ria",
      "GENERAL SESSION SALON ABCD 41' x 73' x 13'",
      { name: "SALON ABCD", dimensions: "41' x 73' x 13'", floor: null },
    ],
    [
      "consultants",
      "GENERAL SESSION GRAND BALLROOM A/B A/B: 82' x 63' x 14' 8th Floor",
      { name: "GRAND BALLROOM A/B", dimensions: "A/B: 82' x 63' x 14'", floor: "8th Floor" },
    ],
  ];
  for (const [slug, header, want] of cases) {
    it(`${slug}: inline GS header splits to venue name + dims + floor`, () => {
      const md = [`| ${header} | ${header} |`, "| :---: | :---: |", "| GS Setup | x |"].join("\n");
      const gs = parseRooms(md, "v2").filter((r) => r.kind === "gs");
      expect(gs).toHaveLength(1);
      expect({ name: gs[0]!.name, dimensions: gs[0]!.dimensions, floor: gs[0]!.floor }).toEqual(
        want,
      );
    });
  }
});

// Adversarial-review (Codex) regressions for the east-coast venue-headed-GS fix.
describe("exporter fidelity — east-coast venue-headed GS: adversarial regressions", () => {
  it("a LOSSLESS-SUBSET same-name breakout is absorbed (its gs-absent field merges in, one room)", () => {
    // MABEL 2 is headed as the GS venue AND reused as a day-2 breakout whose only populated
    // field (BO Video) is ABSENT in the GS room — a lossless subset → absorb into the GS
    // room (video merged in), one room. (Codex HIGH part 1: never drop a populated value.)
    const md = [
      "| MABEL 2&#10;APPROXIMATELY 30' x 20' | MABEL 2&#10;APPROXIMATELY 30' x 20' |",
      "| :---: | :---: |",
      "| GS Setup | Theater |",
      "| GS Audio | (2) Speakers |",
      "",
      "| MABEL 2&#10;DAY 2 | MABEL 2&#10;DAY 2 |",
      "| :---: | :---: |",
      "| BO Video | (1) Projector & Screen |",
    ].join("\n");
    const m = parseRooms(md, "v1").filter((r) => /MABEL 2/i.test(r.name));
    expect(m, "subset breakout absorbed → one MABEL 2 room").toHaveLength(1);
    expect(m[0]!.kind).toBe("gs");
    expect(m[0]!.audio).toBe("(2) Speakers"); // GS field kept
    expect(m[0]!.video, "breakout's gs-absent field merged in, not dropped").toBe(
      "(1) Projector & Screen",
    );
  });

  it("a CONFLICTING same-name breakout is KEPT as a separate room (its distinct value survives)", () => {
    // MABEL 3's day-2 breakout BO Video differs from the GS Video — a conflict, so the
    // breakout is NOT absorbed (that would drop one of the two values); both rooms are
    // kept and BOTH videos survive. (Codex HIGH part 2: fill-null merge still dropped the
    // conflicting breakout value.)
    const md = [
      "| MABEL 3&#10;APPROXIMATELY 30' x 20' | MABEL 3&#10;APPROXIMATELY 30' x 20' |",
      "| :---: | :---: |",
      "| GS Setup | Theater |",
      "| GS Video | (2) Eiki Projectors |",
      "",
      "| MABEL 3&#10;DAY 2 | MABEL 3&#10;DAY 2 |",
      "| :---: | :---: |",
      "| BO Video | (1) Projector & Screen |",
    ].join("\n");
    const m = parseRooms(md, "v1").filter((r) => /MABEL 3/i.test(r.name));
    expect(m, "conflict → two MABEL 3 rooms, not one").toHaveLength(2);
    const gs = m.find((r) => r.kind === "gs")!;
    const bo = m.find((r) => r.kind === "breakout")!;
    expect(gs.video).toBe("(2) Eiki Projectors"); // GS value intact
    expect(bo.video, "breakout's conflicting value survives, not dropped").toBe(
      "(1) Projector & Screen",
    );
  });

  it("a label-only metadata row above GS Setup is NOT a venue header (stays General Session)", () => {
    // A trimmed single-cell DETAILS label ("| Fonts |", value column empty) directly above
    // GS Setup must NOT become the GS room name. (Codex MEDIUM: real raw-fixture false
    // positive — 2025-04-asset-mgmt-cfo-coo named its GS room "Fonts".)
    for (const label of ["Fonts", "Test Pattern", "Staff Office Room"]) {
      const md = [`| ${label} |`, "| :---: |", "| GS Setup | Theater |"].join("\n");
      const gs = parseRooms(md, "v1").filter((r) => r.kind === "gs");
      expect(gs, `${label} → 1 gs room`).toHaveLength(1);
      expect(gs[0]!.name, `"${label}" must not become the GS room name`).toBe("General Session");
    }
  });
});
