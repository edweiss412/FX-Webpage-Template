import { describe, it, expect } from "vitest";
import { dimsFullRe, dimsStartRe, DIMS_SEP } from "@/lib/parser/blocks/_dimsToken";

describe("DIMS_FULL capture (spec §C canonical table)", () => {
  const admit: [string, string][] = [
    ["50' x 40'", "50' x 40'"],
    ["50'x40'", "50'x40'"],
    ["50′×45′", "50′×45′"],
    ["50ft x 40ft", "50ft x 40ft"],
    ["50 FT X 40'", "50 FT X 40'"],
    ["50 x 40", "50 x 40"],
    ["120x80", "120x80"],
    ["8' x 10'", "8' x 10'"],
    ["APPROXIMATELY 60' x 45'", "60' x 45'"],
    ["TOTAL 120 x 80", "120 x 80"],
    ["2026' x 40'", "2026' x 40'"],
    ["50' x 40' x 30'", "50' x 40' x 30'"],
    ["50 x 40 x 1200", "50 x 40"], // partial-capture-then-drop
  ];
  it.each(admit)("captures %s -> %s", (input, cap) => {
    expect(dimsFullRe().exec(input)?.[1]).toBe(cap);
  });
  const reject = [
    "5 x 8",
    "3x4",
    "2026 x 40",
    "1200x50",
    "Box40x2",
    "Room4x4",
    "120x80B",
    "SKU 40x20A",
    "50 x 1200",
    "Box",
    "Matrix",
    "50' x",
  ];
  it.each(reject)("rejects %s", (input) => {
    expect(dimsFullRe().exec(input)).toBeNull();
  });
});

describe("DIMS_START (unanchored contains)", () => {
  const reject = ["5 x 8", "2026 x 40", "1200x50", "Box40x2", "120x80B", "SKU 40x20A", "50 x 1200"];
  it.each(reject)("rejects %s", (s) => expect(dimsStartRe(false).exec(s)).toBeNull());
  const admit = ["50' x 40'", "50 x 40", "120x80", "2026' x 40'", "50' x"];
  it.each(admit)("admits %s", (s) => expect(dimsStartRe(false).exec(s)).not.toBeNull());
});

describe("DIMS_SEP", () => {
  it("exists", () => expect(DIMS_SEP).toBe("[x×]"));
});
