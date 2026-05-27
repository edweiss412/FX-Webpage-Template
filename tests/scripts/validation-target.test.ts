// tests/scripts/validation-target.test.ts — M12 Phase 0.C Task 0.C.2.
// Per master spec §3.3 step 5 + plan 03 Task 0.C.2.
import { describe, it, expect } from "vitest";
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "@/scripts/lib/validation-target";

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

describe("assertSupabaseTargetMatchesProjectRef (F2 wrong-project guard — Codex Phase 0.C R1)", () => {
  it("permits matching host prefix and project_ref", () => {
    expect(() =>
      assertSupabaseTargetMatchesProjectRef(
        "https://vzakgrxqwcalbmagufjh.supabase.co",
        "vzakgrxqwcalbmagufjh",
        false,
      ),
    ).not.toThrow();
  });

  it("permits the .supabase.in legacy host", () => {
    expect(() =>
      assertSupabaseTargetMatchesProjectRef(
        "https://abcd1234.supabase.in",
        "abcd1234",
        false,
      ),
    ).not.toThrow();
  });

  it("permits the branched-preview <ref>--<branch>.supabase.co shape", () => {
    expect(() =>
      assertSupabaseTargetMatchesProjectRef(
        "https://vzakgrxqwcalbmagufjh--preview.supabase.co",
        "vzakgrxqwcalbmagufjh",
        false,
      ),
    ).not.toThrow();
  });

  it("rejects when URL host prefix does not match project_ref", () => {
    expect(() =>
      assertSupabaseTargetMatchesProjectRef(
        "https://projectA.supabase.co",
        "projectB",
        false,
      ),
    ).toThrow(/Project-ref mismatch.*F2 wrong-project guard/);
  });

  it("rejects when project_ref env var is missing", () => {
    expect(() =>
      assertSupabaseTargetMatchesProjectRef(
        "https://vzakgrxqwcalbmagufjh.supabase.co",
        undefined,
        false,
      ),
    ).toThrow(/VALIDATION_SUPABASE_PROJECT_REF is required/);
  });

  it("rejects URL that doesn't match canonical Supabase host shape", () => {
    expect(() =>
      assertSupabaseTargetMatchesProjectRef(
        "https://my-custom-supabase.example.com",
        "vzakgrxqwcalbmagufjh",
        false,
      ),
    ).toThrow(/does not match the canonical Supabase host shape/);
  });

  it("skips all checks under --allow-local-override (local Supabase has non-canonical host)", () => {
    expect(() =>
      assertSupabaseTargetMatchesProjectRef(
        "http://127.0.0.1:54321",
        "local",
        true,
      ),
    ).not.toThrow();
  });
});
