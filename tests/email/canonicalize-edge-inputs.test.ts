/**
 * Edge-input pins for lib/email/canonicalize.ts (2026-06-12).
 *
 * canonicalize() is the ONLY function allowed to touch raw emails before they
 * enter the system (AGENTS.md plan-wide invariant 3). It deliberately does
 * trim + toLowerCase + empty→null and NOTHING else — no format validation, no
 * punycode/IDN normalization, no length enforcement (schema CHECK constraints
 * are the validity gate). These tests PIN that minimalism for inputs the
 * happy-path suite (tests/parser/email.test.ts) doesn't cover, so any future
 * behavior change here is a deliberate, test-visible decision.
 */
import { describe, expect, it } from "vitest";

import { canonicalize, isCanonical } from "@/lib/email/canonicalize";

describe("canonicalize edge inputs (pins — no validation layer exists here by design)", () => {
  it("PIN: unicode local part is lowercased per JS toLowerCase, plus-tag and accents preserved", () => {
    // "Café" → "café": toLowerCase() applies Unicode default case mapping to
    // the local part too (no ASCII-only carve-out, no NFC/NFKC normalization).
    expect(canonicalize("User+Café@EXAMPLE.com")).toBe("user+café@example.com");
  });

  it("PIN: IDN domain stays unicode — no punycode (xn--) conversion", () => {
    // A registrar-equivalent ASCII form would be crew@xn--bcher-kva.example;
    // canonicalize does NOT produce it. Unicode and punycode spellings of the
    // same mailbox therefore canonicalize to DIFFERENT strings — dedupe across
    // the two spellings is out of scope for this layer.
    expect(canonicalize("Crew@BÜCHER.example")).toBe("crew@bücher.example");
    expect(canonicalize("crew@xn--bcher-kva.example")).toBe("crew@xn--bcher-kva.example");
  });

  it("PIN: inputs longer than RFC 5321's 254-octet path limit pass through untruncated", () => {
    const local = "a".repeat(250);
    const long = `${local}@EXAMPLE.com`; // 262 chars
    const out = canonicalize(long);
    expect(out).toBe(`${local}@example.com`);
    expect(out).toHaveLength(262);
    // Length policing, if any, belongs to schema CHECKs — not this function.
  });

  it("PIN: whitespace padding (spaces, tabs, newlines) is trimmed; interior content untouched", () => {
    expect(canonicalize("\t  User@Example.COM \n")).toBe("user@example.com");
  });

  it("PIN: empty and whitespace-only inputs collapse to null (no empty-string canonical form)", () => {
    expect(canonicalize("")).toBeNull();
    expect(canonicalize(" \t\n ")).toBeNull();
  });

  it("PIN: isCanonical agrees with canonicalize on the unicode outputs above", () => {
    expect(isCanonical("user+café@example.com")).toBe(true);
    expect(isCanonical("crew@bücher.example")).toBe(true);
    // Pre-canonical unicode form is correctly rejected.
    expect(isCanonical("User+Café@EXAMPLE.com")).toBe(false);
  });
});
