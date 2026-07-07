// tests/parser/transportSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/transport";
import { buildCol0HeaderRe, buildCol0HeaderAltRe } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("transport SECTION_HEADER_TOKENS", () => {
  it("exports TRANSPORTATION + DRIVER", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(["DRIVER", "TRANSPORTATION"]);
  });
  it("col0 identity pre-checks are SUPERSETS of the retained /im regexes (case + slash suffix)", () => {
    // Live :172 col0 is `TRANSPORTATION(?:\/[^|]*)?` — accepts a slash suffix, so the
    // pre-check MUST allow a trailing suffix (AltRe), not whole-cell (plan R2 finding 1).
    const tRe = buildCol0HeaderAltRe(["TRANSPORTATION"], { caseInsensitive: true });
    expect(tRe.test("| TRANSPORTATION | TRANSPORTATION | PHONE | EMAIL |")).toBe(true);
    expect(tRe.test("| transportation | transportation | phone | email |")).toBe(true); // case superset
    expect(tRe.test("| TRANSPORTATION/Ground | TRANSPORTATION | PHONE | EMAIL |")).toBe(true); // slash-suffix superset
    // v1 Driver header is whole-cell /^\|\s*Driver\s*\|/im — whole-cell case-insensitive is exact.
    expect(
      buildCol0HeaderRe(["DRIVER"], { caseInsensitive: true }).test("| Driver | Name | Phone |"),
    ).toBe(true);
  });
});
