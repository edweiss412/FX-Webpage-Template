import { describe, expect, test } from "vitest";
import { normalizeSnippet, hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";

describe("normalizeSnippet", () => {
  test("trims and collapses internal whitespace, preserves case", () => {
    expect(normalizeSnippet("  Storage   |   Row  ")).toBe("Storage | Row");
    expect(normalizeSnippet("A\t\nB")).toBe("A B");
    expect(normalizeSnippet("MixedCase")).toBe("MixedCase");
  });
});

describe("hasIgnorableSnippet", () => {
  test("true for a non-empty snippet, false for missing/blank", () => {
    expect(hasIgnorableSnippet({ rawSnippet: "Storage | x" })).toBe(true);
    expect(hasIgnorableSnippet({ rawSnippet: "   " })).toBe(false);
    expect(hasIgnorableSnippet({ rawSnippet: "" })).toBe(false);
    expect(hasIgnorableSnippet({ rawSnippet: undefined })).toBe(false);
    // @ts-expect-error non-string guard
    expect(hasIgnorableSnippet({ rawSnippet: 123 })).toBe(false);
  });
});
