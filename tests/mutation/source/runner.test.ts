import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const SOURCE = "lib/specLint/taskContract.ts";
const PRISTINE = readFileSync(SOURCE, "utf8");

type Outcome = number | { status: null; signal?: string; code?: string };
/** Per-suite outcome; a function receives whether this call is the BASELINE. */
type Behaviour = Record<string, Outcome | ((isBaseline: boolean) => Outcome)>;

const calls: {
  suite: string;
  isBaseline: boolean;
  timeout: number | undefined;
  killSignal: string | undefined;
}[] = [];
let behaviour: Behaviour = {};

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    // `pgrep` is delegated to the REAL implementation: `killTree` walks a live
    // process tree, and the descendant-reap case below is only meaningful if
    // that walk is real. Everything else is the fixture.
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
      if (cmd === "pgrep") return real.spawnSync(cmd, args, opts as never);
      const suite = opts.env!.MUTATION_SUITE!;
      // The baseline run overlays the PRISTINE source; every other call overlays
      // a mutant. Reading the overlay file is how the mock tells them apart,
      // which lets a fixture make a suite reject mutants while still passing
      // baseline.
      const isBaseline = readFileSync(opts.env!.MUTATION_MUTANT!, "utf8") === PRISTINE;
      calls.push({ suite, isBaseline, timeout: opts.timeout, killSignal: opts.killSignal });
      const entry = behaviour[suite] ?? 0;
      const b = typeof entry === "function" ? entry(isBaseline) : entry;
      if (typeof b === "number") {
        return { pid: FIXTURE_PID, status: b, signal: null, stdout: "", stderr: "", output: [] };
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

const { MUTANT_TIMEOUT_EXIT, MutantRunInfraError, killTree, runSuite, runSurface } = await import(
  "./runner"
);
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
  });

  it("kills the DESCENDANTS of a timed-out child, not just the child (live, unmocked)", async () => {
    // The topology this exists for: pnpm -> vitest -> a forked pool worker, with
    // the infinite mutant running in the worker. Node's timeout signals only the
    // process it spawned, so before the tree reap a scored-KILLED timeout could
    // leave the real spinner alive (whole-diff R2 F1). Modelled here with a
    // parent that spawns a long-lived grandchild and then never exits.
    const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    const marker = join(tmpdir(), `runner-tree-${process.pid}.pid`);
    const script = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      `fs.writeFileSync(${JSON.stringify(marker)}, String(child.pid));`,
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const parent = real.spawn(process.execPath, ["-e", script], { stdio: "ignore" });
    try {
      // Wait for the grandchild's pid to land, then time the parent out.
      const deadline = Date.now() + 10_000;
      while (!existsSync(marker) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      const grandchild = Number(readFileSync(marker, "utf8"));
      premiseHolds("the grandchild really started", Number.isInteger(grandchild) && grandchild > 0);
      premiseHolds("the grandchild is alive before the reap", alive(grandchild));

      killTree(parent.pid);

      const gone = Date.now() + 10_000;
      while (alive(grandchild) && Date.now() < gone) await new Promise((r) => setTimeout(r, 50));
      expect(alive(grandchild)).toBe(false);
      expect(alive(parent.pid)).toBe(false);
    } finally {
      rmSync(marker, { force: true });
      parent.kill("SIGKILL");
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
