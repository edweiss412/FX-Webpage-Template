import { describe, expect, test } from "vitest";
import { parseSampleRate } from "@/lib/observe/parseSampleRate";

describe("parseSampleRate", () => {
  test("undefined/empty/non-numeric/negative → 0", () => {
    for (const v of [undefined, "", "  ", "abc", "-1", "-0.5", "NaN"]) {
      expect(parseSampleRate(v)).toBe(0);
    }
  });
  test("> 1 clamps to 1", () => {
    expect(parseSampleRate("2")).toBe(1);
    expect(parseSampleRate("1.5")).toBe(1);
  });
  test("in-range passes through", () => {
    expect(parseSampleRate("0")).toBe(0);
    expect(parseSampleRate("0.1")).toBe(0.1);
    expect(parseSampleRate("1")).toBe(1);
  });
});
