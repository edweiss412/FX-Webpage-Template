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

type Anchor = { runId: string; rates: Record<string, { observedPerBoot: number }> };

const ANCHOR = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "scripts/probes/2026-09-01-mutation-shard-figures-input.json"),
    "utf8",
  ),
) as Anchor;

describe("declared millisPerBoot matches the committed measurement anchor", () => {
  it("the anchor actually carries rates, so the comparison below is not vacuous", () => {
    // The failure this prevents: an anchor that parsed to `{}` would make every
    // surface "not measured here" and the whole suite would pass having compared
    // nothing.
    premiseHolds("the anchor holds rate rows", Object.keys(ANCHOR.rates).length > 0);
    expect(ANCHOR.runId).toMatch(/^\d+$/);
  });

  it("every surface the anchor measured declares that exact rate", () => {
    const wrong = GUARD_SURFACES.filter((s) => ANCHOR.rates[s.id] !== undefined)
      .filter((s) => s.millisPerBoot !== ANCHOR.rates[s.id]!.observedPerBoot)
      .map(
        (s) =>
          `${s.id}: declares ${s.millisPerBoot}, anchor measured ${ANCHOR.rates[s.id]!.observedPerBoot}`,
      );
    expect(wrong, "a declared rate disagrees with the run that measured it").toEqual([]);
  });

  it("names the surfaces the anchor does NOT cover, rather than passing over them in silence", () => {
    // Surfaces enrolled AFTER the anchor run, and the two halves of the split (whose
    // parts did not exist when it ran), have no anchor row. That is legitimate, and it
    // is also exactly where an unmeasured rate would hide -- so the set is asserted
    // rather than skipped, and adding to it is a deliberate edit.
    const uncovered = GUARD_SURFACES.filter((s) => ANCHOR.rates[s.id] === undefined)
      .map((s) => s.id)
      .sort();
    expect(uncovered).toEqual(["controlOutlineResidueBoundaries", "controlOutlineResidueRewrites"]);
  });
});
