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

    it("is genuinely held out: the seed run is not the scored run", () => {
      // The forbidden construction, pinned rather than assumed. With one run on both
      // sides the comparison is circular and every margin is free.
      expect(fx.seedRun).not.toBe(fx.scoreRun);
    });

    it("prices no surface the seed run never saw", () => {
      // The second forbidden construction. An arrival has no held-out rate, and
      // falling back to the scored run's OWN rate makes it score itself. Excluded
      // surfaces must be absent from the seed AND from the scored set.
      const scoredIds = new Set(run().scored.map((m) => m.surfaceId));
      for (const id of fx.excluded) {
        expect(Object.keys(fx.seed), `${id} must not be seeded`).not.toContain(id);
        expect(scoredIds.has(id), `${id} must not be scored`).toBe(false);
      }
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
