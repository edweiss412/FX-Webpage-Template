// tests/parser/email.test.ts
import { describe, it, expect } from "vitest";
import { canonicalize, isCanonical } from "@/lib/email/canonicalize";
describe("canonicalize email", () => {
  it("lowercases and trims", () => {
    expect(canonicalize(" Alice@FXAV.NET ")).toBe("alice@fxav.net");
  });
  it("passes already-canonical", () => {
    expect(canonicalize("alice@fxav.net")).toBe("alice@fxav.net");
  });
  it("returns null for null/undefined/empty/whitespace-only", () => {
    expect(canonicalize(null)).toBeNull();
    expect(canonicalize(undefined)).toBeNull();
    expect(canonicalize("")).toBeNull();
    expect(canonicalize("   ")).toBeNull();
  });
  it("isCanonical rejects mixed-case, empty, and untrimmed", () => {
    expect(isCanonical("Alice@FXAV.NET")).toBe(false);
    expect(isCanonical("alice@fxav.net")).toBe(true);
    expect(isCanonical("")).toBe(false);
    expect(isCanonical("  alice@fxav.net  ")).toBe(false);
  });
});
