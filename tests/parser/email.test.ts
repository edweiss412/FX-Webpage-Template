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
  it("returns null for null/empty", () => {
    expect(canonicalize(null)).toBeNull();
    expect(canonicalize("")).toBeNull();
  });
  it("isCanonical rejects mixed-case", () => {
    expect(isCanonical("Alice@FXAV.NET")).toBe(false);
    expect(isCanonical("alice@fxav.net")).toBe(true);
  });
});
