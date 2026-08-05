import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const SOURCE = "lib/specLint/taskContract.ts";
const PRISTINE = readFileSync(SOURCE, "utf8");

type Outcome = number | { status: null; signal?: string; code?: string };
/** Per-suite outcome; a function receives whether this call is the BASELINE. */
type Behaviour = Record<string, Outcome | ((isBaseline: boolean) => Outcome)>;

const calls: { suite: string; isBaseline: boolean }[] = [];
let behaviour: Behaviour = {};

vi.mock("node:child_process", () => ({
  execFileSync: (_cmd: string, _args: string[], opts: { env: Record<string, string> }) => {
    const suite = opts.env.MUTATION_SUITE!;
    // The baseline run overlays the PRISTINE source; every other call overlays a
    // mutant. Reading the overlay file is how the mock tells them apart, which
    // lets a fixture make a suite reject mutants while still passing baseline.
    const isBaseline = readFileSync(opts.env.MUTATION_MUTANT!, "utf8") === PRISTINE;
    calls.push({ suite, isBaseline });
    const entry = behaviour[suite] ?? 0;
    const b = typeof entry === "function" ? entry(isBaseline) : entry;
    if (typeof b === "number") {
      if (b === 0) return "";
      throw Object.assign(new Error("suite failed"), { status: b });
    }
    throw Object.assign(new Error("child died"), b);
  },
}));

const { MutantRunInfraError, runSuite, runSurface } = await import("./runner");
const { OPERATOR_NAMES } = await import("./operators");

const surface = (suitePaths: string[]) => ({
  id: "fixture",
  sourcePath: "lib/specLint/taskContract.ts",
  suitePaths,
  operators: [...OPERATOR_NAMES],
  // Unread by the runner - the control is the gate's probe, not the run's - but
  // required by GuardSurface, so the fixture carries the real one.
  controlMutation: {
    find: 'if (kind !== "plan") return [];',
    replace: 'if (kind === "plan") return [];',
  },
  scoreFloor: 0.95,
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
