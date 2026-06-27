import { describe, it, expect } from "vitest";
import { normalizeStageWords } from "@/lib/parser/personalization";

describe("normalizeStageWords — confidence-gated stage-word typo correction", () => {
  it("East Coast full list: corrects Strke, leaves A1, one correction", () => {
    const r = normalizeStageWords("Load In/Set/Strke/Load Out - A1");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - A1");
    expect(r.corrections).toEqual([{ detected: "Strke", corrected: "Strike" }]);
  });

  it("2-word ONLY, typo on the RIGHT (peel ONLY): corrects + keeps ONLY", () => {
    const r = normalizeStageWords("Load Out / Strke ONLY");
    expect(r.corrected).toBe("Load Out / Strike ONLY");
    expect(r.corrections).toEqual([{ detected: "Strke", corrected: "Strike" }]);
  });

  it("2-word ONLY, typo on the LEFT (transposition): corrects + keeps ONLY", () => {
    const r = normalizeStageWords("Laod In / Set ONLY");
    expect(r.corrected).toBe("Load In / Set ONLY");
    expect(r.corrections).toEqual([{ detected: "Laod In", corrected: "Load In" }]);
  });

  it("multiple typos in one cell → all corrected, one result (each typo Damerau ≤ 1)", () => {
    // Lod In (+A), Strke (-I), Load Ot (+U) are EACH distance 1. (A two-typo word
    // like "Lod Ot" would be distance 2 → beyond maxDistance=1 → not corrected.)
    const r = normalizeStageWords("Lod In/Set/Strke/Load Ot - V1");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - V1");
    expect(r.corrections.map((c) => c.corrected).sort()).toEqual(["Load In", "Load Out", "Strike"]);
  });

  it("a stage word with TWO typos (Damerau 2) is NOT corrected", () => {
    // "Lod Ot" → "Load Out" is distance 2; with Set+Strike as anchors the gate could
    // fire, but Lod Ot is not a near-miss so it is left as an unknown role token.
    const r = normalizeStageWords("Load In/Set/Strike/Lod Ot - V1");
    expect(r.corrections).toEqual([]); // Lod Ot not within maxDistance=1; nothing corrected
    expect(r.corrected).toBe("Load In/Set/Strike/Lod Ot - V1");
  });

  it("lone near-miss with NO exact anchor → NOT corrected (intentional token wins)", () => {
    const r = normalizeStageWords("Strke - A1");
    expect(r.corrected).toBe("Strke - A1");
    expect(r.corrections).toEqual([]);
  });

  it("TWO near-misses but ZERO exact anchor → NOT corrected (pins the ≥1-exact gate)", () => {
    // STRKE (near) + LAOD IN (near) = 2 stage-ish, but 0 EXACT — without a confirmed
    // stage word to corroborate, we are not confident, so neither is auto-corrected.
    // This is the case that exercises the `exactCount >= 1` half of the gate.
    const r = normalizeStageWords("Strke / Laod In");
    expect(r.corrections).toEqual([]);
    expect(r.corrected).toBe("Strke / Laod In");
  });

  it("genuine unknown role with stage context → NOT corrected (not a near-miss)", () => {
    const r = normalizeStageWords("Load In/Set/Strike/Load Out - RIGGER");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - RIGGER");
    expect(r.corrections).toEqual([]);
  });

  it("role-exclusion: a recognized role is never rewritten to a stage word", () => {
    // A1 is a real role; even with stage context it is classified as a role, not corrected.
    const r = normalizeStageWords("Load In/Set/Strike/Load Out - A1");
    expect(r.corrected).toContain("- A1"); // A1 untouched
  });

  it("clean stage list (no typo) → unchanged, no corrections", () => {
    const r = normalizeStageWords("Load In / Set / Strike / Load Out - LEAD");
    expect(r.corrections).toEqual([]);
    expect(r.corrected).toBe("Load In / Set / Strike / Load Out - LEAD");
  });

  it("hyphenated non-stage segment in stage context is rejoined verbatim", () => {
    const r = normalizeStageWords("Load In/Set/Strke/Load Out - SOME-VALUE");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - SOME-VALUE");
    expect(r.corrections).toEqual([{ detected: "Strke", corrected: "Strike" }]);
  });

  it("*** day-restriction marker preserved on a corrected stage word", () => {
    const r = normalizeStageWords("Load In/Set/Strke/Load Out*** - A1");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out*** - A1");
  });

  it("empty / non-stage cell → unchanged", () => {
    expect(normalizeStageWords("- A1").corrections).toEqual([]);
    expect(normalizeStageWords("").corrections).toEqual([]);
  });
});
