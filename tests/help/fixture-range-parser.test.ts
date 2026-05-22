import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseFixtureDateRange,
  parseFixtureDateRangeFromPath,
} from "@/scripts/help-screenshots-fixture-range";

const rawDir = join(process.cwd(), "fixtures/shows/raw");
const pdfOnlyDir = join(process.cwd(), "fixtures/shows/pdf-only");

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("help screenshot fixture-range parser (Task F.2 / test #14)", () => {
  it("parses the known RPAS Central raw INFO DATES range", () => {
    const source = readFileSync(
      join(rawDir, "2026-03-rpas-central-four-seasons.md"),
      "utf8",
    );

    const range = parseFixtureDateRange(source);

    expect(isoDate(range.earliest)).toBe("2026-03-22");
    expect(isoDate(range.latest)).toBe("2026-03-26");
  });

  it("parses every raw fixture without throwing", () => {
    const fixtureFiles = readdirSync(rawDir)
      .filter((file) => file.endsWith(".md"))
      .sort();

    expect(fixtureFiles.length).toBeGreaterThan(0);
    for (const file of fixtureFiles) {
      const source = readFileSync(join(rawDir, file), "utf8");
      const range = parseFixtureDateRange(source);
      expect(range.earliest.getTime(), file).toBeLessThanOrEqual(range.latest.getTime());
    }
  });

  it("parses pdf-only split INFO files from disk", () => {
    const infoPath = join(pdfOnlyDir, "2025-11-sub-advisory-central__INFO.md");
    expect(existsSync(infoPath)).toBe(true);

    const range = parseFixtureDateRangeFromPath(infoPath);

    expect(isoDate(range.earliest)).toBe("2025-11-02");
    expect(isoDate(range.latest)).toBe("2025-11-05");
  });

  it("parses every pdf-only INFO split file without throwing", () => {
    const infoFiles = readdirSync(pdfOnlyDir)
      .filter((file) => file.endsWith("__INFO.md"))
      .sort();

    expect(infoFiles.length).toBeGreaterThan(0);
    for (const file of infoFiles) {
      const range = parseFixtureDateRangeFromPath(join(pdfOnlyDir, file));
      expect(range.earliest.getTime(), file).toBeLessThanOrEqual(range.latest.getTime());
    }
  });
});
