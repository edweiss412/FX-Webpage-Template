import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectVersion } from "@/lib/parser/schema";

// Fixture paths (all paths relative to project root, loaded at test time)
const FIXTURE_V4 = "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md";
const FIXTURE_V2 = "fixtures/shows/raw/2025-03-dci-rpas-central.md";
// Note: 2024-05-east-coast-family-office.md has "Hotal Contact Info" (v2 marker) — used in v2 suite.
const FIXTURE_EAST_COAST = "fixtures/shows/raw/2024-05-east-coast-family-office.md";

describe("detectVersion", () => {
  describe("v4 detection", () => {
    // Verified: 2026-03-rpas-central-four-seasons.md line 6 has "Contact Office" row
    it("returns v4 when Contact Office row present (fixture-grounded)", () => {
      const md = readFileSync(FIXTURE_V4, "utf8");
      expect(detectVersion(md)).toBe("v4");
    });

    it("returns v4 for minimal markdown with Contact Office cell", () => {
      expect(detectVersion("| Contact Office | 555-1234 |")).toBe("v4");
    });
  });

  describe("v2 detection — typo-aware (MI-1 regression)", () => {
    // Verified: 2025-03-dci-rpas-central.md line 236 has "Hotal Contact Info" (typo).
    // The detector MUST resolve this via FIELD_ALIASES to venue.contact_info, which is
    // the v2 canonical marker. Without typo-awareness this fixture falls through to v1
    // (wrong field map, silent parse corruption).
    it("returns v2 for fixture with typo Hotal Contact Info — typo-aware regression", () => {
      const md = readFileSync(FIXTURE_V2, "utf8");
      expect(detectVersion(md)).toBe("v2");
    });

    it("returns v2 for minimal markdown with canonical Hotel Contact Info", () => {
      expect(detectVersion("| Hotel Contact Info | .. |")).toBe("v2");
    });

    it("returns v2 for minimal markdown with typo Hotal Contact Info", () => {
      expect(detectVersion("| Hotal Contact Info | .. |")).toBe("v2");
    });

    // Amendment 4: 2024-05-east-coast-family-office.md also has "Hotal Contact Info"
    // (line 23) — it is v2, not v1. Confirms the PULLED/INITAL removal (former v3 workaround)
    // did not break classification of this fixture.
    it("classifies 2024-05-east-coast as v2 (has Hotal Contact Info → venue.contact_info)", () => {
      const md = readFileSync(FIXTURE_EAST_COAST, "utf8");
      expect(detectVersion(md)).toBe("v2");
    });
  });

  describe("v1 fallback", () => {
    // v1 is reached only by sheets with markdown table syntax but neither v2 nor v4 markers.
    // No corpus fixture falls here — v1 is exercised by synthetic input only.
    it("returns v1 for markdown that looks like a sheet (has table) but no version markers", () => {
      expect(detectVersion("| DATES | |\n| :---: | :---: |\n| Travel | 5/13/24 |")).toBe("v1");
    });
  });

  describe("null for unrecognizable input", () => {
    it("returns null when no version markers and no table syntax", () => {
      expect(detectVersion("completely unrecognizable text")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(detectVersion("")).toBeNull();
    });
  });
});
