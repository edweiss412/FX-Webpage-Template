import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type Child, type Measured, readRun } from "@/lib/mutationWeight/records";
import {
  type ModelledBoots,
  type Snapshot,
  bindingLeg,
  buildSeedTable,
  bootCountHistory,
  bootRatioStability,
  driftReport,
  heldOutMargin,
  legSeconds,
  lpt,
  median,
  ratePerModelledBoot,
  recoverModelled,
  reconcile,
  seamMagnitude,
  seedRates,
  suiteMedians,
  verdictDelta,
} from "@/lib/mutationWeight/weights";

/**
 * The instrument every figure in the weight-model spec comes from.
 *
 * These assertions are not decoration and they are not taken on trust: each one is
 * paired with a planted defect in `scripts/mutation-weight-plant.mjs`, which edits a
 * COPY of the module and requires this suite to go red. That script refuses to
 * report a pass when its anchor is not unique or its mutant does not compile,
 * because a green suite under a mutation that never applied is the most convincing
 * wrong answer available.
 */

const child = (suite: string, durationMs: number): Child => ({ suite, kind: "exit", durationMs });

const measured = (over: Partial<Measured> & { surfaceId: string }): Measured => {
  const children = over.children ?? [child("a.test.ts", 1000)];
  return {
    leg: 0,
    mutants: 1,
    observedBoots: children.length,
    seconds: children.reduce((a, c) => a + c.durationMs, 0) / 1000,
    verdicts: new Map(),
    passed: true,
    ...over,
    children,
  };
};

/**
 * A modelled-boots dump.
 *
 * `boots` DEFAULTS to its own formula rather than to a constant, because
 * `reconcile` now requires a dump's parts to compose into its total and a fixture
 * that violated that would red every unrelated case. Passing `boots` explicitly is
 * how the inconsistency arm itself is exercised.
 */
const modelled = (
  o: Record<string, Partial<ModelledBoots extends ReadonlyMap<string, infer V> ? V : never>>,
): ModelledBoots =>
  new Map(
    Object.entries(o).map(([k, v]) => {
      const mutants = v.mutants ?? 1;
      const accepted = v.accepted ?? 0;
      const suites = v.suites ?? 1;
      return [
        k,
        {
          boots: v.boots ?? mutants + accepted * (suites - 1) + suites,
          mutants,
          accepted,
          suites,
          ...(v.millisPerBoot === undefined ? {} : { millisPerBoot: v.millisPerBoot }),
        },
      ];
    }),
  );

const snap = (label: string, sha: string, surfaces: Measured[], m: ModelledBoots): Snapshot => ({
  label,
  sha,
  surfaces,
  modelled: m,
});

describe("readRun", () => {
  /**
   * Every scratch root this describe creates, removed after each case.
   *
   * The per-case `finally` blocks below are NOT sufficient on their own, and the
   * gap is narrow enough to be worth naming: `layout()` creates its root and then
   * keeps writing, so a failure anywhere after `mkdtempSync` throws out of the
   * helper before the caller can bind `dir` and enter its `try`. The root then
   * outlives the run with nothing holding a reference to it. The same applies to
   * the case that builds three layouts in sequence, where a throw in the second
   * strands the first.
   *
   * Registering the root the instant it exists closes both, because cleanup stops
   * depending on control ever returning to the caller. Found by the scratch-root
   * cleanup guard, which injects a throw into the Nth filesystem call precisely so
   * the failure lands AFTER a root exists -- a failing assertion never reproduces
   * it, since that path does reach the `finally`.
   */
  const roots: string[] = [];
  afterEach(() => {
    for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** A record directory shaped exactly like the artifacts the nightly uploads. */
  const layout = (
    opts: { elapsed?: string; emptyElapsedDir?: boolean; badDuration?: unknown } = {},
  ): string => {
    const dir = mkdtempSync(join(tmpdir(), "fx-readrun-"));
    roots.push(dir);
    mkdirSync(join(dir, "mutation-records-source-shards-2"), { recursive: true });
    writeFileSync(
      join(dir, "mutation-records-source-shards-2", "surf.run.json"),
      JSON.stringify({
        surfaceId: "surf",
        runId: "run",
        passed: true,
        score: 1,
        outcomes: [
          {
            siteId: "s1",
            verdict: "KILLED",
            children: [
              {
                suite: "one.test.ts",
                kind: "exit",
                // `badDuration` is written EXACTLY as given, including undefined,
                // which JSON.stringify drops -- that is the missing-field case and it
                // must be refused like the rest.
                durationMs: "badDuration" in opts ? opts.badDuration : 1500,
              },
            ],
          },
          {
            siteId: "s2",
            verdict: "SURVIVED",
            children: [
              { suite: "one.test.ts", kind: "exit", durationMs: 500 },
              { suite: "two.test.ts", kind: "timeout", durationMs: 2000 },
            ],
          },
        ],
      }),
    );
    if (opts.elapsed !== undefined || opts.emptyElapsedDir === true) {
      mkdirSync(join(dir, "elapsed-source-shards-2"), { recursive: true });
      if (opts.elapsed !== undefined)
        writeFileSync(join(dir, "elapsed-source-shards-2", "elapsed.txt"), opts.elapsed);
    }
    return dir;
  };

  it("keeps each child WHOLE, so the suite name and kind survive parsing", () => {
    // Reducing children to durations makes the per-suite breakdown behind
    // documented limit L-5 unrecoverable, and leaves the distinct-suite count --
    // the observable `reconcile` uses -- uncomputable.
    const dir = layout();
    try {
      const [m] = readRun(dir).surfaces;
      expect(m?.children.map((c) => c.suite)).toEqual([
        "one.test.ts",
        "one.test.ts",
        "two.test.ts",
      ]);
      expect(m?.children.map((c) => c.kind)).toEqual(["exit", "exit", "timeout"]);
      expect(new Set(m?.children.map((c) => c.suite)).size).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("derives the leg from the DIRECTORY and sums seconds from the children", () => {
    const dir = layout();
    try {
      const [m] = readRun(dir).surfaces;
      expect(m?.leg).toBe(2);
      expect(m?.mutants).toBe(2);
      expect(m?.observedBoots).toBe(3);
      expect(m?.seconds).toBe(4);
      expect(m?.verdicts.get("s2")).toBe("SURVIVED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("REFUSES a child duration that is not a finite non-negative number", () => {
    // The cast on JSON.parse is a promise about the file, not a check of it, and every
    // invalid shape JSON can hold reaches the addition. Two STRING durations are the
    // worst of them: "1000" + "2000" concatenates to 10002 seconds rather than 3, and
    // nothing downstream notices because the child, mutant, suite and leg counts are
    // all intact -- reconciliation passes and the corrupted total becomes a seed rate.
    //
    // Refused loudly rather than coerced, because there is no conservative reading of
    // a duration nobody can parse: pricing it at zero understates a leg exactly as
    // silently as trusting it overstates one.
    for (const bad of ["1000", true, null, -1, {}, undefined]) {
      const dir = layout({ badDuration: bad });
      expect(() => readRun(dir), `durationMs ${JSON.stringify(bad)}`).toThrow(/durationMs/);
    }
  });

  it("reads a leg's elapsed stamp, and reports an ABSENT one as absent rather than zero", () => {
    // A leg that never reported is not a leg that took no time, and the budget
    // check draws the same distinction for the same reason.
    //
    // THREE layouts, because the interesting one is the middle: an artifact
    // DIRECTORY with no `elapsed.txt` inside it, which is what an upload from a
    // leg that died before stamping leaves behind. A fixture with no directory at
    // all never reaches the code that decides, so it cannot tell absent from zero
    // -- and did not, until a planted defect escaped this case.
    const withStamp = layout({ elapsed: "4242\n" });
    const dirNoFile = layout({ emptyElapsedDir: true });
    const noDir = layout();
    try {
      expect(readRun(withStamp).elapsed.get(2)).toBe(4242);
      expect(readRun(dirNoFile).elapsed.has(2)).toBe(false);
      expect(readRun(noDir).elapsed.has(2)).toBe(false);
    } finally {
      for (const d of [withStamp, dirNoFile, noDir]) rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("ratePerModelledBoot", () => {
  it("divides by the MODELLED boot count, which is what the partition multiplies", () => {
    // 4 seconds over 8 modelled boots is 500 ms/boot. Dividing by the two OBSERVED
    // children instead would give 2000, and that error is invisible in any run where
    // the two counts happen to agree -- which is most of them.
    const m = measured({ surfaceId: "a", children: [child("s", 2000), child("s", 2000)] });
    expect(ratePerModelledBoot(m, modelled({ a: { boots: 8 } }))).toBe(500);
  });

  it("returns undefined for zero modelled boots rather than Infinity", () => {
    expect(
      ratePerModelledBoot(measured({ surfaceId: "a" }), modelled({ a: { boots: 0 } })),
    ).toBeUndefined();
  });
});

describe("median", () => {
  it("averages the middle PAIR when the count is even", () => {
    // The defect this replaced picked the upper-middle value, so [1000, 3000]
    // returned 3000. An ordinary enrolment makes the surface population even, so
    // that was the common case one enrolment away rather than a corner.
    expect(median([1000, 3000])).toBe(2000);
    expect(median([1, 2, 3, 100])).toBe(2.5);
  });

  it("takes the middle value when the count is odd", () => {
    expect(median([30_000, 1000, 2000])).toBe(2000);
  });

  it("does not care about input order", () => {
    expect(median([3000, 1000])).toBe(median([1000, 3000]));
  });

  it("returns 0 for an empty sample rather than NaN", () => {
    expect(median([])).toBe(0);
  });
});

describe("seedRates", () => {
  const newer = snap(
    "new",
    "sha-new",
    [measured({ surfaceId: "a", children: [child("s", 10_000)] })],
    modelled({ a: { boots: 1 } }),
  );
  const older = snap(
    "old",
    "sha-old",
    [measured({ surfaceId: "a", children: [child("s", 100_000)] })],
    modelled({ a: { boots: 1 } }),
  );

  it("takes the newest sha and does NOT average over time", () => {
    // 10000 and 100000 are an order of magnitude apart -- the shape ledgerGit really
    // produced at 8.33x -- so mean (55000), median-over-time (55000) and
    // most-recent (10000) are all distinguishable. A fixture whose values were close
    // could not tell the rules apart.
    expect(seedRates([newer, older]).get("a")).toBe(10_000);
  });

  it("medians ACROSS snapshots that share one sha", () => {
    // Two runs of one program: 1000 and 3000 median to 2000. This is a noise filter
    // over repeated measurements, not an average over time, and the distinction is
    // the whole reason `sha` is carried.
    const a = snap(
      "r1",
      "same",
      [measured({ surfaceId: "x", children: [child("s", 1000)] })],
      modelled({ x: { boots: 1 } }),
    );
    const b = snap(
      "r2",
      "same",
      [measured({ surfaceId: "x", children: [child("s", 3000)] })],
      modelled({ x: { boots: 1 } }),
    );
    expect(seedRates([a, b]).get("x")).toBe(2000);
  });

  it("ignores an older sha entirely once a newer one measured the surface", () => {
    const a = snap(
      "r1",
      "new",
      [measured({ surfaceId: "x", children: [child("s", 1000)] })],
      modelled({ x: { boots: 1 } }),
    );
    const b = snap(
      "r2",
      "old",
      [measured({ surfaceId: "x", children: [child("s", 99_000)] })],
      modelled({ x: { boots: 1 } }),
    );
    expect(seedRates([a, b]).get("x")).toBe(1000);
  });

  it("falls through to an older snapshot for a surface the newest never saw", () => {
    expect(
      seedRates([
        newer,
        snap(
          "old",
          "o",
          [measured({ surfaceId: "b", children: [child("s", 20_000)] })],
          modelled({ b: { boots: 1 } }),
        ),
      ]).get("b"),
    ).toBe(20_000);
  });

  it("emits NO rate for a zero-second surface rather than a rate of zero", () => {
    // A zero is not a cheap surface, it is an absent measurement, and a weightless
    // surface is invisible to LPT and lands wherever the tie-break puts it.
    expect(
      seedRates([
        snap(
          "n",
          "s",
          [measured({ surfaceId: "a", children: [child("s", 0)] })],
          modelled({ a: { boots: 1 } }),
        ),
      ]).has("a"),
    ).toBe(false);
  });

  it("emits no rate for a surface the modelled set does not know", () => {
    expect(seedRates([snap("n", "s", [measured({ surfaceId: "a" })], modelled({}))]).size).toBe(0);
  });
});

describe("lpt", () => {
  it("breaks ties by KEY, so input order cannot move an assignment", () => {
    // TWO equal items into TWO bins is the smallest fixture that can express this.
    // Three equal items into two bins fills 0,1,0 whichever order it is handed, so
    // an order-sensitive packer passes it -- which an earlier version of this test
    // did, under the exact defect it named.
    const a = lpt(
      [
        { key: "x", w: 1 },
        { key: "y", w: 1 },
      ],
      2,
    );
    const b = lpt(
      [
        { key: "y", w: 1 },
        { key: "x", w: 1 },
      ],
      2,
    );
    expect(a.get("x")).toBe(b.get("x"));
    expect(a.get("y")).toBe(b.get("y"));
    expect(a.get("x")).not.toBe(a.get("y"));
  });
});

describe("bindingLeg and legSeconds", () => {
  it("bindingLeg is the longest leg, which is what breaches a budget", () => {
    expect(bindingLeg([1, 9, 3])).toBe(9);
  });

  it("legSeconds sums the REAL seconds of whatever the assignment placed", () => {
    const surfaces = [
      measured({ surfaceId: "a", children: [child("s", 1000)] }),
      measured({ surfaceId: "b", children: [child("s", 3000)] }),
    ];
    expect(
      legSeconds(
        new Map([
          ["a", 0],
          ["b", 1],
        ]),
        surfaces,
        2,
      ),
    ).toEqual([1, 3]);
  });

  // The three cases below replace what an earlier draft was going to file as
  // equivalent `?? 0` mutants. None of them is equivalent: every one is
  // reachable through the exported signature, which admits any map.
  it("REFUSES a leg outside the shard range instead of returning NaN for it", () => {
    // The mutant this kills is not a wrong number, it is a number that stops
    // being one. Coalescing here wrote index 5 of a length-3 array, leaving
    // [0,0,0,null,null,100], and the binding leg every budget check reads is
    // Math.max of that: NaN. A guard that silently produces NaN for the single
    // quantity the model exists to bound is worse than no guard.
    const surfaces = [measured({ surfaceId: "a", children: [child("s", 100_000)] })];
    expect(() => legSeconds(new Map([["a", 5]]), surfaces, 3)).toThrow(/outside 0\.\.2/);
    expect(() => legSeconds(new Map([["a", -1]]), surfaces, 3)).toThrow(/outside 0\.\.2/);
    expect(() => legSeconds(new Map([["a", 1.5]]), surfaces, 3)).toThrow(/outside 0\.\.2/);
  });

  it("prices a surface it cannot measure at zero, the direction driftReport covers", () => {
    // Deliberate, not defensive: a registry row added since the last nightly has
    // no measurement, and refusing would fail the report over a routine state.
    // The zero UNDERSTATES the leg, so this is only safe while the caller prints
    // driftReport's `unmeasured`. Asserted at 1 rather than 0 total so a mutant
    // that drops the measured term cannot pass by coincidence.
    const surfaces = [measured({ surfaceId: "a", children: [child("s", 1000)] })];
    const legs = legSeconds(
      new Map([
        ["a", 0],
        ["never-measured", 0],
      ]),
      surfaces,
      2,
    );
    expect(legs).toEqual([1, 0]);
  });

  it("reports a leg nothing was assigned to as zero, not as absent", () => {
    // Materialising over `length: n` rather than over the assignment's keys is
    // what makes an empty leg a 0 in position instead of a short array. A short
    // array would misalign every leg after the gap.
    const surfaces = [measured({ surfaceId: "a", children: [child("s", 2000)] })];
    expect(legSeconds(new Map([["a", 2]]), surfaces, 3)).toEqual([0, 0, 2]);
  });
});

describe("survivor kills — boundaries and counters the earlier cases stepped over", () => {
  // Every case here closes a mutant that survived the re-score. Each names the
  // mutation it kills, because a case whose purpose is invisible gets deleted by the
  // next person who tidies the file.

  it("legSeconds refuses leg === n, the boundary exactly one past the last", () => {
    // Killed: `leg >= n` weakened to `leg > n`. The earlier case used 5, -1 and 1.5
    // against n=3 and never tried 3 itself, so the off-by-one at the boundary was the
    // one spelling it could not see -- and n is the FIRST invalid index, so it is the
    // value a real caller would get wrong.
    const surfaces = [measured({ surfaceId: "a" })];
    expect(() => legSeconds(new Map([["a", 3]]), surfaces, 3)).toThrow(/outside 0\.\.2/);
  });

  it("verdictDelta counts the surfaces and sites the two runs SHARE", () => {
    // Killed: the shared counters being dropped, never incremented, or started at 1.
    // They exist so a comparison over almost nothing cannot read as a clean result --
    // "0 verdicts moved" across 0 shared surfaces is not neutrality, it is silence --
    // and nothing had asserted them, so all four mutations survived.
    const before = [
      measured({
        surfaceId: "a",
        verdicts: new Map([
          ["s1", "KILLED"],
          ["s2", "SURVIVED"],
        ]),
      }),
      measured({ surfaceId: "gone", verdicts: new Map([["s9", "KILLED"]]) }),
    ];
    const after = [
      measured({
        surfaceId: "a",
        verdicts: new Map([
          ["s1", "KILLED"],
          ["s2", "KILLED"],
        ]),
      }),
      measured({ surfaceId: "new", verdicts: new Map([["s7", "KILLED"]]) }),
    ];
    const d = verdictDelta(before, after);
    // One surface in both; the arrival and the departure are not shared.
    expect(d.sharedSurfaces).toBe(1);
    // Two site ids in both, of which one moved.
    expect(d.sharedSiteIds).toBe(2);
    expect(d.moved).toEqual([{ surfaceId: "a", siteId: "s2", from: "SURVIVED", to: "KILLED" }]);
  });

  it("driftReport skips a surface whose OBSERVED rate is zero, not just undefined", () => {
    // Killed: `obs <= 0` weakened to `< 0`, its `||` flipped to `&&`, and its literal
    // 0 moved to 1. A zero observed rate divides into the ratio, so admitting it
    // yields Infinity and reports a surface as infinitely drifted rather than as
    // unmeasurable.
    const zero = measured({ surfaceId: "z", children: [child("s", 0)] });
    const r = driftReport(new Map([["z", 1000]]), [zero], modelled({ z: { mutants: 1 } }), 2);
    expect(r.drifted).toEqual([]);
    expect(r.undeclared).toEqual([]);
  });

  it("driftReport calls a surface with a zero DECLARED rate undeclared, not drifted", () => {
    // Killed: `dec <= 0` weakened to `< 0` and its literal moved. A declared zero is a
    // row nobody measured; reporting it as drift would blame the surface for the
    // registry.
    const m = measured({ surfaceId: "d", children: [child("s", 2000)] });
    const r = driftReport(new Map([["d", 0]]), [m], modelled({ d: { mutants: 1 } }), 2);
    expect(r.undeclared).toEqual(["d"]);
    expect(r.drifted).toEqual([]);
  });

  it("names a surface that is BOTH undeclared and unobservable, rather than dropping it", () => {
    // The consequence bound of this whole design is that every input is handled or
    // SIGNALED, never silently wrong. A surface with no declared rate and no usable
    // observation used to appear in none of the three categories: the unusable
    // observation was skipped before anything asked whether it was declared. It is a
    // fact about the registry either way.
    const silent = measured({ surfaceId: "ghost", children: [child("s", 0)] });
    const r = driftReport(new Map(), [silent], modelled({ ghost: { mutants: 1 } }), 2);
    expect(r.undeclared).toEqual(["ghost"]);
    expect(r.drifted).toEqual([]);
  });

  it("driftReport keeps an OBSERVED rate of exactly 1, at the guard's literal", () => {
    // Killed: the literal in `obs <= 0` moved to 1, so a surface observed at exactly
    // one millisecond per modelled boot is skipped entirely. The earlier zero-rate
    // case cannot see this -- it proves the guard rejects 0, not that it accepts 1 --
    // and the boundary between them is the only place the literal is visible.
    // One child of 1 ms over one modelled boot is exactly 1 ms/boot.
    const one = measured({ surfaceId: "one", children: [child("s", 1)] });
    const r = driftReport(new Map([["one", 1000]]), [one], modelled({ one: { mutants: 0 } }), 2);
    expect(r.drifted.map((d) => d.surfaceId)).toEqual(["one"]);
  });

  it("driftReport keeps a DECLARED rate of exactly 1 rather than calling it undeclared", () => {
    // Killed: the literal in `dec <= 0` moved to 1. A registry row declaring 1 ms per
    // boot is legal and measured; reporting it as undeclared would send someone to
    // add a rate that is already there.
    const m = measured({ surfaceId: "d", children: [child("s", 2000)] });
    const r = driftReport(new Map([["d", 1]]), [m], modelled({ d: { mutants: 0 } }), 2);
    expect(r.undeclared).toEqual([]);
    expect(r.drifted.map((d) => d.surfaceId)).toEqual(["d"]);
  });

  it("seedRates keeps a rate of exactly 1, which the skip must not swallow", () => {
    // Killed: `rate <= 0` moved to `rate <= 1`. One millisecond per modelled boot is
    // absurd in production and perfectly legal here, and dropping it would silently
    // shrink the seed table rather than fail.
    const one = measured({ surfaceId: "one", children: [child("s", 1)] });
    const snap = {
      label: "x",
      sha: "x",
      surfaces: [one],
      elapsed: new Map<number, number>(),
      modelled: modelled({ one: { mutants: 999 } }),
    };
    expect(seedRates([snap]).has("one")).toBe(true);
  });

  it("reconcile composes a dump with MORE than one suite and a non-empty ledger", () => {
    // Killed: `dump.suites - 1` moved to `- 2`. With one suite or an empty ledger the
    // accepted term is zero and the mutation is invisible; it takes both at once.
    // The two SURVIVED verdicts are not decoration: on a passing run every survivor
    // is a ledgered accepted row, so the records witness the accepted count and a
    // dump claiming 2 with none observed is now a disagreement in its own right.
    const r = reconcile(
      [
        measured({
          surfaceId: "a",
          mutants: 5,
          verdicts: new Map([
            ["s1", "SURVIVED"],
            ["s2", "SURVIVED"],
            ["s3", "KILLED"],
          ]),
        }),
      ],
      modelled({ a: { mutants: 5, accepted: 2, suites: 3 } }),
      4,
    );
    expect(r.weightDisagreement).toEqual([]);
  });

  it("reconcile catches a dump that raises accepted and boots together", () => {
    // The gap this closes: accepted was checked only against the dump's OWN total, so
    // raising `accepted` and raising `boots` coherently passed every check while
    // emitting a DIFFERENT rate -- probed at 1500 vs 1000 ms/boot for the same
    // seconds. The weight is invariant within one tree, since boots x rate reproduces
    // the seconds either way, but the RATE is what gets seeded and applied to a LATER
    // tree's boots, where nothing cancels.
    const r = reconcile(
      [
        measured({
          surfaceId: "a",
          mutants: 5,
          verdicts: new Map([["s1", "KILLED"]]),
        }),
      ],
      // Self-consistent by composition (5 + 1*(2-1) + 2 = 8) and still wrong: the run
      // observed no survivor at all.
      modelled({ a: { mutants: 5, accepted: 1, suites: 2 } }),
      4,
    );
    expect(r.weightDisagreement.map((w) => w.field)).toEqual(["accepted"]);
    expect(r.ok).toBe(false);
  });

  it("NAMES a surface whose accepted count it could not witness", () => {
    // A red run is where an unaccepted survivor exists, so its SURVIVED count
    // legitimately differs from the registry's accepted count and the check must stand
    // down. Standing down SILENTLY was the defect: the report kept claiming agreement
    // on all surfaces while one of the two denominators behind the rate went
    // unchecked, and a red run whose survivor is later accepted raises accepted and
    // boots together and passes everything with the wrong denominator.
    const r = reconcile(
      [measured({ surfaceId: "red", mutants: 5, passed: false, verdicts: new Map() })],
      modelled({ red: { mutants: 5, accepted: 1, suites: 2 } }),
      4,
    );
    expect(r.unwitnessed).toEqual(["red"]);
    // Standing down is not a disagreement -- it is an absence of evidence, and the
    // report says which.
    expect(r.weightDisagreement.map((w) => w.field)).not.toContain("accepted");
  });

  it("reconcile prices a MIXED registry, some rated and some not", () => {
    // Killed: the old-dump fallback `?? 1` moved to `?? 2`. Scaling every weight
    // uniformly cannot be seen -- LPT is scale-invariant -- so an all-unrated fixture
    // proves nothing. Doubling only the UNRATED ones changes their weight relative to
    // the rated ones, which is what moves a leg.
    // Weights 3, 2, 3 over two legs. Normal packing puts a and b on leg 0 and c on
    // leg 1; with the unrated b doubled to 4 it becomes b alone on leg 0 and a, c on
    // leg 1. Chosen by computing both, not by hoping they differ.
    const surfaces = [
      measured({ surfaceId: "a", leg: 0, mutants: 2 }),
      measured({ surfaceId: "b", leg: 0, mutants: 1 }),
      measured({ surfaceId: "c", leg: 1, mutants: 2 }),
    ];
    const r = reconcile(
      surfaces,
      modelled({
        a: { mutants: 2, suites: 1, millisPerBoot: 1 },
        b: { mutants: 1, suites: 1 },
        c: { mutants: 2, suites: 1, millisPerBoot: 1 },
      }),
      2,
    );
    expect(r.moved).toEqual([]);
  });
});

describe("survivor kills — the stability and seam reports", () => {
  const snap = (label: string, surfaces: Measured[], mod: Parameters<typeof modelled>[0]) => ({
    label,
    // A Snapshot carries the sha it was taken at; `seedRates` groups by it, so a
    // fixture without one is not a Snapshot even though vitest, which strips types,
    // runs it perfectly happily.
    sha: label,
    surfaces,
    elapsed: new Map<number, number>(),
    modelled: modelled(mod),
  });

  it("drops a surface whose modelled boots are missing, rather than pricing it at one", () => {
    // Killed: `?? 0` moved to `?? 1`, and the `&&` in the finite-and-positive filter
    // flipped to `||`. With zero the ratio is Infinity and the filter removes it; with
    // one the ratio becomes the raw observed count and the surface enters the report
    // as though it had been modelled. The `||` admits Infinity for the same reason.
    const orphan = measured({
      surfaceId: "orphan",
      children: [child("s", 1000), child("s", 1000)],
    });
    const known = measured({ surfaceId: "known", children: [child("s", 1000)] });
    const r = bootRatioStability(
      [
        snap("new", [orphan, known], { known: { mutants: 1 } }),
        snap("old", [orphan, known], { known: { mutants: 1 } }),
      ],
      1.5,
    );
    // `orphan` has no modelled entry in either snapshot, so it must not be ranked.
    expect(r.latest.maxSurface).not.toBe("orphan");
    expect(r.moved.map((m) => m.surfaceId)).not.toContain("orphan");
  });

  it("breaks a tie for the worst ratio toward the FIRST surface, not the last", () => {
    // Killed: `b[1] > a[1]` weakened to `>=`, which silently prefers whichever
    // surface the map happened to yield last. A report that names a different
    // surface run to run for identical data is not a report.
    const one = measured({ surfaceId: "aaa", children: [child("s", 10), child("s", 10)] });
    const two = measured({ surfaceId: "zzz", children: [child("s", 10), child("s", 10)] });
    const r = bootRatioStability(
      [snap("new", [one, two], { aaa: { mutants: 1 }, zzz: { mutants: 1 } })],
      1.5,
    );
    expect(r.latest.maxSurface).toBe("aaa");
  });

  it("reports a surface only when it moved MORE than the threshold, not equal to it", () => {
    // Killed: `factor > movedBy` weakened to `>=`. A factor exactly at the threshold
    // is the boundary the caller chose to exclude, and admitting it makes the
    // threshold mean something different from what its name says.
    const m = (id: string, a: number, b: number) => [
      measured({ surfaceId: id, children: Array.from({ length: a }, () => child("s", 1)) }),
      measured({ surfaceId: id, children: Array.from({ length: b }, () => child("s", 1)) }),
    ];
    const [newer, older] = m("s1", 4, 2) as [Measured, Measured];
    const r = bootRatioStability(
      [snap("new", [newer], { s1: { mutants: 1 } }), snap("old", [older], { s1: { mutants: 1 } })],
      // ratios are 4/2 and 2/2 -> factor exactly 2. At the boundary, excluded.
      2,
    );
    expect(r.moved).toEqual([]);
  });

  it("drops a surface whose observed boot ratio is exactly ZERO", () => {
    // Killed: `r > 0` weakened to `r >= 0`. A surface that produced no children has
    // ratio 0, which is not a measurement -- it is the absence of one. Admitting it
    // makes the minimum ratio 0 and drags the reported floor to a value nothing ran.
    const none = measured({ surfaceId: "silent", children: [], observedBoots: 0 });
    const real = measured({ surfaceId: "real", children: [child("s", 1000)] });
    const r = bootRatioStability(
      [snap("new", [none, real], { silent: { mutants: 1 }, real: { mutants: 1 } })],
      1.5,
    );
    expect(r.latest.min).toBeGreaterThan(0);
    expect(r.latest.maxSurface).toBe("real");
  });

  it("reports an EMPTY history as zero rather than as undefined", () => {
    // Killed: `vals[0] ?? 0` moved to `?? 1`. With no snapshots the minimum is not
    // one; a fabricated 1 would read as a measured ratio.
    const r = bootRatioStability([], 1.5);
    expect(r.latest.min).toBe(0);
  });

  it("weights a seeded surface the later run never modelled at ZERO", () => {
    // Killed: `laterModelled.get(id)?.boots ?? 0` moved to `?? 1`. A surface can be in
    // the SEED and absent from the later run's modelled dump -- the two come from
    // different shas -- and pricing it at one boot gives it a real weight derived from
    // nothing. Zero keeps it in the scored set, where its measured seconds still count
    // against the leg, while contributing no weight it did not earn.
    // Weights at zero: a=1, b=1, u=0, packing a,u | b, so the seconds legs are 5 and 2.
    // With the fabricated boot u weighs 100, takes a leg alone, and the legs become
    // 4 and 3. Computed both ways rather than hoped, because a uniform change would
    // be invisible.
    const seed = new Map([
      ["a", 1],
      ["b", 1],
      ["u", 100],
    ]);
    const later = [
      measured({ surfaceId: "a", children: [child("s", 1000)] }),
      measured({ surfaceId: "b", children: [child("s", 2000)] }),
      measured({ surfaceId: "u", children: [child("s", 4000)] }),
    ];
    const r = heldOutMargin(seed, later, modelled({ a: { mutants: 0 }, b: { mutants: 0 } }), 2);
    // `u` is seeded, so it is SCORED -- its seconds still count against whatever leg
    // it lands on. What it must not have is weight derived from a boot count nobody
    // recorded.
    expect(r.scored.map((m) => m.surfaceId).sort()).toEqual(["a", "b", "u"]);
    expect(r.excluded).toEqual([]);
    expect(r.seconds).toEqual([5, 2]);
  });

  it("counts a surface as moved only when BOTH partitions place it", () => {
    // Killed: `pb.has(k) && pa.get(k) !== pb.get(k)` flipped to `||`. A key present
    // only in the first partition compares its leg against undefined, which differs,
    // so the flip reports every ARRIVAL as a surface that moved legs -- inflating the
    // seam magnitude with surfaces that had no previous leg at all.
    const before = new Map([
      ["shared", 10],
      ["gone", 10],
    ]);
    const after = new Map([
      ["shared", 10],
      ["arrived", 10],
    ]);
    expect(seamMagnitude(before, after, 2)).toEqual([]);
  });
});

describe("recoverModelled", () => {
  it("recovers the mutant count by removing the ledger and suite terms", () => {
    // boots = mutants + accepted*(suites-1) + suites, so with 2 accepted over 3
    // suites: mutants = boots - 2*2 - 3.
    const m = recoverModelled(20, 2, 3, 1015);
    expect(m.mutants).toBe(20 - 4 - 3);
    expect(m.boots).toBe(20);
    expect(m.accepted).toBe(2);
    expect(m.suites).toBe(3);
  });

  it("carries the rate through, or the reconciliation silently falls back to one", () => {
    // The producer half. `reconcile` weights by boots x millisPerBoot and defaults a
    // missing rate to 1 — correct for an OLD dump, and wrong here, where it would
    // compare a priced run against a boots partition and report most of the corpus
    // as moved.
    expect(recoverModelled(20, 2, 3, 1015).millisPerBoot).toBe(1015);
  });

  it("is fed BOOTS, and a priced weight would corrupt the count it derives", () => {
    // The defect this exists to catch, stated as arithmetic: hand it a weight already
    // multiplied by the rate and the recovered mutant total is wrong by that factor.
    // Nothing downstream can notice, because the number still looks like a count.
    const boots = 20;
    const rate = 1015;
    expect(recoverModelled(boots, 2, 3, rate).mutants).toBe(13);
    expect(recoverModelled(boots * rate, 2, 3, rate).mutants).not.toBe(13);
  });
});

describe("buildSeedTable", () => {
  // The four obligations of the bootstrap flag, none of which any command exercised
  // before: repeatable parsing lands upstream, and these are what the table itself owes.

  it("prices every surface from the records when nothing is overridden", () => {
    const r = buildSeedTable(
      new Map([
        ["a", 100],
        ["b", 200],
      ]),
      new Map(),
      ["a", "b"],
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect([...r.table].sort()).toEqual([
        ["a", 100],
        ["b", 200],
      ]);
  });

  it("MERGES the override BEFORE judging completeness, which is the whole point", () => {
    // `b` has no record. Judged first and merged second, it is reported missing and the
    // bootstrap can never close -- a surface explicitly given a rate would still be
    // called unmeasured. This case is the order, stated as behaviour.
    const r = buildSeedTable(new Map([["a", 100]]), new Map([["b", 4963]]), ["a", "b"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.table.get("b")).toBe(4963);
  });

  it("still refuses a surface that neither the records nor an override can price", () => {
    // The override must not weaken the guard it is merged into.
    const r = buildSeedTable(new Map([["a", 100]]), new Map([["b", 4963]]), ["a", "b", "c"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["c"]);
  });

  it("DROPS a recorded rate for a surface the registry no longer holds, and names it", () => {
    // Records outlive enrolment: they are artifacts of an older tree, so a retired
    // surface's rate rides along in them. The completeness check only ever asked
    // whether each LIVE surface had a rate, so that stale row was emitted and would
    // have been seeded back into a registry that does not contain it. Dropped and
    // reported rather than refused, because this is the ordinary case.
    const r = buildSeedTable(
      new Map([
        ["live", 100],
        ["retired", 900],
      ]),
      new Map(),
      ["live"],
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect([...r.table.keys()]).toEqual(["live"]);
    expect(r.retired).toEqual(["retired"]);
  });

  it("refuses an override naming a surface the registry does not have", () => {
    // A rate matching no row is a typo in a hand-typed bootstrap value, and silently
    // dropping it would leave the real surface unpriced under a different spelling.
    const r = buildSeedTable(new Map([["a", 100]]), new Map([["typo", 4963]]), ["a"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unmatched).toEqual(["typo"]);
  });

  it("lets an override REPLACE a recorded rate rather than being ignored", () => {
    // Otherwise a stale record silently wins over a freshly measured bootstrap value.
    const r = buildSeedTable(new Map([["a", 100]]), new Map([["a", 999]]), ["a"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.table.get("a")).toBe(999);
  });
});

describe("reconcile against a PRICED partition", () => {
  // Every fixture here is built so the two weightings DISAGREE. A fixture where
  // boots-weighting and rate-weighting happen to pack identically cannot tell the
  // fix from the defect, and would pass in both directions.

  it("reproduces a partition the registry priced, rather than one weighted by boots", () => {
    // a: boots 10, rate 1   -> priced 10
    // b: boots  1, rate 100 -> priced 100
    // Weighted by BOOTS the heavier surface is `a`, so LPT puts a on leg 0 and b
    // on leg 1. Weighted by the PRICE that inverts: b is heaviest and takes leg 0.
    // The observed legs below are the priced answer, which is what a real run on
    // this registry would have produced.
    const surfaces = [
      measured({ surfaceId: "a", leg: 1, mutants: 9 }),
      measured({ surfaceId: "b", leg: 0, mutants: 0 }),
    ];
    const r = reconcile(
      surfaces,
      modelled({
        a: { mutants: 9, suites: 1, millisPerBoot: 1 },
        b: { mutants: 0, suites: 1, millisPerBoot: 100 },
      }),
      2,
    );
    expect(r.moved).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("prices an OLD dump with no rate at one, which is what that tree did", () => {
    // Four surfaces over two legs with unequal boots, chosen so an all-zero
    // weighting packs DIFFERENTLY: at zero every bin ties and LPT fills them in
    // turn (a, c to leg 0; b, d to leg 1), while by boots the heavy `a` takes one
    // leg alone and b, c, d share the other. A fixture with one surface per leg
    // places identically either way and proves nothing, which is why this one has
    // more surfaces than legs.
    const surfaces = [
      measured({ surfaceId: "a", leg: 0, mutants: 99 }),
      measured({ surfaceId: "b", leg: 1, mutants: 0 }),
      measured({ surfaceId: "c", leg: 1, mutants: 0 }),
      measured({ surfaceId: "d", leg: 1, mutants: 0 }),
    ];
    const r = reconcile(
      surfaces,
      modelled({
        a: { mutants: 99, suites: 1 },
        b: { mutants: 0, suites: 1 },
        c: { mutants: 0, suites: 1 },
        d: { mutants: 0, suites: 1 },
      }),
      2,
    );
    expect(r.moved).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("applies the rate to BOOTS, not to the mutant count", () => {
    // The same fixture as the first case, read for a different mutant. By
    // mutants*rate the weights are 9 and 0, so `a` is heaviest and takes leg 0 --
    // the exact inverse of the priced answer the records carry.
    const r = reconcile(
      [
        measured({ surfaceId: "a", leg: 1, mutants: 9 }),
        measured({ surfaceId: "b", leg: 0, mutants: 0 }),
      ],
      modelled({
        a: { mutants: 9, suites: 1, millisPerBoot: 1 },
        b: { mutants: 0, suites: 1, millisPerBoot: 100 },
      }),
      2,
    );
    expect(r.ok).toBe(true);
  });
});

describe("reconcile", () => {
  const one = [measured({ surfaceId: "a", leg: 0 })];

  it("sees a surface the registry has and the run does not", () => {
    // The enrolment case, and the one an intersection of the two sets cannot see.
    const r = reconcile(one, modelled({ a: {}, b: {} }), 4);
    expect(r.ok).toBe(false);
    expect(r.modelOnly).toEqual(["b"]);
  });

  it("sees a surface the run has and the registry does not", () => {
    const r = reconcile([...one, measured({ surfaceId: "z", leg: 0 })], modelled({ a: {} }), 4);
    expect(r.ok).toBe(false);
    expect(r.recordOnly).toEqual(["z"]);
  });

  it("sees a weight change that does NOT move the partition", () => {
    // A single surface lands on leg 0 whatever it weighs, so membership and legs
    // both agree while the weight itself moved. This is the arm a partition-level
    // check cannot have, and its absence was a blocking review finding.
    const r = reconcile(one, modelled({ a: { mutants: 12 } }), 4);
    expect(r.ok).toBe(false);
    expect(r.weightDisagreement).toEqual([
      { surfaceId: "a", field: "mutants", modelled: 12, observed: 1 },
    ]);
  });

  it("sees duplicate records for one surface", () => {
    // Collapsing them by id doubles that surface's seconds while every other arm
    // still reports agreement.
    const r = reconcile([...one, measured({ surfaceId: "a", leg: 0 })], modelled({ a: {} }), 4);
    expect(r.ok).toBe(false);
    expect(r.duplicated).toEqual(["a"]);
  });

  it("flags a dump whose own parts do not compose into its own total", () => {
    // `accepted` is the third input to the boot formula and the records cannot
    // witness it: moving it changes `boots` while the mutant count, the suite bound
    // and the assignment all still agree. Requiring the dump to be internally
    // consistent is the only way to catch that, and it is what makes a hand-edited
    // or differently-generated dump fail rather than pass.
    const r = reconcile(one, modelled({ a: { boots: 99 } }), 4);
    expect(r.ok).toBe(false);
    expect(r.weightDisagreement).toEqual([
      { surfaceId: "a", field: "boots", modelled: 99, observed: 2 },
    ]);
  });

  it("does NOT flag a surface that entered fewer suites than it declares", () => {
    // The short-circuit means a surface whose every mutant dies in suite one never
    // spawns a child for suites two and three. Observed distinct suites is a LOWER
    // bound on the declared count; treating it as an equality flags ordinary runs.
    const r = reconcile(one, modelled({ a: { suites: 3, mutants: 1 } }), 4);
    expect(r.weightDisagreement).toEqual([]);
  });

  it("DOES flag a run that entered a suite the registry does not declare", () => {
    const m = measured({ surfaceId: "a", children: [child("one.ts", 1), child("two.ts", 1)] });
    const r = reconcile([m], modelled({ a: { suites: 1, mutants: 1 } }), 4);
    expect(r.weightDisagreement).toContainEqual({
      surfaceId: "a",
      field: "suites",
      modelled: 1,
      observed: 2,
    });
  });

  it("reports a surface observed on a leg it does not recompute to", () => {
    // The wrong-leg arm, which had no assertion at all: the partition code could
    // have been replaced with a constant and every other case here still passed,
    // so cost evidence from a genuinely different partition would have validated.
    // FOUR surfaces over four shards so each lands on its own leg, and one record
    // is then claimed to have run somewhere else.
    const four = ["a", "b", "c", "d"];
    const dump = modelled(Object.fromEntries(four.map((id, i) => [id, { mutants: 10 - i }])));
    const truth = reconcile(
      four.map((id, i) => measured({ surfaceId: id, leg: i })),
      dump,
      4,
    );
    expect(truth.moved, "premise: the honest placement reconciles").toEqual([]);

    const lied = four.map((id, i) => measured({ surfaceId: id, leg: id === "a" ? 3 : i }));
    const r = reconcile(lied, dump, 4);
    expect(r.ok).toBe(false);
    expect(r.moved).toEqual([{ surfaceId: "a", observed: 3, recomputed: 0 }]);
  });

  it("returns movers in a stable order, not in the order the records arrived", () => {
    // Two surfaces on wrong legs, supplied worst-name-first, so the sort is
    // observable. Reconciliation failures are read as a list by whoever has to fix
    // the dump, and an unstable one cannot be diffed between runs.
    const four = ["a", "b", "c", "d"];
    const dump = modelled(Object.fromEntries(four.map((id, i) => [id, { mutants: 10 - i }])));
    const lied = [
      measured({ surfaceId: "d", leg: 0 }),
      measured({ surfaceId: "c", leg: 0 }),
      measured({ surfaceId: "b", leg: 1 }),
      measured({ surfaceId: "a", leg: 2 }),
    ];
    const r = reconcile(lied, dump, 4);
    expect(r.moved.map((m) => m.surfaceId)).toEqual([...r.moved.map((m) => m.surfaceId)].sort());
    expect(r.moved.length).toBeGreaterThan(1);
  });

  it("returns recordOnly, modelOnly and duplicated in a stable order", () => {
    // Three lists, all read by whoever repairs the dump, all sorted, and none of
    // them distinguishable from unsorted with a single element. Supplied
    // worst-name-first so the sort is observable.
    const r = reconcile(
      [
        measured({ surfaceId: "zz", leg: 0 }),
        measured({ surfaceId: "aa", leg: 0 }),
        // TWO duplicated ids, in reverse name order. One duplicate cannot tell a
        // sorted list from an unsorted one, which is how the ordering on this
        // particular list survived its first plant.
        measured({ surfaceId: "zdup", leg: 0 }),
        measured({ surfaceId: "zdup", leg: 0 }),
        measured({ surfaceId: "adup", leg: 0 }),
        measured({ surfaceId: "adup", leg: 0 }),
      ],
      modelled({ zmodel: { mutants: 1 }, amodel: { mutants: 1 } }),
      4,
    );
    expect(r.recordOnly).toEqual(["aa", "adup", "zdup", "zz"]);
    expect(r.modelOnly).toEqual(["amodel", "zmodel"]);
    expect(r.duplicated).toEqual(["adup", "zdup"]);
  });

  it("is ok when everything agrees", () => {
    expect(reconcile(one, modelled({ a: {} }), 4).ok).toBe(true);
  });
});

describe("driftReport", () => {
  const surfaces = [
    measured({ surfaceId: "a", children: [child("s", 1500)] }),
    measured({ surfaceId: "b", children: [child("s", 1000)] }),
    measured({ surfaceId: "new", children: [child("s", 900)] }),
  ];
  const m = modelled({ a: { boots: 1 }, b: { boots: 1 }, new: { boots: 1 } });
  const declared = new Map([
    ["a", 1000],
    ["b", 1000],
    ["gone", 5],
  ]);

  it("names a drift the threshold would not call actionable", () => {
    // The consequence bound promises a misdeclared rate is NAMED. A report that
    // speaks only above its threshold leaves every ratio inside it unnamed while
    // that promise still stands, which was a blocking review finding.
    const d = driftReport(declared, surfaces, m, 2).drifted.find((x) => x.surfaceId === "a");
    expect(d).toMatchObject({ declaredMillis: 1000, observedMillis: 1500, actionable: false });
    expect(d?.ratio).toBeCloseTo(1.5);
  });

  it("names an exactly-agreeing surface too", () => {
    expect(driftReport(declared, surfaces, m, 2).drifted.map((x) => x.surfaceId)).toContain("b");
  });

  it("reports a MEASURED surface with no declared rate as undeclared, not as absent", () => {
    // The arrival shape. An earlier version skipped it, so a newly enrolled surface
    // appeared in no list at all while the report claimed to name everything.
    const r = driftReport(declared, surfaces, m, 2);
    expect(r.undeclared).toEqual(["new"]);
    // And it is ONLY there. Dropping the `continue` that ends that branch would let
    // the same surface fall through into the ranked list with no declared rate,
    // which no assertion on `undeclared` alone can see.
    expect(r.drifted.map((x) => x.surfaceId)).not.toContain("new");
  });

  it("returns the undeclared list in a stable order, not in encounter order", () => {
    // TWO undeclared surfaces supplied in reverse order, because one cannot
    // distinguish a sort from its absence. The report joins this list into a line an
    // operator reads, so a run-to-run reshuffle is a diff nobody can act on.
    const two = [
      measured({ surfaceId: "zeta", children: [child("s", 900)] }),
      measured({ surfaceId: "alpha", children: [child("s", 900)] }),
    ];
    const mm = modelled({ zeta: { boots: 1 }, alpha: { boots: 1 } });
    expect(driftReport(new Map(), two, mm, 2).undeclared).toEqual(["alpha", "zeta"]);
  });

  it("ranks by ratio even when encounter order already looks ranked", () => {
    // The earlier fixture happened to supply the worst drifter first, so removing
    // the sort left the assertion true. Supplying it LAST is what makes the sort
    // observable.
    const rising = [
      measured({ surfaceId: "mild", children: [child("s", 1100)] }),
      measured({ surfaceId: "worst", children: [child("s", 4000)] }),
    ];
    const mm = modelled({ mild: { boots: 1 }, worst: { boots: 1 } });
    const d = driftReport(
      new Map([
        ["mild", 1000],
        ["worst", 1000],
      ]),
      rising,
      mm,
      2,
    ).drifted;
    expect(d.map((x) => x.surfaceId)).toEqual(["worst", "mild"]);
  });

  it("reports a declared surface that did not run as unmeasured, not as agreeing", () => {
    expect(driftReport(declared, surfaces, m, 2).unmeasured).toEqual(["gone"]);
  });

  it("treats a ratio EXACTLY at the threshold as not actionable", () => {
    // The boundary the `>` decides. Every other case sits well clear of it, so a
    // `>` to `>=` mutant is invisible to them: a threshold guard is only pinned by
    // an input that lands exactly on it.
    const exact = [measured({ surfaceId: "e", children: [child("s", 2000)] })];
    const mm = modelled({ e: { boots: 1 } });
    const d = driftReport(new Map([["e", 1000]]), exact, mm, 2).drifted;
    expect(d[0]?.ratio).toBe(2);
    expect(d[0]?.actionable).toBe(false);
  });

  it("returns the unmeasured list in a stable order", () => {
    // Two declared surfaces that did not run, declared worst-name-first.
    const d = driftReport(
      new Map([
        ["zeta", 1000],
        ["alpha", 1000],
      ]),
      [],
      modelled({}),
      2,
    );
    expect(d.unmeasured).toEqual(["alpha", "zeta"]);
  });

  it("ranks by ratio, worst first", () => {
    expect(driftReport(declared, surfaces, m, 2).drifted[0]?.surfaceId).toBe("a");
  });
});

describe("verdictDelta", () => {
  it("counts only siteIds present on BOTH sides", () => {
    // A mutant that exists on one side has no verdict to disagree with, and counting
    // it would report every source edit as a verdict regression.
    const before = [
      measured({
        surfaceId: "a",
        verdicts: new Map([
          ["s1", "KILLED"],
          ["s2", "KILLED"],
        ]),
      }),
    ];
    const after = [
      measured({
        surfaceId: "a",
        verdicts: new Map([
          ["s1", "SURVIVED"],
          ["s3", "KILLED"],
        ]),
      }),
    ];
    const d = verdictDelta(before, after);
    expect(d.sharedSiteIds).toBe(1);
    expect(d.moved).toEqual([{ surfaceId: "a", siteId: "s1", from: "KILLED", to: "SURVIVED" }]);
  });

  it("returns movers in a stable order across surfaces and siteIds", () => {
    // Two surfaces, each with two movers, all supplied in reverse of the reported
    // order. A single mover cannot distinguish a sort from its absence, and this
    // list is what an AC-1 report enumerates.
    const v = (id: string, verdict: string): Map<string, string> => new Map([[id, verdict]]);
    const before = [
      measured({
        surfaceId: "zeta",
        verdicts: new Map([
          ["s2", "KILLED"],
          ["s1", "KILLED"],
        ]),
      }),
      measured({ surfaceId: "alpha", verdicts: v("s9", "KILLED") }),
    ];
    const after = [
      measured({
        surfaceId: "zeta",
        verdicts: new Map([
          ["s2", "SURVIVED"],
          ["s1", "SURVIVED"],
        ]),
      }),
      measured({ surfaceId: "alpha", verdicts: v("s9", "SURVIVED") }),
    ];
    expect(verdictDelta(before, after).moved.map((x) => `${x.surfaceId}:${x.siteId}`)).toEqual([
      "alpha:s9",
      "zeta:s1",
      "zeta:s2",
    ]);
  });
});

describe("bootRatioStability", () => {
  // These three helpers produce figures the spec cites, so they are logic and not
  // reporting. Enrolled and uncovered they would be guaranteed survivors on a
  // surface declaring an empty ledger, which is how the first enrolment of this
  // module would have failed its own gate.
  const snapOf = (label: string, sha: string, obs: number, mod: number): Snapshot =>
    snap(
      label,
      sha,
      [measured({ surfaceId: "a", children: Array.from({ length: obs }, () => child("s", 1000)) })],
      modelled({ a: { boots: mod, mutants: mod } }),
    );

  it("reports the ratio of OBSERVED children to MODELLED boots", () => {
    const r = bootRatioStability([snapOf("n", "s", 8, 2)], 1.05);
    expect(r.latest).toMatchObject({ min: 4, median: 4, max: 4, maxSurface: "a" });
  });

  it("takes a real MEDIAN across surfaces, including an even population", () => {
    // The earlier fixture had ONE surface, so every statistic collapsed to the same
    // number and no median rule could be distinguished. An even population of four
    // with distinct ratios is what discriminates. Each surface declares one mutant
    // and one suite, so its modelled boots are 2, and children of 1/2/4/8 give
    // ratios of 0.5/1/2/4: the median is 1.5 and picking the upper-middle gives 2.
    const many = snap(
      "n",
      "s",
      [1, 2, 4, 8].map((k, i) =>
        measured({
          surfaceId: `s${String(i)}`,
          children: Array.from({ length: k }, () => child("t", 1000)),
        }),
      ),
      modelled(Object.fromEntries([0, 1, 2, 3].map((i) => [`s${String(i)}`, { mutants: 1 }]))),
    );
    const r = bootRatioStability([many], 1.05);
    expect(r.latest.median).toBe(1.5);
    expect(r.latest.min).toBe(0.5);
    expect(r.latest.max).toBe(4);
    expect(r.latest.maxSurface).toBe("s3");
  });

  it("reports a surface whose ratio MOVED, oldest first", () => {
    // Oldest-first deliberately, matching `bootCountHistory`, so a reader comparing
    // the two blocks is not silently reading one of them backwards.
    const r = bootRatioStability([snapOf("new", "b", 8, 2), snapOf("old", "a", 2, 2)], 1.05);
    expect(r.moved).toEqual([{ surfaceId: "a", ratios: [1, 4], factor: 4 }]);
  });

  it("returns movers worst-factor first, not in name order", () => {
    // The fixture makes name order and factor order DISAGREE, which is the whole
    // point: `aaa` moves ratio 1 -> 2 (factor 2) and `zzz` moves 0.5 -> 4 (factor 8),
    // so sorting by factor gives zzz first while sorting by name gives aaa first.
    // A fixture where the two agree passes under either rule and pins neither.
    const boots = modelled({ aaa: { mutants: 1 }, zzz: { mutants: 1 } });
    const kids = (n: number): Child[] => Array.from({ length: n }, () => child("t", 1000));
    const newer = snap(
      "new",
      "b",
      [
        measured({ surfaceId: "aaa", children: kids(4) }),
        measured({ surfaceId: "zzz", children: kids(8) }),
      ],
      boots,
    );
    const older = snap(
      "old",
      "a",
      [
        measured({ surfaceId: "aaa", children: kids(2) }),
        measured({ surfaceId: "zzz", children: kids(1) }),
      ],
      boots,
    );
    const moved = bootRatioStability([newer, older], 1.05).moved;
    expect(moved.map((m) => m.surfaceId)).toEqual(["zzz", "aaa"]);
    expect(moved[0]!.factor).toBeGreaterThan(moved[1]!.factor);
  });

  it("stays silent about a ratio that moved less than the threshold", () => {
    expect(
      bootRatioStability([snapOf("new", "b", 8, 2), snapOf("old", "a", 8, 2)], 1.05).moved,
    ).toEqual([]);
  });
});

describe("bootCountHistory", () => {
  const withBoots = (label: string, boots: Record<string, number>): Snapshot =>
    snap(
      label,
      label,
      [],
      modelled(Object.fromEntries(Object.entries(boots).map(([k, b]) => [k, { boots: b }]))),
    );

  it("lists a surface whose modelled boot count changed, oldest first", () => {
    const h = bootCountHistory([withBoots("new", { a: 12 }), withBoots("old", { a: 10 })]);
    expect(h.changed).toEqual([{ surfaceId: "a", boots: [10, 12] }]);
  });

  it("separates an ARRIVAL from a change, because only one of them is unpriceable", () => {
    const h = bootCountHistory([withBoots("new", { a: 10, b: 5 }), withBoots("old", { a: 10 })]);
    expect(h.arrived).toEqual(["b"]);
    expect(h.changed).toEqual([{ surfaceId: "b", boots: [undefined, 5] }]);
  });

  it("lists changed surfaces in a stable order", () => {
    const h = bootCountHistory([
      withBoots("new", { zeta: 12, alpha: 12 }),
      withBoots("old", { zeta: 10, alpha: 10 }),
    ]);
    expect(h.changed.map((c) => c.surfaceId)).toEqual(["alpha", "zeta"]);
  });

  it("says nothing about a surface whose count never moved", () => {
    expect(
      bootCountHistory([withBoots("new", { a: 10 }), withBoots("old", { a: 10 })]).changed,
    ).toEqual([]);
  });
});

describe("suiteMedians", () => {
  it("groups children by suite and reports each MEDIAN, slowest first", () => {
    // SKEWED deliberately: 1000/2000/30000 has a median of 2000 and a mean of
    // 11000. An earlier fixture used two values, and for two values the mean and
    // the median are always equal — so it passed under a mean implementation, which
    // is the same defect shape as the tie-break fixture that could not express its
    // own difference. A fixture that cannot distinguish the rules tests neither.
    const m = measured({
      surfaceId: "a",
      children: [
        child("slow.ts", 1000),
        child("slow.ts", 2000),
        child("slow.ts", 30_000),
        child("fast.ts", 500),
      ],
    });
    expect(suiteMedians(m)).toEqual([
      { suite: "slow.ts", children: 3, medianMs: 2000 },
      { suite: "fast.ts", children: 1, medianMs: 500 },
    ]);
  });

  it("averages the middle pair for an EVEN count, where the median is not a sample", () => {
    const m = measured({
      surfaceId: "a",
      children: [child("s", 1000), child("s", 2000), child("s", 3000), child("s", 100_000)],
    });
    expect(suiteMedians(m)[0]).toEqual({ suite: "s", children: 4, medianMs: 2500 });
  });
});

describe("seamMagnitude", () => {
  it("names the surfaces that change leg, in a stable order", () => {
    // Keys inserted worst-name-first, so the returned order comes from the sort
    // rather than from Map insertion order, which would otherwise supply it for free.
    const rev = new Map([
      ["zeta", 10],
      ["alpha", 1],
    ]);
    const fwd = new Map([
      ["zeta", 1],
      ["alpha", 10],
    ]);
    expect(seamMagnitude(rev, fwd, 2)).toEqual(["alpha", "zeta"]);
  });

  it("names the surfaces that change leg between two weightings", () => {
    const a = new Map([
      ["x", 10],
      ["y", 1],
    ]);
    const b = new Map([
      ["x", 1],
      ["y", 10],
    ]);
    expect(seamMagnitude(a, b, 2)).toEqual(["x", "y"]);
  });
});
