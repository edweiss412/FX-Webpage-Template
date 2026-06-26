/**
 * Tests for `namesRefer` — the hotel-guest↔viewer name matcher.
 * Spec: docs/superpowers/specs/2026-06-26-hotel-viewer-name-match.md (§1 oracle).
 *
 * The matcher decides whether a parsed hotel-guest name and a roster viewer name
 * refer to the SAME person, tolerant of first-name-only, nickname/legal-name
 * (Bill↔William), prefix nicknames (Doug↔Douglas), initials (Eric W↔Eric Weiss),
 * accents, generational suffixes, and `/`-merged multi-person persisted rows.
 * It is LENIENT by design (UX-not-security per the owner determination): under-
 * match (hides a viewer's own hotel) is the harm; over-match (an extra card) is
 * benign. So the multi-token rule is SURNAME-only.
 */
import { describe, it, expect } from "vitest";
import { namesRefer } from "@/lib/data/nameMatch";

// [roster, guest, expected] — derived from the §1 oracle (parseSheet projection of
// the round-trip-guarded exporter-xlsx fixtures; see spec "Oracle provenance").
const MATCHES: Array<[string, string]> = [
  // east-coast: first-name guests
  ["Doug Larson", "Doug"],
  ["Carl Fenton", "Carl"],
  ["Eric Weiss", "Eric W"],
  // ria: first-name guests
  ["Eric Weiss", "Eric"],
  // rpas: legal-name guest (Douglas) ↔ nickname roster (Doug)
  ["Doug Larson", "Douglas Larson"],
  ["John Carleo", "John Carleo"],
  // consultants: legal-name guest (Alexandre) ↔ nickname roster (Alex)
  ["Alex Rodrigues", "Alexandre Rodrigues"],
  ["John Clark", "John Clark"],
  // fixed-income: nickname roster (DJ) ↔ legal-name guest (David), shared surname
  ["DJ Johnson", "David Johnson"],
  ["Jeffrey Justice", "Jeffrey Justice"],
  // fintech
  ["Eric Weiss", "Eric Weiss"],
  // non-prefix nickname / legal name from crew fixtures (raw 2025-10:536 Bill/William Werner)
  ["Bill Werner", "William Werner"],
  ["Bill Werner", "William Werner Jr"],
  // initials + hyphenated surname
  ["Mary Smith-Jones", "Mary Smith"],
];

// pairs that MUST NOT match (distinct surnames — the over-match exclusions)
const NON_MATCHES: Array<[string, string]> = [
  ["Eric Weiss", "Eric Carroll"],
  ["Eric Carroll", "Eric Weiss"],
  ["Calvin Saller", "Carlos Pineda"],
  ["John Carleo", "Carlos Pineda"],
  ["Connor Hester", "Eric Weiss"],
  ["Kari Rose", "Carl"],
];

describe("namesRefer — §1 oracle (must MATCH)", () => {
  for (const [roster, guest] of MATCHES) {
    it(`"${roster}" ↔ "${guest}"`, () => {
      // failure mode: substring relapse / first-name-gate would miss these
      expect(namesRefer(roster, guest)).toBe(true);
      expect(namesRefer(guest, roster)).toBe(true); // symmetry
    });
  }
});

describe("namesRefer — over-match exclusions (must NOT match)", () => {
  for (const [a, b] of NON_MATCHES) {
    it(`"${a}" ↮ "${b}"`, () => {
      // failure mode: an over-broad (surname-ignoring) matcher would wrongly match
      expect(namesRefer(a, b)).toBe(false);
      expect(namesRefer(b, a)).toBe(false); // symmetry
    });
  }
});

describe("namesRefer — accents normalize/fold", () => {
  const precomposed = "José Núñez"; // José Núñez (precomposed)
  const decomposed = "José Nuñez"; // Jose + combining acute / tilde
  const plain = "Jose Nunez";
  it("precomposed ↔ decomposed ↔ plain all match", () => {
    expect(namesRefer(precomposed, decomposed)).toBe(true);
    expect(namesRefer(precomposed, plain)).toBe(true);
    expect(namesRefer(decomposed, plain)).toBe(true);
    // FORCE-decomposed (combining marks) must fold to plain ASCII + precomposed
    const decomp = precomposed.normalize("NFD"); // guaranteed letter + combining mark
    expect(decomp).not.toBe(precomposed.normalize("NFC")); // sanity: actually decomposed
    expect(namesRefer(decomp, plain)).toBe(true);
    expect(namesRefer(decomp, precomposed)).toBe(true);
  });
});

describe("namesRefer — legacy '/'-merged persisted row (match-time split)", () => {
  // getShowForViewer reads PERSISTED names; legacy rows hold the un-split form.
  // failure mode: merging '/' into one token list makes the surname "justice", so
  // DJ Johnson would miss his own reservation until a re-ingest.
  const merged = "David Johnson / Jeffrey Justice";
  it("DJ Johnson matches the merged row via the David Johnson sub-name", () => {
    expect(namesRefer(merged, "DJ Johnson")).toBe(true);
    expect(namesRefer("DJ Johnson", merged)).toBe(true);
  });
  it("Jeffrey Justice matches the merged row via his sub-name", () => {
    expect(namesRefer(merged, "Jeffrey Justice")).toBe(true);
  });
  it("an unrelated viewer does NOT match the merged row", () => {
    expect(namesRefer(merged, "Eric Weiss")).toBe(false);
  });
});

describe("namesRefer — guard edges", () => {
  it("empty / whitespace inputs never match (no crash)", () => {
    expect(namesRefer("", "Eric Weiss")).toBe(false);
    expect(namesRefer("Eric Weiss", "")).toBe(false);
    expect(namesRefer("   ", "Eric Weiss")).toBe(false);
    expect(namesRefer("-", "Eric Weiss")).toBe(false);
  });
  it("single-token both sides", () => {
    expect(namesRefer("Doug", "Doug")).toBe(true);
    expect(namesRefer("Doug", "Douglas")).toBe(true); // prefix
    expect(namesRefer("Doug", "Eric")).toBe(false);
  });
});
