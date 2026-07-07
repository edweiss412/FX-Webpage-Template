import { describe, expect, test } from "vitest";
import { isParseableUrl } from "@/lib/url/isParseableUrl";

describe("isParseableUrl", () => {
  test("accepts http(s) URLs", () => {
    expect(isParseableUrl("https://maps.google.com/?q=1")).toBe(true);
    expect(isParseableUrl("http://example.com")).toBe(true);
  });
  test("rejects non-URLs, sentinels, empty, null/undefined", () => {
    for (const v of ["TBD", "N/A", "", "   ", "ftp://x", "not a url", null, undefined]) {
      expect(isParseableUrl(v)).toBe(false);
    }
  });
});
