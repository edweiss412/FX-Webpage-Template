// tests/parser/crewSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/crew";
import { buildCol0HeaderRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("crew SECTION_HEADER_TOKENS", () => {
  it("exports exactly CREW and TECH", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(["CREW", "TECH"]);
  });
  it("factory-derived matchers reproduce the original accepted set", () => {
    const crewRe = buildCol0HeaderRe(["CREW"]);
    const techRe = buildCol0HeaderRe(["TECH"]);
    expect(crewRe.test("| CREW | NAME |")).toBe(true);
    expect(techRe.test("| TECH | NAME |")).toBe(true);
    expect(crewRe.test("| crew |")).toBe(false); // case-sensitive preserved
    expect(crewRe.test("| CREWS |")).toBe(false); // whole-cell preserved
  });
});
