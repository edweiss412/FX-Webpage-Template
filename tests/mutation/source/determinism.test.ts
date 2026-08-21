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
const { parseRuns, runDeterminism, stampInputs, renderDeterminism } = await import("./determinism");

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

describe("determinism — PROVENANCE is derived from the run's ACTUAL inputs (AC-8)", () => {
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
