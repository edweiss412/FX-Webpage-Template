import { describe, expect, it } from "vitest";
import { MUTANT_TIMEOUT_MS } from "../source/spawnBounded";
import * as runner from "./runner";

/**
 * The pooled measured healthy MAXIMUM across 82 browser-gate children over two
 * full GREEN `pnpm heavy pnpm mutation:browser` runs.
 *
 * Source: `docs/superpowers/specs/ci/probes/2026-08-20-browser-child-wallclock-probe.md` §2.
 * The maximum, not the median (24451 ms): the max is already 2.66x its own
 * median, and it REPRODUCES — 65111 ms in one run, 62723 ms in the other, within
 * 4% — which is what makes it a property of the workload rather than a stall.
 */
const MEASURED_HEALTHY_MAX_MS = 65_111;

/** The derivation the constant's comment claims (spec §5.1). */
const DERIVATION_MULTIPLE = 10;

describe("BROWSER_MUTANT_TIMEOUT_MS", () => {
  // The MODULE is imported, never a symbol that does not exist yet: an
  // unresolved import fails before any assertion runs, which exits non-zero
  // while proving nothing about the production defect. The assertion is what
  // must fail, and it fails on the missing export.
  it("is exported by the browser runner", () => {
    expect(Object.keys(runner)).toContain("BROWSER_MUTANT_TIMEOUT_MS");
  });

  it("is 660_000 ms", () => {
    expect(runner.BROWSER_MUTANT_TIMEOUT_MS).toBe(660_000);
  });

  // The DERIVATION, not the value: lowering the number without a re-measurement
  // reds here even if the literal above were updated to match.
  it("is at least 10x the pooled measured healthy maximum", () => {
    expect(runner.BROWSER_MUTANT_TIMEOUT_MS).toBeGreaterThanOrEqual(
      DERIVATION_MULTIPLE * MEASURED_HEALTHY_MAX_MS,
    );
  });

  // An import-and-reuse regression is the specific thing this rejects: 180 s is
  // only 2.76x THIS surface's measured max, so one contention regime widening
  // the tail threefold puts HEALTHY children past it.
  it("is not the source harness's ceiling", () => {
    expect(runner.BROWSER_MUTANT_TIMEOUT_MS).not.toBe(MUTANT_TIMEOUT_MS);
  });
});
