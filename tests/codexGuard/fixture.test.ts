import { afterAll, describe, expect, it } from "vitest";
import { execFile, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Self-test for the scenario-driven fake codex (plan "Fixture scenario protocol").
// Fixture tests manage their own mkdtemp dirs; guard tests use the harness cleanupRuns.

const FIXTURE = join(process.cwd(), "tests/codexGuard/fixtures/fake-codex.mjs");

const DIRS: string[] = [];
afterAll(() => {
  for (const d of DIRS.splice(0)) rmSync(d, { recursive: true, force: true });
});

function mkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
  DIRS.push(dir);
  return dir;
}

interface FixtureExit {
  code: number | null;
  stdout: string;
  stderr: string;
}

// The wrapper contract is "stdin always closed"; mirror it here — an execFile
// child whose stdin pipe is never ended would park the fixture on stdinDone.
function runFixture(
  args: string[],
  env: Record<string, string>,
  stdinText = "",
): Promise<FixtureExit> {
  return new Promise((resolve) => {
    const child: ChildProcess = execFile(
      process.execPath,
      [FIXTURE, ...args],
      { env: { ...process.env, ...env }, timeout: 15000, killSignal: "SIGKILL" },
      (err, stdout, stderr) => {
        const code = err
          ? typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code?: number }).code ?? null)
            : null
          : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    child.stdin?.end(stdinText);
  });
}

describe("fake-codex fixture", () => {
  it("scenario playback records argv/stdin/pid, honors -o and exit code", async () => {
    const dir = mkDir();
    const scenario = join(dir, "s.json");
    const oFile = join(dir, "last-message.txt");
    writeFileSync(
      scenario,
      JSON.stringify({
        steps: [
          {
            onCall: 1,
            actions: [
              { type: "stdout", text: "working\n" },
              { type: "lastMessage", text: "VERDICT: APPROVE\n" },
              { type: "exit", code: 0 },
            ],
          },
        ],
      }),
    );
    const res = await runFixture(
      ["exec", "--skip-git-repo-check", "-o", oFile],
      { FAKE_CODEX_SCENARIO: scenario, FAKE_CODEX_RECORD_DIR: dir },
      "PROMPT BODY",
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("working\n");
    const call = JSON.parse(readFileSync(join(dir, "call-1.json"), "utf8")) as {
      argv: string[];
      cwd: string;
      stdinBytes: number;
      stdin: string;
      codexHome: string | null;
    };
    expect(call.argv).toEqual(["exec", "--skip-git-repo-check", "-o", oFile]);
    expect(call.stdin).toBe("PROMPT BODY");
    expect(call.stdinBytes).toBe(Buffer.byteLength("PROMPT BODY"));
    const pid = Number(readFileSync(join(dir, "pid-1.txt"), "utf8"));
    expect(Number.isInteger(pid)).toBe(true);
    expect(pid).toBeGreaterThan(0);
    expect(readFileSync(oFile, "utf8")).toBe("VERDICT: APPROVE\n");
  });

  it("counts calls independently across two invocations of one record dir", async () => {
    const dir = mkDir();
    const scenario = join(dir, "s.json");
    writeFileSync(
      scenario,
      JSON.stringify({
        steps: [
          { onCall: 1, actions: [{ type: "exit", code: 0 }] },
          {
            onCall: 2,
            actions: [
              { type: "stderr", text: "second call\n" },
              { type: "exit", code: 7 },
            ],
          },
        ],
      }),
    );
    const env = { FAKE_CODEX_SCENARIO: scenario, FAKE_CODEX_RECORD_DIR: dir };
    const first = await runFixture(["exec"], env);
    expect(first.code).toBe(0);
    const second = await runFixture(["exec"], env);
    expect(second.code).toBe(7);
    expect(second.stderr).toBe("second call\n");
    const call2 = JSON.parse(readFileSync(join(dir, "call-2.json"), "utf8")) as { argv: string[] };
    expect(call2.argv).toEqual(["exec"]);
  });

  it("writeFile action substitutes $CODEX_HOME", async () => {
    const dir = mkDir();
    const ch = join(dir, "codexhome");
    mkdirSync(ch);
    const scenario = join(dir, "s.json");
    writeFileSync(
      scenario,
      JSON.stringify({
        steps: [
          {
            onCall: 1,
            actions: [
              {
                type: "writeFile",
                path: "$CODEX_HOME/models_cache.json",
                text: '{"recreated":true}',
              },
              { type: "exit", code: 0 },
            ],
          },
        ],
      }),
    );
    const res = await runFixture(["exec"], {
      FAKE_CODEX_SCENARIO: scenario,
      FAKE_CODEX_RECORD_DIR: dir,
      CODEX_HOME: ch,
    });
    expect(res.code).toBe(0);
    expect(JSON.parse(readFileSync(join(ch, "models_cache.json"), "utf8"))).toEqual({
      recreated: true,
    });
  });

  it("grandchild ignores SIGTERM (pin for scenario 16's KILL-fallback proof)", async () => {
    const dir = mkDir();
    const scenario = join(dir, "s.json");
    writeFileSync(
      scenario,
      JSON.stringify({
        steps: [{ onCall: 1, actions: [{ type: "grandchild" }, { type: "exit", code: 0 }] }],
      }),
    );
    const res = await runFixture(["exec"], {
      FAKE_CODEX_SCENARIO: scenario,
      FAKE_CODEX_RECORD_DIR: dir,
    });
    expect(res.code).toBe(0);
    // The grandchild writes its own pid file after registering its SIGTERM handler —
    // wait for it (the fixture may exit before the grandchild finishes booting).
    const gcPidPath = join(dir, "grandchild-pid-1.txt");
    const deadline = Date.now() + 5000;
    while (!existsSync(gcPidPath) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    const gcPid = Number(readFileSync(gcPidPath, "utf8"));
    try {
      process.kill(gcPid, "SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
      let alive = true;
      try {
        process.kill(gcPid, 0);
      } catch {
        alive = false;
      }
      expect(alive).toBe(true);
    } finally {
      try {
        process.kill(gcPid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  });
});
