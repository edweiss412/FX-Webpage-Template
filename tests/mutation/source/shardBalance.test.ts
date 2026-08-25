/**
 * AC-3: on every held-out pair, the seconds-calibrated binding leg beats the
 * shipped boot-count model's.
 *
 * HELD OUT means the rate is seeded from one nightly and scored on a LATER one, so
 * the seed never sees the run it is judged on. Seeding and scoring on one run makes
 * `boots x rate` reproduce that run's seconds by construction, and the surface then
 * scores itself.
 *
 * The comparison is `heldOutMargin`, the SAME function the report runs, so the
 * figures the spec quotes and the assertions here cannot drift apart. A suite that
 * re-implemented the packing would assert against its own arithmetic.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { premise } from "../../_shared/premise";
import type { Measured } from "@/lib/mutationWeight/records";
import { bindingLeg, heldOutMargin } from "@/lib/mutationWeight/weights";
import { SOURCE_SHARD_COUNT } from "./shardPartition";

type Fixture = {
  seedRun: string;
  scoreRun: string;
  seed: Record<string, number>;
  surfaces: { surfaceId: string; seconds: number }[];
  boots: Record<string, number>;
  excluded: string[];
  observed: {
    secondsBinding: number;
    bootsBinding: number;
    marginSeconds: number;
  };
};

const PAIRS = [1, 2, 3].map((n) => {
  const path = `tests/mutation/source/fixtures/heldout/pair-${n}.json`;
  return { path, fx: JSON.parse(readFileSync(path, "utf8")) as Fixture };
});

/** Only `surfaceId` and `seconds` are read by the packing; the rest is scaffolding. */
const asMeasured = (s: { surfaceId: string; seconds: number }): Measured => ({
  surfaceId: s.surfaceId,
  seconds: s.seconds,
  leg: 0,
  mutants: 1,
  observedBoots: 1,
  children: [],
  verdicts: new Map(),
  passed: true,
});

describe("held-out binding leg (AC-3)", () => {
  it("has three committed pairs to compare", () => {
    premise("held-out fixture pairs", PAIRS.length, 2);
  });

  describe.each(PAIRS)("$path", ({ fx }) => {
    const run = () =>
      heldOutMargin(
        new Map(Object.entries(fx.seed)),
        fx.surfaces.map(asMeasured),
        new Map(
          Object.entries(fx.boots).map(([k, boots]) => [
            k,
            { boots, mutants: 0, accepted: 0, suites: 1 },
          ]),
        ),
        SOURCE_SHARD_COUNT,
      );

    it("is genuinely held out: two DISTINCT, non-empty run ids", () => {
      // Inequality alone was not enough, and the gap was exploitable by deletion:
      // with either field absent the comparison is `undefined !== "meas-..."`, which
      // is true, so a fixture that had lost its provenance entirely passed as held
      // out. The shape has to be asserted before the difference means anything.
      for (const [field, value] of [
        ["seedRun", fx.seedRun],
        ["scoreRun", fx.scoreRun],
      ] as const) {
        expect(typeof value, `${field} must be a string`).toBe("string");
        expect(value.trim().length, `${field} must not be empty`).toBeGreaterThan(0);
        expect(value, `${field} must name a run`).toMatch(/^meas-\d+$/);
      }
      expect(fx.seedRun).not.toBe(fx.scoreRun);
    });

    it("partitions EVERY later-run surface into scored or excluded, with none lost", () => {
      // Completeness DERIVED, not read back from a list the fixture also supplies.
      // Checking only the ids already in `excluded` left the omitted set unchecked,
      // so deleting an entry from that list passed every assertion -- the fixture was
      // grading its own homework. The partition is now computed from the seed.
      const r = run();
      const all = fx.surfaces.map((m) => m.surfaceId).sort();
      const partition = [...r.scored.map((m) => m.surfaceId), ...r.excluded].sort();
      expect(partition, "every later surface is either scored or excluded").toEqual(all);
      // And the split is exactly seeded versus not, which is what "held out" means.
      const seeded = new Set(Object.keys(fx.seed));
      expect(r.scored.every((m) => seeded.has(m.surfaceId))).toBe(true);
      expect(r.excluded.every((id) => !seeded.has(id))).toBe(true);
      // The recorded list must agree with the derived one, so a fixture edited on one
      // side and not the other fails rather than drifting.
      expect(r.excluded).toEqual([...fx.excluded].sort());
    });

    it("puts the SECONDS-calibrated binding leg STRICTLY below the shipped one", () => {
      // STRICT, not at-or-below. AC-3 states a bound, and a bound is the right shape
      // for a criterion -- but with the rate unapplied the two partitions are
      // IDENTICAL and equality satisfies at-or-below, so a test asserting only the
      // criterion passes on an unimplemented tree and proves nothing. Every one of
      // these pairs records a strictly positive margin, so the assertion is the
      // measured fact; it implies the criterion and it can fail.
      //
      // Direction, stated so a sign error cannot pass: SECONDS is the SMALLER number.
      const r = run();
      expect(bindingLeg(r.seconds)).toBeLessThan(bindingLeg(r.boots));
    });

    it("reproduces the recorded margin from the fixture, not from weightOf", () => {
      // The expectation comes from the committed SECONDS, never from the function
      // under test: an expectation derived from `weightOf` could not notice a rate
      // mutant, because both sides would move together.
      const r = run();
      expect(Math.round(bindingLeg(r.seconds))).toBe(fx.observed.secondsBinding);
      expect(Math.round(bindingLeg(r.boots))).toBe(fx.observed.bootsBinding);
      expect(Math.round(bindingLeg(r.boots) - bindingLeg(r.seconds))).toBe(
        fx.observed.marginSeconds,
      );
    });
  });
});
