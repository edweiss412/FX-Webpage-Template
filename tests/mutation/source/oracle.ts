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

/**
 * Abort the run unless the unmutated source passes its own suite.
 *
 * `surfaceId` is REQUIRED and leads the message. The annotation this produces is
 * read off a shard leg holding several surfaces, and the leg number is not a
 * stable name for any of them -- the partition is recomputed from the registry
 * on every runner -- so a message naming only the suites costs the triager a
 * partition derivation before triage can start. The browser runner already
 * composes the surface into its own construction of this error; this is the
 * source side catching up, not a new idea.
 */
export function assertCleanBaseline(exitCode: number, suite: string, surfaceId: string): void {
  if (exitCode !== 0) throw new BaselineNotGreenError(`${surfaceId}: ${suite}`);
}
