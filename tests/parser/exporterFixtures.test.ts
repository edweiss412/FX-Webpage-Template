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
