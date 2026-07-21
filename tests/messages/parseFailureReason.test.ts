import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PARSE_FAILURE_ALLOWLIST,
  parseFailureReasonTitle,
} from "@/lib/messages/parseFailureReason";

const CASES: Array<[string, string]> = [
  ["MI-1_VERSION_DETECTION_FAILED", "Unrecognized show template"],
  ["MI-2_EMPTY_TITLE", "Show title missing"],
  ["MI-3_NO_VALID_DATES", "No readable show dates"],
  ["MI-4_NO_CREW", "No crew rows"],
  ["MI-5_NO_ROOMS", "No rooms found"],
  ["MI-5a_DUPLICATE_CREW_NAME", "Two crew rows share a name"],
  ["MI-5b_DUPLICATE_CREW_EMAIL", "Two crew rows share an email"],
  ["VERSION_AMBIGUOUS", "Unsure which show template this is"],
];

describe("parseFailureReasonTitle", () => {
  it.each(CASES)("resolves %s to its catalog title", (code, title) =>
    expect(parseFailureReasonTitle(code)).toBe(title),
  );
  it("the allowlist is exactly these 8 codes", () =>
    expect([...PARSE_FAILURE_ALLOWLIST].sort()).toEqual(CASES.map((c) => c[0]).sort()));
  it("returns null for PARSE_HARD_FAIL, non-allowlisted, unknown, null, undefined", () => {
    for (const c of ["PARSE_HARD_FAIL", "SHEET_UNAVAILABLE", "NOT_A_CODE"] as const)
      expect(parseFailureReasonTitle(c)).toBeNull();
    expect(parseFailureReasonTitle(null)).toBeNull();
    expect(parseFailureReasonTitle(undefined)).toBeNull();
  });
  it("no resolved title contains an em dash", () => {
    for (const code of PARSE_FAILURE_ALLOWLIST)
      expect(parseFailureReasonTitle(code)).not.toMatch(/—/);
  });
  it("resolves via lookup, not MESSAGE_CATALOG directly (invariant 5)", () => {
    const src = readFileSync("lib/messages/parseFailureReason.ts", "utf8");
    expect(src).not.toMatch(/MESSAGE_CATALOG/);
    expect(src).toMatch(/messageFor/);
  });
});
