import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);
const ONE_ATTEMPT = { CODEX_GUARD_MAX_ATTEMPTS: "1" };

function assertDead(pidFile: string): void {
  const pid = Number(readFileSync(pidFile, "utf8"));
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  expect(alive).toBe(false);
}

describe("codex-guard timeouts (§5)", () => {
  it("scenario 5: stall after first byte → stall kill", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "stdout", text: "x" }, { type: "hang" }] }]);
    const res = await runGuard(run, [], ONE_ATTEMPT);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("no_verdict");
    expect(r.attempts[0]!).toMatchObject({ killedReason: "stall", failureShape: "killed" });
  }, 30000);

  it("scenario 6: no first byte → no_output kill", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "hang" }] }]);
    const res = await runGuard(run, [], ONE_ATTEMPT);
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.killedReason).toBe("no_output");
  }, 30000);

  it("scenario 12: periodic output resets the stall clock — no kill", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "emitEvery", ms: 400, times: 20, text: "tick\n" },
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run, [], {
      ...ONE_ATTEMPT,
      CODEX_GUARD_ATTEMPT_MAX_SECS: "15",
      CODEX_GUARD_TOTAL_MAX_SECS: "18",
    });
    expect(res.code).toBe(0);
    expect(readResult(run).status).toBe("verdict");
  }, 30000);

  it("scenario 12b: stderr-only periodic output resets clocks — no kill", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "emitEvery", ms: 400, times: 20, text: "warn tick\n", stream: "stderr" },
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run, [], {
      CODEX_GUARD_MAX_ATTEMPTS: "1",
      CODEX_GUARD_ATTEMPT_MAX_SECS: "15",
      CODEX_GUARD_TOTAL_MAX_SECS: "18",
    });
    expect(res.code).toBe(0);
    expect(readResult(run).status).toBe("verdict");
  }, 30000);

  it("scenario 9: total timeout mid-attempt actively kills (pidfile dead)", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: "a" },
          { type: "exit", code: 1 },
        ],
      },
      { onCall: 2, actions: [{ type: "emitEvery", ms: 200, times: 100, text: "t" }] },
    ]);
    const res = await runGuard(run, [], {
      CODEX_GUARD_TOTAL_MAX_SECS: "3",
      CODEX_GUARD_ATTEMPT_MAX_SECS: "10",
      CODEX_GUARD_STALL_SECS: "8",
      CODEX_GUARD_FIRST_OUTPUT_SECS: "8",
    });
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.failureReason).toBe("total_timeout");
    expect(r.attempts[1]!.killedReason).toBe("total_timeout");
    assertDead(join(run.recordDir, "pid-2.txt"));
  }, 30000);

  it("scenario 17a: continuous output past attempt-max → attempt_timeout", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "emitEvery", ms: 200, times: 200, text: "t" }] },
    ]);
    const res = await runGuard(run, [], {
      ...ONE_ATTEMPT,
      CODEX_GUARD_ATTEMPT_MAX_SECS: "2",
      CODEX_GUARD_STALL_SECS: "1.5",
      CODEX_GUARD_FIRST_OUTPUT_SECS: "1.5",
      CODEX_GUARD_TOTAL_MAX_SECS: "30",
    });
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.killedReason).toBe("attempt_timeout");
  }, 30000);

  it("scenario 17b: attempt-max and total-max expire together → total_timeout wins", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "emitEvery", ms: 200, times: 200, text: "t" }] },
    ]);
    const res = await runGuard(run, [], {
      ...ONE_ATTEMPT,
      CODEX_GUARD_ATTEMPT_MAX_SECS: "2",
      CODEX_GUARD_TOTAL_MAX_SECS: "2",
      CODEX_GUARD_STALL_SECS: "1.5",
      CODEX_GUARD_FIRST_OUTPUT_SECS: "1.5",
    });
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.killedReason).toBe("total_timeout");
  }, 30000);
});
