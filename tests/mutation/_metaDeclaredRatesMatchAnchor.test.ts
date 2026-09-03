// tests/mutation/_metaDeclaredRatesMatchAnchor.test.ts
//
// Every enrolled surface's `millisPerBoot` equals what the committed measurement anchor
// records for it. The rate is then DERIVABLE rather than typed, and a future
// recalibration cannot move one without the other.
//
// WHY THIS EXISTS, and it is not a hypothetical. The 2026-09-01 recalibration moved all
// sixty declared rates to what GitHub Actions run 33404224554 measured, and left sixty
// per-row comments each quoting the enrolling measurement that produced the OLD number.
// Three consecutive review rounds found instances of that one class -- eight of them in
// the round that finally prompted this file. Patching instances is what let it recur.
//
// The prose repair was to stop QUOTING figures in those comments at all, since a comment
// that asserts a number rots the moment the number moves. This is the other half: the
// DECLARED number now has exactly one source, and disagreeing with it is a red rather
// than something a reader might notice.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";
import { GUARD_SURFACES } from "./source/registry";

type Anchor = {
  runId: string;
  rates: Record<string, { observedPerBoot: number }>;
  /**
   * The block the declared rates FOLLOW. The anchor's top-level `rates` is run 33404224554 and is
   * kept as the record that licensed the split; the registry declares from the newest full run.
   */
  recalibration: {
    runId: string;
    rates: Record<string, { observedPerBoot: number }>;
    rateExcluded: string[];
  };
};

const ANCHOR = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "scripts/probes/2026-09-01-mutation-shard-figures-input.json"),
    "utf8",
  ),
) as Anchor;

/**
 * The block the rates are declared FROM.
 *
 * Not the anchor's top-level `rates`, which measured run 33404224554 and is kept as the record
 * that licensed the surface split. A rate is a prediction of the next run's cost, so it follows
 * the newest full run, and the two are separate blocks precisely so that moving one does not
 * silently rewrite the other.
 */
const DECLARED_FROM = ANCHOR.recalibration;

describe("declared millisPerBoot matches the committed measurement anchor", () => {
  it("the anchor actually carries rates, so the comparison below is not vacuous", () => {
    // The failure this prevents: an anchor that parsed to `{}` would make every
    // surface "not measured here" and the whole suite would pass having compared
    // nothing.
    premiseHolds("the anchor holds rate rows", Object.keys(ANCHOR.rates).length > 0);
    premiseHolds(
      "the recalibration block holds rate rows",
      Object.keys(DECLARED_FROM.rates).length > 0,
    );
    expect(ANCHOR.runId).toMatch(/^\d+$/);
    expect(DECLARED_FROM.runId).toMatch(/^\d+$/);
  });

  it("every surface the recalibration measured, and does not exclude, declares that exact rate", () => {
    const excluded = new Set(DECLARED_FROM.rateExcluded);
    const wrong = GUARD_SURFACES.filter(
      (s) => DECLARED_FROM.rates[s.id] !== undefined && !excluded.has(s.id),
    )
      .filter((s) => s.millisPerBoot !== DECLARED_FROM.rates[s.id]!.observedPerBoot)
      .map(
        (s) =>
          `${s.id}: declares ${s.millisPerBoot}, run ${DECLARED_FROM.runId} measured ${DECLARED_FROM.rates[s.id]!.observedPerBoot}`,
      );
    expect(wrong, "a declared rate disagrees with the run that measured it").toEqual([]);
  });

  it("names the EXCLUDED surfaces, rather than letting an exclusion be invisible", () => {
    // An excluded surface is MEASURED here and not declared from, so it must appear in the block
    // and be named as excluded. Silence would be indistinguishable from an unmeasured surface.
    for (const id of DECLARED_FROM.rateExcluded) {
      expect(DECLARED_FROM.rates[id], `${id} is excluded but not measured`).toBeDefined();
    }
    expect([...DECLARED_FROM.rateExcluded].sort()).toEqual(["ledgerClaimsCore", "ledgerGit"]);
  });

  it("an EXCLUDED surface still declares the rate the OLDER run measured", () => {
    // Whole-diff round 4, and it was squarely inside the threat fence: excluding a surface from
    // the recalibration removed it from every parity check, so `millisPerBoot: 1` on `ledgerGit`
    // passed and priced it at 0.107 s instead of 264.718 s in the partition. Excluded means "not
    // declared from the NEW measurement", never "declared from nothing" -- these two keep the
    // rate the anchor's body measured, and that is checkable.
    const excluded = DECLARED_FROM.rateExcluded;
    premiseHolds("there are excluded surfaces to check", excluded.length > 0);
    const wrong = GUARD_SURFACES.filter((s) => excluded.includes(s.id))
      .filter((s) => s.millisPerBoot !== ANCHOR.rates[s.id]?.observedPerBoot)
      .map(
        (s) =>
          `${s.id}: declares ${s.millisPerBoot}, run ${ANCHOR.runId} measured ${String(ANCHOR.rates[s.id]?.observedPerBoot)}`,
      );
    expect(wrong, "an excluded surface's rate matches neither measurement").toEqual([]);
  });

  it("names the surfaces the recalibration does NOT cover, rather than passing over them in silence", () => {
    // A surface enrolled AFTER the recalibration run has no row. That is legitimate, and it is
    // also exactly where an unmeasured rate would hide -- so the set is asserted rather than
    // skipped, and adding to it is a deliberate edit. Empty today: run 33501574343 measured every
    // enrolled surface, including both halves of the split, which the older run could not.
    const uncovered = GUARD_SURFACES.filter((s) => DECLARED_FROM.rates[s.id] === undefined)
      .map((s) => s.id)
      .sort();
    expect(uncovered).toEqual([]);
  });
});
