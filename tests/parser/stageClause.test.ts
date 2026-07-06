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
  it("R4: a STAGE token BEFORE the full-4 phrase is not dropped (Show / … ONLY)", () => {
    // The unanchored full-4 pattern matches the Load In…Load Out ONLY suffix; the leading Show
    // must NOT be silently dropped. General grammar parses all 5 stages explicitly.
    const r = parseStageClause("Show / Load In / Set / Strike / Load Out ONLY");
    expect(new Set(r.stages)).toEqual(new Set(["Show", "Load In", "Set", "Strike", "Load Out"]));
    expect(r.unrecognizedRestriction).toBe(false);
  });
  it("R4: leading-stage + lenient star fails OPEN, never the 4-subset that hides Show", () => {
    const r = parseStageClause("Show / Load In / Set / Strike / Load Out ONLY**");
    expect(r.stages).toEqual([]); // fail open (whole show) — ONLY** is not a valid general marker
    expect(r.stages).not.toContain("Load In"); // did NOT keep the 4 and drop Show
  });
  it("STRUCTURAL (fail-open invariant): no present stage is ever silently dropped from an explicit restriction", () => {
    // For EVERY subset AND EVERY ORDERING of the 5 stages + trailing ONLY, the parsed explicit
    // `stages` is EITHER exactly the present set OR empty (fail open) — NEVER a proper subset that
    // hides a present stage. All permutations (not just natural/reversed) are required to exercise
    // the unanchored full-4-suffix match with a LEADING extra stage (`Show / Load In / Set / Strike
    // / Load Out ONLY`). Closes the dropped-stage class across prefix/middle/tail (whole-diff R2/R3/R4).
    const STAGES = ["Load In", "Set", "Show", "Strike", "Load Out"];
    const permutations = <T>(xs: T[]): T[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) =>
            permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
          );
    let checked = 0;
    for (let mask = 1; mask < 1 << STAGES.length; mask++) {
      const present = STAGES.filter((_, i) => mask & (1 << i));
      for (const order of permutations(present)) {
        const cell = order.join(" / ") + " ONLY";
        const parsed = new Set(parseStageClause(cell).stages);
        checked++;
        if (parsed.size === 0) continue; // fail open — acceptable
        expect(parsed, `cell='${cell}' dropped a present stage`).toEqual(new Set(present));
      }
    }
    expect(checked).toBe(325); // sum_{k=1}^{5} C(5,k)*k! — every subset × every ordering
  });
  it("R5: a TYPO'd/unknown stage before the full-4 phrase fails open, not the 4-subset (Showw / …)", () => {
    // `Showw` is a garbled `Show`; the full-4 fast-path must not silently return the 4 stages and
    // hide the intended Show — the unknown-alongside-stages clause fails open (UNKNOWN_STAGE_RESTRICTION).
    const r = parseStageClause("Showw / Load In / Set / Strike / Load Out ONLY");
    expect(r.stages).toEqual([]);
    expect(r.unrecognizedRestriction).toBe(true);
  });
  it("STRUCTURAL: an UNKNOWN/typo token alongside stages ALWAYS fails open (prefix/tail/middle) — R5", () => {
    // Extends the permutation invariant to unknown tokens (the anti-tautology gap): an unknown
    // non-role token adjacent to real stages must NEVER yield a partial restriction, regardless of
    // whether it sits before the full-4 suffix (prefix), after the ONLY marker (tail), or between
    // stages (general path). All three must fail open with unrecognizedRestriction.
    const UNKNOWN = ["Showw", "Sett", "Strk", "Rehearsal", "Xyz"];
    const FULL4 = "Load In / Set / Strike / Load Out";
    for (const u of UNKNOWN) {
      for (const cell of [
        `${u} / ${FULL4} ONLY`, // prefix, before the unanchored full-4 match
        `${FULL4} ONLY / ${u}`, // tail, after the ONLY marker
        `Set / ${u} / Strike ONLY`, // middle, general grammar path
      ]) {
        const r = parseStageClause(cell);
        expect(r.stages, `cell='${cell}' must fail open`).toEqual([]);
        expect(r.unrecognizedRestriction, `cell='${cell}'`).toBe(true);
      }
    }
  });
  it("STRUCTURAL: a leading role-ONLY clause + ANY stage subset ALWAYS fails open + signals — R8", () => {
    // A stage token ONLY'd behind a leading role-ONLY clause is inherently ambiguous, so for EVERY
    // non-empty subset of the 5 stages the whole clause must fail open (never hide a work day) AND
    // signal UNKNOWN_STAGE_RESTRICTION — never a silent partial restriction. Closes the no-stage-body
    // dropped-stage hole across every stage subset and both leading-role shapes.
    const STAGES = ["Load In", "Set", "Show", "Strike", "Load Out"];
    for (const lead of ["A1 ONLY", "LEAD ONLY", "A1 / LEAD ONLY"]) {
      for (let mask = 1; mask < 1 << STAGES.length; mask++) {
        const subset = STAGES.filter((_, i) => mask & (1 << i));
        const cell = `${lead} / ${subset.join(" / ")} ONLY`;
        const r = parseStageClause(cell);
        expect(r.stages, `cell='${cell}' must fail open`).toEqual([]);
        expect(r.unrecognizedRestriction, `cell='${cell}'`).toBe(true);
        expect(r.consumedOnlyClause, `cell='${cell}'`).toBe(true);
      }
    }
  });
  it("STRUCTURAL: a leading role BAD-STAR ONLY + ANY bare stage subset ALWAYS fails open + signals — R9", () => {
    // The bad-star sibling of the R8 invariant: a bad-star role-ONLY (ONLY* / ONLY** / ONLY****)
    // followed by ANY non-empty stage subset (no trailing valid marker) is a malformed stage
    // restriction — fail open AND signal for every subset and every bad-star count. Closes the
    // no-marker bad-star dropped-stage hole across the whole body, not just preMarker.
    const STAGES = ["Load In", "Set", "Show", "Strike", "Load Out"];
    for (const lead of ["A1 ONLY**", "LEAD ONLY****", "A1 / LEAD ONLY*"]) {
      for (let mask = 1; mask < 1 << STAGES.length; mask++) {
        const subset = STAGES.filter((_, i) => mask & (1 << i));
        const cell = `${lead} / ${subset.join(" / ")}`;
        const r = parseStageClause(cell);
        expect(r.stages, `cell='${cell}' must fail open`).toEqual([]);
        expect(r.unrecognizedRestriction, `cell='${cell}'`).toBe(true);
        expect(r.consumedOnlyClause, `cell='${cell}'`).toBe(true);
      }
    }
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
  it("NON-full-4 clause with Show + a double-star marker fails open AND signals (R17 + whole-diff R6)", () => {
    // 'Load In / Set / Show / Strike ONLY**' is NOT the full-4 phrase and ONLY** is invalid for
    // generalized clauses → no stages, no restriction (R17: must NOT hide Show days). R6 refinement:
    // recognized stages + a bad-star marker is a MALFORMED attempt → also emit UNKNOWN_STAGE_RESTRICTION
    // (fail open is preserved; the operator is no longer left in the dark).
    const r = parseStageClause("Load In / Set / Show / Strike ONLY**");
    expect(r.stages).toEqual([]); // still fail open — Show days are NOT hidden
    expect(r.unrecognizedRestriction).toBe(true); // R6: signal the dropped restriction
  });
  it("R6: recognized stages + a bad-star ONLY marker fail open AND signal (Set / Strike ONLY**)", () => {
    for (const cell of ["Set / Strike ONLY**", "Set ONLY*", "Load In / Set ONLY****"]) {
      const r = parseStageClause(cell);
      expect(r.stages, cell).toEqual([]); // fail open
      expect(r.unrecognizedRestriction, cell).toBe(true); // UNKNOWN_STAGE_RESTRICTION
    }
  });
  it("R6: a bad-star ONLY with NO stage token stays a role clause (no signal)", () => {
    // `LEAD ONLY**` / `Rehearsal ONLY*` carry no stage token → not a stage restriction → no signal.
    expect(parseStageClause("LEAD ONLY**").unrecognizedRestriction).toBe(false);
    expect(parseStageClause("Rehearsal ONLY*").unrecognizedRestriction).toBe(false);
  });
  it("consumedOnlyClause is true for a malformed ONLY*** clause (suppresses crew triple-asterisk guard)", () => {
    expect(parseStageClause("Set / Rehearsal ONLY***").consumedOnlyClause).toBe(true);
    expect(parseStageClause("Set / Rehearsal ONLY***").unrecognizedRestriction).toBe(true);
  });
  // Whole-diff Codex R8 [high]: the first ONLY marker may have NO stage in its BODY yet a LATER
  // clause carries a stage (`A1 ONLY / Set ONLY`, `LEAD ONLY / Set / Strike ONLY`). The no-stage
  // branch returned early WITHOUT the tail check the general path uses, so the dropped stage
  // restriction failed open SILENTLY (no UNKNOWN_STAGE_RESTRICTION). It must fail open AND signal.
  it("R8: a STAGE token after a leading role-ONLY clause fails open AND signals", () => {
    for (const cell of [
      "A1 ONLY / Set ONLY",
      "LEAD ONLY / Set / Strike ONLY",
      "A1 ONLY / Set", // bare stage after role-ONLY is still ambiguous → signal (fail-open safe)
    ]) {
      const r = parseStageClause(cell);
      expect(r.stages, cell).toEqual([]); // fail open — never hide a work day
      expect(r.unrecognizedRestriction, cell).toBe(true); // UNKNOWN_STAGE_RESTRICTION
      expect(r.consumedOnlyClause, cell).toBe(true);
    }
  });
  it("R8: a role-ONLY clause with NO stage token anywhere stays a pure role clause (no signal)", () => {
    // An UNKNOWN non-stage token after the ONLY (`LEAD ONLY / Foobar`) is a ROLE concern
    // (UNKNOWN_ROLE_TOKEN downstream), NOT a stage restriction — the R8 guard must be stage-scoped.
    for (const cell of ["LEAD ONLY", "LEAD ONLY / A1", "LEAD ONLY / Foobar", "Rehearsal ONLY"]) {
      const r = parseStageClause(cell);
      expect(r.unrecognizedRestriction, cell).toBe(false);
      expect(r.consumedOnlyClause, cell).toBe(false);
    }
  });
  it("R8: stage tokens are excised from `cleaned` (never leak as UNKNOWN_ROLE_TOKEN)", () => {
    // The role tokens survive for the role path; the stage tokens + consumed ONLY markers are gone.
    const c = parseStageClause("A1 ONLY / Set ONLY").cleaned.toUpperCase();
    expect(c).toContain("A1");
    expect(c).not.toMatch(/\bSET\b/);
    expect(c).not.toMatch(/\bONLY\b/);
  });
  // Whole-diff Codex R9 [high]: same class as R8 but the leading role-ONLY carries a BAD-STAR
  // marker (`A1 ONLY** / Set`, `LEAD ONLY**** / Load In`). The no-marker bad-star branch only
  // scanned `preMarker` for stages, so a bare stage AFTER the bad-star marker leaked to role
  // parsing as UNKNOWN_ROLE_TOKEN instead of signalling. Must scan the WHOLE body.
  it("R9: a bare STAGE after a leading role BAD-STAR ONLY fails open AND signals", () => {
    for (const cell of ["A1 ONLY** / Set", "LEAD ONLY**** / Load In", "A1 ONLY* / Set / Strike"]) {
      const r = parseStageClause(cell);
      expect(r.stages, cell).toEqual([]); // fail open
      expect(r.unrecognizedRestriction, cell).toBe(true); // UNKNOWN_STAGE_RESTRICTION
      expect(r.consumedOnlyClause, cell).toBe(true);
    }
  });
  it("R9: a bad-star role-ONLY with NO stage token stays a role clause (no signal)", () => {
    for (const cell of ["LEAD ONLY** / A1", "Rehearsal ONLY* / Foobar", "LEAD ONLY**"]) {
      const r = parseStageClause(cell);
      expect(r.unrecognizedRestriction, cell).toBe(false);
    }
  });
  it("R9: the stage is excised from `cleaned` in the bad-star branch", () => {
    const c = parseStageClause("A1 ONLY** / Set").cleaned.toUpperCase();
    expect(c).toContain("A1");
    expect(c).not.toMatch(/\bSET\b/);
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
  it("R8: a stage ONLY'd behind a leading role-ONLY → none + UNKNOWN_STAGE_RESTRICTION", () => {
    const r = extractStageRestriction("A1 ONLY / Set ONLY");
    expect(r.restriction).toEqual({ kind: "none" }); // fail open
    expect(r.warnings.map((w) => w.code)).toContain("UNKNOWN_STAGE_RESTRICTION");
    expect(r.consumedOnlyClause).toBe(true);
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
