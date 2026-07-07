// tests/parser/hotelsSectionTokens.test.ts
import { describe, it, expect } from "vitest";
import { SECTION_HEADER_TOKENS } from "@/lib/parser/blocks/hotels";
import { buildCol0HeaderRe, matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("hotels SECTION_HEADER_TOKENS", () => {
  it("exports HOTEL + reservation/stay singular+plural (all registry members)", () => {
    expect([...SECTION_HEADER_TOKENS].sort()).toEqual(
      ["HOTEL", "HOTEL RESERVATION", "HOTEL RESERVATIONS", "HOTEL STAY", "HOTEL STAYS"].sort(),
    );
  });
  it("structured HOTEL matcher reproduces /^\\|\\s*HOTEL\\s*\\|/m", () => {
    const re = buildCol0HeaderRe(["HOTEL"]);
    expect(re.test("| HOTEL | RESERVATION #1 |")).toBe(true);
    expect(re.test("| HOTELS |")).toBe(false);
  });
  it("D1 detector matches all inline forms via matchesSectionHeader", () => {
    expect(matchesSectionHeader("Hotel Reservations", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("Hotel Stay", SECTION_HEADER_TOKENS)).toBe(true);
    expect(matchesSectionHeader("Get Hotel Reservations", SECTION_HEADER_TOKENS)).toBe(false);
  });
});
