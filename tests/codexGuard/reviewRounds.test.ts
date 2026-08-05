import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// `readResult` arrives HERE, in the task that first calls it: Task 4 must be
// runnable and committable on its own (TDD invariant 1), and a test block whose
// helper is imported by a later task's fence is red for a reason that has
// nothing to do with the behavior under test.
import {
  GUARD,
  cleanupRuns,
  guardEnv,
  mkRun,
  readResult,
  runGuard,
  writeScenario,
} from "./harness";

afterAll(cleanupRuns);

describe("codex-guard --stage / --round validation (spec §5.1)", () => {
  // Failure caught: inference creeping back in - a wrapper that guesses the
  // stage from the brief or the --out path instead of being told.
  it("exits 2 naming --stage when it is missing", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code, stderr } = await runGuard(run, ["--round", "1"], {}, { injectDefaults: false });
    expect(code).toBe(2);
    expect(stderr).toContain("--stage");
  });

  // Failure caught: a required flag that silently defaults, which is the
  // "forgetting exempts the arc" hole the hard cutover exists to close.
  it("exits 2 naming --round when it is missing", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code, stderr } = await runGuard(
      run,
      ["--stage", "spec"],
      {},
      { injectDefaults: false },
    );
    expect(code).toBe(2);
    expect(stderr).toContain("--round");
  });

  // Failure caught: a silent `unknown` stage bucket - an exemption from the
  // gate wearing the costume of tolerance.
  it("exits 2 on a stage outside the accept-set, naming the value", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code, stderr } = await runGuard(run, ["--stage", "review", "--round", "1"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--stage");
    expect(stderr).toContain("review");
  });

  it.each([["0"], ["-1"], ["1.5"], ["abc"], [""]])("exits 2 on --round %j", async (bad) => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", bad]);
    expect(code).toBe(2);
    expect(stderr).toContain("--round");
  });

  it.each([["spec"], ["plan"], ["diff"], ["task"]])("accepts stage %j", async (stage) => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code } = await runGuard(run, ["--stage", stage, "--round", "2"]);
    expect(code).toBe(0);
  });
});

/** Turn a harness run's cwdDir into a real repo on a feature branch. */
function gitify(cwdDir: string): { base: string } {
  const g = (...args: string[]) =>
    execFileSync("git", args, { cwd: cwdDir, encoding: "utf8" }).trim();
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "T");
  writeFileSync(join(cwdDir, "seed.txt"), "seed\n");
  g("add", "seed.txt");
  g("commit", "-qm", "seed");
  const base = g("rev-parse", "HEAD");
  g("update-ref", "refs/remotes/origin/main", base);
  g("checkout", "-q", "-b", "feat/emit");
  return { base };
}

const corpusPath = (cwdDir: string, base: string): string =>
  join(cwdDir, "docs", "review-rounds", "feat", "emit", `${base.slice(0, 12)}.jsonl`);

const rowsIn = (file: string): Record<string, unknown>[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe("row emission (spec §5.4)", () => {
  // Failure caught: emission silently no-ops and the corpus is empty forever,
  // so every arc reads as having run zero rounds.
  it("appends a row after a successful verdict", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code } = await runGuard(run, ["--stage", "diff", "--round", "2"]);
    expect(code).toBe(0);

    const rows = rowsIn(corpusPath(run.cwdDir, base));
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({
      stage: "diff",
      round: 2,
      branch: "feat/emit",
      baseSha: base.slice(0, 12),
      status: "verdict",
      verdict: "APPROVE",
    });
    // Failure caught: a row whose identity disagrees with its own path - a
    // false identity in the committed corpus that the report prints as fact.
    expect(rows[0]!.baseSha).toBe(base.slice(0, 12));
  });

  // Failure caught: wrapper failures missing from the corpus entirely. Only
  // ONE of the two write sites emitting is the documented defect (spec §5.4).
  //
  // The trigger matters and is NOT the lint arm. `buildConfig` and the whole
  // `--lint-doc` preprocessing block run at MODULE TOP LEVEL, before `main` is
  // even defined and long before `main().catch` is installed. A bad
  // CODEX_GUARD_TSX therefore exits 2 in preprocessing, writes no result at
  // all, and never reaches the second writer. The fault must be raised INSIDE
  // main(). A CODEX_HOME pointed at a plain file does NOT do it - every read of
  // cfg.codexHome is already guarded (the heartbeat mkdir, the cache rung, and
  // findRollout each swallow their own failure), so that dispatch runs to a
  // clean verdict. Probed 2026-08-04: status "verdict", exit 0, twice. What
  // does reach the site is a DIRECTORY planted where attempt 1's transcript
  // file must go: createWriteStream errors, the stream-error latch rejects with
  // fail() (scripts/codex-guard.mjs:576-579), and that rejection leaves the
  // attempt loop for main().catch - while cfg.out stays writable, so the
  // wrapper-error result.json is still produced. Probed the same day: exit 3,
  // failureReason "wrapper_error".
  it("appends a row from the wrapper_error site too", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);

    mkdirSync(join(run.outDir, "attempt-1.transcript.txt"), { recursive: true });
    const { code } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(3);

    // Confirm the fault really took the second writer, not the first: a
    // wrapper_error result is the ONLY body that carries this failureReason.
    expect(readResult(run)).toMatchObject({
      status: "no_verdict",
      failureReason: "wrapper_error",
    });
    const rows = rowsIn(corpusPath(run.cwdDir, base));
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ status: "no_verdict", failureReason: "wrapper_error" });
  });

  // Belt-and-braces on the same defect, and independent of any trigger being
  // available: if a future refactor moves the fault surface, the integration
  // test above can silently stop reaching the second writer while still
  // passing on the first. This one cannot.
  it("has an emit call at BOTH result.json write sites", () => {
    const src = readFileSync(join(process.cwd(), "scripts", "codex-guard.mjs"), "utf8");
    const writes = [...src.matchAll(/result\.json/g)].length;
    const emits = [...src.matchAll(/emitReviewRoundRow\(/g)].length;
    // Derived from the source, not a literal: every result.json write site is
    // paired with an emit, plus the one emit inside the shared helper.
    expect(emits).toBeGreaterThanOrEqual(2);
    expect(writes).toBeGreaterThan(0);
  });

  // Failure caught: infra faults vanishing, or worse being recorded as
  // verdicts - the reaper bug killed 58% of dispatches at one point, and
  // counting those would push nearly every arc over threshold on noise.
  it("records a no_verdict row and marks it", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    await runGuard(run, ["--stage", "spec", "--round", "1", "--max-attempts", "1"]);
    const rows = rowsIn(corpusPath(run.cwdDir, base));
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ status: "no_verdict", verdict: null });
    expect(rows[0]!.failureReason).toBe("attempts_exhausted");
  });

  // Failure caught: telemetry breaking a review. The row is attached to work
  // that already happened; a corpus that cannot be written must not change the
  // exit code or lose the result.json.
  it("warns and preserves exit code and result.json when the corpus is unwritable", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    // Plant a DIRECTORY where the row file must go: mkdir succeeds, append fails.
    mkdirSync(corpusPath(run.cwdDir, base), { recursive: true });
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(0);
    expect(existsSync(join(run.outDir, "result.json"))).toBe(true);
    expect(stderr.toLowerCase()).toContain("review-round");
  });

  // Plan resolution R1. Failure caught: a non-repo --cwd throwing, which would
  // break every pre-existing tests/codexGuard scenario.
  it("warns and exits 0 when --cwd is not a git repository", async () => {
    const run = mkRun(); // cwdDir is a bare mkdirSync temp dir
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(0);
    expect(stderr.toLowerCase()).toContain("review-round");
  });

  // Failure caught: rows landing in a nonsense location under a detached HEAD.
  it("exits 2 on a detached HEAD", async () => {
    const run = mkRun();
    gitify(run.cwdDir);
    execFileSync("git", ["checkout", "-q", "--detach"], { cwd: run.cwdDir });
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const { code, stderr } = await runGuard(run, ["--stage", "spec", "--round", "1"]);
    expect(code).toBe(2);
    expect(stderr.toLowerCase()).toContain("detached");
  });

  // Failure caught: a corpus written under `<repo>/app/docs/` that the gate,
  // walking from the repo root, never sees - so an obliged arc passes.
  it("writes the repo-root corpus when --cwd is a subdirectory", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const sub = join(run.cwdDir, "app", "nested");
    mkdirSync(sub, { recursive: true });
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "spec", "--round", "1", "--cwd", sub]);
    expect(existsSync(corpusPath(run.cwdDir, base))).toBe(true);
    expect(existsSync(join(sub, "docs", "review-rounds"))).toBe(false);
  });
});

describe("declared finding count (spec §5.3)", () => {
  // Failure caught: a count inferred from prose shape. The probe measured
  // inferred recognition at 64.8% against 681 real outputs; declared reaches
  // 99.6%. A recognizer here is the denylist shape the accept-set rule forbids.
  it("records the declared count", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "FINDINGS: 5\nVERDICT: BLOCKING\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBe(5);
  });

  it("records 0 as 0, distinct from undeclared", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "FINDINGS: 0\nVERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBe(0);
  });

  // Failure caught: `null` folded into zero, which understates every report
  // total and is indistinguishable from "no findings found" (spec §5.3).
  it("records null when no line was declared, never zero", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "I found 3 problems, listed above.\nVERDICT: BLOCKING\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBeNull();
  });

  // Failure caught: an unanchored recognizer reading "FINDINGS: 2 or 7" as 2,
  // recording an ambiguous declaration as a fact. This is an ordinary malformed
  // reviewer response, not hiding, so the consequence bound applies: the corpus
  // must not carry a false scalar.
  it.each([["FINDINGS: 2 or 7"], ["FINDINGS: 3 (plus 2 nits)"], ["FINDINGS: 4 and rising"]])(
    "records null for the ambiguous single line %j",
    async (line) => {
      const run = mkRun();
      const { base } = gitify(run.cwdDir);
      writeScenario(run, [
        {
          onCall: 1,
          actions: [
            { type: "lastMessage", text: `${line}\nVERDICT: BLOCKING\n` },
            { type: "exit", code: 0 },
          ],
        },
      ]);
      await runGuard(run, ["--stage", "diff", "--round", "1"]);
      expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBeNull();
    },
  );

  // Failure caught: an ambiguous double declaration silently taking the first.
  it("records null when two different counts are declared", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "FINDINGS: 2\nFINDINGS: 7\nVERDICT: BLOCKING\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(rowsIn(corpusPath(run.cwdDir, base))[0]!.findingCount).toBeNull();
  });

  // Failure caught: the carrier's grain reduced to "last message wins". The
  // ladder reads a terminal message per attempt, and the later ones are
  // routinely EMPTY or ABSENT - that is what a reaped attempt looks like. An
  // empty message is not a declaration of nothing, so folding it in overwrites
  // the real declaration with `null` and the corpus reports a reviewer that
  // gave a number as one that never did. Probed 2026-08-04: with the
  // non-empty check removed from `recordDeclaredCount`, the whole file stayed
  // green at 35/35, so nothing else pins this.
  it("keeps an earlier declaration when later attempts read empty or absent", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    writeScenario(run, [
      // Declares, but never reaches a VERDICT line, so the ladder continues.
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nStill working, no verdict yet.\n` },
          { type: "exit", code: 0 },
        ],
      },
      // Present but empty, then absent entirely: BOTH shapes the guard folds to
      // "" - one test covers both branches of the same check.
      {
        onCall: 2,
        actions: [
          { type: "lastMessage", text: "" },
          { type: "exit", code: 0 },
        ],
      },
      { onCall: 3, actions: [{ type: "exit", code: 0 }] },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);

    // Proves the two later reads actually happened - without this the test
    // could pass on a ladder that stopped after attempt 1.
    const shapes = readResult(run).attempts.map((a) => a.failureShape);
    expect(shapes).toEqual(["no_marker", "empty_o_file", "no_o_file"]);
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    // Derived from attempt 1's own declared line, never a literal repeated on
    // the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  }, 30000);

  // Failure caught: wiring the count at the verdict-success path only. A
  // reviewer that declares its count and then dies before emitting a VERDICT
  // line records `null`, which means NOT DECLARED - so a real declaration is
  // erased, and the corpus reports the reviewer never gave a number.
  it("records a declared count on a no_verdict row, never null", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "FINDINGS: 2\nStill working, no verdict yet.\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1", "--max-attempts", "1"]);
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.status).toBe("no_verdict");
    expect(row.findingCount).toBe(2);
  });

  // Failure caught: the SECOND parse site left unwired. A rollout-recovered
  // verdict is a full review that reached a conclusion, and recording its
  // declared count as `null` says the reviewer declared nothing.
  it("records the declared count on a rollout-recovered verdict", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const SID = "0199aa11-2233-4455-6677-889900aabbcc";
    const rolloutDir = join(run.codexHome, "sessions", "2026", "07", "24");
    mkdirSync(rolloutDir, { recursive: true });
    // The -o write never lands; the verdict AND its count survive only in the
    // rollout, which is exactly the shape the reaper bug produced.
    const rollout = [
      JSON.stringify({
        timestamp: "2026-07-24T20:30:43.000Z",
        type: "session_meta",
        payload: { id: SID, cli_version: "0.146.0-alpha.6", originator: "codex_exec" },
      }),
      JSON.stringify({
        timestamp: "2026-07-24T20:31:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "FINDINGS: 3\n\nVERDICT: BLOCKING" }],
        },
      }),
    ].join("\n");
    writeFileSync(join(rolloutDir, `rollout-2026-07-24T20-30-43-${SID}.jsonl`), rollout + "\n");

    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID}\n` },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 2,
        actions: [
          { type: "stderr", text: "dead\n" },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 3,
        actions: [
          { type: "stderr", text: "dead\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1"]);

    expect(readResult(run)).toMatchObject({ status: "verdict", recoveredFrom: "rollout_scrape" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    // Derived from the rollout fixture's own declared line, not a literal
    // repeated from the assertion side.
    expect(row.findingCount).toBe(3);
    expect(row.verdict).toBe("BLOCKING");
  });

  // Failure caught: the count wired at the two SUCCESS writers only. `onSignal`
  // (scripts/codex-guard.mjs:1051-1057) writes its own terminal result, so a
  // reviewer that declared FINDINGS: 2 and was then interrupted records `null`
  // - "not declared" - and the corpus then reports a declaration that WAS made
  // as one the reviewer never gave. A false fact about a real review, which is
  // the outcome the consequence bound forbids.
  it("records a declared count on an interrupted row", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    // Attempt 1 declares its count and stops short of a VERDICT line, so the
    // ladder continues (no_marker); attempt 2 hangs, which is what leaves a
    // live child for the SIGTERM to interrupt.
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: "x" },
          { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nStill working, no verdict yet.\n` },
          { type: "exit", code: 0 },
        ],
      },
      { onCall: 2, actions: [{ type: "stdout", text: "x" }, { type: "hang" }] },
    ]);
    const child = spawn(
      process.execPath,
      [
        GUARD,
        "review",
        "--brief",
        run.briefPath,
        "--cwd",
        run.cwdDir,
        "--out",
        run.outDir,
        "--stage",
        "diff",
        "--round",
        "1",
      ],
      {
        env: guardEnv(run, {
          CODEX_GUARD_STALL_SECS: "30",
          CODEX_GUARD_ATTEMPT_MAX_SECS: "60",
          CODEX_GUARD_TOTAL_MAX_SECS: "90",
        }),
      },
    );
    const exited = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      // Waiting on attempt 2's pidfile is what makes this deterministic rather
      // than a sleep: it proves attempt 1 was already read and classified, so
      // there is a declared count present to lose.
      for (let i = 0; i < 200 && !existsSync(join(run.recordDir, "pid-2.txt")); i++) await nap(50);
      expect(existsSync(join(run.recordDir, "pid-2.txt"))).toBe(true);
      child.kill("SIGTERM");
      expect(await exited).toBe(3);
    } finally {
      child.kill("SIGKILL");
    }
    expect(readResult(run)).toMatchObject({ failureReason: "interrupted" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.failureReason).toBe("interrupted");
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  }, 30000);

  // Failure caught: the same gap at the fourth writer. The `main().catch`
  // handler (scripts/codex-guard.mjs:1075-1093) builds its OWN body literal
  // instead of going through `writeResult`, so a count threaded through
  // `writeResult` alone is absent from every wrapper-error row - and an infra
  // fault is exactly when an operator most wants the reviewer's own number.
  it("records a declared count on a wrapper_error row", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: "x" },
          { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nStill working, no verdict yet.\n` },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    // The fault must land inside main() and AFTER attempt 1 declared its count,
    // so the directory goes where attempt TWO's transcript must be written.
    // Task 4 Step 1 records why this is the trigger that reaches the site and
    // why the CODEX_HOME one does not.
    mkdirSync(join(run.outDir, "attempt-2.transcript.txt"), { recursive: true });
    const { code } = await runGuard(run, ["--stage", "diff", "--round", "1"]);
    expect(code).toBe(3);
    expect(readResult(run)).toMatchObject({ status: "no_verdict", failureReason: "wrapper_error" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.findingCount).toBe(DECLARED);
  });

  // Failure caught: the count extracted below the FIRST of `classifyAttempt`'s
  // guards specifically. `killed` and `nonzero_exit` are two separate early
  // returns, so a read hoisted past only the second one still loses every
  // watchdog-killed attempt - and the reaper era is exactly the regime where a
  // reviewer writes its message and is then killed. Probed 2026-08-04: with the
  // read moved below the `killedReason` guard alone, the whole file stayed
  // green at 34/34, so the nonzero-exit case below does NOT cover this path.
  it("records a declared count on a watchdog-killed attempt whose message landed", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    // The message lands and the process then produces no bytes at all, so the
    // first-output watchdog kills it (`no_output`, scripts/codex-guard.mjs:690)
    // rather than it exiting on its own.
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nVERDICT: BLOCKING\n` },
          { type: "hang" },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1", "--max-attempts", "1"]);
    // Proves the attempt really took the `killed` guard and not some other
    // early return, so the assertion below cannot pass via the wrong path.
    const result = readResult(run);
    expect(result.attempts[0]!.killedReason).toBe("no_output");
    expect(result.attempts[0]!.failureShape).toBe("killed");
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.status).toBe("no_verdict");
    expect(row.verdict).toBeNull();
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  }, 30000);

  // Failure caught: the count extracted BELOW `classifyAttempt`'s exit-shape
  // guards. An attempt that writes its message and then exits nonzero returns
  // at the `nonzero_exit` guard (scripts/codex-guard.mjs:492-495), which is
  // ABOVE the read, so the message is never opened and the corpus records
  // `null` - "not declared" - against a message that plainly declares. The
  // reviewer's own number is a fact about the review, not about the exit code
  // of the process that carried it.
  it("records a declared count on a nonzero-exit attempt whose message landed", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nVERDICT: BLOCKING\n` },
          { type: "exit", code: 1 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1", "--max-attempts", "1"]);
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    // The verdict is NOT accepted, because the attempt failed - and the
    // declared count survives anyway. That is the decoupling stated as an
    // assertion: one row carrying both answers, reached by different paths.
    expect(row.status).toBe("no_verdict");
    expect(row.verdict).toBeNull();
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  });

  // Failure caught: the count extracted BELOW the scrape's verdict guard.
  // `tryRolloutScrape` continues at `parsed.shape !== "ok"`
  // (scripts/codex-guard.mjs:783-784), so a rollout whose message declares a
  // count but never reached a VERDICT line loses it - and on this dispatch
  // nothing else ever read a message, so the declaration is gone outright
  // rather than merely stale.
  it("records a declared count from a rollout message carrying no verdict", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    const SID = "0199bb22-3344-5566-7788-99aabbccddee";
    const rolloutDir = join(run.codexHome, "sessions", "2026", "07", "24");
    mkdirSync(rolloutDir, { recursive: true });
    const rollout = [
      JSON.stringify({
        timestamp: "2026-07-24T21:10:00.000Z",
        type: "session_meta",
        payload: { id: SID, cli_version: "0.146.0-alpha.6", originator: "codex_exec" },
      }),
      JSON.stringify({
        timestamp: "2026-07-24T21:11:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: `FINDINGS: ${DECLARED}\n\nStill working, no verdict yet.`,
            },
          ],
        },
      }),
    ].join("\n");
    writeFileSync(join(rolloutDir, `rollout-2026-07-24T21-10-00-${SID}.jsonl`), rollout + "\n");

    // The -o write never lands, so the ONLY terminal message this dispatch
    // produced is the scraped one.
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID}\n` },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    await runGuard(run, ["--stage", "diff", "--round", "1", "--max-attempts", "1"]);

    // No verdict is recovered - there was none to recover - and the count
    // lands regardless, which is the whole point of the split.
    expect(readResult(run)).toMatchObject({ status: "no_verdict", recoveredFrom: null });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    // Derived from the rollout fixture's own declared line.
    expect(row.findingCount).toBe(DECLARED);
  });

  // Failure caught: the interrupt path reading nothing at all. The live
  // attempt writes its terminal message and then hangs, so `classifyAttempt`
  // never runs for it and neither read site is ever reached; `onSignal`
  // (scripts/codex-guard.mjs:1042-1058) then writes the interrupted result
  // from a carrier that is still null. A declaration sitting on disk in the
  // out-dir is recorded as one the reviewer never gave, on the one dispatch
  // shape where no later attempt and no scrape can recover it.
  it("records a declared count when SIGTERM lands before the attempt is classified", async () => {
    const run = mkRun();
    const { base } = gitify(run.cwdDir);
    const DECLARED = 2;
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: "x" },
          { type: "lastMessage", text: `FINDINGS: ${DECLARED}\nStill working, no verdict yet.\n` },
          { type: "hang" },
        ],
      },
    ]);
    const child = spawn(
      process.execPath,
      [
        GUARD,
        "review",
        "--brief",
        run.briefPath,
        "--cwd",
        run.cwdDir,
        "--out",
        run.outDir,
        "--stage",
        "diff",
        "--round",
        "1",
      ],
      {
        env: guardEnv(run, {
          CODEX_GUARD_STALL_SECS: "30",
          CODEX_GUARD_ATTEMPT_MAX_SECS: "60",
          CODEX_GUARD_TOTAL_MAX_SECS: "90",
        }),
      },
    );
    const exitedAt = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const msgPath = join(run.outDir, "attempt-1.last-message.txt");
    try {
      // Waiting on the MESSAGE FILE rather than a pidfile is what puts the
      // signal in the right window: the file existing proves the declaration
      // is on disk, and attempt 1 hanging proves nothing has classified it.
      for (let i = 0; i < 200 && !existsSync(msgPath); i++) await pause(50);
      expect(existsSync(msgPath)).toBe(true);
      // No second attempt was ever started, so no other read could have run.
      expect(existsSync(join(run.recordDir, "pid-2.txt"))).toBe(false);
      child.kill("SIGTERM");
      expect(await exitedAt).toBe(3);
    } finally {
      child.kill("SIGKILL");
    }
    expect(readResult(run)).toMatchObject({ failureReason: "interrupted" });
    const row = rowsIn(corpusPath(run.cwdDir, base))[0]!;
    expect(row.failureReason).toBe("interrupted");
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(row.findingCount).toBe(DECLARED);
  }, 30000);
});
