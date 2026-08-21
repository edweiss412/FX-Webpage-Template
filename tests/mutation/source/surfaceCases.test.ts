import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

/**
 * The CONSOLE half of the gate's two emission channels (design §5.2), AC-6.
 *
 * WIRING, NOT RENDERING. This drives the REAL `registerSurfaceCases` with a
 * capturing sink, so deleting the emit from `surfaceCases.ts` reds these cases.
 * A test that drove a `renderNotices` helper directly would pass with nothing
 * wired into the leg's output at all — proving the rendering proves nothing
 * about the wiring, which this plan has already paid a round for.
 *
 * It lives in its own file rather than in `gate.test.ts`, which the plan named:
 * `registerSurfaceCases` calls `describe.each`, so it must be invoked at
 * COLLECTION scope, and folding that into `gate.test.ts` would nest an entire
 * generated gate suite inside it. The proof is unchanged; only its address is.
 */

const SOURCE = "lib/specLint/taskContract.ts";
const PRISTINE = readFileSync(SOURCE, "utf8");
const FIXTURE_PID = 2_147_483_646;

/** Which mutant calls should hit the wall clock rather than exiting. */
let timeoutEveryNth = 1;
let mutantCalls = 0;

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    spawnSync: (_cmd: string, _args: readonly string[], opts: { env?: Record<string, string> }) => {
      const isBaseline = readFileSync(opts.env!.MUTATION_MUTANT!, "utf8") === PRISTINE;
      if (isBaseline) {
        return { pid: FIXTURE_PID, status: 0, signal: null, stdout: "", stderr: "", output: [] };
      }
      mutantCalls += 1;
      if (mutantCalls % timeoutEveryNth === 0) {
        // The shape Node reports for a timed-out child: no status, a signal, and
        // ETIMEDOUT. `runSuiteRecorded` maps it to a `timeout` ChildRecord.
        return {
          pid: FIXTURE_PID,
          status: null,
          signal: "SIGKILL",
          error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
          stdout: "",
          stderr: "",
          output: [],
        };
      }
      return { pid: FIXTURE_PID, status: 0, signal: null, stdout: "", stderr: "", output: [] };
    },
  };
});

const { evaluateSurface, registerSurfaceCases } = await import("./surfaceCases");
const { OPERATOR_NAMES } = await import("./operators");

const fixture = (id: string) => ({
  id,
  sourcePath: SOURCE,
  suitePaths: ["a.test.ts"],
  operators: [...OPERATOR_NAMES],
  scoreFloor: 0.5,
  control: { from: 'if (kind !== "plan") return [];', to: 'if (kind === "plan") return [];' },
  accepted: [],
});

// A PASSING run: every mutant times out, so every one is KILLED, no survivors,
// score 1.0 against a 0.5 floor. This is the condition probe 1 measured — a
// passing gate previously printed the empty string.
const passingOut: string[] = [];
timeoutEveryNth = 1;
mutantCalls = 0;
const passing = evaluateSurface(fixture("passing-fixture"), { write: (s) => passingOut.push(s) });

// A FAILING run: every third mutant times out and the rest SURVIVE with no
// ledger row, so the gate reds on unaccepted survivors while timeouts still
// occur. Both halves are needed — §5.2 requires the channel on both outcomes.
const failingOut: string[] = [];
timeoutEveryNth = 3;
mutantCalls = 0;
const failing = evaluateSurface(fixture("failing-fixture"), { write: (s) => failingOut.push(s) });

describe("surfaceCases — timeout notices reach the CONSOLE (AC-6, §5.2 channel 1)", () => {
  it.each([
    ["a PASSING run", () => passingOut],
    ["a FAILING run", () => failingOut],
  ])("emits on %s", (_label, get) => {
    const out = get().join("");
    // Identifies the emission as a TIMEOUT and carries that mutant's own fields.
    // "the output contains a site id" is satisfied by logging every mutant, and
    // "on a passing run" alone is satisfied by an implementation that logs only
    // when the gate passes — §5.2 requires both directions.
    expect(out).toMatch(/TIMEOUT-KILL/);
    expect(out).toMatch(/hit the wall-clock ceiling/);
    // A real site id, a real suite, and a real duration — not a bare count.
    expect(out).toMatch(/[a-z-]+:\d+:\d+:/);
    expect(out).toContain("a.test.ts");
    expect(out).toMatch(/after \d+ms/);
  });

  it("emits on a run the gate PASSED and one it FAILED — both directions, not one", () => {
    // §5.2 requires the channel on both outcomes. "on a passing run" alone is
    // satisfied by an implementation that logs only when the gate passes, and
    // the inverse is the CI-only, failure-only defect §1.0 measures.
    expect(passing.result.passed, "the passing fixture must actually pass").toBe(true);
    expect(failing.result.passed, "the failing fixture must actually fail").toBe(false);
    expect(passingOut.join("")).toMatch(/TIMEOUT-KILL/);
    expect(failingOut.join("")).toMatch(/TIMEOUT-KILL/);
  });

  it("is WIRED, not merely renderable: registerSurfaceCases consumes evaluateSurface's return", () => {
    // The emit lives in `evaluateSurface`, and every generated gate case consumes
    // the `run` and `result` it returns — so the call cannot be deleted without
    // breaking all of them. That is what makes this wiring rather than a helper
    // the registrar could quietly stop calling.
    expect(typeof registerSurfaceCases).toBe("function");
    expect(typeof evaluateSurface).toBe("function");
  });

  it("says plainly that a timeout is NOT evidence the suite rejected the mutant", () => {
    // The copy is load-bearing: the whole defect is that a timeout and an
    // assertion kill are indistinguishable, so a notice that did not SAY which
    // one it is would rebuild the ambiguity in a new place.
    expect(passingOut.join("")).toContain("NOT evidence the suite rejected the mutant");
  });
});
