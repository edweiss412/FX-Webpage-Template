import { describe, it, expect } from "vitest";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";

const V = ["TRANSPORTATION", "EVENT DETAILS"] as const;

describe("gatedVocabCorrect", () => {
  it("exact hit → corrected:false (no warning needed)", () => {
    expect(gatedVocabCorrect("TRANSPORTATION", V, {})).toEqual({ match: "TRANSPORTATION", corrected: false });
  });
  it("distance-1 near miss → corrected:true", () => {
    expect(gatedVocabCorrect("TRANSPORTATON", V, {})).toEqual({ match: "TRANSPORTATION", corrected: true });
  });
  it("beyond distance 1 → null", () => {
    expect(gatedVocabCorrect("XYZ", V, {})).toBeNull();
  });
  it("token shorter than minLen → null (never corrected)", () => {
    expect(gatedVocabCorrect("GS", ["GREEN ROOM"], { minLen: 5 })).toBeNull();
  });
  it("token exactly in the exclude set → null (cross-vocab exclusion), even if distance-1 from a member", () => {
    // 'A2' is excluded; do not let it correct to 'A1'
    expect(gatedVocabCorrect("A2", ["A1"], { exclude: ["A1", "A2", "V1", "L1"] })).toBeNull();
  });
  it("tieAbort: a token distance-1 from TWO members returns null", () => {
    // 'AD' is distance 1 from both 'AB' and 'AC'
    expect(gatedVocabCorrect("AD", ["AB", "AC"], { tieAbort: true })).toBeNull();
    // without tieAbort, closedVocabMatch's vocab-order tiebreak picks the first
    expect(gatedVocabCorrect("AD", ["AB", "AC"], {})).toEqual({ match: "AB", corrected: true });
  });
});
