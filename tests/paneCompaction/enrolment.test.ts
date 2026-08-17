import { describe, expect, it } from "vitest";

import { enumerateSites } from "@/tests/mutation/source/operators";
import { GUARD_SURFACES } from "@/tests/mutation/source/registry";
import { premise } from "@/tests/_shared/premise";
import { readFileSync } from "node:fs";

/**
 * Task 9 — enrolment in the source-mutation registry.
 *
 * Enrolment precedes the whole-diff review, because that review's brief must
 * carry a `GUARD SURFACE:` line with a real score.
 */

const ID = "paneCompactionCore";

describe("the classifier core is enrolled", () => {
  const surface = GUARD_SURFACES.find((s) => s.id === ID);

  it("has a registry row", () => {
    expect(surface, `no GUARD_SURFACES row with id ${ID}`).toBeDefined();
  });

  it("accepts ONLY argued-equivalent mutants, never a coverage gap", () => {
    // Enrolment started with an empty ledger deliberately: a `siteId` is
    // line-keyed, so any later edit to the source shifts every accepted row
    // below it and the gate reports the whole set stale by construction. That
    // trap could not bite until survivors were actually classified -- which has
    // now happened, so the assertion moves from "empty" to "exactly these".
    //
    // The first measurement scored 0.8282 with 28 survivors; the round-1 repairs
    // then moved the core, the gate correctly reported every accepted row stale,
    // and the re-measurement found 17. Both rounds were repaid by tests
    // (mutantKills.test.ts) except the eight argued below.
    //
    // SIX mutate a TYPE ANNOTATION, which TypeScript erases and the runner never
    // typechecks, so the emitted JavaScript is byte-identical. TWO are counter
    // details in `newestVerdictTie`, whose only consumer is `count > 1`: the
    // counter is reset to 1 at each new maximum, so neither the initial value
    // nor the increment size can move that predicate.
    //
    // Eight of the seventeen also taught something the score alone would not
    // have: the refusal-message tests I had written lived in adapter.test.ts,
    // which is NOT in this surface's suitePaths, so they never counted. Coverage
    // that does not run under the mutant is not coverage.
    //
    // The bar this pins is the one that matters: NO `accepted-gap` rows. A gap
    // is real coverage debt and would need a BL- ref; an equivalent mutant is
    // not debt at all. Keeping the two apart is what stops the ledger from
    // becoming a place to park survivors nobody wanted to kill.
    const accepted = surface?.accepted ?? [];
    expect(accepted.map((r) => r.kind)).toEqual(Array(8).fill("equivalent"));
    expect(accepted.filter((r) => r.kind === "accepted-gap")).toEqual([]);
    expect(accepted.map((r) => r.siteId).sort()).toEqual([
      "integer-literal:316:15:0>1",
      "integer-literal:325:16:1>2",
      "integer-literal:487:53:0>1",
      "integer-literal:487:57:1>2",
      "integer-literal:487:61:2>3",
      "integer-literal:621:35:1>2",
      "integer-literal:719:17:0>1",
      "integer-literal:719:21:1>2",
    ]);
    // Not a formality: an empty reason would let a future row be waved through.
    for (const r of accepted) expect(r.reason.length).toBeGreaterThan(40);
  });

  it("excludes regex-quantifier-bound, which generates no site on this surface", () => {
    // Probed, not assumed: it recognizes only `{m,n}` inside literal text, and
    // this surface uses `{5}` and `\s+`. Declaring it would be a DARK operator
    // — the gate checks only that total mutants exceed zero, so it would pass
    // while contributing nothing. Plan round 1 predicted exactly this.
    expect(surface?.operators).not.toContain("regex-quantifier-bound");
  });

  it("every DECLARED operator has at least one site here", () => {
    // The gate asserts only that total mutants exceed zero, so a declared
    // operator with no site on this surface is DARK: it contributes nothing
    // while enrolment still passes. Plan round 1 caught the operator table
    // asserting sites it had never checked.
    if (surface === undefined) throw new Error("surface not enrolled");
    const src = readFileSync(surface.sourcePath, "utf8");
    const sites = enumerateSites(surface.sourcePath, src, surface.operators as never);
    premise("the surface generates mutants at all", sites.length, 0);

    // The premise the LOOP needs, stated before it: an empty declared set makes
    // every iteration vacuous and this case passes while asserting nothing. The
    // previous premise here — that each declared operator is in the declared set
    // — was drawn from the very array it iterates, so it could not be false and
    // guarded nothing.
    premise("the surface declares operators for the loop to check", surface.operators.length, 0);

    const seen = new Set(sites.map((s) => s.operator));
    for (const declared of surface.operators) {
      expect(
        seen.has(declared),
        `declared operator ${declared} generates NO site on this surface`,
      ).toBe(true);
    }
  });
});
