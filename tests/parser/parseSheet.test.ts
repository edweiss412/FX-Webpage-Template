import { parseSheet, type ParsedSheet } from "@/lib/parser";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("parseSheet across fixture corpus (AC-1.1, AC-1.2)", () => {
  const dir = "fixtures/shows/raw";
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    it(`${f}`, () => {
      const r: ParsedSheet = parseSheet(readFileSync(`${dir}/${f}`, "utf8"), f);
      expect(r.hardErrors).toEqual([]);
      expect(r.show.title.length).toBeGreaterThan(0);
      expect(
        [r.show.dates.travelIn, r.show.dates.set, r.show.dates.showDays[0]].some(Boolean),
      ).toBe(true);
      expect(r.crewMembers.length).toBeGreaterThan(0);
      expect(r.crewMembers[0]!.name.length).toBeGreaterThan(0);
      expect(r.rooms.length).toBeGreaterThan(0);
      // ParsedSheet contract: embeddedImages is ALWAYS empty at parse time
      expect(r.diagrams.embeddedImages).toEqual([]);
      expect(r.diagrams.linkedFolderItems).toEqual([]);
      if (r.openingReel) {
        expect(r.openingReel).not.toHaveProperty("drive_modified_time");
        expect(r.openingReel).not.toHaveProperty("headRevisionId");
        expect(r.openingReel).not.toHaveProperty("mimeType");
      }
    });
  }
});

describe("parseSheet title regression — no column-header artifacts (Task 1.13)", () => {
  const KNOWN_COLUMN_HEADERS = [
    "Main",
    "Name",
    "Details",
    "Setup",
    "BO Setup",
    "GS Setup",
    "Secondary",
    "Event Name",
    "Event Name:",
    "Title of Event",
  ];

  it("does not extract column headers as show.title across entire fixture corpus", () => {
    const dir = "fixtures/shows/raw";
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const r = parseSheet(readFileSync(`${dir}/${f}`, "utf8"), f);
      expect(
        KNOWN_COLUMN_HEADERS,
        `${f}: title "${r.show.title}" is a column header`,
      ).not.toContain(r.show.title);
      // Empty string is acceptable for fixtures with no extractable title;
      // any non-empty title must be longer than any single column-header word.
      if (r.show.title.length > 0) {
        expect(
          r.show.title.length,
          `${f}: title "${r.show.title}" is suspiciously short`,
        ).toBeGreaterThan(2);
      }
    }
  });
});

// ── Codex round-1 finding: agenda_links + schedule_phases populated ──────────
describe("parseSheet — agenda_links extraction (Codex round-1 finding)", () => {
  it("2025-03-dci-rpas-central has at least 2 agenda links (DCI + RPAS)", () => {
    const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
    const r = parseSheet(md, "2025-03-dci-rpas-central.md");
    expect(r.show.agenda_links.length).toBeGreaterThanOrEqual(2);
    const labels = r.show.agenda_links.map((a) => a.label);
    expect(labels.some((l) => /DCI/i.test(l))).toBe(true);
    expect(labels.some((l) => /RPAS/i.test(l))).toBe(true);
  });

  it("2025-05-redefining-fixed-income has at least 1 agenda link", () => {
    const md = readFileSync(
      "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
      "utf8",
    );
    const r = parseSheet(md, "2025-05-redefining-fixed-income-private-credit.md");
    expect(r.show.agenda_links.length).toBeGreaterThanOrEqual(1);
  });
});

describe("parseSheet — schedule_phases derivation from dates (M1 baseline)", () => {
  it("2026-03-rpas-central-four-seasons has phases for set/showDays/travelOut", () => {
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const r = parseSheet(md, "2026-03-rpas-central-four-seasons.md");
    const phases = r.show.schedule_phases;
    // Per Task 1.5 fixture-grounded: set=2026-03-23, showDays=['2026-03-24','2026-03-25'], travelOut=2026-03-26
    expect(phases["2026-03-23"]).toEqual(["Load In", "Set"]);
    expect(phases["2026-03-24"]).toEqual(["Show"]);
    expect(phases["2026-03-25"]).toEqual(["Show", "Strike"]); // last show day → compound
    expect(phases["2026-03-26"]).toEqual(["Load Out"]);
  });

  it("schedule_phases is non-empty for every fixture with dates", () => {
    const dir = "fixtures/shows/raw";
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const r = parseSheet(readFileSync(`${dir}/${f}`, "utf8"), f);
      const phaseCount = Object.keys(r.show.schedule_phases).length;
      const hasAnyDate = !!(r.show.dates.set || r.show.dates.showDays[0] || r.show.dates.travelOut);
      if (hasAnyDate) {
        expect(phaseCount, `${f}: schedule_phases empty despite having dates`).toBeGreaterThan(0);
      }
    }
  });
});
