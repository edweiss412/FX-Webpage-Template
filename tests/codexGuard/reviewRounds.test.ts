import { afterAll, describe, expect, it } from "vitest";

import { cleanupRuns, mkRun, runGuard, writeScenario } from "./harness";

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
