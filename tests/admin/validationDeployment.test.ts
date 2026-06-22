import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VALIDATION_PROJECT_REF,
  projectRefFromUrl,
  isValidationDeployment,
  destructiveResetAllowed,
} from "@/lib/admin/validationDeployment";

afterEach(() => vi.unstubAllEnvs());

describe("projectRefFromUrl (strict host boundary)", () => {
  it("parses the bare validation host", () => {
    expect(projectRefFromUrl("https://vzakgrxqwcalbmagufjh.supabase.co")).toBe(
      "vzakgrxqwcalbmagufjh",
    );
  });
  it("allows an optional port", () => {
    expect(projectRefFromUrl("http://abc123.supabase.co:54321")).toBe("abc123");
  });
  it("REJECTS a branch-preview / suffixed host", () => {
    expect(projectRefFromUrl("https://vzakgrxqwcalbmagufjh-preview.supabase.co")).toBeNull();
  });
  it("returns null for non-supabase / garbage / empty / undefined", () => {
    expect(projectRefFromUrl("https://evil.example.com")).toBeNull();
    expect(projectRefFromUrl("http://127.0.0.1:54321")).toBeNull();
    expect(projectRefFromUrl("")).toBeNull();
    expect(projectRefFromUrl(undefined)).toBeNull();
  });
});

describe("isValidationDeployment / destructiveResetAllowed", () => {
  it("true only for the validation ref", () => {
    vi.stubEnv("SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    expect(isValidationDeployment()).toBe(true);
  });
  it("false for a prod-looking ref", () => {
    vi.stubEnv("SUPABASE_URL", "https://prodref000000000000.supabase.co");
    expect(isValidationDeployment()).toBe(false);
  });
  it("destructiveResetAllowed AND-composes ref + flag", () => {
    vi.stubEnv("SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "true");
    expect(destructiveResetAllowed()).toBe(true);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "");
    expect(destructiveResetAllowed()).toBe(false);
  });
  it("falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is UNSET (undefined)", () => {
    // isValidationDeployment uses `??` fallback — keeps existing behaviour for render gate.
    vi.stubEnv("SUPABASE_URL", undefined as unknown as string); // vitest deletes the var
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "true");
    expect(isValidationDeployment()).toBe(true);
  });
  it("empty-string SUPABASE_URL closes the guard (does NOT fall back — `??` is not triggered by '')", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "true");
    expect(destructiveResetAllowed()).toBe(false);
  });

  // FIX 3: destructiveResetAllowed must require SUPABASE_URL specifically (not NEXT_PUBLIC fallback)
  it("(FIX-3) destructiveResetAllowed is FALSE when SUPABASE_URL is unset even if NEXT_PUBLIC_SUPABASE_URL is validation ref + flag on", () => {
    vi.stubEnv("SUPABASE_URL", undefined as unknown as string);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "true");
    expect(destructiveResetAllowed()).toBe(false);
  });

  it("(FIX-3) destructiveResetAllowed is TRUE only when SUPABASE_URL itself is the validation ref + flag on", () => {
    vi.stubEnv("SUPABASE_URL", `https://${VALIDATION_PROJECT_REF}.supabase.co`);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://someother.supabase.co");
    vi.stubEnv("ALLOW_DESTRUCTIVE_RESET", "true");
    expect(destructiveResetAllowed()).toBe(true);
  });
});
