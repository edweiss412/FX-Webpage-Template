// tests/parser/datesSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/dates";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("dates SECTION_HEADER_TOKENS", () => {
  it("exports exactly DATES", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["DATES"]);
  });
  it("matcher accepts DATES (any casing/spacing) and rejects near-misses", () => {
    expect(matchesSectionHeader("dates", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("DATE", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
