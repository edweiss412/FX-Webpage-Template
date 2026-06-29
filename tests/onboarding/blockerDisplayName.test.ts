import { describe, it, expect } from "vitest";
import { parsedShowTitle } from "@/lib/onboarding/blockerDisplayName";

describe("parsedShowTitle", () => {
  it("returns the title for a real ParseResult-shaped object", () => {
    expect(parsedShowTitle({ show: { title: "Consultants Roundtable" } })).toBe(
      "Consultants Roundtable",
    );
  });

  it("decodes a legacy double-encoded JSON string and returns the title", () => {
    const encoded = JSON.stringify({ show: { title: "East Coast 2025" } });
    expect(parsedShowTitle(encoded)).toBe("East Coast 2025");
  });

  it.each([
    ["missing show", { crew: [] }],
    ["empty show", { show: {} }],
    ["empty-string title", { show: { title: "" } }],
    ["whitespace title", { show: { title: "   " } }],
    ["non-string title", { show: { title: 42 } }],
    ["non-JSON string", "1N1PKmhcvLAn"],
    ["null", null],
    ["undefined", undefined],
  ])("returns null and does not throw for %s", (_label, input) => {
    expect(() => parsedShowTitle(input)).not.toThrow();
    expect(parsedShowTitle(input)).toBeNull();
  });
});
