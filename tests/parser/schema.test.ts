import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifyVersion, detectVersion, MIN_ABS, MIN_MARGIN, MIN_BLOCKS } from "@/lib/parser/schema";

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

const V4_FIXTURES = [
  "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
  "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
  "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
];
const V2_FIXTURES = [
  "fixtures/shows/raw/2024-05-east-coast-family-office.md",
  "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
  "fixtures/shows/raw/2025-03-dci-rpas-central.md",
  "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
  "fixtures/shows/raw/2025-06-ria-investment-forum.md",
  "fixtures/shows/raw/2025-10-consultants-roundtable.md",
];

describe("classifyVersion", () => {
  it("constants are the spec values", () => {
    expect([MIN_ABS, MIN_MARGIN, MIN_BLOCKS]).toEqual([2, 2, 2]);
  });

  it("classifies every golden v4 fixture as confident v4 (no false staging)", () => {
    for (const f of V4_FIXTURES) {
      const v = classifyVersion(readFileSync(f, "utf8"));
      expect(v.status, f).toBe("confident");
      if (v.status === "confident") expect(v.version, f).toBe("v4");
    }
  });

  it("classifies every golden v2 fixture as confident v2 (no false staging)", () => {
    for (const f of V2_FIXTURES) {
      const v = classifyVersion(readFileSync(f, "utf8"));
      expect(v.status, f).toBe("confident");
      if (v.status === "confident") expect(v.version, f).toBe("v2");
    }
  });

  it("stays confident v4 when Contact Office is renamed (multi-marker resilience, fixes #2)", () => {
    const md = readFileSync(V4_FIXTURES[0]!, "utf8").replace(/Contact Office/gi, "Office Contact");
    const v = classifyVersion(md);
    expect(v.status).toBe("confident");
    if (v.status === "confident") expect(v.version).toBe("v4");
  });

  it("flags AMBIGUOUS when two markers come from a single block (block diversity)", () => {
    const v2SameBlock = classifyVersion("| GS SET TIME | 10:00 |\n| GS SETUP | 9:00 |");
    expect(v2SameBlock.status).toBe("ambiguous");
    const v4SameBlock = classifyVersion("| RENTAL PICKUP | x |\n| RENTAL RETURN | y |");
    expect(v4SameBlock.status).toBe("ambiguous");
  });

  it("stays confident when only one block is lost (block redundancy)", () => {
    const v2 = classifyVersion(
      "| GS SET TIME | a |\n| GS SETUP | a |\n| BO SET TIME | b |\n| BO SETUP | b |",
    );
    expect(v2.status).toBe("confident");
    if (v2.status === "confident") expect(v2.version).toBe("v2");
    const v4 = classifyVersion(
      "| RENTAL PICKUP | a |\n| RENTAL RETURN | a |\n| LOAD AT WAREHOUSE | b |",
    );
    expect(v4.status).toBe("confident");
    if (v4.status === "confident") expect(v4.version).toBe("v4");
  });

  it("flags AMBIGUOUS for a novel template (no known markers)", () => {
    const v = classifyVersion("| Some Label | value |\n| Another | thing |");
    expect(v.status).toBe("ambiguous");
    if (v.status === "ambiguous") expect(v.bestGuess).toBe("v1");
  });

  it("resolution round-trip: an ambiguous sheet becomes confident once a second block's markers are restored (spec §7.1/§8)", () => {
    const ambiguous = "| GS SET TIME | 10:00 |\n| GS SETUP | 9:00 |"; // 1 block
    expect(classifyVersion(ambiguous).status).toBe("ambiguous");
    const restored = ambiguous + "\n| BO SET TIME | 8:00 |\n| BO SETUP | 7:00 |"; // +2nd block
    const v = classifyVersion(restored);
    expect(v.status).toBe("confident");
    if (v.status === "confident") expect(v.version).toBe("v2");
  });

  it("does NOT score markers that appear in value cells (columns 1+)", () => {
    const v = classifyVersion("| Real Label | GS SET TIME | more | BO SET TIME |\n| x | y |");
    expect(v.status).toBe("ambiguous");
  });

  it("does NOT score markers in a row whose physical column 0 is blank", () => {
    const v = classifyVersion("| | GS SET TIME |\n| | BO SET TIME |");
    expect(v.status).toBe("ambiguous");
  });

  it("does NOT score a marker embedded as a substring of a larger col-0 cell", () => {
    const v = classifyVersion("| NOTES: GS SET TIME WAS LATE | x |\n| ALSO BO SETUP HAPPENED | y |");
    expect(v.status).toBe("ambiguous");
  });

  it("threshold boundary: score 2 / margin 2 / blocks 2 is confident", () => {
    const v = classifyVersion("| CONTACT OFFICE | x |\n| RENTAL PICKUP | y |");
    expect(v.status).toBe("confident");
    if (v.status === "confident") expect(v.version).toBe("v4");
  });

  it("returns not_a_sheet for empty and non-table input", () => {
    expect(classifyVersion("").status).toBe("not_a_sheet");
    expect(classifyVersion("# A doc\n\nno pipe tables here").status).toBe("not_a_sheet");
  });
});
