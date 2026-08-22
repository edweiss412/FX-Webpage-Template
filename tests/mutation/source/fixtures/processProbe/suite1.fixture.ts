import { describe, expect, it } from "vitest";

import { always } from "./source";

/**
 * Deciding suite ONE. Green throughout, and it never reads `gate`.
 *
 * A child entry that runs `suitePaths[0]` only passes every single-suite control
 * and silently mis-scores every multi-suite surface; this suite exists to be the
 * one such an implementation runs, so the control reports STABLE under it while
 * the shipped composition reports the flip.
 */
describe("processProbe control suite 1", () => {
  it("pins the deterministic boundary, decided by suite bytes alone", () => {
    expect(always(99)).toBe(true);
    expect(always(100)).toBe(false);
  });
});
