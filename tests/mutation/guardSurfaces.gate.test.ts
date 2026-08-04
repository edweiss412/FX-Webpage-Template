import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateGate } from "./source/gate";
import { GUARD_SURFACES } from "./source/registry";
import { runSurface } from "./source/runner";

/**
 * The nightly source-mutation gate (spec §3.6, AC-13/AC-15).
 *
 * NIGHTLY ONLY. It spawns one `vitest` child per mutant — 102 on the first
 * enrolled surface, ~77 s — so it lives in no default project. The tests it
 * MOTIVATES are merge-gating (they are ordinary cases in the surface's own
 * suite); this file only detects NEW gaps. That split is spec R4 and it is
 * deliberate.
 *
 * On-demand: `pnpm mutation:guards`.
 */
const root = process.cwd();

/**
 * Per-surface ledger-kind expectations.
 *
 * Declared HERE rather than counted from the surface's own ledger, because
 * counting a list and comparing it to itself proves nothing — the point (whole-diff
 * R1 F4) is that the deliberately coarse score floor cannot catch one or two rows
 * migrating between kinds, so the target has to be stated independently.
 *
 * Keyed by surface id, and every enrolled surface must appear: a NEW surface fails
 * by default until it declares its own counts, rather than silently inheriting the
 * first customer's (whole-diff R2 MEDIUM — the previous version asserted
 * taskContract's 18/2 against every surface in `describe.each`).
 */
const EXPECTED_LEDGER_KINDS: Record<string, Record<string, number>> = {
  taskContract: { equivalent: 18, "accepted-gap": 2 },
};

describe("guard-surface registry — ledger-kind expectations", () => {
  it("declares expected ledger-kind counts for every enrolled surface", () => {
    expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(
      GUARD_SURFACES.map((s) => s.id).sort(),
    );
  });
});

describe.each(GUARD_SURFACES.map((s) => [s.id, s] as const))(
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

    it("kills a deliberately-broken control mutant, proving the overlay is live (AC-3)", () => {
      // Without this, a harness whose overlay silently failed to apply would
      // report a PERFECT score — every mutant running against clean source —
      // and every other assertion here would still pass. The control inverts
      // the function's own kind guard, which the suite must notice.
      const source = readFileSync(surface.sourcePath, "utf8");
      const broken = source.replace(
        'if (kind !== "plan") return [];',
        'if (kind === "plan") return [];',
      );
      expect(broken, "control mutation did not apply").not.toBe(source);

      const control = runSurface(root, {
        ...surface,
        // One operator, one site: this is a liveness probe, not a second run.
        operators: ["equality-flip"],
      });
      expect(control.mutantCount).toBeGreaterThan(0);
      expect(control.killed).toBeGreaterThan(0);
    });
  },
);
