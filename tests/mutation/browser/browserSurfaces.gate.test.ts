import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateGate } from "../source/gate";
import { BROWSER_SURFACES, browserSiteId } from "./registry";
import { runBrowserControl, runBrowserSurface } from "./runner";

/**
 * The browser-mutant gate (spec §3.6, AC-1/AC-2).
 *
 * NIGHTLY AND ON-DEMAND ONLY, like its vitest-mode sibling
 * (`tests/mutation/guardSurfaces.gate.test.ts`) and more so: each mutant spawns a
 * real Playwright child, ~20-30 minutes for the first enrolled surface (spec §4,
 * measured). It lives in no default project. On demand: `pnpm mutation:browser`.
 *
 * The SCORING stack is imported unmodified — `evaluateGate` decides all nine
 * conditions here exactly as it does for the vitest mode (spec §1.1.6). A
 * browser-side fork of it would be a second oracle to keep in step, which is the
 * failure this mode was built to avoid rather than repeat.
 */
const root = process.cwd();

/**
 * Per-surface ledger-kind expectations, declared INDEPENDENTLY of the ledger.
 *
 * Same shape and same reason as `EXPECTED_LEDGER_KINDS` in the vitest-mode gate:
 * counting a list and comparing it to itself proves nothing, and a score floor
 * cannot see an `equivalent` row appearing — such a row leaves the score at 1 by
 * excluding its survivor from the denominator entirely. A new surface reds here
 * until it declares its own counts rather than inheriting a neighbour's.
 */
const EXPECTED_LEDGER_KINDS: Record<string, Record<string, number>> = {
  // The tap-target surface enrolled clean: 19/19 killed on its first run, so its
  // ledger is EMPTY and its floor is 1. A row appearing here later is a coverage
  // regression to explain, not a number to update.
  tapTargetFloor: {},
};

describe("browser-surface registry — structural", () => {
  it("enrols at least one surface", () => {
    // NOT env-gated by a skip: an empty browser registry after this arc means
    // the enrolment was deleted, and a silently empty registry is the one state
    // in which every other case below passes vacuously (describe.each over an
    // empty list registers nothing at all).
    expect(BROWSER_SURFACES.length).toBeGreaterThan(0);
  });

  it("declares expected ledger-kind counts for every enrolled surface", () => {
    expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(
      BROWSER_SURFACES.map((s) => s.id).sort(),
    );
  });
});

describe.each(BROWSER_SURFACES.map((s) => [s.id, s] as const))(
  "browser-mutation gate — %s",
  (_id, surface) => {
    // Every file any mutant or the control names, captured BEFORE the run: the
    // overlay serves mutant text from memory, so a run that ever writes one of
    // these has been rewritten to patch files in place and a crash could leave a
    // mutant on disk.
    const targets = [
      ...new Set([...surface.mutants, surface.control].flatMap((m) => m.edits.map((e) => e.file))),
    ];
    const before = new Map(targets.map((f) => [f, readFileSync(f)]));

    const run = runBrowserSurface(root, surface);
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

    it("holds the exact ledger-kind counts declared for THIS surface", () => {
      const kinds = surface.accepted.reduce<Record<string, number>>((acc, row) => {
        acc[row.kind] = (acc[row.kind] ?? 0) + 1;
        return acc;
      }, {});
      expect(kinds).toEqual(EXPECTED_LEDGER_KINDS[surface.id]);
    });

    it("classifies every declared mutant exactly once", () => {
      expect(run.killed + run.survivors.length).toBe(run.mutantCount);
      expect(new Set(run.survivors).size).toBe(run.survivors.length);
      expect(run.outcomes).toHaveLength(surface.mutants.length);
      expect(run.outcomes.map((o) => o.siteId)).toEqual(surface.mutants.map(browserSiteId));
    });

    it("ran mutants at all, and none was a no-op", () => {
      expect(run.mutantCount).toBeGreaterThan(0);
      expect(run.noOps).toEqual([]);
    });

    it("scores at or above the surface's floor", () => {
      expect(result.score.value).toBeGreaterThanOrEqual(surface.scoreFloor);
    });

    it("leaves every tracked mutant target byte-identical", () => {
      for (const [file, bytes] of before) {
        expect(readFileSync(file).equals(bytes), `${file} was written during the run`).toBe(true);
      }
    });

    it("kills THIS surface's own control mutant, proving the overlay is live", () => {
      // Without this, a harness whose overlay silently failed to apply reports a
      // PERFECT score — every mutant having run against clean source — with
      // every other assertion here still passing.
      expect(
        runBrowserControl(root, surface),
        "no declared suite noticed this surface's control mutant",
      ).toBe("KILLED");
      // Explicit budget: this case SPAWNS REAL CHILD SUITE RUNS, and the shared
      // 30s default is a per-test budget meant for in-process work. The other
      // cases read a run performed at module scope, where no timeout applies.
    }, 900_000);
  },
);
