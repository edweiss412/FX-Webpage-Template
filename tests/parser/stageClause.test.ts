import { describe, it, expect } from "vitest";
import { parseStageClause } from "@/lib/parser/stageClause";

describe("parseStageClause (spec §3.2)", () => {
  it("EXPLICIT: any subset/order of the 5 stages + trailing ONLY", () => {
    expect(parseStageClause("Set / Strike ONLY").stages).toEqual(["Set", "Strike"]);
    expect(parseStageClause("Load Out / Strike ONLY").stages).toEqual(["Load Out", "Strike"]);
    expect(parseStageClause("Set / Show ONLY").stages).toEqual(["Set", "Show"]);
    expect(parseStageClause("Set / Strike ONLY").unrecognizedRestriction).toBe(false);
  });
  it("EXPLICIT keeps a role token and routes it to cleaned (R22)", () => {
    const r = parseStageClause("A1 / Set / Strike ONLY");
    expect(r.stages).toEqual(["Set", "Strike"]);
    expect(r.cleaned).toMatch(/A1/);
    expect(r.unrecognizedRestriction).toBe(false);
  });
  it("hyphen-mixed stage is not swallowed by an adjacent role (R25)", () => {
    expect(parseStageClause("Load In / Set - LEAD ONLY").stages).toEqual(["Load In", "Set"]);
  });
  it("MALFORMED: >=1 stage AND >=1 unknown → unrecognizedRestriction, no stages (R28)", () => {
    const r = parseStageClause("Set / Rehearsal ONLY");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(true);
    expect(r.cleaned).toMatch(/Rehearsal/); // non-stage tokens preserved (autocorrect/UNKNOWN_ROLE downstream)
  });
  it("ROLE CLAUSE: zero stages → not a restriction (Rehearsal ONLY, RIGGER ONLY)", () => {
    expect(parseStageClause("Rehearsal ONLY").stages).toEqual([]);
    expect(parseStageClause("Rehearsal ONLY").unrecognizedRestriction).toBe(false);
    expect(parseStageClause("RIGGER ONLY").unrecognizedRestriction).toBe(false);
  });
  it("full-4 lenient star: the EXACT live full-4 phrase (no Show) keeps a 4-stage restriction (R17)", () => {
    // FULL_STAGE_ONLY_PATTERN = /Load In / Set / Strike / Load Out ONLY\*{0,3}/i (personalization.ts:53)
    const r = parseStageClause("Load In / Set / Strike / Load Out ONLY**");
    expect(r.stages).toEqual(["Load In", "Set", "Strike", "Load Out"]);
    expect(r.unrecognizedRestriction).toBe(false);
    expect(r.consumedOnlyClause).toBe(true);
  });
  it("NON-full-4 clause with Show + a double-star marker does NOT restrict (fail-open, R17)", () => {
    // 'Load In / Set / Show / Strike ONLY**' is NOT the full-4 phrase and ONLY** is invalid for
    // generalized clauses → no stages, no restriction (must NOT hide Show days).
    const r = parseStageClause("Load In / Set / Show / Strike ONLY**");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(false);
  });
  it("consumedOnlyClause is true for a malformed ONLY*** clause (suppresses crew triple-asterisk guard)", () => {
    expect(parseStageClause("Set / Rehearsal ONLY***").consumedOnlyClause).toBe(true);
    expect(parseStageClause("Set / Rehearsal ONLY***").unrecognizedRestriction).toBe(true);
  });
});
