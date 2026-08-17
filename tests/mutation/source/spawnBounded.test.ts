import { describe, expect, it, vi } from "vitest";

/**
 * The MOCKED half of spawnBounded's guard, and the enrolled suite (spec §8).
 *
 * The split is deliberate: this file pins the pure interpretation and the
 * option wiring — the declared operators' home turf — with no live spawn, so
 * the per-mutant gate cost stays flat. The live process-tree behaviour the
 * registry cannot express lives in `./spawnBounded.live.test.ts`.
 */

type MockResult = {
  pid?: number;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error & { code?: string };
};

type RecordedCall = {
  cmd: string;
  args: string[];
  cwd: unknown;
  env: NodeJS.ProcessEnv | undefined;
  timeout: unknown;
  killSignal: unknown;
  stdio: unknown;
};

const calls: RecordedCall[] = [];
/** Handed back in order, one per `spawnSync` call. */
let results: MockResult[] = [];

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    spawnSync: (
      cmd: string,
      args: readonly string[],
      opts: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        timeout?: number;
        killSignal?: string;
        stdio?: unknown;
      },
    ) => {
      calls.push({
        cmd,
        args: [...args],
        cwd: opts.cwd,
        env: opts.env,
        timeout: opts.timeout,
        killSignal: opts.killSignal,
        stdio: opts.stdio,
      });
      const next = results.shift();
      if (next === undefined) throw new Error("mock spawnSync called more times than scripted");
      return { pid: next.pid ?? FIXTURE_PID, stdout: "", stderr: "", output: [], ...next };
    },
  };
});

/**
 * The pid every mocked child reports.
 *
 * It has to be a pid that does NOT exist, because the abnormal paths reap the
 * group: a real pid here would make the fixture kill some unrelated process.
 * 2^31 is above every pid_max on the platforms this runs on.
 */
const FIXTURE_PID = 2_147_483_646;

const {
  MUTANT_TIMEOUT_MS,
  WATCHDOG_ARGV,
  WATCHDOG_SCRIPT,
  interpretSpawnOutcome,
  killGroup,
  spawnBounded,
} = await import("./spawnBounded");

const ARGV: readonly [string, ...string[]] = ["pnpm", "exec", "vitest", "run"];

const reset = (scripted: MockResult[]): void => {
  calls.length = 0;
  results = [...scripted];
};

/** Run `spawnBounded` with `process.kill` spied, and return what it was asked to signal. */
const withKillSpy = <T>(body: () => T): { value: T; killed: [number, unknown][] } => {
  const killed: [number, unknown][] = [];
  const spy = vi.spyOn(process, "kill").mockImplementation(((pid: number, sig?: string) => {
    killed.push([pid, sig]);
    return true;
  }) as typeof process.kill);
  try {
    return { value: body(), killed };
  } finally {
    spy.mockRestore();
  }
};

describe("interpretSpawnOutcome — the pure verdict interpreter", () => {
  it("reads ETIMEDOUT as a timeout, ahead of the null status it arrives with", () => {
    // Node's timeout kill and this machine's idle-process reaper arrive in the
    // SAME shape — no status, a signal — so the errno is the only thing that
    // separates a mutant that hung itself (detection) from infrastructure
    // stealing a run (never a verdict). Flipping this equality makes every
    // timeout an infra abort AND every reaper kill a KILLED verdict.
    expect(
      interpretSpawnOutcome({
        status: null,
        signal: "SIGKILL",
        error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      }),
    ).toEqual({ kind: "timeout" });
  });

  it("returns a numeric status as an exit, even when an error is attached", () => {
    expect(
      interpretSpawnOutcome({
        status: 3,
        signal: null,
        error: Object.assign(new Error("noise"), { code: "EPIPE" }),
      }),
    ).toEqual({ kind: "exit", code: 3 });
  });

  it("returns exit 0 as an exit, not as an absent value", () => {
    // 0 is falsy; a truthiness test in place of `typeof status === "number"`
    // sends every clean run down the infra path.
    expect(interpretSpawnOutcome({ status: 0, signal: null })).toEqual({ kind: "exit", code: 0 });
  });

  it("reads a signal death with no status as an infra fault carrying the signal", () => {
    expect(interpretSpawnOutcome({ status: null, signal: "SIGKILL" })).toEqual({
      kind: "infra",
      signal: "SIGKILL",
      code: undefined,
    });
  });

  it("reads a spawn failure as an infra fault carrying the errno", () => {
    expect(
      interpretSpawnOutcome({
        status: null,
        signal: null,
        error: Object.assign(new Error("no such file"), { code: "ENOENT" }),
      }),
    ).toEqual({ kind: "infra", signal: null, code: "ENOENT" });
  });
});

describe("killGroup — the group reap, and the cases where it must not fire", () => {
  it("SIGKILLs the NEGATIVE pid, which is the group form", () => {
    // A plain `kill(pid)` satisfies a laxer assertion while reaping nothing:
    // the leader is already dead by the time this runs, and only the group id
    // still reaches its descendants.
    const { killed } = withKillSpy(() => killGroup(FIXTURE_PID, true));
    expect(killed).toEqual([[-FIXTURE_PID, "SIGKILL"]]);
  });

  it("does nothing when the spawn produced no pid", () => {
    const { killed } = withKillSpy(() => killGroup(undefined, true));
    expect(killed).toEqual([]);
  });

  it("does nothing when the child was never put in its own group", () => {
    // Without `ownGroup` the negative-pid form signals THIS process's group.
    const { killed } = withKillSpy(() => killGroup(FIXTURE_PID, false));
    expect(killed).toEqual([]);
  });

  it("tolerates a group that is already gone", () => {
    const spy = vi.spyOn(process, "kill").mockImplementation((() => {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    }) as typeof process.kill);
    try {
      expect(() => killGroup(FIXTURE_PID, true)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("spawnBounded — how the child is launched", () => {
  it("runs the command under the perl supervisor, preserving cwd and env", () => {
    reset([{ status: 0, signal: null }]);
    const { value } = withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: { FX_MARKER: "kept" } as unknown as NodeJS.ProcessEnv,
      }),
    );

    expect(value).toEqual({ outcome: { kind: "exit", code: 0 }, ownGroup: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe("perl");
    expect(calls[0]!.args).toEqual([...WATCHDOG_ARGV, ...ARGV]);
    expect(calls[0]!.cwd).toBe("/root");
    expect(calls[0]!.env).toEqual({ FX_MARKER: "kept" });
  });

  it("arms the wall-clock ceiling with the caller's value and an untrappable kill signal", () => {
    // Premise, executable: without a real `timeout` on the call no run can ever
    // produce ETIMEDOUT and the timeout arm above is unreachable code that reads
    // as protection. SIGTERM is what vitest's own watchdogs use and a vitest
    // child can trap it, so the ceiling is only a ceiling under SIGKILL.
    reset([{ status: 0, signal: null }]);
    withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: {} as unknown as NodeJS.ProcessEnv,
        timeoutMs: 4_242,
      }),
    );
    expect(calls[0]!.timeout).toBe(4_242);
    expect(calls[0]!.killSignal).toBe("SIGKILL");
    expect(calls[0]!.stdio).toEqual(["ignore", "ignore", "ignore"]);
  });

  it("falls back to the module ceiling when the caller names none", () => {
    reset([{ status: 0, signal: null }]);
    withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: {} as unknown as NodeJS.ProcessEnv,
      }),
    );
    expect(calls[0]!.timeout).toBe(MUTANT_TIMEOUT_MS);
    expect(MUTANT_TIMEOUT_MS).toBe(180_000);
  });

  it("spawns the command DIRECTLY when perl is missing, and never signals a group it does not own", () => {
    // G1/AC-6. The fallback result is a signal death precisely so the group reap
    // WOULD fire if `ownGroup` were wrongly true — under a direct spawn the
    // negative-pid form would signal this process's own group.
    reset([
      { status: null, signal: null, error: Object.assign(new Error("nope"), { code: "ENOENT" }) },
      { status: null, signal: "SIGKILL" },
    ]);
    const { value, killed } = withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: {} as unknown as NodeJS.ProcessEnv,
      }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]!.cmd).toBe("pnpm");
    expect(calls[1]!.args).toEqual(ARGV.slice(1));
    expect(value.ownGroup).toBe(false);
    expect(value.outcome).toEqual({ kind: "infra", signal: "SIGKILL", code: undefined });
    expect(killed).toEqual([]);
  });

  it("does NOT fall back when perl itself ran and the failure came from elsewhere", () => {
    // Only ENOENT means "no perl". Widening this to any error would double every
    // genuinely failing spawn, running the command a second time outside its
    // group.
    reset([
      { status: null, signal: null, error: Object.assign(new Error("denied"), { code: "EACCES" }) },
    ]);
    const { value } = withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: {} as unknown as NodeJS.ProcessEnv,
      }),
    );
    expect(calls).toHaveLength(1);
    expect(value.ownGroup).toBe(true);
  });
});

describe("spawnBounded — which outcomes reap the group", () => {
  it.each([
    [
      "a timeout",
      {
        status: null,
        signal: "SIGKILL",
        error: Object.assign(new Error("t"), { code: "ETIMEDOUT" }),
      },
    ],
    ["a signal death", { status: null, signal: "SIGTERM" }],
  ])("reaps the group after %s", (_label, result) => {
    // The live suite proves the MECHANISM; this proves the WIRING. Without it,
    // deleting the call site leaves every test green and the reap never runs in
    // production.
    reset([result as MockResult]);
    const { killed } = withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: {} as unknown as NodeJS.ProcessEnv,
      }),
    );
    expect(killed).toEqual([[-FIXTURE_PID, "SIGKILL"]]);
  });

  it("never reaps the group after a clean exit", () => {
    // A normally-completed run's descendants are not this harness's to kill, and
    // an unconditional reap would SIGKILL the group of every mutant that passed.
    reset([{ status: 0, signal: null }]);
    const { killed } = withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: {} as unknown as NodeJS.ProcessEnv,
      }),
    );
    expect(killed).toEqual([]);
  });

  it("never reaps the group after a non-zero exit either", () => {
    reset([{ status: 1, signal: null }]);
    const { killed } = withKillSpy(() =>
      spawnBounded(ARGV, {
        cwd: "/root",
        env: {} as unknown as NodeJS.ProcessEnv,
      }),
    );
    expect(killed).toEqual([]);
  });
});

describe("WATCHDOG_SCRIPT — the self-signal arms (AC-11)", () => {
  // These two are the ONLY text assertions in this file. They pin the mechanism
  // the live exec-failure case exercises, and the fork-failure half that fork
  // exhaustion makes unconstructible live: a wrapper-internal failure must die
  // by SIGNAL, never by a numeric exit, because exit codes 0-255 all belong to
  // the child (AC-2) and a numeric wrapper failure would alias one and be scored
  // as a verdict.
  it("kills itself rather than exiting when the fork fails", () => {
    expect(WATCHDOG_SCRIPT).toContain(
      "my $pid = fork() // do { kill('USR2', $$); kill('KILL', $$) };",
    );
  });

  it("kills itself rather than exiting when the exec fails", () => {
    expect(WATCHDOG_SCRIPT).toContain(
      "if ($pid == 0) { exec @ARGV; kill('USR2', $$); kill('KILL', $$) }",
    );
  });

  it("hands the script to perl as a program, terminated before the command argv", () => {
    // `--` is what stops perl reading the wrapped command's own flags as its
    // own; without it a child argv beginning with `-` is swallowed by perl.
    expect(WATCHDOG_ARGV[0]).toBe("-e");
    expect(WATCHDOG_ARGV[1]).toBe(WATCHDOG_SCRIPT);
    expect(WATCHDOG_ARGV[2]).toBe("--");
    expect(WATCHDOG_ARGV).toHaveLength(3);
  });
});
