// tests/mutation/source/surfaceCases.ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EXPECTED_LEDGER_KINDS } from "./expectedLedgerKinds";
import { evaluateGate } from "./gate";
import type { GuardSurface } from "./registry";
import { runControl, runSurface } from "./runner";

const root = process.cwd();

/**
 * The seven per-surface gate cases, in ONE copy, called by each shard with its
 * own slice (wall-clock spec §3.2). Lifted unmodified out of the retired
 * tests/mutation/guardSurfaces.gate.test.ts.
 *
 * `runSurface` runs at MODULE scope inside describe.each -- deliberate and
 * load-bearing. It is why the gate's cost is vitest IMPORT time, and it is why a
 * shard must filter BEFORE calling this: a `describe.skip` or a filtered `it`
 * would still pay the full run during collection.
 */
export function registerSurfaceCases(surfaces: readonly GuardSurface[]): void {
  describe.each(surfaces.map((s) => [s.id, s] as const))(
    "source-mutation gate — %s",
    (_id, surface) => {
      const before = readFileSync(surface.sourcePath);
      const run = runSurface(root, surface);
      const result = evaluateGate({
        surfaceId: surface.id,
        mutantCount: run.mutantCount,
        noOps: run.noOps,
        baselineGreen: run.baselineGreen,
        killed: run.killed,
        survivors: run.survivors,
        ledger: surface.accepted,
        scoreFloor: surface.scoreFloor,
      });

      it("passes every gate condition", () => {
        expect(
          result.failures.map((f) => `${f.condition}: ${f.detail}`).join("\n"),
          "gate failures",
        ).toBe("");
        expect(result.passed).toBe(true);
      });

      it("holds the exact ledger-kind counts declared for THIS surface (AC-13)", () => {
        // The score floor is deliberately COARSE (spec §4.3): from the shipping
        // state it takes three further blessed gaps to breach 0.95, so the floor
        // cannot detect one or two rows silently migrating between kinds.
        // Expectations are per-surface: §4.3's numbers belong to the FIRST
        // CUSTOMER, while §3.7 enrollment is per-surface, so a legitimate second
        // surface must not be measured against taskContract's ledger.
        const kinds = surface.accepted.reduce<Record<string, number>>((acc, row) => {
          acc[row.kind] = (acc[row.kind] ?? 0) + 1;
          return acc;
        }, {});
        expect(kinds).toEqual(EXPECTED_LEDGER_KINDS[surface.id]);
      });

      it("classifies every generated mutant exactly once", () => {
        // The consequence bound in one assertion: killed + survivors must account
        // for every mutant produced. A dropped outcome leaves the gate green while
        // the run tested less than it claims.
        expect(run.killed + run.survivors.length).toBe(run.mutantCount);
        expect(new Set(run.survivors).size).toBe(run.survivors.length);
        expect(run.outcomes).toHaveLength(run.mutantCount);
      });

      it("generated mutants at all, and none was a no-op", () => {
        // Guards the vacuity hole from the other side: a run that silently
        // produced nothing would satisfy the ledger and floor conditions.
        expect(run.mutantCount).toBeGreaterThan(0);
        expect(run.noOps).toEqual([]);
      });

      it("scores at or above the surface's floor", () => {
        expect(result.score.value).toBeGreaterThanOrEqual(surface.scoreFloor);
      });

      it("leaves the tracked source byte-identical (AC-4)", () => {
        // The overlay serves mutant text from memory. If this ever fails, the
        // harness has been rewritten to patch files in place and a crashed run
        // can leave a mutant on disk.
        expect(readFileSync(surface.sourcePath).equals(before)).toBe(true);
      });

      it("kills THIS surface's own control mutant, proving the overlay is live (AC-3)", () => {
        // Without this, a harness whose overlay silently failed to apply reports a
        // PERFECT score -- every mutant running against clean source -- and every
        // other assertion here still passes.
        //
        // The previous version READ as if it made this assertion and did not: it
        // computed `broken`, asserted it differed from the source, and then called
        // runSurface with the surface's own operators, never passing `broken` to
        // anything. So it proved a string occurred in a file. It also hardcoded
        // taskContract's text inside this describe.each, which meant enrolling a
        // second surface red the gate.
        const source = readFileSync(surface.sourcePath, "utf8");
        const broken = source.replace(surface.control.from, surface.control.to);
        expect(
          broken,
          "control did not apply; validateSurface should have rejected this row",
        ).not.toBe(source);
        expect(
          runControl(root, surface, broken),
          "the suite did not notice this surface's control mutant",
        ).not.toBe(0);
        // Explicit budget, because this case SPAWNS A FULL CHILD SUITE RUN and
        // the shared 30s default is a per-test budget meant for in-process work.
        // The gate's other cases run runSurface at module scope, outside any
        // `it`, so no timeout applies to them -- this one moved inside an `it`
        // precisely so the control's verdict is asserted, and inherited a budget
        // that fits an ordinary test rather than a child vitest process. Green
        // locally at ~33s and RED on CI's slower runner, which is the whole
        // reason "real CI green" is a separate gate from "local green".
      }, 600_000);
    },
  );
}
