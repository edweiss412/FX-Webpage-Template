// tests/parser/venueSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/venue";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("venue SECTION_HEADER_TOKENS", () => {
  it("exports exactly VENUE (NOT VENUES — registry alias only)", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["VENUE"]);
  });
  it("opener matches VENUE only", () => {
    expect(matchesSectionHeader("VENUE", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("VENUES", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
