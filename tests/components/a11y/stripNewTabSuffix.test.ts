import { describe, expect, test } from "vitest";

import { stripNewTabSuffix } from "@/components/shared/NewTabHint";

describe("stripNewTabSuffix (spec 2026-07-31 §3.2)", () => {
  test("strips a single trailing occurrence", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab)")).toBe("Summit");
  });
  test("strips repeated trailing occurrences", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab) (opens in a new tab)")).toBe("Summit");
  });
  test("tolerates trailing whitespace around occurrences", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab)  ")).toBe("Summit");
  });
  test("mid-string occurrence is preserved (documented limit §6)", () => {
    expect(stripNewTabSuffix("Summit (opens in a new tab) Tour")).toBe(
      "Summit (opens in a new tab) Tour",
    );
  });
  test("near-miss spellings pass through", () => {
    expect(stripNewTabSuffix("Summit (opens in new tab)")).toBe("Summit (opens in new tab)");
    expect(stripNewTabSuffix("Summit (Opens in a New Tab)")).toBe("Summit (Opens in a New Tab)");
  });
  test("value that IS the phrase strips to empty", () => {
    expect(stripNewTabSuffix("(opens in a new tab)")).toBe("");
  });
  test("empty and whitespace-only input", () => {
    expect(stripNewTabSuffix("")).toBe("");
    expect(stripNewTabSuffix("   ")).toBe("");
  });
});
