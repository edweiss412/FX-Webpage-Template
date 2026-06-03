// @vitest-environment node
import { describe, expect, test } from "vitest";
import { formatBoundedCount } from "@/lib/format/count";

describe("formatBoundedCount", () => {
  test("returns the number as a string below 100", () => {
    expect(formatBoundedCount(0)).toBe("0");
    expect(formatBoundedCount(1)).toBe("1");
    expect(formatBoundedCount(99)).toBe("99");
  });
  test("caps at 99+ from 100 upward", () => {
    expect(formatBoundedCount(100)).toBe("99+");
    expect(formatBoundedCount(250)).toBe("99+");
  });
  test("defensive on bad input (negative / NaN / non-finite)", () => {
    expect(formatBoundedCount(-5)).toBe("0");
    expect(formatBoundedCount(Number.NaN)).toBe("0");
    expect(formatBoundedCount(Number.POSITIVE_INFINITY)).toBe("99+");
  });
});
