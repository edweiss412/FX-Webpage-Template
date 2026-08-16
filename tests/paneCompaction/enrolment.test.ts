import { describe, expect, it } from "vitest";

import { enumerateSites } from "@/tests/mutation/source/operators";
import { GUARD_SURFACES } from "@/tests/mutation/source/registry";
import { premise, premiseHolds } from "@/tests/_shared/premise";
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

  it("starts with an EMPTY accepted ledger, so nothing can go stale before the first run", () => {
    // A `siteId` is line-keyed: any later edit to the source shifts every
    // accepted row below it and the gate reports the whole set stale by
    // construction. Enrolling empty means the trap cannot bite until survivors
    // are actually classified.
    expect(surface?.accepted).toEqual([]);
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

    const seen = new Set(sites.map((s) => s.operator));
    for (const declared of surface.operators) {
      premiseHolds(`operator ${declared} is declared`, surface.operators.includes(declared));
      expect(
        seen.has(declared),
        `declared operator ${declared} generates NO site on this surface`,
      ).toBe(true);
    }
  });
});
