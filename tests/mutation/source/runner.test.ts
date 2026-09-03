import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const SOURCE = "lib/specLint/taskContract.ts";
const PRISTINE = readFileSync(SOURCE, "utf8");

type Outcome =
  | number
  | { status: null; signal?: string; code?: string; hang?: boolean }
  | { code: number; sleepMs: number }
  /**
   * A child that WRITES A REPORT, which is the only thing separating the three
   * outcomes AC-3 must tell apart. `report: null` is a child that exits and
   * writes nothing -- a collection failure, a dead overlay, an OOM -- and it is
   * the fail-open case: it exits NON-ZERO, which the exit code alone reads as
   * "the suite noticed".
   */
  | {
      code: number;
      report: {
        numTotalTests: number;
        numPassedTests: number;
        numFailedTests: number;
        numPendingTests: number;
      } | null;
    };

/**
 * A VIRTUAL clock, armed only for the timeout cases.
 *
 * The shipped `runSuite` hardcodes 180_000, so the ONLY observation separating
 * it from a version honouring an injected 2_000 ceiling is the recorded
 * duration — and a real 180-second hang cannot run in a unit suite. When a
 * fixture declares `hang`, the mock advances this clock by whatever ceiling the
 * CALLER passed, which is exactly the quantity under test.
 *
 * AC-15 deliberately does NOT use it. Under a controlled clock a measured value
 * and a fabricated one are the same bytes — the fake IS the fabrication that AC
 * exists to detect — so that case runs a real sleep on the real clock.
 */
let virtualNow = 0;
let clockSpy: { mockRestore: () => void } | null = null;
const armVirtualClock = () => {
  virtualNow = 1_000_000;
  clockSpy = vi.spyOn(Date, "now").mockImplementation(() => virtualNow);
};
const disarmVirtualClock = () => {
  clockSpy?.mockRestore();
  clockSpy = null;
};
/** Block the calling thread for real, so AC-15 measures a real interval. */
const sleepSync = (ms: number) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* spin — synchronous by necessity: spawnSync's caller cannot await */
  }
};
/** Per-suite outcome; a function receives whether this call is the BASELINE. */
type Behaviour = Record<string, Outcome | ((isBaseline: boolean) => Outcome)>;

const calls: {
  suite: string;
  isBaseline: boolean;
  timeout: number | undefined;
  killSignal: string | undefined;
  cmd: string;
  args: string[];
}[] = [];
let behaviour: Behaviour = {};

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    spawnSync: (
      cmd: string,
      args: readonly string[],
      opts: {
        env?: Record<string, string>;
        timeout?: number;
        killSignal?: string;
        encoding?: string;
      },
    ) => {
      const suite = opts.env!.MUTATION_SUITE!;
      // The baseline run overlays the PRISTINE source; every other call overlays
      // a mutant. Reading the overlay file is how the mock tells them apart,
      // which lets a fixture make a suite reject mutants while still passing
      // baseline.
      const isBaseline = readFileSync(opts.env!.MUTATION_MUTANT!, "utf8") === PRISTINE;
      calls.push({
        suite,
        isBaseline,
        timeout: opts.timeout,
        killSignal: opts.killSignal,
        cmd,
        args: [...args],
      });
      const entry = behaviour[suite] ?? 0;
      const b = typeof entry === "function" ? entry(isBaseline) : entry;
      if (typeof b === "number") {
        return { pid: FIXTURE_PID, status: b, signal: null, stdout: "", stderr: "", output: [] };
      }
      if ("report" in b) {
        // The real child is told where to write by `--outputFile=<path>` in its
        // argv, so the fake reads the same argv rather than being handed a path.
        // A fake that took the path some other way could pass while the shipped
        // code never asked for a report at all.
        const flag = args.find((a) => a.startsWith("--outputFile="));
        if (b.report !== null && flag !== undefined) {
          writeFileSync(flag.slice("--outputFile=".length), JSON.stringify(b.report), "utf8");
        }
        return {
          pid: FIXTURE_PID,
          status: b.code,
          signal: null,
          stdout: "",
          stderr: "",
          output: [],
        };
      }
      if ("sleepMs" in b) {
        sleepSync(b.sleepMs);
        return {
          pid: FIXTURE_PID,
          status: b.code,
          signal: null,
          stdout: "",
          stderr: "",
          output: [],
        };
      }
      if (b.hang === true) {
        // A child that never terminates consumes the WHOLE ceiling the caller
        // passed. That is the quantity AC-1 discriminates on: the shipped code
        // burns its hardcoded 180_000 here, a repaired one burns the injected value.
        virtualNow += opts.timeout ?? 0;
      }
      return {
        pid: FIXTURE_PID,
        status: null,
        signal: b.signal ?? null,
        error: Object.assign(new Error("child died"), b.code ? { code: b.code } : {}),
        stdout: "",
        stderr: "",
        output: [],
      };
    },
  };
});

/**
 * The pid every mocked child reports.
 *
 * It has to be a pid that does NOT exist, because the no-status paths reap the
 * tree: a real pid here would make the fixture kill some unrelated process. 2^31
 * is above every pid_max on the platforms this runs on.
 */
const FIXTURE_PID = 2_147_483_646;

const {
  WATCHDOG_ARGV,
  MUTANT_TIMEOUT_EXIT,
  MUTANT_TIMEOUT_MS,
  MutantRunInfraError,
  runControl,
  runSuite,
  runSuiteRecorded,
  runMutantRecorded,
  runSurface,
} = await import("./runner");

const { premiseHolds } = await import("../../_shared/premise");

/** Is this pid still alive? Signal 0 tests for existence without delivering one. */
const alive = (pid: number | undefined): boolean => {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const { OPERATOR_NAMES } = await import("./operators");
const { classify } = await import("./oracle");

const surface = (suitePaths: string[]) => ({
  id: "fixture",
  sourcePath: "lib/specLint/taskContract.ts",
  suitePaths,
  operators: [...OPERATOR_NAMES],
  scoreFloor: 0.95,
  millisPerBoot: 1000,
  // Unused by these cases; runSurface never reads it. Present because the
  // registry requires every surface to declare a liveness control.
  control: { from: 'if (kind !== "plan") return [];', to: 'if (kind === "plan") return [];' },
  accepted: [],
});

const reset = (b: Behaviour) => {
  calls.length = 0;
  behaviour = b;
};

describe("runner — infrastructure faults are never coverage (whole-diff R1 F1)", () => {
  it("throws rather than returning an exit code when the child dies on a signal", () => {
    // Mapping a signal death to exit 1 makes `classify` report KILLED, so a
    // reaped or OOM-killed child would count as detection and inflate the score
    // with a kill the suite never earned. On this machine an idle-process reaper
    // has actually been observed SIGTERM-ing long-running children.
    reset({ "a.test.ts": { status: null, signal: "SIGTERM" } });
    expect(() => runSuite("/root", "/t.ts", SOURCE, "a.test.ts", "site")).toThrow(
      MutantRunInfraError,
    );
  });

  it("throws on a spawn failure, which also yields no numeric status", () => {
    reset({ "a.test.ts": { status: null, code: "ENOENT" } });
    expect(() => runSuite("/root", "/t.ts", SOURCE, "a.test.ts", "site")).toThrow(
      /no exit status/i,
    );
  });

  it("still returns a real non-zero exit code as a normal verdict (limit L-3 unaffected)", () => {
    // A compile failure is a genuine non-zero exit from a real process, and
    // counting it as detection is deliberate. Only the NO-status case is an
    // infrastructure fault.
    reset({ "a.test.ts": 1 });
    expect(runSuite("/root", "/t.ts", SOURCE, "a.test.ts", "site")).toBe(1);
  });
});

describe("runner — a mutant that never terminates (fix/ui-interactive-token-policy)", () => {
  // Measured, not hypothetical. Enrolling `tests/styles/interactiveScanCore.ts`
  // produced `statement-removal` of `cursor = cursor.parent;` inside
  // `while (cursor)`, and the child ran for 1h48m without exiting; the run was
  // killed by hand with 0 of 207 mutants scored. Four other wedged
  // `mutantOverlay.config.ts` children from OTHER arcs were alive on the same
  // machine at the same moment (2h28m, 2h55m, 3h53m, 5h43m), so the hole is the
  // harness's, not this surface's.
  it("scores a timed-out mutant as KILLED rather than aborting the run", () => {
    // Node sets code ETIMEDOUT and kills with `killSignal`, so the shape reaching
    // the catch is a NO-STATUS death — indistinguishable, without the code, from
    // the reaper SIGTERM above, which must stay fatal.
    reset({ "a.test.ts": { status: null, signal: "SIGKILL", code: "ETIMEDOUT" } });
    const code = runSuite("/root", "/t.ts", SOURCE, "a.test.ts", "site");
    expect(code).toBe(MUTANT_TIMEOUT_EXIT);
    expect(classify(code)).toBe("KILLED");
  });

  it("arms the timeout the branch above depends on", () => {
    // Premise, executable: without a real `timeout` passed to the child, no run
    // can ever produce ETIMEDOUT and the case above is unreachable code that
    // reads as protection. Asserted on the CALL, so deleting the option reds
    // this rather than silently disarming the guard.
    reset({ "a.test.ts": 0 });
    runSuite("/root", "/t.ts", SOURCE, "a.test.ts", "site");
    expect(calls[0]!.timeout).toBeGreaterThan(0);
    expect(calls[0]!.killSignal).toBe("SIGKILL");
    // And the child is launched under the perl supervisor, which is what makes
    // the reap possible at all: it setpgrp's before exec'ing the command, and
    // `spawnSync` returns only after killing the process it spawned, so a parent
    // link is already broken by the time anything walks the tree. The group
    // reap itself lives in `spawnBounded`.
    expect(calls[0]!.cmd).toBe("perl");
    expect(calls[0]!.args.slice(0, WATCHDOG_ARGV.length)).toEqual([...WATCHDOG_ARGV]);
  });

  it.each([
    ["a timeout", { status: null, signal: "SIGKILL", code: "ETIMEDOUT" }],
    ["a signal death", { status: null, signal: "SIGTERM" }],
  ])("runSuite itself reaps the group after %s", (_label, outcome) => {
    // The live case below proves the MECHANISM; this proves the WIRING. Without
    // it, deleting either call site in `runSuite` leaves every test green and
    // the reap never runs in production (whole-diff R4 F1). Asserted on
    // `process.kill` with the NEGATIVE pid, which is the group form — a plain
    // `kill(pid)` would satisfy a laxer assertion while reaping nothing.
    const killed: [number, string | number | undefined][] = [];
    const spy = vi.spyOn(process, "kill").mockImplementation(((pid: number, sig?: string) => {
      killed.push([pid, sig]);
      return true;
    }) as typeof process.kill);
    try {
      reset({ "a.test.ts": outcome as Outcome });
      try {
        runSuite("/root", "/t.ts", SOURCE, "a.test.ts", "site");
      } catch {
        // the signal-death arm throws by design; the reap must have run first
      }
      expect(killed).toContainEqual([-FIXTURE_PID, "SIGKILL"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("reaps a grandchild that OUTLIVED its parent (live, unmocked, production order)", async () => {
    // Production order is the whole point (whole-diff R3 F1): `spawnSync`
    // returns only AFTER killing the process it spawned, so the survivor has
    // already been reparented to init and no parent-based walk can find it.
    // This runs the real sequence — group-leader launch, real timeout, then the
    // group kill — rather than reaping while the parent is still alive.
    const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    const pidFile = join(tmpdir(), `runner-orphan-${process.pid}.pid`);
    const script = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      `fs.writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));`,
      "setInterval(() => {}, 1000);",
    ].join("\n");

    const timedOut = real.spawnSync("perl", [...WATCHDOG_ARGV, process.execPath, "-e", script], {
      encoding: "utf8",
      timeout: 2_000,
      killSignal: "SIGKILL",
      stdio: "ignore",
    });
    let grandchild = 0;
    try {
      premiseHolds(
        "the parent really timed out",
        (timedOut.error as { code?: string } | undefined)?.code === "ETIMEDOUT",
      );
      grandchild = Number(readFileSync(pidFile, "utf8"));
      premiseHolds("the grandchild started", Number.isInteger(grandchild) && grandchild > 0);
      premiseHolds("it OUTLIVED its parent, which is the case under test", alive(grandchild));
      premiseHolds("the parent is gone, so no tree walk can reach it", !alive(timedOut.pid));

      process.kill(-timedOut.pid!, "SIGKILL");

      const deadline = Date.now() + 10_000;
      while (alive(grandchild) && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 50));
      expect(alive(grandchild)).toBe(false);
    } finally {
      rmSync(pidFile, { force: true });
      if (grandchild > 0 && alive(grandchild)) process.kill(grandchild, "SIGKILL");
    }
  }, 30_000);

  it("Node really reports ETIMEDOUT on a timed-out child (live, unmocked)", async () => {
    // The two cases above agree with a MOCK. This one agrees with Node: if the
    // real runtime signalled a timeout some other way, both would pass green
    // while every real hang still wedged the harness forever.
    const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    let caught: { code?: string; status?: number | null } | null = null;
    try {
      real.execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 600000)"], {
        timeout: 300,
        killSignal: "SIGKILL",
        stdio: "pipe",
      });
    } catch (e) {
      caught = e as { code?: string; status?: number | null };
    }
    expect(caught).not.toBeNull();
    expect(caught!.code).toBe("ETIMEDOUT");
    expect(typeof caught!.status === "number").toBe(false);
  }, 20_000);
});

describe("runner — every declared suite runs (whole-diff R1 F3)", () => {
  it("kills a mutant that only the SECOND declared suite rejects", () => {
    // Running suitePaths[0] alone reports this mutant SURVIVED — a wrong verdict,
    // and a silent contradiction of the plural registry contract in spec §3.7.
    reset({ "a.test.ts": 0, "b.test.ts": 0 });
    const clean = runSurface(process.cwd(), surface(["a.test.ts", "b.test.ts"]));
    expect(clean.mutantCount).toBeGreaterThan(0);

    // Now let suite B pass the BASELINE but reject every mutant — the only
    // configuration in which suitePaths[0]-only execution is observably wrong.
    reset({ "a.test.ts": 0, "b.test.ts": (isBaseline) => (isBaseline ? 0 : 1) });
    const run = runSurface(process.cwd(), surface(["a.test.ts", "b.test.ts"]));
    expect(run.survivors).toEqual([]);
    expect(run.killed).toBe(run.mutantCount);
  });

  it("runs the baseline across every suite, so a red LATER suite aborts the run", () => {
    reset({ "a.test.ts": 0, "b.test.ts": 1 });
    expect(() => runSurface(process.cwd(), surface(["a.test.ts", "b.test.ts"]))).toThrow(
      /baseline is not green/i,
    );
  });

  it("short-circuits: once a suite rejects, later suites are not spawned", () => {
    // Each suite costs a full vitest boot and cannot change an already-KILLED
    // verdict. Asserting the spawn list pins the optimisation instead of
    // assuming it.
    reset({ "a.test.ts": 0, "b.test.ts": 0 });
    runSurface(process.cwd(), surface(["a.test.ts", "b.test.ts"]));
    const baselineCalls = calls.slice(0, 2).map((c) => c.suite);
    expect(baselineCalls).toEqual(["a.test.ts", "b.test.ts"]);

    reset({ "a.test.ts": 1, "b.test.ts": 0 });
    // Baseline now fails on suite A, so B is never reached.
    expect(() => runSurface(process.cwd(), surface(["a.test.ts", "b.test.ts"]))).toThrow();
    expect(calls.map((c) => c.suite)).toEqual(["a.test.ts"]);
  });
});

describe("runner — accounting", () => {
  it("classifies every generated mutant exactly once, with unique ids", () => {
    reset({ "a.test.ts": 0 });
    const run = runSurface(process.cwd(), surface(["a.test.ts"]));
    expect(run.outcomes).toHaveLength(run.mutantCount);
    expect(run.killed + run.survivors.length).toBe(run.mutantCount);
    expect(new Set(run.outcomes.map((o) => o.siteId)).size).toBe(run.mutantCount);
  });
});

describe("runner — a mutant outcome carries the evidence that decided it (AC-4)", () => {
  // The shipped `MutantOutcome` is `{ siteId, verdict }`, so `children` reads as
  // `undefined` at runtime. Each case below therefore asserts the WHOLE children
  // array by deep equality, so the red is `undefined` meeting a populated
  // expectation — a VALUE assertion. Mapping over it first would red with a
  // TypeError instead, which is a crash rather than a discriminating comparison
  // and would go green for any implementation that merely defines the field.
  const childrenOf = (o: unknown): unknown => (o as { children?: unknown }).children;

  const exited = (suite: string, exitCode: number) =>
    ({ suite, kind: "exit", exitCode, durationMs: expect.any(Number) }) as const;

  it("records EVERY declared suite in EXECUTION ORDER, each an exit 0, for a SURVIVOR", () => {
    // MORE THAN TWO suites, deliberately. Every two-suite proof is satisfied by a
    // runner capped at two children — the implementation that makes "the deciding
    // child is the last one" false on the registry's larger rows, one of which
    // declares ten.
    const suites = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];
    reset(Object.fromEntries(suites.map((s) => [s, 0])));
    const run = runSurface(process.cwd(), surface(suites));
    expect(run.survivors.length).toBeGreaterThan(0);

    for (const outcome of run.outcomes) {
      expect(outcome.verdict).toBe("SURVIVED");
      // ONE deep equality over the whole array: order, suite identity, kind and
      // code together. A COUNT assertion is satisfied by a runner reporting the
      // right number of WRONG suites; suite identity alone would let a survivor's
      // children be recorded as timeouts or arbitrary exits with no row noticing.
      expect(childrenOf(outcome)).toEqual(suites.map((s) => exited(s, 0)));
    }
  });

  it("also holds on a TWO-suite surface, so the shape is not >2-only", () => {
    const suites = ["a.test.ts", "b.test.ts"];
    reset(Object.fromEntries(suites.map((s) => [s, 0])));
    const run = runSurface(process.cwd(), surface(suites));
    for (const outcome of run.outcomes) {
      expect(childrenOf(outcome)).toEqual(suites.map((s) => exited(s, 0)));
    }
  });

  it("records the KILLING child with its OWN exit code, not a normalised one", () => {
    reset({ "a.test.ts": 0, "b.test.ts": (isBaseline) => (isBaseline ? 0 : 7) });
    const run = runSurface(process.cwd(), surface(["a.test.ts", "b.test.ts"]));
    expect(run.killed).toBe(run.mutantCount);
    for (const outcome of run.outcomes) {
      // The DECIDING child is the LAST one, because the loop short-circuits — and
      // its code is the child's REAL 7, not a normalised 1. The evidence is what
      // the child reported, not what the verdict was interpreted to mean.
      expect(childrenOf(outcome)).toEqual([exited("a.test.ts", 0), exited("b.test.ts", 7)]);
    }
  });
});

describe("runner — no suite AFTER the deciding one is spawned (AC-5)", () => {
  // These assertions are TRUE of the shipped source, so authoring them cannot
  // produce a red. Their red is observed against a NAMED MUTANT of the
  // production surface instead — deleting the early return in
  // `runMutantRecorded` — and that probe is recorded in the commit rather than
  // left as a claim. A non-regression pin whose red can never be observed is
  // exactly the shape the red contract rejects.
  const mutantSpawns = () => calls.filter((c) => !c.isBaseline).map((c) => c.suite);

  it("kill at suite 1: the seam runs ONCE per mutant, with suite 1", () => {
    const suites = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];
    reset({
      "a.test.ts": (isBaseline) => (isBaseline ? 0 : 3),
      "b.test.ts": 0,
      "c.test.ts": 0,
      "d.test.ts": 0,
    });
    const run = runSurface(process.cwd(), surface(suites));
    // THE SEAM ASSERTION COMES FIRST, deliberately. Ordered after the verdict
    // check it never evaluates under the probe that proves this case
    // discriminates: deleting the early return makes every mutant SURVIVE, so
    // `killed` reds first and the seam — the thing this case is actually about —
    // is never reached. An assertion only tests what it names if it DECIDES.
    expect(new Set(mutantSpawns())).toEqual(new Set(["a.test.ts"]));
    expect(mutantSpawns()).toHaveLength(run.mutantCount);
    expect(run.killed).toBe(run.mutantCount);
  });

  it("kill at suite 3: the seam runs EXACTLY THREE times, in order, and NEVER for suite 4", () => {
    // A single suite-1 case is passed by an implementation that short-circuits
    // correctly at suite 1 and runs on after a LATER kill — which records
    // children AFTER the deciding event, falsifies "the deciding child is the
    // last one", and can attach a later timeout to a verdict already settled.
    const suites = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];
    reset({
      "a.test.ts": 0,
      "b.test.ts": 0,
      "c.test.ts": (isBaseline) => (isBaseline ? 0 : 5),
      "d.test.ts": 0,
    });
    const run = runSurface(process.cwd(), surface(suites));
    const spawned = mutantSpawns();
    expect(spawned).toHaveLength(run.mutantCount * 3);
    expect(spawned.slice(0, 3)).toEqual(["a.test.ts", "b.test.ts", "c.test.ts"]);
    expect(spawned).not.toContain("d.test.ts");
    // Asserted on the SPAWN SEAM, not on `children.length`. An implementation
    // that runs every suite and DISCARDS the records after the deciding one
    // satisfies a length assertion while destroying the short-circuit; it cannot
    // fake the seam, because the spawn already happened.
    for (const outcome of run.outcomes) {
      expect((outcome.children ?? []).map((c) => c.suite)).toEqual([
        "a.test.ts",
        "b.test.ts",
        "c.test.ts",
      ]);
    }
  });
});

describe("runner — a timed-out child records a TIMEOUT, and the ceiling is injectable (AC-1, AC-3)", () => {
  afterEach(() => disarmVirtualClock());

  it("honours an INJECTED ceiling, and the DURATION is the discriminator", () => {
    armVirtualClock();
    reset({ "a.test.ts": { status: null, signal: "SIGKILL", code: "ETIMEDOUT", hang: true } });
    const { code, record } = runSuiteRecorded("/root", "/t.ts", SOURCE, "a.test.ts", "site", 2_000);

    // AC-1 requires the whole tuple, so a correctly TIMED but wrongly SPELLED
    // record must fail. `kind` is NOT the discriminator — a hanging child reports
    // `timeout` under the shipped code too.
    expect(record.kind).toBe("timeout");
    expect(record.exitCode).toBeNull();
    expect(record.suite).toBe("a.test.ts");
    expect(record.durationMs).toBeGreaterThanOrEqual(2_000);
    // THE DISCRIMINATING BOUND. Only the duration separates a runner honouring
    // the injected ceiling from one ignoring it and burning the hardcoded 180_000.
    expect(record.durationMs).toBeLessThan(10_000);

    // AC-3, the no-blast-radius guarantee, ASSERTED rather than assumed.
    expect(code).toBe(MUTANT_TIMEOUT_EXIT);
    expect(classify(code)).toBe("KILLED");
  });

  it("defaults to MUTANT_TIMEOUT_MS when no ceiling is passed, so every existing call site is unchanged", () => {
    reset({ "a.test.ts": 0 });
    runSuiteRecorded("/root", "/t.ts", SOURCE, "a.test.ts", "site");
    expect(calls[0]!.timeout).toBe(MUTANT_TIMEOUT_MS);
  });
});

describe("runner — an assertion-killed child records its OWN exit code (AC-2, AC-3)", () => {
  it.each([
    ["a.test.ts", 1],
    ["b.test.ts", 42],
  ])("%s exits %i and the record carries THAT code", (suite, expected) => {
    // TWO fixtures with DIFFERENT non-zero codes. A single fixture admits an
    // implementation hard-coding whichever value that one fixture produced, and
    // one hard-coding `kind` from the verdict — which AC-1's timeout case, also
    // a KILLED verdict, then separates.
    reset({ [suite]: expected });
    const { code, record } = runSuiteRecorded("/root", "/t.ts", SOURCE, suite, "site");
    expect(record.kind).toBe("exit");
    expect(record.exitCode).toBe(expected);
    expect(record.suite).toBe(suite);
    expect(code).toBe(expected);
    expect(classify(code)).toBe("KILLED");
  });
});

describe("runner — an ordinary child's durationMs is MEASURED, not fabricated (AC-15)", () => {
  it("tracks TWO DIFFERENT intervals, which is what kills a CONSTANT implementation", () => {
    // On the REAL clock, deliberately: under the virtual one a measured value and
    // a fabricated one are the same bytes.
    //
    // And TWO intervals, because one cannot prove measurement. A single fixture
    // asserting ~120ms lands in a generous range kills `durationMs: 0` and
    // NOTHING ELSE — a constant 5000 passes it comfortably. Requiring the longer
    // child to exceed the shorter kills every constant, whatever it picks.
    const SHORT_MS = 40;
    const LONG_MS = 300;
    reset({
      "a.test.ts": { code: 0, sleepMs: SHORT_MS },
      "b.test.ts": { code: 0, sleepMs: LONG_MS },
    });
    const { children } = runMutantRecorded(
      "/root",
      "/t.ts",
      SOURCE,
      ["a.test.ts", "b.test.ts"],
      "site",
    );
    const [short_, long_] = children;
    expect(short_!.suite).toBe("a.test.ts");
    expect(long_!.suite).toBe("b.test.ts");
    expect(short_!.durationMs).toBeGreaterThanOrEqual(SHORT_MS - 10);
    expect(long_!.durationMs).toBeGreaterThanOrEqual(LONG_MS - 10);
    expect(long_!.durationMs).toBeGreaterThan(short_!.durationMs);
  });
});

describe("runControl — a verdict from OBSERVATIONS, not from an exit code (AC-2, AC-3)", () => {
  /**
   * The three outcomes that reach one exit code, measured against this repo's own
   * overlay config on 2026-09-01 before any of this existed:
   *
   *   a suite that rejected the mutant    numTotalTests 60  numFailedTests 1  exit 1
   *   a suite that ran and did not notice numTotalTests 60  numFailedTests 0  exit 0
   *   a child that collected NOTHING      numTotalTests  0  numFailedTests 0  exit 1
   *
   * The third is why this exists. It exits NON-ZERO, and the shipped assertion
   * `expect(runControl(...)).not.toBe(0)` read that as "the suite noticed" -- so a
   * mistyped `suitePaths` entry, a collection failure, a dead overlay or an OOM
   * all certified an overlay liveness the run never earned.
   */
  const surface = {
    id: "fixture",
    sourcePath: SOURCE,
    suitePaths: ["a.test.ts"],
    operators: [],
    scoreFloor: 0.5,
    millisPerBoot: 1000,
    control: { from: "x", to: "y" },
    accepted: [],
  } as unknown as Parameters<typeof runControl>[1];

  const twoSuites = {
    ...(surface as object),
    suitePaths: ["a.test.ts", "b.test.ts"],
  } as unknown as Parameters<typeof runControl>[1];

  it("reports NOTICED when a suite records a failed test", () => {
    reset({
      "a.test.ts": {
        code: 1,
        report: { numTotalTests: 60, numPassedTests: 59, numFailedTests: 1, numPendingTests: 0 },
      },
    });
    const v = runControl("/root", surface, "mutant");
    expect(v.kind).toBe("noticed");
    expect(v.observations.map((o) => [o.ranTests, o.failedTests])).toEqual([[60, 1]]);
  });

  it("reports RAN-CLEAN when every suite ran tests and none failed", () => {
    // The honest diagnosis for main's 2026-08-31 nightly: the overlay was live and
    // the registry's declared control simply was not killed. Reported as its own
    // kind so it can carry its own message rather than "the overlay is dead".
    reset({
      "a.test.ts": {
        code: 0,
        report: { numTotalTests: 60, numPassedTests: 60, numFailedTests: 0, numPendingTests: 0 },
      },
    });
    expect(runControl("/root", surface, "mutant").kind).toBe("ran-clean");
  });

  it("reports NO-OBSERVATIONS for a child that wrote no report, and NAMES the suite", () => {
    // THE FAIL-OPEN. `code: 1` is what a collection failure exits with, and the
    // shipped `.not.toBe(0)` accepted exactly this.
    reset({ "a.test.ts": { code: 1, report: null } });
    const v = runControl("/root", surface, "mutant");
    expect(v.kind).toBe("no-observations");
    expect(v.kind === "no-observations" ? v.dark : []).toEqual(["a.test.ts"]);
  });

  it("reports NO-OBSERVATIONS for a child that ran ZERO tests, even at a non-zero exit", () => {
    // vitest's "No test files found" shape: exit 1, numTotalTests 0. A report that
    // parses is not evidence the suite ran.
    reset({
      "a.test.ts": {
        code: 1,
        report: { numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0 },
      },
    });
    expect(runControl("/root", surface, "mutant").kind).toBe("no-observations");
  });

  it("a report where every test was SKIPPED is dark, not clean (the -t trap)", () => {
    // Measured against vitest 4.1.5 on 2026-09-01: `-t` matching nothing reports
    // numTotalTests 29, numPassedTests 0, numFailedTests 0, numPendingTests 29,
    // and EXITS 0. Counting declared tests would call that "the suite ran and did
    // not notice" -- the same fail-open this verdict exists to close, one level
    // in, and the one Task 3's case-filtered red depends on being closed.
    reset({
      "a.test.ts": {
        code: 0,
        report: {
          numTotalTests: 29,
          numPassedTests: 0,
          numFailedTests: 0,
          numPendingTests: 29,
        },
      },
    });
    const v = runControl("/root", surface, "mutant");
    expect(v.kind).toBe("no-observations");
    expect(v.kind === "no-observations" ? v.dark : []).toEqual(["a.test.ts"]);
  });

  it("a report MISSING a counter is dark, not a suite that ran and found nothing", () => {
    // Whole-diff review round 1. An earlier version coerced a missing counter to 0 while its
    // comment claimed a changed report shape went dark, so `{"numPassedTests": 60}` with the child
    // exiting 1 came back `ran-clean` and `controlProblem` blamed the control row for a report
    // that never said whether anything failed.
    reset({
      "a.test.ts": {
        code: 1,
        report: { numTotalTests: 60, numPassedTests: 60, numPendingTests: 0 } as never,
      },
    });
    expect(runControl("/root", surface, "mutant").kind).toBe("no-observations");
  });

  it("a report with a NON-NUMERIC counter is dark too", () => {
    reset({
      "a.test.ts": {
        code: 1,
        report: {
          numTotalTests: 60,
          numPassedTests: 60,
          numFailedTests: "1",
          numPendingTests: 0,
        } as never,
      },
    });
    expect(runControl("/root", surface, "mutant").kind).toBe("no-observations");
  });

  it("a dark suite outranks a clean one, so a partial run cannot report RAN-CLEAN", () => {
    // Otherwise a two-suite surface whose SECOND suite never ran would be reported
    // as "the suite did not notice", sending the reader to the control row when the
    // defect is that half the evidence is missing.
    reset({
      "a.test.ts": {
        code: 0,
        report: { numTotalTests: 12, numPassedTests: 12, numFailedTests: 0, numPendingTests: 0 },
      },
      "b.test.ts": { code: 1, report: null },
    });
    const v = runControl("/root", twoSuites, "mutant");
    expect(v.kind).toBe("no-observations");
    expect(v.kind === "no-observations" ? v.dark : []).toEqual(["b.test.ts"]);
  });

  it("asks the child for a report, and only on the control path", () => {
    // The producer half of the contract: without `--reporter=json --outputFile=`,
    // every verdict above would be `no-observations` for the wrong reason. Pinned
    // on the ARGV the child actually received, and the per-mutant path is asserted
    // NOT to carry it, because that path pays for every mutant.
    reset({
      "a.test.ts": {
        code: 1,
        report: { numTotalTests: 3, numPassedTests: 2, numFailedTests: 1, numPendingTests: 0 },
      },
    });
    runControl("/root", surface, "mutant");
    const control = calls.at(-1)!.args;
    expect(control).toContain("--reporter=json");
    expect(control.some((a) => a.startsWith("--outputFile="))).toBe(true);

    reset({ "a.test.ts": 0 });
    runSuite("/root", "/t.ts", SOURCE, "a.test.ts", "site");
    const perMutant = calls.at(-1)!.args;
    expect(perMutant).not.toContain("--reporter=json");
    expect(perMutant.some((a) => a.startsWith("--outputFile="))).toBe(false);
  });
});
