// tests/parser/agendaSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser";
import { buildCol0HeaderAltRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("index.ts agenda SECTION_HEADER_TOKENS", () => {
  it("exports AGENDA + AGENDA LINK", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(["AGENDA", "AGENDA LINK"]);
  });
  it("factory alt-matcher accepts the same label set as the live agenda regex", () => {
    const re = buildCol0HeaderAltRe(SECTION_HEADER_TOKENS, { caseInsensitive: true, allowLeadingWs: true });
    expect(re.test("| AGENDA | https://x |")).toBe(true);
    expect(re.test("| AGENDA LINK - Day 1 | https://x |")).toBe(true);
    expect(re.test("|  AGENDA  | v |")).toBe(true);
  });
});
