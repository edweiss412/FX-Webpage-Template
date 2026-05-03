import { parseSheet, type ParsedSheet } from "@/lib/parser";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Fixtures that genuinely contain no show title anywhere in the markdown
// (dual-show production with blank Title of Event and no Event Name: row).
const FIXTURES_WITHOUT_TITLE = new Set(["2025-03-dci-rpas-central.md"]);

describe("parseSheet across fixture corpus (AC-1.1, AC-1.2)", () => {
  const dir = "fixtures/shows/raw";
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    it(`${f}`, () => {
      const r: ParsedSheet = parseSheet(readFileSync(`${dir}/${f}`, "utf8"));
      expect(r.hardErrors).toEqual([]);
      if (!FIXTURES_WITHOUT_TITLE.has(f)) {
        expect(r.show.title.length).toBeGreaterThan(0);
      }
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
      const r = parseSheet(readFileSync(`${dir}/${f}`, "utf8"));
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
