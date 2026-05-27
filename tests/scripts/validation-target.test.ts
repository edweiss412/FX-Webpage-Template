// tests/scripts/validation-target.test.ts — M12 Phase 0.C Task 0.C.2.
// Per master spec §3.3 step 5 + plan 03 Task 0.C.2.
import { describe, it, expect } from "vitest";
import { assertProdEquivalentTarget } from "@/scripts/lib/validation-target";

describe("assertProdEquivalentTarget", () => {
  describe("rejects localhost variants without --allow-local-override", () => {
    const localhostUrls = [
      "http://localhost",
      "http://localhost:54321",
      "http://localhost:54321/rest/v1",
      "https://localhost:443",
      "http://127.0.0.1",
      "http://127.0.0.1:54321/rest/v1",
      "http://[::1]",
      "http://[::1]:54321/rest/v1",
    ];
    for (const url of localhostUrls) {
      it(`rejects ${url}`, () => {
        expect(() => assertProdEquivalentTarget(url, false)).toThrow(
          /local URL.*--allow-local-override/,
        );
      });
    }
  });

  it("permits localhost with --allow-local-override", () => {
    expect(() =>
      assertProdEquivalentTarget("http://127.0.0.1:54321", true),
    ).not.toThrow();
  });

  it("permits prod-equivalent URL", () => {
    expect(() =>
      assertProdEquivalentTarget(
        "https://vzakgrxqwcalbmagufjh.supabase.co",
        false,
      ),
    ).not.toThrow();
  });

  it("rejects when URL is missing (undefined)", () => {
    expect(() => assertProdEquivalentTarget(undefined, false)).toThrow(
      /VALIDATION_SUPABASE_URL is required/,
    );
  });

  it("rejects when URL is empty string", () => {
    expect(() => assertProdEquivalentTarget("", false)).toThrow(
      /VALIDATION_SUPABASE_URL is required/,
    );
  });
});
