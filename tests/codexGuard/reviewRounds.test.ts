import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// `readResult` arrives HERE, in the task that first calls it: Task 4 must be
// runnable and committable on its own (TDD invariant 1), and a test block whose
// helper is imported by a later task's fence is red for a reason that has
// nothing to do with the behavior under test.
import { cleanupRuns, mkRun, readResult, runGuard, writeScenario } from "./harness";

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
