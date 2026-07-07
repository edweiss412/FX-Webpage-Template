// tests/parser/roomsSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/rooms";
import { KNOWN_SECTION_HEADERS, normalizeHeader } from "@/lib/parser/knownSections";

describe("rooms SECTION_HEADER_TOKENS", () => {
  it("exports the 4 banners rooms opens on (NOT LUNCH SESSION)", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(
      ["ADDITIONAL ROOM", "BREAKOUT", "GENERAL SESSION", "LUNCH ROOM"].sort(),
    );
    expect([...SECTION_HEADER_TOKENS]).not.toContain("LUNCH SESSION");
  });
  it("every exported banner is an exact registry member", () => {
    for (const t of SECTION_HEADER_TOKENS) {
      expect(KNOWN_SECTION_HEADERS.has(normalizeHeader(t))).toBe(true);
    }
  });
});
