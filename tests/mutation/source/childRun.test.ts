import { describe, expect, it, vi } from "vitest";

/**
 * `childRun`'s abnormal-outcome contract (AC-5).
 *
 * The mock intercepts BOTH seams from one behaviour table — `execFileSync`, the
 * pre-repair implementation's, which signals by THROWING a shaped error, and
 * `spawnSync`, the post-repair one's, which RETURNS a shaped result. That is
 * deliberate: the same command is then observably red against the old code and
 * green against the new, rather than being a suite written to fit whichever
 * implementation happened to exist when it was authored.
 */

type Behaviour =
  | { kind: "exit"; code: number }
  | { kind: "timeout" }
  | { kind: "signal"; signal: NodeJS.Signals };

type RecordedCall = { cmd: string; args: string[]; opts: Record<string, unknown> };

const calls: RecordedCall[] = [];
let behaviour: Behaviour = { kind: "exit", code: 0 };

/**
 * A pid that does NOT exist: the abnormal paths reap the process group, and a
 * real pid here would make the fixture kill some unrelated process.
 */
const FIXTURE_PID = 2_147_483_646;

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    execFileSync: (cmd: string, args: readonly string[], opts: Record<string, unknown>) => {
      calls.push({ cmd, args: [...args], opts });
      if (behaviour.kind === "exit") {
        if (behaviour.code === 0) return "";
        throw Object.assign(new Error("child exited non-zero"), { status: behaviour.code });
      }
      if (behaviour.kind === "timeout") {
        throw Object.assign(new Error("timed out"), {
          code: "ETIMEDOUT",
          status: null,
          signal: "SIGKILL",
        });
      }
      throw Object.assign(new Error("child died"), {
        status: undefined,
        signal: behaviour.signal,
      });
    },
    spawnSync: (cmd: string, args: readonly string[], opts: Record<string, unknown>) => {
      calls.push({ cmd, args: [...args], opts });
      const base = { pid: FIXTURE_PID, stdout: "", stderr: "", output: [] };
      if (behaviour.kind === "exit") {
        return { ...base, status: behaviour.code, signal: null };
      }
      if (behaviour.kind === "timeout") {
        return {
          ...base,
          status: null,
          signal: "SIGKILL",
          error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
        };
      }
      return { ...base, status: null, signal: behaviour.signal };
    },
  };
});

const { childRun, INERT_TARGET } = await import("./childRun");
const { MutantRunInfraError } = await import("./runner");

const run = (b: Behaviour): number => {
  calls.length = 0;
  behaviour = b;
  return childRun(process.cwd(), "tests/mutation/fixtures/whatever.fixture.ts", INERT_TARGET);
};

describe("childRun — a real exit code is still the whole signal", () => {
  it("returns a non-zero exit code unchanged", () => {
    // The fixtures that prove a premise cannot run MUST FAIL when executed, so
    // nothing but a child's status can carry their verdict.
    expect(run({ kind: "exit", code: 3 })).toBe(3);
  });

  it("returns 0 for a fixture that passed", () => {
    expect(run({ kind: "exit", code: 0 })).toBe(0);
  });
});

describe("childRun — an abnormal outcome is an infra fault, never a verdict", () => {
  it("THROWS when the child hangs and is killed by the ceiling", () => {
    // Returning non-zero here forges "premise proven" at
    // tests/mutation/_metaPremiseContract.test.ts:336 — the consumer where a
    // fabricated code is silent rather than loud. A hung fixture is an authoring
    // or infrastructure defect; it is not evidence about the premise.
    expect(() => run({ kind: "timeout" })).toThrow(MutantRunInfraError);
  });

  it("THROWS when the child dies on a signal with no exit status at all", () => {
    // This machine's idle-process reaper has been observed SIGTERM-ing
    // long-running children. Under the pre-repair `status ?? 1` catch a reaped
    // fixture returned exactly 1 — indistinguishable from a fixture that ran and
    // legitimately failed.
    expect(() => run({ kind: "signal", signal: "SIGKILL" })).toThrow(MutantRunInfraError);
  });

  it("names the fixture in the error it throws, so the fault is attributable", () => {
    expect(() => run({ kind: "signal", signal: "SIGKILL" })).toThrow(/whatever\.fixture\.ts/);
  });
});

describe("childRun — the bound the cases above depend on", () => {
  it("arms a wall-clock ceiling and an untrappable kill signal on the child", () => {
    // Premise, executable: without a real ceiling on the call no run can ever
    // produce the timeout the case above asserts, and that case would be
    // unreachable code that reads as protection. `childRun` had NO bound of any
    // kind before this — no timeout, no process group — unlike its sibling
    // `runSuite`, which is the defect this arc repairs.
    run({ kind: "exit", code: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.opts.timeout).toBeGreaterThan(0);
    expect(calls[0]!.opts.killSignal).toBe("SIGKILL");
  });

  it("keeps the fixture-env contract its consumers depend on", () => {
    run({ kind: "exit", code: 0 });
    const env = calls[0]!.opts.env as Record<string, string>;
    expect(env.VITEST_INCLUDE_MUTATION_HARNESS).toBe("1");
    expect(env.MUTATION_SUITE).toBe("tests/mutation/fixtures/whatever.fixture.ts");
    expect(env.MUTATION_TARGET).toBe(env.MUTATION_MUTANT);
  });
});
