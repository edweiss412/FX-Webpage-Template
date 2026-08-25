import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type Child, type Measured, readRun } from "@/lib/mutationWeight/records";
import {
  type ModelledBoots,
  type Snapshot,
  bindingLeg,
  driftReport,
  legSeconds,
  lpt,
  ratePerModelledBoot,
  reconcile,
  seamMagnitude,
  seedRates,
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

const modelled = (
  o: Record<string, Partial<ModelledBoots extends ReadonlyMap<string, infer V> ? V : never>>,
): ModelledBoots =>
  new Map(
    Object.entries(o).map(([k, v]) => [
      k,
      {
        boots: v.boots ?? 1,
        mutants: v.mutants ?? 1,
        accepted: v.accepted ?? 0,
        suites: v.suites ?? 1,
      },
    ]),
  );

const snap = (label: string, sha: string, surfaces: Measured[], m: ModelledBoots): Snapshot => ({
  label,
  sha,
  surfaces,
  modelled: m,
});

describe("readRun", () => {
  /** A record directory shaped exactly like the artifacts the nightly uploads. */
  const layout = (opts: { elapsed?: string } = {}): string => {
    const dir = mkdtempSync(join(tmpdir(), "fx-readrun-"));
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
            children: [{ suite: "one.test.ts", kind: "exit", durationMs: 1500 }],
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
    if (opts.elapsed !== undefined) {
      mkdirSync(join(dir, "elapsed-source-shards-2"), { recursive: true });
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

  it("reads a leg's elapsed stamp, and reports an ABSENT one as absent rather than zero", () => {
    // A leg that never reported is not a leg that took no time, and the budget
    // check draws the same distinction for the same reason.
    const withStamp = layout({ elapsed: "4242\n" });
    const without = layout();
    try {
      expect(readRun(withStamp).elapsed.get(2)).toBe(4242);
      expect(readRun(without).elapsed.has(2)).toBe(false);
    } finally {
      rmSync(withStamp, { recursive: true, force: true });
      rmSync(without, { recursive: true, force: true });
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
    const r = reconcile(one, modelled({ a: { boots: 12, mutants: 12 } }), 4);
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

  it("does NOT flag a surface that entered fewer suites than it declares", () => {
    // The short-circuit means a surface whose every mutant dies in suite one never
    // spawns a child for suites two and three. Observed distinct suites is a LOWER
    // bound on the declared count; treating it as an equality flags ordinary runs.
    const r = reconcile(one, modelled({ a: { suites: 3, mutants: 1, boots: 1 } }), 4);
    expect(r.weightDisagreement).toEqual([]);
  });

  it("DOES flag a run that entered a suite the registry does not declare", () => {
    const m = measured({ surfaceId: "a", children: [child("one.ts", 1), child("two.ts", 1)] });
    const r = reconcile([m], modelled({ a: { suites: 1, mutants: 1, boots: 1 } }), 4);
    expect(r.weightDisagreement).toContainEqual({
      surfaceId: "a",
      field: "suites",
      modelled: 1,
      observed: 2,
    });
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
    expect(driftReport(declared, surfaces, m, 2).undeclared).toEqual(["new"]);
  });

  it("reports a declared surface that did not run as unmeasured, not as agreeing", () => {
    expect(driftReport(declared, surfaces, m, 2).unmeasured).toEqual(["gone"]);
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
});

describe("seamMagnitude", () => {
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
