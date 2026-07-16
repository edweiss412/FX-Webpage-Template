// tests/visibility/financialsFlag.test.ts
// FINANCIALS role flag — render-predicate gate (spec 2026-07-15-extend-role-scope-vocab §4.1).
import { describe, expect, test } from "vitest";
import {
  financialsVisible,
  audioScopeVisible,
  videoScopeVisible,
  lightingScopeVisible,
} from "@/lib/visibility/scopeTiles";

describe("FINANCIALS flag (spec §4.1)", () => {
  test("financialsVisible accepts FINANCIALS without admin/LEAD", () => {
    expect(financialsVisible(["FINANCIALS"], false)).toBe(true);
  });
  test("existing gates unchanged", () => {
    expect(financialsVisible([], false)).toBe(false);
    expect(financialsVisible(["LEAD"], false)).toBe(true);
    expect(financialsVisible([], true)).toBe(true);
    // FINANCIALS unlocks NOTHING else
    expect(audioScopeVisible(["FINANCIALS"])).toBe(false);
    expect(videoScopeVisible(["FINANCIALS"])).toBe(false);
    expect(lightingScopeVisible(["FINANCIALS"])).toBe(false);
  });
});
