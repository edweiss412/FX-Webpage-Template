import { describe, it, expect } from "vitest";
import { parseStageClause } from "@/lib/parser/stageClause";
import { extractStageRestriction, extractRoleFlags } from "@/lib/parser/personalization";

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
  it("MALFORMED tail: a second ONLY marker after the first fails open, not narrow (whole-diff R2)", () => {
    // `Set ONLY / Strike ONLY` must NOT narrow to ["Set"] and hide Strike days.
    const r = parseStageClause("Set ONLY / Strike ONLY");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(true);
    expect(r.consumedOnlyClause).toBe(true);
  });
  it("MALFORMED tail: a STAGE token after the ONLY marker fails open (whole-diff R2)", () => {
    // `Set ONLY / Strike` (no second ONLY) — Strike sits in the dropped tail → fail open.
    const r = parseStageClause("Set ONLY / Strike");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(true);
  });
  it("CLEAN tail: a role token after the ONLY marker keeps the explicit restriction (whole-diff R2)", () => {
    // `Set ONLY - LEAD` — LEAD is a clean role in the tail → Set-only restriction preserved.
    const r = parseStageClause("Set ONLY - LEAD");
    expect(r.stages).toEqual(["Set"]);
    expect(r.unrecognizedRestriction).toBe(false);
    expect(r.cleaned).toMatch(/LEAD/);
  });
  it("full-4 carve-out keeps the 4-stage restriction for ANY star count incl ONLY**** (whole-diff R3)", () => {
    // ONLY**** : the R2 tail check must NOT treat the leftover emphasis star as dropped stage
    // content — origin/main's FULL_STAGE_ONLY_PATTERN keeps the 4 stages for any star count.
    for (const stars of ["", "*", "**", "***", "****", "*****"]) {
      const r = parseStageClause(`Load In / Set / Strike / Load Out ONLY${stars}`);
      expect(r.stages, `ONLY${stars}`).toEqual(["Load In", "Set", "Strike", "Load Out"]);
      expect(r.unrecognizedRestriction, `ONLY${stars}`).toBe(false);
      expect(r.consumedOnlyClause).toBe(true);
    }
    // ONLY**** WITH a clean role tail still keeps the 4 stages.
    const withRole = parseStageClause("- Load In / Set / Strike / Load Out ONLY**** - LEAD");
    expect(withRole.stages).toEqual(["Load In", "Set", "Strike", "Load Out"]);
    expect(withRole.unrecognizedRestriction).toBe(false);
    // ONLY**** WITH a dropped trailing STAGE still fails open (emphasis strip does not mask /Show).
    const withStage = parseStageClause("Load In / Set / Strike / Load Out ONLY**** / Show");
    expect(withStage.stages).toEqual([]);
    expect(withStage.unrecognizedRestriction).toBe(true);
  });
  it("full-4 carve-out also fails open on a dropped trailing stage (whole-diff R2 class-sweep)", () => {
    // `… Load Out ONLY / Show` must NOT keep the 4 and drop Show — the carve-out fails open too.
    const r = parseStageClause("Load In / Set / Strike / Load Out ONLY / Show");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(true);
    // But a clean role tail on the carve-out is still fine (LEAD preserved, 4 stages kept).
    const ok = parseStageClause("- Load In / Set / Strike / Load Out ONLY*** - LEAD");
    expect(ok.stages).toEqual(["Load In", "Set", "Strike", "Load Out"]);
    expect(ok.unrecognizedRestriction).toBe(false);
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

describe("extractStageRestriction delegates to parseStageClause (spec §3)", () => {
  it("explicit → restriction, no warning", () => {
    const r = extractStageRestriction("Set / Strike ONLY");
    expect(r.restriction).toEqual({ kind: "explicit", stages: ["Set", "Strike"] });
    expect(r.warnings).toEqual([]);
    expect(r.consumedOnlyClause).toBe(true);
  });
  it("the three original phrasings still produce identical restrictions (regression)", () => {
    expect(
      extractStageRestriction("- Load In / Set / Strike / Load Out ONLY*** - LEAD").restriction,
    ).toEqual({
      kind: "explicit",
      stages: ["Load In", "Set", "Strike", "Load Out"],
    });
    expect(extractStageRestriction("- Load In / Set ONLY").restriction).toEqual({
      kind: "explicit",
      stages: ["Load In", "Set"],
    });
    expect(extractStageRestriction("- Load Out / Strike ONLY").restriction).toEqual({
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    });
  });
  it("malformed → none + UNKNOWN_STAGE_RESTRICTION", () => {
    const r = extractStageRestriction("Set / Rehearsal ONLY");
    expect(r.restriction).toEqual({ kind: "none" });
    expect(r.warnings.map((w) => w.code)).toContain("UNKNOWN_STAGE_RESTRICTION");
    expect(r.consumedOnlyClause).toBe(true);
  });
  it("role clause → none + no stage warning", () => {
    const r = extractStageRestriction("Rehearsal ONLY");
    expect(r.restriction).toEqual({ kind: "none" });
    expect(r.warnings.map((w) => w.code)).not.toContain("UNKNOWN_STAGE_RESTRICTION");
    expect(r.consumedOnlyClause).toBe(false);
  });
  it("no-cascade: 'Set / Strike ONLY' → extractRoleFlags emits ZERO UNKNOWN_ROLE_TOKEN (was 2)", () => {
    const codes = extractRoleFlags("Set / Strike ONLY").warnings.map((w) => w.code);
    expect(codes).not.toContain("UNKNOWN_ROLE_TOKEN");
  });
  it("role-prefixed valid restriction keeps the role via cleaned (R22)", () => {
    expect(extractStageRestriction("A1 / Set / Strike ONLY").restriction).toEqual({
      kind: "explicit",
      stages: ["Set", "Strike"],
    });
    expect(extractRoleFlags("A1 / Set / Strike ONLY").flags).toContain("A1");
  });
  it("malformed preserves role-prefix + unknown token in cleaned (R16/R28)", () => {
    const codes = extractRoleFlags("A1 / Set / Rehearsal ONLY").warnings.map((w) => w.code);
    expect(extractRoleFlags("A1 / Set / Rehearsal ONLY").flags).toContain("A1");
    expect(codes).toContain("UNKNOWN_ROLE_TOKEN"); // Rehearsal surfaced
  });
});
