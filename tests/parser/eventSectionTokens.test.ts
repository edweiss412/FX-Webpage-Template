// tests/parser/eventSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/event";
import { buildCol0HeaderRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

const ORIGINAL =
  /^\|\s*(EVENT\s+DETAILS|DETAILS(?:\/Room\s+Diagram)?|GS\s+DETAILS(?:\s+\(FOR\s+BOTH\))?)\s*[|]/im;

describe("event SECTION_HEADER_TOKENS", () => {
  it("exports the 5 canonical variants", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(
      ["DETAILS", "DETAILS/ROOM DIAGRAM", "EVENT DETAILS", "GS DETAILS", "GS DETAILS (FOR BOTH)"].sort(),
    );
  });
  it("factory regex matches EXACTLY the original's accepted set", () => {
    const rebuilt = buildCol0HeaderRe(SECTION_HEADER_TOKENS, { caseInsensitive: true });
    const accepted = [
      "| EVENT DETAILS |",
      "| DETAILS |",
      "| DETAILS/Room Diagram |",
      "| GS DETAILS |",
      "| GS DETAILS (FOR BOTH) |",
      "| gs details (for both) |", // case-insensitive
      "| EVENT  DETAILS |", // multi-space
    ];
    const rejected = ["| EVENTS |", "| DETAIL |", "| GS |", "| ROOM DIAGRAM |"];
    for (const s of accepted) {
      expect(rebuilt.test(s), `rebuilt should accept ${s}`).toBe(true);
      expect(ORIGINAL.test(s), `original should accept ${s}`).toBe(true);
    }
    for (const s of rejected) {
      expect(rebuilt.test(s), `rebuilt should reject ${s}`).toBe(false);
      expect(ORIGINAL.test(s), `original should reject ${s}`).toBe(false);
    }
  });
});
