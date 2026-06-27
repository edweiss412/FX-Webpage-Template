import { describe, it, expect } from "vitest";
import { damerauLevenshtein, closedVocabMatch } from "@/lib/parser/fuzzyMatch";

describe("damerauLevenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(damerauLevenshtein("STRIKE", "STRIKE")).toBe(0);
  });
  it("counts a single deletion / insertion / substitution as 1", () => {
    expect(damerauLevenshtein("STRKE", "STRIKE")).toBe(1); // deletion
    expect(damerauLevenshtein("STRIKEE", "STRIKE")).toBe(1); // insertion
    expect(damerauLevenshtein("STRIME", "STRIKE")).toBe(1); // substitution
  });
  it("counts an ADJACENT TRANSPOSITION as 1 (the differentiator vs plain Levenshtein)", () => {
    expect(damerauLevenshtein("LAOD IN", "LOAD IN")).toBe(1); // A/O swapped
    expect(damerauLevenshtein("STIRKE", "STRIKE")).toBe(1);
  });
  it("is high for unrelated tokens", () => {
    expect(damerauLevenshtein("XYZ", "STRIKE")).toBeGreaterThan(1);
    expect(damerauLevenshtein("A1", "SET")).toBeGreaterThan(1);
  });
  it("handles empty strings", () => {
    expect(damerauLevenshtein("", "SET")).toBe(3);
    expect(damerauLevenshtein("SET", "")).toBe(3);
  });
});

describe("closedVocabMatch", () => {
  const VOCAB = ["LOAD IN", "SET", "STRIKE", "LOAD OUT"] as const;
  it("returns an exact match with exact:true", () => {
    expect(closedVocabMatch("STRIKE", VOCAB, 1)).toEqual({ match: "STRIKE", exact: true });
  });
  it("returns a near-miss within maxDistance with exact:false", () => {
    expect(closedVocabMatch("STRKE", VOCAB, 1)).toEqual({ match: "STRIKE", exact: false });
    expect(closedVocabMatch("LAOD IN", VOCAB, 1)).toEqual({ match: "LOAD IN", exact: false });
  });
  it("returns null beyond maxDistance", () => {
    expect(closedVocabMatch("XYZ", VOCAB, 1)).toBeNull();
    expect(closedVocabMatch("A1", VOCAB, 1)).toBeNull();
  });
  it("prefers an exact hit over a near-miss", () => {
    expect(closedVocabMatch("SET", VOCAB, 1)).toEqual({ match: "SET", exact: true });
  });
  it("among near-misses picks smallest distance, then vocab order", () => {
    const V = ["AB", "AC", "XY"] as const;
    // "AD" is distance 1 from BOTH AB and AC → tie → vocab order wins → AB
    expect(closedVocabMatch("AD", V, 1)).toEqual({ match: "AB", exact: false });
    // "AAB" is distance 1 from AB but distance 2 from AC → smaller distance wins → AB
    expect(closedVocabMatch("AAB", V, 2)).toEqual({ match: "AB", exact: false });
  });
});
