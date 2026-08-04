/**
 * The verdict oracle (spec §3.4).
 *
 * Deliberately trivial, and deliberately explicit about the one judgement it
 * makes: ANY non-zero exit is `KILLED`, including a mutant that fails to
 * compile. The typechecker is part of the suite's gate, so a compile failure
 * is detection — recorded as documented limit L-3 so it is not re-derived as a
 * finding later.
 */
export type Verdict = "KILLED" | "SURVIVED";

export const classify = (exitCode: number): Verdict => (exitCode === 0 ? "SURVIVED" : "KILLED");

/**
 * Raised when the surface's suite is red BEFORE any mutation is applied.
 *
 * This is fatal to the run rather than a per-mutant outcome: against an
 * already-red suite every mutant scores `KILLED` and the harness reports a
 * perfect score while measuring the broken suite instead of the mutants.
 */
export class BaselineNotGreenError extends Error {
  constructor(readonly suite: string) {
    super(
      `mutation baseline is not green: ${suite} fails on UNMUTATED source. ` +
        `Every mutant would score KILLED and the run would report a meaningless perfect score. ` +
        `Fix the suite before enrolling or re-running this surface.`,
    );
    this.name = "BaselineNotGreenError";
  }
}

/** Abort the run unless the unmutated source passes its own suite. */
export function assertCleanBaseline(exitCode: number, suite: string): void {
  if (exitCode !== 0) throw new BaselineNotGreenError(suite);
}
