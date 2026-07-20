import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GUARD, cleanupRuns, guardEnv, mkRun, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

describe("codex-guard signals + spawn errors", () => {
  it("scenario 13: child killed externally → external_signal, ladder continues", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stdout", text: "x" }, { type: "hang" }] },
      { onCall: 2, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
    ]);
    const killer = setInterval(() => {
      const f = join(run.recordDir, "pid-1.txt");
      if (existsSync(f)) {
        try {
          process.kill(Number(readFileSync(f, "utf8")), "SIGKILL");
        } catch {
          /* raced */
        }
        clearInterval(killer);
      }
    }, 50);
    try {
      const res = await runGuard(run);
      expect(res.code).toBe(0);
      const r = readResult(run);
      const a1 = r.attempts[0]!;
      expect(a1.killedReason).toBe("external_signal");
      expect(a1.signal).toBe("SIGKILL");
      expect(r.status).toBe("verdict");
    } finally {
      clearInterval(killer);
    }
  }, 30000);

  it("scenario 14: nonexistent CODEX_GUARD_BIN → exit 3, wrapper_error, spawn_error attempt", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    const res = await runGuard(run, [], { CODEX_GUARD_BIN: "/nonexistent/codex-binary", CODEX_GUARD_BIN_ARGS: "[]" });
    expect(res.code).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("wrapper_error");
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0]!.failureShape).toBe("spawn_error");
  });

  it("scenario 16 (+14b history pin): SIGTERM to wrapper → exit 3, interrupted, group dead incl. TERM-ignoring grandchild, attempts preserved", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "grandchild" }, { type: "stdout", text: "x" }, { type: "hang" }] },
    ]);
    const child = spawn(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir],
      { env: guardEnv(run, { CODEX_GUARD_STALL_SECS: "30", CODEX_GUARD_ATTEMPT_MAX_SECS: "60", CODEX_GUARD_TOTAL_MAX_SECS: "90" }) },
    );
    const exit = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    try {
      for (let i = 0; i < 100 && !existsSync(join(run.recordDir, "pid-1.txt")); i++) await sleep(50);
      expect(existsSync(join(run.recordDir, "pid-1.txt"))).toBe(true);
      // deterministic: wait for the grandchild pidfile too (no fixed-delay race on slow CI)
      for (let i = 0; i < 100 && !existsSync(join(run.recordDir, "grandchild-pid-1.txt")); i++) await sleep(50);
      expect(existsSync(join(run.recordDir, "grandchild-pid-1.txt"))).toBe(true);
      child.kill("SIGTERM");
      const code = await exit;
      expect(code).toBe(3);
      const r = readResult(run);
      expect(r.failureReason).toBe("interrupted");
      // 14b folded here: history preserved on the exit-3 path
      expect(r.attempts.length).toBeGreaterThanOrEqual(1);
      expect(r.attempts[0]!.n).toBe(1);
      await sleep(700); // reap window
      expect(isDead(Number(readFileSync(join(run.recordDir, "pid-1.txt"), "utf8")))).toBe(true);
      expect(isDead(Number(readFileSync(join(run.recordDir, "grandchild-pid-1.txt"), "utf8")))).toBe(true);
    } finally {
      child.kill("SIGKILL");
    }
  }, 30000);
});
