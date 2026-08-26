import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { cleanupRuns, mkRun, readCalls, runGuard, writeScenario, type Run } from "./harness";
import { HEADING_CORPUS } from "./fixtures/guardSurfaceHeadingCorpus";

afterAll(cleanupRuns);

/**
 * The guard-surface dispatch gate (enforcement-pair spec §2.1): a round-1 diff
 * brief that declares a `GUARD SURFACE:` line, written plain or as a Markdown
 * ATX heading, must carry, ON THAT LINE, either a canonical mutation-score
 * declaration with an empty unaccepted-survivor set AND the `OPERATORS:` tail
 * naming the set that score ranges over, or a `CANNOT-EXPRESS:` probe citation
 * - else exit 2 BEFORE any dispatch.
 *
 * Marker precedence (jurisdiction spec §2.2): a line carrying `MUTATION SCORE:`
 * in any shape is a score declaration, decided by the score arm plus the
 * `OPERATORS:` check and never rescued by a cannot-express tail; the
 * cannot-express arm decides only marker-free lines. Presence is checked, not
 * membership (§4 L-A), the same posture as the registry floor.
 *
 * Every rejecting case asserts zero fake-codex calls AND writes an APPROVE
 * scenario first: without one the fake codex exits before recording a call, so
 * the zero-call half would hold even had the gate dispatched. `readCalls`
 * throws on a scenario-less run, so the class cannot return with the next case.
 * The gate sits in the pre-dispatch validation phase, so a rejected brief takes
 * no lock, writes no result artifact, and appends no corpus row - identical to
 * missing --stage.
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
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, "GUARD SURFACE: lib/reviewRounds/filing.ts — enrolment pending");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    // The message names both arms and points at the durable contract.
    expect(res.stderr).toContain("MUTATION SCORE");
    expect(res.stderr).toContain("CANNOT-EXPRESS");
    expect(res.stderr).toContain("AGENTS.md");
    expect(readCalls(run)).toHaveLength(0);
  });

  // Jurisdiction spec §2.2: a score without the operator set it ranges over is
  // a number without its jurisdiction. Presence is checked, not membership
  // (spec §4 L-A), the same posture as the cannot-express citation.
  it("EXITS 2 on a score arm with no OPERATORS: tail, naming OPERATORS, without dispatching", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("OPERATORS:");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("PASSES a score arm with an OPERATORS: tail through to the dispatch", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors; OPERATORS: relational-boundary, regex-quantifier-bound",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  // Spec review round 2: the score arm BINDS. A valid score without its tail is
  // rejected even when the line also carries a cannot-express tail; otherwise a
  // quoted score passes without its jurisdiction on the other arm.
  it("EXITS 2 on a score arm with no OPERATORS: tail even beside a CANNOT-EXPRESS: tail", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: tests/mutation/source/spawnBounded.ts - MUTATION SCORE: 12/12, 0 unaccepted survivors; CANNOT-EXPRESS: watchdog half, no string-literal operator",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("OPERATORS:");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("EXITS 2 on a NON-canonical score beside a CANNOT-EXPRESS: tail (marker precedence)", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: lib/foo.ts - MUTATION SCORE: 0/0, 0 unaccepted survivors; CANNOT-EXPRESS: spawn-only",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  it("EXITS 2 on an OPERATORS: marker with an empty tail", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors; OPERATORS:",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // Diff review round 4: `\\S` accepts ANY non-whitespace, so a marker whose
  // value is empty but which is FOLLOWED by another token passed - the next
  // arm's own punctuation became the "operator set". An empty tail at
  // end-of-line was covered; the whole suffix-followed class was not. Narrowed
  // to "the tail begins with an identifier character", optionally backticked,
  // which is what every real tail in the corpus does.
  it.each([
    ["semicolon before the next arm", "; OPERATORS: ; CANNOT-EXPRESS: spawn-only"],
    ["comma-only value", "; OPERATORS: , relational-boundary"],
    ["dash-only value", "; OPERATORS: - relational-boundary"],
  ])("EXITS 2 on an OPERATORS: value that is empty but suffix-followed (%s)", async (_n, tail) => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      `GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors${tail}`,
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // The same shape on the SIBLING arm, which predates this spec: one defect,
  // both instances, repaired together rather than left for the next round.
  it("EXITS 2 on a CANNOT-EXPRESS: value that is empty but suffix-followed", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, "GUARD SURFACE: lib/foo.ts - CANNOT-EXPRESS: ; see below");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // The narrowing's positive twin: a backticked tail is what the live corpus
  // writes, so it must keep dispatching or the narrowing has gone too far.
  it("PASSES a backtick-quoted OPERATORS: tail", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors; OPERATORS: `all`",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(0);
    expect(readCalls(run)).toHaveLength(1);
  });

  // Spec review round 1: the corpus writes the declaration as a Markdown
  // heading and the shipped trigger never read it. Structure-keyed: one to six
  // `#` then whitespace, nothing else (spec §4 L-E).
  it("EXITS 2 on a HEADING-form score arm with no OPERATORS: tail (AC-9)", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "## GUARD SURFACE: psqlStartupScan - MUTATION SCORE: 49/49, 0 unaccepted survivors",
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("OPERATORS:");
    expect(readCalls(run)).toHaveLength(0);
  });

  it("replays the 24 corpus heading lines: the 20 nonconforming ones are enumerated by number, the 4 conforming ones dispatch alone, the 12 score lines dispatch once a tail is appended (AC-9)", async () => {
    const rejected = HEADING_CORPUS.filter((r) => r.verdict.startsWith("reject-"));
    const accepted = HEADING_CORPUS.filter((r) => r.verdict.startsWith("dispatch-"));
    const scored = HEADING_CORPUS.filter((r) => r.verdict === "reject-no-operators");
    expect([rejected.length, accepted.length, scored.length]).toEqual([20, 4, 12]);

    const all = mkRun();
    writeScenario(all, [APPROVE_STEP]);
    briefWith(all, HEADING_CORPUS.map((r) => r.line).join("\n"));
    const resAll = await dispatch(all);
    expect(resAll.code).toBe(2);
    expect(readCalls(all)).toHaveLength(0);
    // The message enumerates EXACTLY the nonconforming lines, by 1-based line number.
    const listed = [...resAll.stderr.matchAll(/^\s+line (\d+):/gm)]
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    const expected = HEADING_CORPUS.map((r, i) =>
      r.verdict.startsWith("reject-") ? i + 1 : null,
    ).filter((n): n is number => n !== null);
    expect(listed).toEqual(expected);

    const ok = mkRun();
    writeScenario(ok, [APPROVE_STEP]);
    briefWith(ok, accepted.map((r) => r.line).join("\n"));
    const resOk = await dispatch(ok);
    expect(resOk.code).toBe(0);
    expect(readCalls(ok)).toHaveLength(1);

    const tailed = mkRun();
    writeScenario(tailed, [APPROVE_STEP]);
    briefWith(tailed, scored.map((r) => `${r.line}; OPERATORS: all`).join("\n"));
    const resTailed = await dispatch(tailed);
    expect(resTailed.code).toBe(0);
    expect(readCalls(tailed)).toHaveLength(1);
  });

  it("PASSES a conforming score-arm line through to the dispatch", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      "GUARD SURFACE: lib/reviewRounds/filing.ts — MUTATION SCORE: 82/84, 0 unaccepted survivors; OPERATORS: all",
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
    writeScenario(run, [APPROVE_STEP]);
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
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      [
        "GUARD SURFACE: lib/reviewRounds/corpus.ts — MUTATION SCORE: 12/12, 0 unaccepted survivors; OPERATORS: all",
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
    writeScenario(run, [APPROVE_STEP]);
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
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, `GUARD SURFACE: lib/foo.ts — ${decl}`);
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  // Spec R4 (unrelated_fraction): adjacency is load-bearing - a floating
  // fraction elsewhere on the line cannot satisfy the arm.
  it("EXITS 2 on a floating fraction without the adjacent MUTATION SCORE: marker", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
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
    briefWith(
      run,
      "GUARD SURFACE: lib/foo.ts — MUTATION SCORE: 0/1, 0 unaccepted survivors; OPERATORS: all",
    );
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
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, `GUARD SURFACE: lib/foo.ts — ${decl}`);
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  it("enumerates EVERY nonconforming line, not only the first", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
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
    writeScenario(run, [APPROVE_STEP]);
    briefWith(
      run,
      [
        "GUARD SURFACE: lib/foo.ts — see below",
        "",
        "```",
        "GUARD SURFACE: lib/foo.ts — MUTATION SCORE: 82/84, 0 unaccepted survivors; OPERATORS: all",
        "```",
      ].join("\n"),
    );
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });

  it("EXITS 2 on a CANNOT-EXPRESS marker with an empty tail", async () => {
    const run = mkRun();
    writeScenario(run, [APPROVE_STEP]);
    briefWith(run, "GUARD SURFACE: scripts/codex-guard.mjs — CANNOT-EXPRESS:");
    const res = await dispatch(run);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0);
  });
});

const T = 60000;

describe("guard-surface refusal message (2026-08-26)", () => {
  /** The one conforming line the refusal must show, verbatim. */
  const CONFORMING =
    "GUARD SURFACE: <surface>, MUTATION SCORE: 4/4, 0 unaccepted survivors, OPERATORS: all";

  it(
    "prints one CONFORMING line, and that line actually passes the gate",
    async () => {
      // The measured incident: the refusal repeated the AGENTS.md conjunction
      // prose ("<killed>/<total> plus 0 unaccepted survivors plus OPERATORS:"),
      // so a contributor who wrote "plus" was told to write "plus". The message
      // now shows a line that WORKS.
      const run = mkRun();
      writeScenario(run, [APPROVE_STEP]);
      writeFileSync(
        run.briefPath,
        [
          "# Brief",
          "",
          "GUARD SURFACE: x, MUTATION SCORE: 4/4 plus 0 unaccepted survivors plus OPERATORS: all",
          "",
        ].join("\n"),
      );
      const r = await runGuard(
        run,
        ["--stage", "diff", "--round", "1"],
        {},
        { injectDefaults: false },
      );

      expect(r.code).toBe(2);
      expect(r.stderr).toContain(CONFORMING);
      expect(readCalls(run)).toHaveLength(0);

      // The example is not decoration: the same line, used as a brief, DISPATCHES.
      // A message showing a non-conforming example would be worse than none.
      const ok = mkRun();
      writeScenario(ok, [APPROVE_STEP]);
      writeFileSync(
        ok.briefPath,
        ["# Brief", "", CONFORMING.replace("<surface>", "taskContract"), ""].join("\n"),
      );
      const r2 = await runGuard(
        ok,
        ["--stage", "diff", "--round", "1"],
        {},
        { injectDefaults: false },
      );
      expect(r2.code).toBe(0);
      expect(readCalls(ok)).toHaveLength(1);
    },
    T,
  );

  it(
    "does NOT widen the separator grammar: a conjunction line is still refused",
    async () => {
      // The docs show the form; the grammar does not chase them. Asserted
      // explicitly so a later reader cannot resolve the incident by loosening
      // the regex, which is the repair this arc declined.
      const run = mkRun();
      writeScenario(run, [APPROVE_STEP]);
      writeFileSync(
        run.briefPath,
        [
          "# Brief",
          "",
          "GUARD SURFACE: x, MUTATION SCORE: 4/4 and 0 unaccepted survivors, OPERATORS: all",
          "",
        ].join("\n"),
      );
      const r = await runGuard(
        run,
        ["--stage", "diff", "--round", "1"],
        {},
        { injectDefaults: false },
      );
      expect(r.code).toBe(2);
      expect(readCalls(run)).toHaveLength(0);
    },
    T,
  );

  it("AGENTS.md shows the same conforming line, not the conjunction prose", () => {
    // The docs half of the same repair. Without it the message and the
    // contributor's source of truth still disagree.
    const agents = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
    expect(agents).toContain(CONFORMING);
  });
});
