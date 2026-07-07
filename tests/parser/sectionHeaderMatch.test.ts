// tests/parser/sectionHeaderMatch.test.ts
import { describe, it, expect } from "vitest";
import {
  buildCol0HeaderRe,
  buildCol0HeaderAltRe,
  matchesSectionHeader,
} from "@/lib/parser/blocks/_sectionHeaderMatch";

describe("buildCol0HeaderRe", () => {
  it("reproduces the case-sensitive bare crew matcher `/^\\|\\s*CREW\\s*\\|/m`", () => {
    const re = buildCol0HeaderRe(["CREW"]);
    expect(re.test("| CREW | NAME |")).toBe(true);
    expect(re.test("|CREW|")).toBe(true);
    expect(re.test("| crew | NAME |")).toBe(false); // case-sensitive by default
    expect(re.test("| CREW MEMBER | x |")).toBe(false); // whole-cell, not prefix
    // multiline: matches a header on a non-first line
    expect(re.test("intro\n| CREW | NAME |")).toBe(true);
  });

  it("orders alternation longest-first so a short token cannot shadow a longer one", () => {
    const re = buildCol0HeaderRe(["GS DETAILS", "GS DETAILS (FOR BOTH)"], { caseInsensitive: true });
    expect(re.test("| GS DETAILS (FOR BOTH) |")).toBe(true);
    expect(re.test("| GS DETAILS |")).toBe(true);
  });

  it("collapses literal spaces to \\s+ (tolerates multi-space headers) and escapes regex metachars", () => {
    const re = buildCol0HeaderRe(["EVENT DETAILS", "DETAILS/ROOM DIAGRAM"], { caseInsensitive: true });
    expect(re.test("| EVENT  DETAILS |")).toBe(true); // double space
    expect(re.test("| Details/Room Diagram |")).toBe(true); // case-insensitive + slash literal
  });

  it("caseInsensitive + allowLeadingWs opts widen the match", () => {
    const re = buildCol0HeaderRe(["HOTEL"], { caseInsensitive: true, allowLeadingWs: true });
    expect(re.test("   | hotel | x |")).toBe(true);
  });
});

describe("buildCol0HeaderAltRe", () => {
  it("admits a trailing suffix after the token before the closing pipe", () => {
    const re = buildCol0HeaderAltRe(["AGENDA LINK", "AGENDA"], { caseInsensitive: true });
    expect(re.test("| AGENDA LINK - Day 1 | https://x |")).toBe(true);
    expect(re.test("| AGENDA | https://x |")).toBe(true);
  });
});

describe("matchesSectionHeader", () => {
  it("equality on normalizeHeader (upper, single-spaced, trimmed)", () => {
    expect(matchesSectionHeader("  venue ", ["VENUE"])).toBe(true);
    expect(matchesSectionHeader("VENUES", ["VENUE"])).toBe(false);
    expect(matchesSectionHeader("Event  Details", ["EVENT DETAILS"])).toBe(true);
  });
});
