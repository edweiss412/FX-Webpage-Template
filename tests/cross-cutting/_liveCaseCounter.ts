/**
 * tests/cross-cutting/_liveCaseCounter.ts
 *
 * Counts live-DB cases that actually EXECUTED, so a CI run which asserted
 * nothing can be refused.
 *
 * Extracted from the suite so the wrapper's own behaviour is testable. Inline,
 * it could only be pinned by a source scan — and an adversarial round showed
 * that deleting the `fn()` call from the wrapper left every guard GREEN: each
 * case incremented the counter while executing zero queries and zero
 * assertions. A counter that counts cases it never ran is a more convincing
 * vacuum than the one it replaced.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §5.3.
 */

/** Vitest's `test` / `test.skip`, narrowed to what this needs. */
export type CaseRegistrar = (name: string, fn: () => Promise<void>) => unknown;

export type LiveCaseCounter = {
  /**
   * Registers a case that counts itself once its body has COMPLETED. A case
   * issuing more than one query DECLARES its floor via `opts.queries`
   * (default 1) — the per-case check holds it to that floor, and the
   * aggregate backstop sums the floors so multi-query cases donate no slack.
   */
  liveCase: (name: string, fn: () => void | Promise<void>, opts?: { queries?: number }) => void;
  /** How many bodies have run to completion. */
  count: () => number;
  /** Sum of every registered case's declared query floor (default 1 each). */
  expectedQueries: () => number;
};

/**
 * @param register vitest's `test` / `test.skip`.
 * @param observe  a monotonically increasing count of live queries issued.
 *                 When supplied, each case must issue at least one, ATTRIBUTED
 *                 to that case — an aggregate total does not attribute, so six
 *                 queries in one case with five empty ones satisfied it.
 */
export function makeLiveCaseCounter(
  register: CaseRegistrar,
  observe?: () => number,
): LiveCaseCounter {
  let count = 0;
  let expected = 0;
  return {
    liveCase: (name, fn, opts) => {
      const declared = opts?.queries ?? 1;
      expected += declared;
      register(name, async () => {
        const before = observe?.() ?? 0;
        // AWAITED, and counted only AFTER the body settles. Incrementing first
        // would count a case whose assertions had not run yet — and the
        // original wrapper took `() => void`, discarding the promise of the
        // one async case entirely, so vitest never waited for it.
        await fn();
        if (observe) {
          const issued = observe() - before;
          if (issued === 0) {
            throw new Error(
              `live case "${name}" issued NO database query — it is not a live case. ` +
                "Either query the database or register it with plain `test`.",
            );
          }
          if (issued < declared) {
            throw new Error(
              `live case "${name}" issued ${issued} database ${issued === 1 ? "query" : "queries"} ` +
                `but declares ${declared} — some of its legs silently did not run.`,
            );
          }
        }
        count += 1;
      });
    },
    count: () => count,
    expectedQueries: () => expected,
  };
}
