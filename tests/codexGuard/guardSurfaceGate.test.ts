import { writeFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { cleanupRuns, mkRun, readCalls, runGuard, writeScenario, type Run } from "./harness";

afterAll(cleanupRuns);

/**
 * The guard-surface dispatch gate (enforcement-pair spec §2.1): a round-1 diff
 * brief that declares a `GUARD SURFACE:` line must carry, ON THAT LINE, either
 * a canonical mutation-score declaration with an empty unaccepted-survivor set
 * or a `CANNOT-EXPRESS:` probe citation - else exit 2 BEFORE any dispatch.
 *
 * Every rejecting case asserts zero fake-codex calls: the gate sits in the
 * pre-dispatch validation phase, so a rejected brief takes no lock, writes no
 * result artifact, and appends no corpus row - identical to missing --stage.
 */

const APPROVE_STEP = {
  onCall: 1,
  actions: [
    { type: "stdout", text: "working\n" },
    { type: "lastMessage", text: "Fine.\n\nVERDICT: APPROVE\nFINDINGS: 0\n" },
    { type: "exit", code: 0 },
  ],
};

function briefWith(run: Run, body: string): void {
  writeFileSync(run.briefPath, `${body}\n\nEnd with VERDICT: APPROVE.\n`);
}

/** Dispatch at the gate's trigger point unless overridden. */
async function dispatch(run: Run, args: string[] = ["--stage", "diff", "--round", "1"]) {
  return runGuard(run, args);
}

describe("round-1 diff guard-surface gate (spec §2.1)", () => {
  it("EXITS 2 on a declared line with neither arm, naming both arms, without dispatching", async () => {
    const run = mkRun();
    briefWith(run, "GUARD SURFACE: lib/reviewRounds/filing.ts — enrolment pending");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    // The message names both arms and points at the durable contract.
    expect(res.stderr).toContain("MUTATION SCORE");
    expect(res.stderr).toContain("CANNOT-EXPRESS");
    expect(res.stderr).toContain("AGENTS.md");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("PASSES a conforming score-arm line through to the dispatch", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: lib/reviewRounds/filing.ts — MUTATION SCORE: 82/84, 0 unaccepted survivors",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  it("PASSES a conforming cannot-express line through to the dispatch", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: scripts/codex-guard.mjs — CANNOT-EXPRESS: spawn-only surface, no Vitest import edge (tests/codexGuard/harness.ts)",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  // Spec R1 finding 1 (mixed_missing_score): a brief-global check would let one
  // surface's CANNOT-EXPRESS silently absorb a deleted MUTATION SCORE line.
  it("EXITS 2 on a MIXED brief - a conforming cannot-express line plus a bare line", async () => {
    const run = mkRun();
    briefWith(
      run,
      [
        "GUARD SURFACE: scripts/codex-guard.mjs — CANNOT-EXPRESS: spawn-only, probe cited",
        "",
        "GUARD SURFACE: lib/reviewRounds/filing.ts — enrolled yesterday",
      ].join("\n"),
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    // The BARE line is named; the conforming one is not accused.
    expect(res.stderr).toContain("lib/reviewRounds/filing.ts — enrolled yesterday");
    expect(readCalls(run)).toHaveLength(0);
  });

  // Spec R1 finding 1 (two_enrolled_one_score): one surface's score must not
  // cover a second enrolled surface.
  it("EXITS 2 when one of two enrolled surfaces carries the only score", async () => {
    const run = mkRun();
    briefWith(
      run,
      [
        "GUARD SURFACE: lib/reviewRounds/corpus.ts — MUTATION SCORE: 12/12, 0 unaccepted survivors",
        "",
        "GUARD SURFACE: lib/reviewRounds/count.ts — also enrolled",
      ].join("\n"),
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("count.ts — also enrolled");
    expect(readCalls(run)).toHaveLength(0);
  });

  // Spec R1 finding 2 (nonempty_survivor_set): a declared non-converged surface
  // is rejected - dispatching on it is what enrolment-precedes-review forbids.
  it("EXITS 2 on a declared NON-empty unaccepted-survivor set", async () => {
    const run = mkRun();
    briefWith(run, "GUARD SURFACE: lib/foo.ts — MUTATION SCORE: 82/84, 1 unaccepted survivor");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // Spec R3 probe pair: semantically impossible fractions, per the shipped
  // authority's no-mutants and unaccounted-mutants conditions. The third row is
  // the diff R1 finding-1 probe: past Number.MAX_SAFE_INTEGER the operands
  // round together, so an impossible killed > total pair reads as equal - the
  // arm requires SAFE integers, not merely parseable ones.
  it.each([
    ["0/0 - no mutants", "MUTATION SCORE: 0/0, 0 unaccepted survivors"],
    ["2/1 - killed exceeds total", "MUTATION SCORE: 2/1, 0 unaccepted survivors"],
    [
      "unsafe integers rounding equal",
      "MUTATION SCORE: 9007199254740993/9007199254740992, 0 unaccepted survivors",
    ],
  ])("EXITS 2 on a semantically invalid fraction (%s)", async (_n, decl) => {
    const run = mkRun();
    briefWith(run, `GUARD SURFACE: lib/foo.ts — ${decl}`);
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // Spec R4 (unrelated_fraction): adjacency is load-bearing - a floating
  // fraction elsewhere on the line cannot satisfy the arm.
  it("EXITS 2 on a floating fraction without the adjacent MUTATION SCORE: marker", async () => {
    const run = mkRun();
    briefWith(run, "GUARD SURFACE: lib/foo.ts — last run 12/12; 0 unaccepted survivors");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // Spec R4 below_floor, the ACCEPTING direction of documented limit §5.8: the
  // gate forces the evidence to EXIST in canonical form; judging the stated
  // value against the registry floor is the reviewer's and orchestrator's
  // ground. A below-floor declaration is loud, not blocked.
  it("PASSES a canonical below-floor declaration - documented limit §5.8", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, "GUARD SURFACE: lib/foo.ts — MUTATION SCORE: 0/1, 0 unaccepted survivors");
    const res = await dispatch(run);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  // Plan discriminator fixtures: each fails for exactly one missing element.
  it.each([
    ["no fraction adjacent to the marker", "MUTATION SCORE: pending, 0 unaccepted survivors"],
    ["no survivor phrase after the fraction", "MUTATION SCORE: 1/1"],
  ])("EXITS 2 on a score line with %s", async (_n, decl) => {
    const run = mkRun();
    briefWith(run, `GUARD SURFACE: lib/foo.ts — ${decl}`);
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  it("enumerates EVERY nonconforming line, not only the first", async () => {
    const run = mkRun();
    briefWith(
      run,
      [
        "GUARD SURFACE: lib/first.ts — bare one",
        "",
        "GUARD SURFACE: lib/second.ts — bare two",
      ].join("\n"),
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("lib/first.ts — bare one");
    expect(res.stderr).toContain("lib/second.ts — bare two");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("EXEMPTS round 2 - the gate binds the FIRST diff dispatch only", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, "GUARD SURFACE: lib/foo.ts — bare, but this is a repair round");
    const res = await dispatch(run, ["--stage", "diff", "--round", "2"]);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  it("EXEMPTS non-diff stages", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, "GUARD SURFACE: lib/foo.ts — bare, but this is a plan review");
    const res = await dispatch(run, ["--stage", "plan", "--round", "1"]);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  // Use-vs-mention, the convergence gate's measured lesson: a brief QUOTING the
  // marker inside a fence neither triggers nor satisfies the gate.
  it("does not TRIGGER on a marker that exists only inside a fenced block", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      [
        "The declaration format, quoted for reference:",
        "",
        "```",
        "GUARD SURFACE: lib/example.ts — bare",
        "```",
      ].join("\n"),
    );
    const res = await dispatch(run);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  it("a conforming disposition inside a fence does not SATISFY a live bare line", async () => {
    const run = mkRun();
    briefWith(
      run,
      [
        "GUARD SURFACE: lib/foo.ts — see below",
        "",
        "```",
        "GUARD SURFACE: lib/foo.ts — MUTATION SCORE: 82/84, 0 unaccepted survivors",
        "```",
      ].join("\n"),
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  it("EXITS 2 on a CANNOT-EXPRESS marker with an empty tail", async () => {
    const run = mkRun();
    briefWith(run, "GUARD SURFACE: scripts/codex-guard.mjs — CANNOT-EXPRESS:");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });
});
