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
/**
 * When set, ONLY this suite times out and every other suite exits 0.
 *
 * A single-suite fixture cannot distinguish a renderer that prints the deciding
 * suite from one that hard-codes the only name available — the two agree on
 * every output. Naming a deciding suite that is NOT the first makes them differ.
 */
let timeoutSuite: string | null = null;

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
      const suite = opts.env!.MUTATION_SUITE!;
      if (timeoutSuite !== null && suite !== timeoutSuite) {
        return { pid: FIXTURE_PID, status: 0, signal: null, stdout: "", stderr: "", output: [] };
      }
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

const { premiseHolds } = await import("../../_shared/premise");
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

// THE REGISTRAR ITSELF, at collection scope — the only place `describe.each` can
// run. Every case above drives `evaluateSurface` directly, and a registrar that
// called it with `{...options, write: () => {}}` would keep every gate result
// intact while removing timeout notices from real shard output entirely.
const registrarOut: string[] = [];
timeoutEveryNth = 1;
mutantCalls = 0;
// `describe.skip` is deliberate and is NOT a skipped proof. The registrar emits
// at COLLECTION time — that is the design, so notices appear before any `it` —
// so calling it here runs the real emission and fills `registrarOut` regardless.
// What `skip` drops is the registrar's own seven generated cases, which assert
// REGISTRY-COUPLED facts (the ledger kinds declared for a real surface id) that a
// synthetic fixture cannot satisfy and has no business claiming. The proof that
// this call did its work is the un-skipped case directly below it.
describe.skip("registrar wiring — the generated cases belong to real surfaces", () => {
  registerSurfaceCases(
    [fixture("registrar-wiring")] as unknown as Parameters<typeof registerSurfaceCases>[0],
    {
      write: (s) => {
        registrarOut.push(s);
      },
    },
  );
});

describe("surfaceCases — the REGISTRAR passes the sink through (diff R3 S1)", () => {
  it("emits this run's timeout notices through registerSurfaceCases, not just evaluateSurface", () => {
    const out = registrarOut.join("");
    expect(out).toMatch(/TIMEOUT-KILL/);
    // Bound to the fixture's own suite, so a registrar that swallowed the sink
    // and a renderer that fabricated a line are both excluded.
    expect(out).toContain("a.test.ts");
    expect(out).toMatch(/[a-z-]+:\d+:\d+:/);
  });
});

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

describe("surfaceCases — the DURABLE record is written by the production path (AC-12)", () => {
  it("lands a record for the surface it just ran, with one entry per mutant", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { listRecords, readRunRecord } = await import("./records");
    const dir = mkdtempSync(join(tmpdir(), "fx-sc-rec-"));
    try {
      timeoutEveryNth = 1;
      mutantCalls = 0;
      const { run } = evaluateSurface(fixture("record-fixture"), {
        write: () => {},
        recordDir: dir,
      });
      const files = listRecords(dir, "record-fixture");
      // The WIRING assertion: a record exists because the production path wrote
      // it, not because a test called the sink directly.
      expect(files).toHaveLength(1);
      const back = readRunRecord(join(dir, files[0] as string));
      // ENTRY COUNT, not mere existence — a writer that creates the file and
      // serializes nothing satisfies an existence check.
      expect(back.outcomes).toHaveLength(run.mutantCount);
      expect(back.surfaceId).toBe("record-fixture");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("surfaceCases — the record lands on ALL FOUR cells of outcome x environment (AC-12, diff R1 S1)", () => {
  // The matrix was proved against `emitRunRecord` directly, which a weaker
  // `evaluateSurface` emitting only on `passed && !CI` satisfies while dropping
  // passing-CI, failing-local and failing-CI — rebuilding the CI-only,
  // failure-only blind spot §1.0 measures inside its own repair. So it is proved
  // HERE, through the production path, once per cell.
  const cells = [
    { name: "passing, local", everyNth: 1, ci: undefined },
    { name: "passing, CI", everyNth: 1, ci: "true" },
    { name: "failing, local", everyNth: 1_000_000, ci: undefined },
    { name: "failing, CI", everyNth: 1_000_000, ci: "true" },
  ] as const;

  for (const cell of cells) {
    it(`writes a record via evaluateSurface — ${cell.name}`, async () => {
      const { mkdtempSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { listRecords, readRunRecord } = await import("./records");

      const dir = mkdtempSync(join(tmpdir(), "fx-sc-matrix-"));
      const priorCi = process.env.CI;
      try {
        if (cell.ci === undefined) delete process.env.CI;
        else process.env.CI = cell.ci;

        timeoutEveryNth = cell.everyNth;
        mutantCalls = 0;
        const id = `matrix-${cell.name.replace(/[^a-z]+/gi, "-")}`;
        const { run, result } = evaluateSurface(fixture(id), { write: () => {}, recordDir: dir });

        // The cell is what it claims to be. Without this, all four cells could be
        // the SAME cell and the matrix would prove one thing four times.
        expect(result.passed).toBe(cell.everyNth === 1);

        const files = listRecords(dir, id);
        expect(files).toHaveLength(1);
        const back = readRunRecord(join(dir, files[0] as string));
        expect(back?.surfaceId).toBe(id);

        // CONTENT-BOUND, derived from the run that produced it. Counts and ids
        // alone are satisfied by a writer persisting CONSTANTS — a record that
        // reports a failing run as passing, or binds a verdict to the wrong
        // mutant, is exactly the wrong-attribution direction the bound forbids.
        expect(back?.passed).toBe(result.passed);
        expect(back?.score).toBe(result.score.value);
        expect(back?.outcomes.map((o) => o.siteId)).toEqual(run.outcomes.map((o) => o.siteId));
        expect(back?.outcomes.map((o) => o.verdict)).toEqual(run.outcomes.map((o) => o.verdict));
        // WHOLE children, not a projection: `suite`, `exitCode` and `durationMs`
        // are the evidence itself, and an implementation persisting correct ids,
        // verdicts and kinds while fabricating those three passes a projection
        // comparison — wrong attribution in the durable channel the arc relies on
        // once the logs are gone.
        expect(back?.outcomes.map((o) => o.children ?? [])).toEqual(
          run.outcomes.map((o) => o.children ?? []),
        );
      } finally {
        if (priorCi === undefined) delete process.env.CI;
        else process.env.CI = priorCi;
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe("surfaceCases — an unwritable sink NEVER moves the gate (AC-14, diff R2 S2)", () => {
  it("does not throw, and returns the same verdict it would with a writable dir", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    timeoutEveryNth = 1;
    mutantCalls = 0;
    const writable = mkdtempSync(join(tmpdir(), "fx-sc-ok-"));
    let reference: { passed: boolean; score: number };
    try {
      const { result } = evaluateSurface(fixture("sink-ok"), {
        write: () => {},
        recordDir: writable,
      });
      reference = { passed: result.passed, score: result.score.value };
    } finally {
      rmSync(writable, { recursive: true, force: true });
    }

    // `/dev/null/child` cannot be created: mkdir returns ENOTDIR. The FAILURE is
    // proved on the production path, not on the helper — `writeRunRecord`
    // returning a typed failure says nothing about what `emitRunRecord` does with
    // it, and an implementation that throws there passes every helper-level case.
    timeoutEveryNth = 1;
    mutantCalls = 0;
    // The real channel is `process.stderr.write` — a console.error spy observes
    // nothing and its empty result would read as "reported nothing" rather than
    // as "watched the wrong pipe".
    const errs: string[] = [];
    const priorErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errs.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const { result } = evaluateSurface(fixture("sink-ok"), {
        write: () => {},
        recordDir: "/dev/null/child",
      });
      // Same verdict, same score: the sink is not permitted to move either.
      expect(result.passed).toBe(reference.passed);
      expect(result.score.value).toBe(reference.score);
      // ...and it is not permitted to be silent about it either: AC-14 has two
      // halves and a sink that swallows the failure satisfies only one.
      expect(errs.join("")).toMatch(/could not write/i);
      expect(errs.join("")).toMatch(/does not change the gate/i);
    } finally {
      process.stderr.write = priorErr as typeof process.stderr.write;
    }
  });
});

describe("surfaceCases — the console notice carries THIS run's values (diff R2 S5)", () => {
  it("prints the site, suite and duration the gate actually produced", () => {
    timeoutEveryNth = 1;
    mutantCalls = 0;
    // TWO suites, and the one that decides is the SECOND. Against a single-suite
    // fixture a renderer that hard-codes the only suite name available passes
    // every assertion here, which is what made this case satisfiable by a
    // constant.
    timeoutSuite = "b.test.ts";
    const out: string[] = [];
    const { result } = evaluateSurface(
      { ...fixture("notice-attribution"), suitePaths: ["a.test.ts", "b.test.ts"] },
      {
        write: (s) => {
          out.push(s);
        },
      },
    );
    expect(result.notices.every((n) => n.suite === "b.test.ts")).toBe(true);
    const notices = result.notices.filter((n) => n.kind === "timeout-kill");
    premiseHolds("this fixture really produced timeout notices", notices.length > 0);

    // PER NOTICE, on one line — not an unordered bag of tokens over the whole
    // output. A renderer transposing durations between lines satisfies "every
    // site appears" and "every duration appears" while attributing each timeout
    // to the wrong child.
    // Segmented on the marker, NOT on newlines: a site id embeds the source text
    // it mutates and that text can contain a newline, so a line-split silently
    // cuts a notice in half and the case fails for a reason that is not the
    // subject. One segment per notice, IN ORDER.
    const segments = out.join("").split("TIMEOUT-KILL ").slice(1);
    expect(segments).toHaveLength(notices.length);
    notices.forEach((n, i) => {
      const seg = segments[i] as string;
      // POSITIONAL, so a renderer that transposes durations or suites between
      // notice lines fails — "every site appears somewhere" does not.
      expect(seg.startsWith(n.site)).toBe(true);
      expect(seg).toContain(String(n.durationMs));
      // The SUITE was never asserted at all, so a hard-coded suite name passed.
      expect(seg).toContain(n.suite);
    });
    timeoutSuite = null;
  });
});
