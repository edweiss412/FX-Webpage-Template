import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

type Outcome = number | { status: null; signal?: string; code?: string };
type Behaviour = Record<string, Outcome | ((call: number) => Outcome)>;

const calls: { suite: string; mutant: string }[] = [];
let behaviour: Behaviour = {};
let callCount = 0;

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    spawnSync: (_cmd: string, _args: readonly string[], opts: { env?: Record<string, string> }) => {
      const suite = opts.env!.MUTATION_SUITE!;
      callCount += 1;
      calls.push({ suite, mutant: opts.env!.MUTATION_MUTANT! });
      const entry = behaviour[suite] ?? 0;
      const b = typeof entry === "function" ? entry(callCount) : entry;
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

/** Above every pid_max on the platforms this runs on, so a reap cannot reach a real process. */
const FIXTURE_PID = 2_147_483_646;

const { GUARD_SURFACES } = await import("./registry");
const { enumerateSites, siteId } = await import("./operators");
const { generateMutants } = await import("./generate");
const { premiseHolds } = await import("../../_shared/premise");
const { parseRuns, runDeterminism, stampInputs, renderDeterminism, resolveSurface } =
  await import("./determinism");
const { main, parseArgv, DEFAULT_DEPS, EXIT_OK, EXIT_REFUSED, EXIT_UNATTRIBUTABLE } =
  await import("../../../scripts/mutation-determinism");
type DeterminismOutcome = Awaited<ReturnType<typeof runDeterminism>>;
type DeterminismInput = Parameters<typeof runDeterminism>[0];

/**
 * The determinism harness core (spec §5.4), AC-8 and AC-9.
 *
 * AC-9 IS THE REASON THIS FILE EXISTS IN THIS SHAPE: the assertions decide
 * IN-PROCESS. A CLI-shaped surface would score as if untested, because the
 * source-mutation runner overlays modules in memory while a spawned `tsx` child
 * reads them from disk — every branch reached only through a child is invisible
 * to it. Nothing below carries a verdict on a subprocess's exit code.
 */

const surfaceOf = (id: string) => {
  const s = GUARD_SURFACES.find((g) => g.id === id);
  premiseHolds(`the registry still enrols ${id}`, s !== undefined);
  return s!;
};

/** A real site id for a real surface, DERIVED from the shipped generator rather than typed in. */
const firstSiteOf = (id: string): string => {
  const surface = surfaceOf(id);
  const target = join(process.cwd(), surface.sourcePath);
  const text = readFileSync(target, "utf8");
  const sites = enumerateSites(target, text, surface.operators);
  const { mutants } = generateMutants(target, text, surface.operators, sites);
  premiseHolds(`${id} generates at least one mutant`, mutants.length > 0);
  return siteId(mutants[0]!.site);
};

const reset = (b: Behaviour) => {
  calls.length = 0;
  callCount = 0;
  behaviour = b;
};

/** Every suite of every surface green, so the baseline passes and mutants survive. */
const allGreen = (): Behaviour => {
  const b: Behaviour = {};
  for (const s of GUARD_SURFACES) for (const p of s.suitePaths) b[p] = 0;
  return b;
};

describe("determinism — `--runs` is an ACCEPT-SET with the complement DEFAULT-DENIED (AC-8)", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty string", ""],
    ["whitespace", "   "],
    ["non-numeric", "two"],
    ["NaN literal", "NaN"],
    ["NaN number", Number.NaN],
    ["Infinity literal", "Infinity"],
    ["-Infinity literal", "-Infinity"],
    ["Infinity number", Number.POSITIVE_INFINITY],
    ["fractional", "2.5"],
    ["fractional number", 2.5],
    ["exponent form", "1e3"],
    ["hex form", "0x2"],
    ["zero", "0"],
    ["negative", "-1"],
    ["trailing junk", "2x"],
    ["object", {}],
    ["array", [2]],
  ])("refuses %s", (_label, value) => {
    expect(parseRuns(value as unknown).ok).toBe(false);
  });

  it.each([
    ["1", 1],
    ["2", 2],
    ["12", 12],
    ["+3", 3],
    [" 4 ", 4],
  ])("accepts %s", (input, expected) => {
    const r = parseRuns(input);
    expect(r.ok).toBe(true);
    expect(r.ok && r.runs).toBe(expected);
  });

  it("accepts an integer NUMBER as well as its string spelling", () => {
    // The adapter hands a string; a caller importing the core may not. A parser
    // that only handles strings silently refuses every programmatic caller.
    expect(parseRuns(3)).toEqual({ ok: true, runs: 3 });
  });

  it("refuses through the CORE and emits NO distribution", () => {
    reset(allGreen());
    const out = runDeterminism({ surface: "spawnBounded", site: "x", runs: "2.5" });
    expect(out.kind).toBe("refusal");
    expect(out.kind === "refusal" && out.input).toBe("runs");
    // A swept-and-clean run must never read as a run that never started.
    expect(JSON.stringify(out)).not.toContain("verdicts");
    // And nothing was spawned: refusal precedes observation.
    expect(calls).toEqual([]);
  });
});

describe("determinism — every refusal names WHICH input failed (AC-8)", () => {
  it("refuses an unknown surface, naming the surface", () => {
    reset(allGreen());
    const out = runDeterminism({ surface: "no-such-surface", site: "x", runs: "1" });
    expect(out.kind === "refusal" && out.input).toBe("surface");
    expect(out.kind === "refusal" && out.detail).toContain("no-such-surface");
    expect(calls).toEqual([]);
  });

  it("refuses an unresolvable site, and says the SURFACE resolved and the SITE did not", () => {
    reset(allGreen());
    const out = runDeterminism({ surface: "spawnBounded", site: "op:99999:1:zz", runs: "1" });
    expect(out.kind === "refusal" && out.input).toBe("site");
    // Never a bare "not found": the operator must be able to tell which half is wrong.
    expect(out.kind === "refusal" && out.detail).toMatch(/SURFACE resolved[\s\S]*SITE did not/i);
  });

  it("refuses a RED baseline rather than reporting a distribution of KILLED", () => {
    const surface = surfaceOf("spawnBounded");
    reset({ ...allGreen(), [surface.suitePaths[0] as string]: 1 });
    const out = runDeterminism({
      surface: "spawnBounded",
      site: firstSiteOf("spawnBounded"),
      runs: "2",
    });
    expect(out.kind === "refusal" && out.input).toBe("baseline");
    // Against a red baseline EVERY mutant scores KILLED, so a distribution here
    // would be a confident report of a meaningless population.
    expect(out.kind === "refusal" && out.detail).toMatch(/RED on unmutated source/i);
    expect(JSON.stringify(out)).not.toContain("verdicts");
  });
});

describe("determinism — one record per deciding suite, in order (AC-8)", () => {
  it("reports every suite of a surface with MORE THAN TWO deciding suites", () => {
    const surface = surfaceOf("paneCompactionCore");
    premiseHolds(
      "the >2-suite surface really declares more than two, or this case tests a two-suite shape",
      surface.suitePaths.length > 2,
    );
    reset(allGreen());
    const out = runDeterminism({
      surface: surface.id,
      site: firstSiteOf(surface.id),
      runs: "2",
    });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") return;
    expect(out.observations).toHaveLength(2);
    for (const o of out.observations) {
      // ORDER, element by element, against the registry row — not a COUNT, which
      // an implementation reporting the right number of wrong suites satisfies,
      // and not a capped-at-two summary, which every two-suite proof admits.
      expect(o.children.map((c) => c.suite)).toEqual([...surface.suitePaths]);
      expect(o.verdict).toBe("SURVIVED");
      for (const c of o.children) {
        expect(c.kind).toBe("exit");
        expect(c.exitCode).toBe(0);
      }
    }
    expect(out.verdicts).toEqual({ SURVIVED: 2 });
    expect(out.kinds).toEqual({ exit: 2 * surface.suitePaths.length });
  });

  it("reports the SINGLE-suite site the spec names, so neither shape is left untested", () => {
    const surface = surfaceOf("psqlStartupScan");
    premiseHolds("psqlStartupScan is still single-suite", surface.suitePaths.length === 1);
    reset(allGreen());
    const out = runDeterminism({
      surface: surface.id,
      site: firstSiteOf(surface.id),
      runs: "3",
    });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") return;
    expect(out.observations).toHaveLength(3);
    expect(out.observations.every((o) => o.children.length === 1)).toBe(true);
  });

  it("reports a MIXED distribution rather than collapsing it to one verdict", () => {
    const surface = surfaceOf("spawnBounded");
    const suite = surface.suitePaths[0] as string;
    // The baseline is call 1; runs are calls 2, 3, 4. Kill only the middle run.
    reset({ ...allGreen(), [suite]: (call: number) => (call === 3 ? 1 : 0) });
    const out = runDeterminism({
      surface: surface.id,
      site: firstSiteOf(surface.id),
      runs: "3",
    });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") return;
    // A harness that reports only the first run, or only the last, or a single
    // summary verdict, cannot produce this — which is the entire point of a
    // determinism harness.
    expect(out.verdicts).toEqual({ SURVIVED: 2, KILLED: 1 });
    expect(out.observations.map((o) => o.verdict)).toEqual(["SURVIVED", "KILLED", "SURVIVED"]);
  });
});

describe("determinism — an INFRA FAULT is excluded, not folded into a verdict (AC-8)", () => {
  it("excludes a faulted run from the distribution and REPORTS it", () => {
    const surface = surfaceOf("spawnBounded");
    const suite = surface.suitePaths[0] as string;
    // Baseline is call 1; runs are 2, 3, 4. Run 2 (call 3) dies with NO exit
    // status and no ETIMEDOUT — a signal death, which is the harness failing
    // rather than the mutant being detected.
    reset({
      ...allGreen(),
      [suite]: (call: number) => (call === 3 ? { status: null, signal: "SIGTERM" } : 0),
    });
    const out = runDeterminism({
      surface: surface.id,
      site: firstSiteOf(surface.id),
      runs: "3",
    });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") return;
    // TWO completed runs, not three, and the denominator says so.
    expect(out.observations).toHaveLength(2);
    expect(out.verdicts).toEqual({ SURVIVED: 2 });
    expect(out.infraFaults).toHaveLength(1);
    // And it is NOT scored as a kill — folding a signal death into KILLED is the
    // score inflation `MutantRunInfraError` exists to prevent.
    expect(out.verdicts.KILLED).toBeUndefined();
  });

  it("ABORTS when every run faults, so the abort is REACHABLE rather than decorative", () => {
    const surface = surfaceOf("spawnBounded");
    const suite = surface.suitePaths[0] as string;
    // Baseline green (call 1), every subsequent run dies without a status.
    reset({
      ...allGreen(),
      [suite]: (call: number) => (call === 1 ? 0 : { status: null, signal: "SIGTERM" }),
    });
    const out = runDeterminism({
      surface: surface.id,
      site: firstSiteOf(surface.id),
      runs: "3",
    });
    // Without the per-run catch this branch could not be reached AT ALL:
    // `parseRuns` guarantees runs >= 1 and the loop appends one observation per
    // iteration, so `observations.length === 0` was impossible and the guard
    // passed unconditionally — a guard whose condition is false where it runs.
    expect(out.kind).toBe("refusal");
    expect(out.kind === "refusal" && out.input).toBe("population");
    expect(out.kind === "refusal" && out.detail).toMatch(/ZERO of 3 run\(s\) COMPLETED/);
    // An abort emits NO distribution — a swept-and-clean run must never read as
    // a run that never started.
    expect(JSON.stringify(out)).not.toContain("verdicts");
  });
});

describe("determinism — PROVENANCE is derived from the run's DECLARED inputs (AC-8)", () => {
  const syntheticRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "fx-stamp-"));
    const write = (rel: string, text: string) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text, "utf8");
    };
    write("src/thing.ts", "export const a = 1;\n");
    write("tests/one.test.ts", "it('a', () => {});\n");
    write("tests/two.test.ts", "it('b', () => {});\n");
    return { root, write };
  };
  const surface = (over: Record<string, unknown> = {}) =>
    ({
      id: "synthetic",
      sourcePath: "src/thing.ts",
      suitePaths: ["tests/one.test.ts", "tests/two.test.ts"],
      operators: ["relational-boundary", "logical-connector"],
      scoreFloor: 0.95,
      control: { from: "1", to: "2" },
      accepted: [],
      ...over,
    }) as unknown as (typeof GUARD_SURFACES)[number];

  it("is STABLE when nothing moves", () => {
    const { root } = syntheticRoot();
    try {
      expect(stampInputs(root, surface()).digest).toBe(stampInputs(root, surface()).digest);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("DIFFERS when a stamped SOURCE byte changes", () => {
    const { root, write } = syntheticRoot();
    try {
      const before = stampInputs(root, surface()).digest;
      write("src/thing.ts", "export const a = 2;\n");
      // This is the assertion that kills a core emitting CONSTANT stamps — which
      // satisfies every other assertion in this file while binding a distribution
      // to the wrong bytes, i.e. wrong attribution.
      expect(stampInputs(root, surface()).digest).not.toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("DIFFERS when a stamped SUITE byte changes", () => {
    const { root, write } = syntheticRoot();
    try {
      const before = stampInputs(root, surface()).digest;
      write("tests/two.test.ts", "it('b', () => { expect(1).toBe(1); });\n");
      expect(stampInputs(root, surface()).digest).not.toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("DIFFERS when the DECLARED OPERATORS change, though no file moved", () => {
    const { root } = syntheticRoot();
    try {
      // The score is a function of source, DECLARED OPERATORS and deciding
      // suites. The operators live in a file that does not look like code under
      // test, which is exactly why an input set that reads as obvious omits them.
      const before = stampInputs(root, surface()).digest;
      const after = stampInputs(root, surface({ operators: ["relational-boundary"] })).digest;
      expect(after).not.toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stamps the bytes that RAN, not whatever is on disk when the stamp is taken", () => {
    const { root, write } = syntheticRoot();
    try {
      const executed = "export const a = 1;\n";
      const diskNow = "export const a = 999;\n";
      // The ordinary save: the run snapshotted `executed` and generated its
      // mutant from it, then somebody saved the file before the stamp was taken.
      write("src/thing.ts", diskNow);

      const bound = stampInputs(root, surface(), { "src/thing.ts": executed });
      const fromDisk = stampInputs(root, surface());
      // Kills a stamp that re-reads disk: it would certify the distribution
      // against bytes that never ran, and both stamps would AGREE about it, so
      // no mismatch would ever surface.
      expect(bound.digest).not.toBe(fromDisk.digest);

      // ...and it is byte-FAITHFUL rather than merely different: restoring the
      // executed bytes to disk reproduces the bound digest exactly. A stamp that
      // hashed the override's LENGTH, or salted it, passes the line above.
      write("src/thing.ts", executed);
      expect(stampInputs(root, surface()).digest).toBe(bound.digest);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("REFUSES an EMPTY override, exactly as it refuses an empty file", () => {
    const { root } = syntheticRoot();
    try {
      // The empty-input refusal must not have a second door that bypasses it.
      expect(() => stampInputs(root, surface(), { "src/thing.ts": "" })).toThrow(/EMPTY INPUT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("DIFFERS when the deciding suites are REORDERED, because execution is ordered", () => {
    const { root } = syntheticRoot();
    try {
      const forward = stampInputs(root, surface()).digest;
      const reversed = stampInputs(
        root,
        surface({ suitePaths: ["tests/two.test.ts", "tests/one.test.ts"] }),
      ).digest;
      // `runMutantRecorded` runs the suites in DECLARED ORDER and short-circuits
      // on the first non-zero, so the order is an input to the outcome. A stamp
      // that sorts before hashing cannot distinguish two input sets that produce
      // different runs — the definition of wrong attribution.
      expect(reversed).not.toBe(forward);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("DIFFERS when a suite is declared TWICE, because it then runs twice", () => {
    const { root } = syntheticRoot();
    try {
      const once = stampInputs(root, surface({ suitePaths: ["tests/one.test.ts"] })).digest;
      const twice = stampInputs(
        root,
        surface({ suitePaths: ["tests/one.test.ts", "tests/one.test.ts"] }),
      ).digest;
      // The same class as the reorder above, reached the other way: a digest
      // built from a path-keyed MAP collapses the duplicate and reports the two
      // input sets as one.
      expect(twice).not.toBe(once);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("REFUSES to stamp an empty file rather than hashing nothing", () => {
    const { root, write } = syntheticRoot();
    try {
      write("tests/two.test.ts", "");
      // A digest over nothing is a fixed-width hex string that sits in a
      // provenance record looking exactly like a measurement.
      expect(() => stampInputs(root, surface())).toThrow(/EMPTY INPUT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds a completed run to a BEFORE and AFTER pair that agree on a clean run", () => {
    reset(allGreen());
    const out = runDeterminism({
      surface: "spawnBounded",
      site: firstSiteOf("spawnBounded"),
      runs: "2",
    });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") return;
    expect(out.stampBefore.digest).toBe(out.stampAfter.digest);
    expect(out.stampBefore.count).toBeGreaterThan(0);
    // Derived, not decorative: the stamped set is the surface's own declared
    // inputs, so an added suite moves it by construction.
    expect(Object.keys(out.stampBefore.files)).toContain(surfaceOf("spawnBounded").sourcePath);
  });
});

describe("determinism — the assertions decide IN-PROCESS (AC-9)", () => {
  it("carries no verdict on a spawned child's exit code", async () => {
    // AC-9 is satisfied BY CONSTRUCTION here, and satisfied-by-construction is
    // exactly the shape that stops being true silently: the day someone reaches
    // for a child-process API to drive the CLI, every branch it covers stops
    // being overlayable, the surface scores as if untested, and the suite stays
    // green. So the property is ASSERTED rather than relied upon.
    //
    // COMMENTS ARE STRIPPED FIRST, via the repo's shared helper. Twice on the
    // first attempt this scan matched ITSELF — once on its own token array, once
    // on the comment explaining that. A scanner whose pattern list can appear in
    // the text it scans reports its own documentation as a violation, so the
    // tokens are assembled AND the prose is removed before the scan runs.
    const ts = await import("typescript");
    const { stripCommentsSafely } = await import("../../_shared/stripComments");
    const source = readFileSync(new URL("./determinism.test.ts", import.meta.url), "utf8");
    const codeOnly = stripCommentsSafely(source, ts.ScriptKind.TS);
    const body = codeOnly.replace(/vi\.mock\("node:child_process"[\s\S]*?\n\}\);\n/, "");
    premiseHolds(
      "the mock factory was elided, or this scan reports its own fixture",
      body.length > 0 && body.length < codeOnly.length,
    );

    const forbidden = ["exec" + "FileSync", "exec" + "Sync", "spawn" + "Sync(", "fo" + "rk("];
    for (const api of forbidden) {
      expect(body.includes(api), `${api} outside the mock factory`).toBe(false);
    }
    // POSITIVE CONTROL on the scan: a token that IS present must be found, or
    // "nothing forbidden here" is indistinguishable from "the scan read nothing".
    expect(body.includes("run" + "Determinism")).toBe(true);
    // And the core really executes in THIS process, so the absence above reads
    // as "nothing shells out" rather than "nothing runs".
    expect(parseRuns("3")).toEqual({ ok: true, runs: 3 });
  });
});

describe("determinism — the rendering carries what the core produced", () => {
  it("renders every field a refusal carries, and no distribution", () => {
    const text = renderDeterminism({
      kind: "refusal",
      input: "runs",
      detail: '--runs must be an integer >= 1, got "2.5"',
    });
    expect(text).toContain("REFUSED (runs)");
    expect(text).toContain("2.5");
    expect(text).not.toContain("verdicts:");
  });
});

describe("mutation:determinism adapter — WIRING and RENDERING, proved separately", () => {
  const FIXED: DeterminismOutcome = {
    kind: "result",
    inputsMoved: [],
    surfaceId: "ledgerGit",
    siteId: "relational-boundary:259:20:<><=",
    // THREE requested, TWO completed — so the fixture is internally coherent AND
    // it exercises the case that matters: a distribution over 2 of 3 runs is a
    // different claim from one over 3, and the rendering has to say so.
    runs: 3,
    observations: [
      {
        run: 1,
        verdict: "SURVIVED",
        exitCode: 0,
        children: [
          { suite: "a.test.ts", kind: "exit", exitCode: 0, durationMs: 1234 },
          { suite: "b.test.ts", kind: "exit", exitCode: 0, durationMs: 5678 },
        ],
      },
      {
        run: 2,
        verdict: "KILLED",
        exitCode: 124,
        children: [{ suite: "a.test.ts", kind: "timeout", exitCode: null, durationMs: 180_000 }],
      },
    ],
    verdicts: { SURVIVED: 1, KILLED: 1 },
    kinds: { exit: 2, timeout: 1 },
    stampBefore: {
      digest: "aaaaaaaaaaaa",
      files: { "x.ts": "1" },
      operators: "op|floor=1",
      count: 1,
    },
    stampAfter: {
      digest: "aaaaaaaaaaaa",
      files: { "x.ts": "1" },
      operators: "op|floor=1",
      count: 1,
    },
    infraFaults: ["run 3: mutation run produced no exit status for fixture [b.test.ts]"],
  };

  it("CALLS the core with the operator's arguments (wiring)", () => {
    // A correct renderer in front of an entry that never invokes the core — or
    // that prints fabricated output — passes every rendering assertion while
    // `pnpm mutation:determinism` reports nothing the core produced.
    const seen: DeterminismInput[] = [];
    const written: string[] = [];
    const code = main(["--surface", "ledgerGit", "--site", "op:1:1:a", "--runs", "2"], {
      run: (input) => {
        seen.push(input);
        return FIXED;
      },
      render: renderDeterminism,
      write: (t) => written.push(t),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ surface: "ledgerGit", site: "op:1:1:a", runs: "2" });
    expect(code).toBe(EXIT_OK);
  });

  it("is bound to the REAL core in production, not only in the injected seam", () => {
    // Without this the injectable seam certifies a path that could be wired to
    // anything at all.
    expect(DEFAULT_DEPS.run).toBe(runDeterminism);
    expect(DEFAULT_DEPS.render).toBe(renderDeterminism);
  });

  it("renders the FIXED result the core returned, field by field (rendering)", () => {
    // Compared against THAT SAME OBJECT — deliberately NOT against a second
    // invocation of the core. `durationMs` is the quantity this arc measured
    // swinging 19.8 s to 39.1 s on byte-identical inputs, so a field-equality
    // assertion across two runs would be flaky by construction and would demand
    // the negation of this arc's own central finding.
    const written: string[] = [];
    main(["--surface", "ledgerGit", "--site", "op:1:1:a", "--runs", "2"], {
      run: () => FIXED,
      render: renderDeterminism,
      write: (t) => written.push(t),
    });
    const out = written.join("");
    expect(out).toContain(FIXED.surfaceId);
    expect(out).toContain((FIXED as { siteId: string }).siteId);
    // NARROWED, not cast: the union already carries these fields on the result
    // arm, and a cast would assert a shape rather than establish it.
    if (FIXED.kind !== "result") throw new Error("FIXED must be a result");
    for (const o of FIXED.observations) {
      expect(out).toContain(o.verdict);
      for (const c of o.children) {
        expect(out).toContain(c.suite);
        expect(out).toContain(String(c.durationMs));
      }
    }
    expect(out).toContain("SURVIVED=1");
    expect(out).toContain("KILLED=1");
    expect(out).toContain("timeout=1");
    expect(out).toContain("aaaaaaaaaaaa");
    // A run that did not COMPLETE must survive the rendering. Silently dropping
    // it would make a distribution over 1 of 2 runs read as a distribution over
    // 2 — the population misreported by the very channel built for attribution.
    expect(out).toMatch(/infra fault/i);
    expect(out).toContain("no exit status");
  });

  it("the fixture itself is COHERENT — completed plus faulted equals requested", () => {
    // A fixture asserting on a self-contradictory object proves nothing about the
    // program, and this one contradicted itself for one revision: it declared two
    // requested runs, two completed observations, AND a fault on run 2, so a run
    // both completed and failed to. Pinned so it cannot drift back.
    if (FIXED.kind !== "result") throw new Error("FIXED must be a result");
    expect(FIXED.observations.length + FIXED.infraFaults.length).toBe(FIXED.runs);
    const completedRuns = new Set(FIXED.observations.map((o) => o.run));
    for (const fault of FIXED.infraFaults) {
      const n = Number(/run (\d+)/.exec(fault)?.[1]);
      expect(completedRuns.has(n), `run ${n} is BOTH completed and faulted`).toBe(false);
    }
  });

  it("exits 2 on an invalid --runs, through the adapter", () => {
    const written: string[] = [];
    const code = main(["--surface", "ledgerGit", "--site", "op:1:1:a", "--runs", "2.5"], {
      run: runDeterminism,
      render: renderDeterminism,
      write: (t) => written.push(t),
    });
    expect(code).toBe(EXIT_REFUSED);
    expect(written.join("")).toContain("REFUSED (runs)");
  });

  it("reads a missing flag value as ABSENT rather than as the next flag", () => {
    expect(parseArgv(["--runs", "--surface", "x"])).toEqual({
      surface: "x",
      site: undefined,
      runs: undefined,
    });
  });
});

describe("determinism — a run whose inputs MOVED is reported, never certified (diff R1 F2)", () => {
  const moved = (): DeterminismOutcome => ({
    kind: "result",
    surfaceId: "ledgerGit",
    siteId: "relational-boundary:259:20:<><=",
    runs: 1,
    observations: [
      {
        run: 1,
        verdict: "KILLED",
        exitCode: 1,
        children: [{ suite: "tests/a.test.ts", kind: "exit", exitCode: 1, durationMs: 12 }],
      },
    ],
    verdicts: { KILLED: 1 },
    kinds: { exit: 1 },
    infraFaults: [],
    stampBefore: {
      digest: "aaaaaaaaaaaa",
      files: { "lib/x.ts": "1111" },
      operators: "o|floor=1",
      count: 1,
    },
    stampAfter: {
      digest: "bbbbbbbbbbbb",
      files: { "lib/x.ts": "2222" },
      operators: "o|floor=1",
      count: 1,
    },
    inputsMoved: ["lib/x.ts"],
  });

  it("names the moved path and BOTH digests in the rendering", () => {
    const out = renderDeterminism(moved());
    expect(out).toContain("INPUTS MOVED DURING THE RUN");
    // The path and both sides, so the reader is not asked to compare two hex
    // strings by eye — the defect this replaces.
    expect(out).toContain("lib/x.ts");
    expect(out).toContain("1111");
    expect(out).toContain("2222");
  });

  it("says NOTHING when the inputs held still", () => {
    // Positive control for the case above: without it, a renderer that printed
    // the banner unconditionally would satisfy every assertion there.
    const still = { ...moved(), inputsMoved: [] };
    expect(renderDeterminism(still)).not.toContain("INPUTS MOVED");
  });

  it("exits UNATTRIBUTABLE — not OK, and not REFUSED", () => {
    const written: string[] = [];
    const code = main(["--surface", "ledgerGit", "--site", "s", "--runs", "1"], {
      run: () => moved(),
      render: renderDeterminism,
      write: (x) => written.push(x),
    });
    expect(code).toBe(EXIT_UNATTRIBUTABLE);
    expect(code).not.toBe(EXIT_OK);
    // NOT `EXIT_REFUSED`: that code promises no distribution was emitted, and
    // one WAS. Reusing it would make one of the two claims false.
    expect(code).not.toBe(EXIT_REFUSED);
    expect(written.join("")).toContain("verdicts:");
  });

  it("still exits OK when nothing moved, so the code above is not constant", () => {
    const code = main(["--surface", "ledgerGit", "--site", "s", "--runs", "1"], {
      run: () => ({ ...moved(), inputsMoved: [] }),
      render: renderDeterminism,
      write: () => {},
    });
    expect(code).toBe(EXIT_OK);
  });
});

describe("determinism — the AFTER stamp is taken AFTER the runs (AC-8, diff R1 S2)", () => {
  /** Copy a surface's declared inputs into a scratch root, so a mid-run edit touches no repo file. */
  const rootFor = (id: string) => {
    const surface = surfaceOf(id);
    const root = mkdtempSync(join(tmpdir(), "fx-moved-"));
    for (const rel of [surface.sourcePath, ...surface.suitePaths]) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), readFileSync(join(process.cwd(), rel), "utf8"), "utf8");
    }
    return { surface, root };
  };

  it("REPORTS an input that moved WHILE the runs were in flight", () => {
    const { surface, root } = rootFor("psqlStartupScan");
    const suiteRel = surface.suitePaths[0] as string;
    try {
      // The edit lands DURING the run, from inside the child mock — which is the
      // only moment that distinguishes a second stamp from a copy of the first.
      reset({
        [suiteRel]: () => {
          writeFileSync(join(root, suiteRel), "it('edited mid-run', () => {});\n", "utf8");
          return 0;
        },
      });
      const out = runDeterminism({
        surface: surface.id,
        site: firstSiteOf(surface.id),
        runs: "1",
        root,
      });
      expect(out.kind).toBe("result");
      if (out.kind !== "result") return;
      // Kills `stampAfter = stampBefore`, which passes every equality-shaped
      // provenance assertion while certifying the distribution against bytes
      // that are no longer the inputs.
      expect(out.inputsMoved).toContain(suiteRel);
      expect(out.stampAfter.digest).not.toBe(out.stampBefore.digest);
      expect(renderDeterminism(out)).toContain("INPUTS MOVED DURING THE RUN");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports NOTHING moved when nothing moves — same surface, same site", () => {
    // The positive control for the case above: without it, an implementation
    // reporting every input as moved on every run passes it.
    const { surface, root } = rootFor("psqlStartupScan");
    try {
      reset(allGreen());
      const out = runDeterminism({
        surface: surface.id,
        site: firstSiteOf(surface.id),
        runs: "1",
        root,
      });
      expect(out.kind).toBe("result");
      if (out.kind !== "result") return;
      expect(out.inputsMoved).toEqual([]);
      expect(out.stampAfter.digest).toBe(out.stampBefore.digest);
      expect(renderDeterminism(out)).not.toContain("INPUTS MOVED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("determinism — a TIMEOUT reaches the kind distribution as a timeout (diff R1 S3)", () => {
  it("aggregates a timed-out child as `timeout`, not as `exit`", () => {
    const surface = surfaceOf("psqlStartupScan");
    premiseHolds("psqlStartupScan is still single-suite", surface.suitePaths.length === 1);
    const suiteRel = surface.suitePaths[0] as string;
    // Call 1 is the BASELINE and must be green, or the run refuses before any
    // mutant is measured and this case would pass having aggregated nothing.
    reset({
      [suiteRel]: (call) =>
        call === 1 ? 0 : { status: null, signal: "SIGKILL", code: "ETIMEDOUT" },
    });
    const out = runDeterminism({
      surface: surface.id,
      site: firstSiteOf(surface.id),
      runs: "1",
    });
    expect(out.kind).toBe("result");
    if (out.kind !== "result") return;
    // The whole subject of this arc, at the aggregation layer: an aggregator
    // that counts every child as `exit` passes an all-exit expectation while
    // spelling a TIMEOUT as an assertion kill in the operator-facing channel.
    expect(out.kinds).toEqual({ timeout: 1 });
    expect(out.observations[0]?.children.map((c) => c.kind)).toEqual(["timeout"]);
    expect(out.observations[0]?.children[0]?.exitCode).toBeNull();
    // Still KILLED — the verdict is ratified and this case must not read as a
    // proposal to change it.
    expect(out.verdicts).toEqual({ KILLED: 1 });
  });
});

describe("determinism — the rendering spells each child's KIND, not just its suite (diff R2 S6)", () => {
  it("prints a timeout child AS a timeout, with the null exit code", () => {
    const out = renderDeterminism({
      kind: "result",
      surfaceId: "s",
      siteId: "op:1:1:x",
      runs: 1,
      observations: [
        {
          run: 1,
          verdict: "KILLED",
          exitCode: 124,
          children: [{ suite: "a.test.ts", kind: "timeout", exitCode: null, durationMs: 180_000 }],
        },
      ],
      verdicts: { KILLED: 1 },
      kinds: { timeout: 1 },
      infraFaults: [],
      stampBefore: { digest: "a", files: {}, operators: "o", count: 0 },
      stampAfter: { digest: "a", files: {}, operators: "o", count: 0 },
      inputsMoved: [],
    });
    // A renderer printing `kind=exit exitCode=0` for this child satisfies every
    // suite/duration assertion while retaining the unrelated aggregate line — so
    // the operator-facing channel spells a TIMEOUT as an assertion kill, which is
    // the exact ambiguity this arc exists to remove.
    expect(out).toMatch(/a\.test\.ts kind=timeout/);
    expect(out).toMatch(/kind=timeout exitCode=null/);
    expect(out).not.toMatch(/a\.test\.ts kind=exit/);
  });

  it("prints an exit child AS an exit, so the line above is not constant", () => {
    const out = renderDeterminism({
      kind: "result",
      surfaceId: "s",
      siteId: "op:1:1:x",
      runs: 1,
      observations: [
        {
          run: 1,
          verdict: "KILLED",
          exitCode: 1,
          children: [{ suite: "a.test.ts", kind: "exit", exitCode: 1, durationMs: 5 }],
        },
      ],
      verdicts: { KILLED: 1 },
      kinds: { exit: 1 },
      infraFaults: [],
      stampBefore: { digest: "a", files: {}, operators: "o", count: 0 },
      stampAfter: { digest: "a", files: {}, operators: "o", count: 0 },
      inputsMoved: [],
    });
    expect(out).toMatch(/a\.test\.ts kind=exit exitCode=1/);
    expect(out).not.toMatch(/kind=timeout/);
  });
});

describe("determinism adapter — EVERY refusal exits 2, not just the one (diff R2 S7)", () => {
  // The complement, enumerated from the core's own refusal inputs rather than
  // from a list typed here: an adapter returning 2 only for `runs` passed the
  // shipped case, and the plan claimed the whole complement was covered.
  const REFUSALS = ["runs", "surface", "site", "baseline", "population"] as const;

  for (const input of REFUSALS) {
    it(`exits REFUSED for a ${input} refusal`, () => {
      const code = main(["--surface", "x", "--site", "y", "--runs", "1"], {
        run: () => ({ kind: "refusal", input, detail: `refused: ${input}` }) as DeterminismOutcome,
        render: renderDeterminism,
        write: () => {},
      });
      expect(code).toBe(EXIT_REFUSED);
    });
  }

  it("covers every refusal input the core can actually produce", () => {
    // The list above is only a complement if it IS the complement. This case is
    // what makes a new refusal kind fail here rather than pass unnoticed.
    const produced = new Set<string>();
    const surface = surfaceOf("psqlStartupScan");
    reset(allGreen());
    produced.add(
      (runDeterminism({ surface: surface.id, site: "nope", runs: "1" }) as { input?: string })
        .input ?? "",
    );
    produced.add(
      (runDeterminism({ surface: "nope", site: "x", runs: "1" }) as { input?: string }).input ?? "",
    );
    produced.add(
      (runDeterminism({ surface: surface.id, site: "x", runs: "2.5" }) as { input?: string })
        .input ?? "",
    );
    reset({ ...allGreen(), [surface.suitePaths[0] as string]: 1 });
    produced.add(
      (
        runDeterminism({ surface: surface.id, site: firstSiteOf(surface.id), runs: "1" }) as {
          input?: string;
        }
      ).input ?? "",
    );
    for (const p of produced) expect(REFUSALS as readonly string[]).toContain(p);
  });
});

describe("determinism — the rendering states WHAT THE STAMP COVERS (spec §6 limit 10)", () => {
  const result = (): DeterminismOutcome => ({
    kind: "result",
    surfaceId: "psqlStartupScan",
    siteId: "op:1:1:x",
    runs: 1,
    observations: [
      {
        run: 1,
        verdict: "SURVIVED",
        exitCode: 0,
        children: [{ suite: "a.test.ts", kind: "exit", exitCode: 0, durationMs: 5 }],
      },
    ],
    verdicts: { SURVIVED: 1 },
    kinds: { exit: 1 },
    infraFaults: [],
    stampBefore: { digest: "a", files: { "x.ts": "1" }, operators: "o", count: 1 },
    stampAfter: { digest: "a", files: { "x.ts": "1" }, operators: "o", count: 1 },
    inputsMoved: [],
  });

  it("says DECLARED inputs only, on a run where nothing moved", () => {
    // The case that matters is precisely the clean one: `inputsMoved: []` is
    // where a reader is most likely to read "nothing moved" from a claim that
    // only supports "no DECLARED input moved". A suite that reads a corpus walk
    // can change a child's exit with both stamps byte-identical.
    const out = renderDeterminism(result());
    expect(out).toContain("DECLARED inputs only");
    expect(out).toContain("§6 limit 10");
  });

  it("does not claim coverage on a REFUSAL, which stamped nothing", () => {
    // The positive control: a renderer printing the coverage line unconditionally
    // would state a boundary for a run that never took a stamp at all.
    const out = renderDeterminism({ kind: "refusal", input: "runs", detail: "no" });
    expect(out).not.toContain("stamp coverage");
  });
});

describe("determinism — evidence is bound to ITS OWN run (diff R3 S3)", () => {
  it("does not let run 2's timeout child appear under run 1", () => {
    const out = renderDeterminism({
      kind: "result",
      surfaceId: "s",
      siteId: "op:1:1:x",
      runs: 2,
      observations: [
        {
          run: 1,
          verdict: "SURVIVED",
          exitCode: 0,
          children: [
            { suite: "one.test.ts", kind: "exit", exitCode: 0, durationMs: 11 },
            { suite: "two.test.ts", kind: "exit", exitCode: 0, durationMs: 22 },
          ],
        },
        {
          run: 2,
          verdict: "KILLED",
          exitCode: 124,
          children: [
            { suite: "one.test.ts", kind: "timeout", exitCode: null, durationMs: 180_000 },
          ],
        },
      ],
      verdicts: { SURVIVED: 1, KILLED: 1 },
      kinds: { exit: 2, timeout: 1 },
      infraFaults: [],
      stampBefore: { digest: "a", files: {}, operators: "o", count: 0 },
      stampAfter: { digest: "a", files: {}, operators: "o", count: 0 },
      inputsMoved: [],
    });

    // PER-RUN BLOCKS, not a bag of tokens over the whole output: a renderer that
    // printed run 2's timeout beneath run 1 and run 1's exits beneath run 2
    // satisfies "every verdict, suite and duration appears somewhere" while
    // attributing the evidence to the wrong run.
    const blocks = out.split(/^run (?=\d+:)/m).slice(1);
    expect(blocks).toHaveLength(2);
    const [first, second] = blocks as [string, string];

    expect(first.startsWith("1: SURVIVED")).toBe(true);
    expect(first).toContain("one.test.ts kind=exit exitCode=0 durationMs=11");
    expect(first).toContain("two.test.ts kind=exit exitCode=0 durationMs=22");
    expect(first).not.toContain("kind=timeout");

    expect(second.startsWith("2: KILLED")).toBe(true);
    expect(second).toContain("one.test.ts kind=timeout exitCode=null durationMs=180000");
    expect(second).not.toContain("kind=exit");
  });
});

describe("determinism — a declared input that moved AND CAME BACK is still reported (diff R3 C1)", () => {
  const rootFor = (id: string) => {
    const surface = surfaceOf(id);
    const root = mkdtempSync(join(tmpdir(), "fx-transient-"));
    for (const rel of [surface.sourcePath, ...surface.suitePaths]) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), readFileSync(join(process.cwd(), rel), "utf8"), "utf8");
    }
    return { surface, root };
  };

  it("catches an A -> B -> A edit across two runs, where the endpoints agree", () => {
    const { surface, root } = rootFor("psqlStartupScan");
    const suiteRel = surface.suitePaths[0] as string;
    const abs = join(root, suiteRel);
    const original = readFileSync(abs, "utf8");
    try {
      // call 1 = baseline, call 2 = run 1's child (edit to B), call 3 = run 2's
      // child (revert to A). Both ENDPOINT stamps see A, so an endpoint-only
      // comparison reports nothing while the children that ran saw B.
      reset({
        [suiteRel]: (call) => {
          if (call === 2) writeFileSync(abs, "it('B', () => {});\n", "utf8");
          if (call === 3) writeFileSync(abs, original, "utf8");
          return 0;
        },
      });
      const out = runDeterminism({
        surface: surface.id,
        site: firstSiteOf(surface.id),
        runs: "2",
        root,
      });
      expect(out.kind).toBe("result");
      if (out.kind !== "result") return;

      // The endpoints AGREE — which is exactly why this case exists.
      expect(out.stampAfter.digest).toBe(out.stampBefore.digest);
      expect(out.inputsMoved).toContain(suiteRel);
      expect(renderDeterminism(out)).toContain("INPUTS MOVED DURING THE RUN");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("determinism — EVERY run boundary is stamped, not just the first (diff R4 S1)", () => {
  const rootFor = (id: string) => {
    const surface = surfaceOf(id);
    const root = mkdtempSync(join(tmpdir(), "fx-late-"));
    for (const rel of [surface.sourcePath, ...surface.suitePaths]) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), readFileSync(join(process.cwd(), rel), "utf8"), "utf8");
    }
    return { surface, root };
  };

  it("catches an A -> B -> A edit between the LAST two runs of three", () => {
    const { surface, root } = rootFor("psqlStartupScan");
    const suiteRel = surface.suitePaths[0] as string;
    const abs = join(root, suiteRel);
    const original = readFileSync(abs, "utf8");
    try {
      // calls: 1 baseline, 2 run 1, 3 run 2 (write B), 4 run 3 (revert). Only the
      // stamp taken before run 3 ever sees B — so an implementation sampling the
      // two endpoints plus the FIRST interior boundary passes the one-run and
      // two-run cases above and misses this one entirely.
      reset({
        [suiteRel]: (call) => {
          if (call === 3) writeFileSync(abs, "it('B', () => {});\n", "utf8");
          if (call === 4) writeFileSync(abs, original, "utf8");
          return 0;
        },
      });
      const out = runDeterminism({
        surface: surface.id,
        site: firstSiteOf(surface.id),
        runs: "3",
        root,
      });
      expect(out.kind).toBe("result");
      if (out.kind !== "result") return;
      expect(out.observations).toHaveLength(3);
      expect(out.stampAfter.digest).toBe(out.stampBefore.digest);
      expect(out.inputsMoved).toContain(suiteRel);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("determinism — each refusal RENDERS as itself (diff R4 S2)", () => {
  const REFUSALS = ["runs", "surface", "site", "baseline", "population"] as const;

  for (const input of REFUSALS) {
    it(`names ${input} in the rendered text, not just in the exit code`, () => {
      const text = renderDeterminism({
        kind: "refusal",
        input,
        detail: `detail for ${input}`,
      } as DeterminismOutcome);
      // A renderer that spelled every refusal as `runs` passed the whole exit-code
      // complement, because those cases discard the text. An unknown surface or
      // site is one typo away from an enrolled input, and labelling it a `runs`
      // failure sends the reader to the wrong half of their own command.
      expect(text).toContain(`REFUSED (${input})`);
      expect(text).toContain(`detail for ${input}`);
      for (const other of REFUSALS) {
        if (other !== input) expect(text).not.toContain(`REFUSED (${other})`);
      }
    });
  }
});

describe("determinism adapter — the process entry must not truncate its own output (diff R3 C2)", () => {
  it("sets process.exitCode instead of calling process.exit", async () => {
    const { readFileSync: read } = await import("node:fs");
    const { stripCommentsSafely } = await import("../../_shared/stripComments");
    const ts = await import("typescript");
    const src = read("scripts/mutation-determinism.ts", "utf8");
    const code = stripCommentsSafely(src, ts.ScriptKind.TS);

    // COMMENTS STRIPPED: this file's own comment explains why `process.exit` is
    // forbidden here, and a scanner that matched it would flag the warning
    // against the mistake as the mistake.
    expect(code).toContain("process.exitCode = main(");
    // On a PIPE stdout is asynchronous and `process.exit` drops queued bytes —
    // measured at 65,536 of 159,926 delivered, exit 0 on both. A truncated
    // distribution reported as a complete one is false certification.
    expect(code).not.toMatch(/process\.exit\s*\(/);
    // Positive control that the scanner reads this file at all, and that
    // stripping did not empty it.
    expect(code).toContain("EXIT_UNATTRIBUTABLE");
  });
});

describe("determinism — a malformed registry row REFUSES rather than certifying (diff R4 C1)", () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: "synthetic",
      sourcePath: "src/thing.ts",
      suitePaths: ["tests/one.test.ts"],
      operators: ["relational-boundary"],
      scoreFloor: 1,
      control: { from: "1", to: "2" },
      accepted: [],
      ...over,
    }) as unknown as (typeof GUARD_SURFACES)[number];

  it("refuses a DUPLICATE id instead of silently taking the first row", () => {
    const out = resolveSurface("synthetic", [row(), row({ sourcePath: "src/other.ts" })]);
    expect(out.ok).toBe(false);
    // BOTH candidates named: an operator whose registry has two rows for one id
    // cannot act on "ambiguous" without being told which two.
    if (out.ok) return;
    expect(out.detail).toContain("src/thing.ts");
    expect(out.detail).toContain("src/other.ts");
  });

  it("refuses a row with NO deciding suites", () => {
    const out = resolveSurface("synthetic", [row({ suitePaths: [] })]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.detail).toMatch(/NO deciding suites/);
  });

  it("resolves a clean row, so the two refusals above are not constant", () => {
    const out = resolveSurface("synthetic", [row()]);
    expect(out.ok).toBe(true);
  });

  it("REFUSES on the production path, emitting no distribution at all", () => {
    // The wiring, not the helper: the reviewer's probe drove `runDeterminism`
    // itself and got two completed SURVIVED observations and exit 0 from a row
    // that ran no child. A distribution whose population is full of observations
    // that observed nothing is the worst shape available — the count looks healthy.
    reset(allGreen());
    const out = runDeterminism({
      surface: "synthetic",
      site: "op:1:1:x",
      runs: "2",
      surfaces: [row({ suitePaths: [] })],
    });
    expect(out.kind).toBe("refusal");
    // KEYS, quoted — the refusal's own prose explains what WOULD have happened and
    // names `SURVIVED`, so a bare substring check tests this message rather than
    // the shape it is asserting about.
    expect(JSON.stringify(out)).not.toContain('"verdicts"');
    expect(JSON.stringify(out)).not.toContain('"observations"');
  });

  it("REFUSES a duplicate id on the production path too", () => {
    reset(allGreen());
    const out = runDeterminism({
      surface: "synthetic",
      site: "op:1:1:x",
      runs: "2",
      surfaces: [row(), row({ sourcePath: "src/other.ts" })],
    });
    expect(out.kind).toBe("refusal");
    expect(JSON.stringify(out)).not.toContain('"verdicts"');
    expect(JSON.stringify(out)).not.toContain('"observations"');
  });

  it("still refuses an UNKNOWN id, with the message it always had", () => {
    // The pre-existing behaviour must survive the rewrite: this is the case that
    // catches a resolver that answers only the two NEW questions.
    const out = resolveSurface("nope", [row()]);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.detail).toContain("no enrolled surface with id");
  });
});
