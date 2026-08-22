import { describe, expect, it } from "vitest";

import { gate } from "./source";
import { boundaryCheckActive, observeRun } from "./state";

/**
 * Deciding suite TWO — the manufactured correlated mechanism.
 *
 * The run index is taken at MODULE SCOPE, once per child, so one child is one
 * observation. Whether the boundary is checked depends on that index, so a
 * shared scope flips the verdict at `FLIP_AT_RUN` while a fresh scope never
 * reaches it. The unmutated source satisfies both branches, so the baseline is
 * green either way.
 */
const { index } = observeRun();

describe("processProbe control suite 2", () => {
  it(`decides by run index ${index}`, () => {
    if (!boundaryCheckActive(index)) {
      // Inert branch: true for the original AND for the mutant, so nothing here
      // can decide a verdict. The rule that decided this observation is the
      // index being below the flip.
      expect(gate(0)).toBe(true);
      return;
    }
    // Active branch: the boundary the mutant moves.
    expect(gate(3)).toBe(false);
  });
});
