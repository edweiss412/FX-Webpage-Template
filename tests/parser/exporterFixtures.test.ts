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
