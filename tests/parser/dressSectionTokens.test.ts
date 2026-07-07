// tests/parser/dressSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/dress";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("dress SECTION_HEADER_TOKENS", () => {
  it("exports exactly DRESS", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["DRESS"]);
  });
  it("matches DRESS, rejects near-miss", () => {
    expect(matchesSectionHeader("Dress", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("DRESSES", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
