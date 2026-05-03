import { parseSheet, type ParsedSheet } from "@/lib/parser";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("parseSheet across fixture corpus (AC-1.1, AC-1.2)", () => {
  const dir = "fixtures/shows/raw";
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    it(`${f}`, () => {
      const r: ParsedSheet = parseSheet(readFileSync(`${dir}/${f}`, "utf8"));
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
