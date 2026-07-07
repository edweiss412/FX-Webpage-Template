// tests/parser/clientSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/client";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("client SECTION_HEADER_TOKENS", () => {
  it("exports exactly CLIENT", () => {
    expect([...SECTION_HEADER_TOKENS]).toEqual(["CLIENT"]);
  });
  it("matches CLIENT, rejects near-miss", () => {
    expect(matchesSectionHeader("client", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("CLIENTS", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
