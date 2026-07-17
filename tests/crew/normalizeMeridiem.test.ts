import { describe, expect, test } from "vitest";

import { normalizeMeridiem } from "@/lib/crew/normalizeMeridiem";

describe("normalizeMeridiem (D3)", () => {
  test("adds a single space and upper-cases the meridiem", () => {
    expect(normalizeMeridiem("9:00PM")).toBe("9:00 PM");
    expect(normalizeMeridiem("7:30am")).toBe("7:30 AM");
    expect(normalizeMeridiem("10:00Pm")).toBe("10:00 PM");
  });

  test("is idempotent on already-normalized values", () => {
    expect(normalizeMeridiem("8:00 AM")).toBe("8:00 AM");
    expect(normalizeMeridiem(normalizeMeridiem("9:00pm"))).toBe("9:00 PM");
  });

  test("normalizes a prefixed anchor value without touching the prefix", () => {
    expect(normalizeMeridiem("10/7 @ 9:00PM")).toBe("10/7 @ 9:00 PM");
  });

  test("preserves the window en-dash and normalizes both sides", () => {
    expect(normalizeMeridiem("7:30am–9:00PM")).toBe("7:30 AM–9:00 PM");
  });

  test("handles dotted meridiem and a bare hour", () => {
    expect(normalizeMeridiem("7:30 p.m.")).toBe("7:30 PM");
    expect(normalizeMeridiem("9am")).toBe("9 AM");
  });

  test("does NOT rewrite words that merely contain am/pm without a digit anchor", () => {
    expect(normalizeMeridiem("spam and eggs")).toBe("spam and eggs");
    expect(normalizeMeridiem("Ampitheater")).toBe("Ampitheater");
  });
});
