import { afterAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUARD,
  cleanupRuns,
  guardEnv,
  mkRun,
  runGuard,
  writeScenario,
  type GuardExit,
  type Run,
} from "./harness";

afterAll(cleanupRuns);

// Raw invocation with fully caller-controlled argv (runGuard always passes the
// required trio; the missing-flag rows need it absent).
function rawGuard(
  run: Run,
  argv: string[],
  envOverrides: Record<string, string> = {},
): Promise<GuardExit> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [GUARD, ...argv],
      {
        env: guardEnv(run, envOverrides),
        maxBuffer: 16 * 1024 * 1024,
        timeout: 25000,
        killSignal: "SIGTERM",
      },
      (err, stdout, stderr) => {
        const code = err
          ? typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code?: number }).code ?? null)
            : null
          : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

function expectUsage(res: GuardExit, run: Run): void {
  expect(res.code).toBe(2);
  expect(res.stderr).toContain("codex-guard:");
  expect(existsSync(join(run.outDir, "result.json"))).toBe(false);
}

describe("codex-guard usage errors (spec §7, scenario 8)", () => {
  it("missing --brief", async () => {
    const run = mkRun();
    const res = await rawGuard(run, ["review", "--cwd", run.cwdDir, "--out", run.outDir]);
    expectUsage(res, run);
  });

  it("--artifact without --fallback", async () => {
    const run = mkRun();
    const art = join(run.dir, "artifact.md");
    writeFileSync(art, "content\n");
    const res = await runGuard(run, ["--artifact", art]);
    expectUsage(res, run);
  });

  it("bad --label", async () => {
    const run = mkRun();
    const res = await runGuard(run, ["--label", "bad label!"]);
    expectUsage(res, run);
  });

  it("--attempt-max-secs above the 1380 watchdog bound", async () => {
    const run = mkRun();
    const res = await runGuard(run, ["--attempt-max-secs", "1400"]);
    expectUsage(res, run);
  });

  it("CODEX_GUARD_POLL_INTERVAL_SECS above 30", async () => {
    const run = mkRun();
    const res = await runGuard(run, [], { CODEX_GUARD_POLL_INTERVAL_SECS: "31" });
    expectUsage(res, run);
  });

  it("--stall-secs >= --attempt-max-secs", async () => {
    const run = mkRun();
    const res = await runGuard(run, ["--stall-secs", "10", "--attempt-max-secs", "10"]);
    expectUsage(res, run);
  });

  it("pre-existing result.json in --out (non-empty)", async () => {
    const run = mkRun();
    mkdirSync(run.outDir, { recursive: true });
    writeFileSync(join(run.outDir, "result.json"), "{}");
    const res = await runGuard(run, []);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("codex-guard:");
  });

  it("pre-existing zero-byte result.json in --out", async () => {
    const run = mkRun();
    mkdirSync(run.outDir, { recursive: true });
    writeFileSync(join(run.outDir, "result.json"), "");
    const res = await runGuard(run, []);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("codex-guard:");
  });

  it("decimal CODEX_GUARD_MAX_ATTEMPTS", async () => {
    const run = mkRun();
    const res = await runGuard(run, [], { CODEX_GUARD_MAX_ATTEMPTS: "2.5" });
    expectUsage(res, run);
  });

  it("decimal CLI flag --stall-secs (flags are integer-only)", async () => {
    const run = mkRun();
    const res = await runGuard(run, ["--stall-secs", "0.5"]);
    expectUsage(res, run);
  });

  it("decimal CLI flag --attempt-max-secs", async () => {
    const run = mkRun();
    const res = await runGuard(run, ["--attempt-max-secs", "0.5"]);
    expectUsage(res, run);
  });

  it("unreadable brief (perms, not just existence)", async () => {
    const run = mkRun();
    writeFileSync(run.briefPath, "x");
    chmodSync(run.briefPath, 0o000);
    try {
      const res = await runGuard(run, []);
      expectUsage(res, run);
    } finally {
      chmodSync(run.briefPath, 0o644);
    }
  });

  it("unreadable artifact with --fallback", async () => {
    const run = mkRun();
    const art = join(run.dir, "artifact.md");
    writeFileSync(art, "content\n");
    chmodSync(art, 0o000);
    try {
      const res = await runGuard(run, ["--fallback", "--artifact", art]);
      expectUsage(res, run);
    } finally {
      chmodSync(art, 0o644);
    }
  });

  it("unwritable --out", async () => {
    const run = mkRun();
    mkdirSync(run.outDir, { recursive: true });
    chmodSync(run.outDir, 0o500);
    try {
      const res = await runGuard(run, []);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("codex-guard:");
    } finally {
      chmodSync(run.outDir, 0o755);
    }
  });

  it("CODEX_GUARD_BIN_ARGS invalid JSON", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    const res = await runGuard(run, [], { CODEX_GUARD_BIN_ARGS: "not-json" });
    expectUsage(res, run);
  });
});
