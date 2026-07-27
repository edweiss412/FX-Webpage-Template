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
  /** Registers a case that counts itself once its body has COMPLETED. */
  liveCase: (name: string, fn: () => void | Promise<void>) => void;
  /** How many bodies have run to completion. */
  count: () => number;
};

export function makeLiveCaseCounter(register: CaseRegistrar): LiveCaseCounter {
  let count = 0;
  return {
    liveCase: (name, fn) => {
      register(name, async () => {
        // AWAITED, and counted only AFTER the body settles. Incrementing first
        // would count a case whose assertions had not run yet — and the
        // original wrapper took `() => void`, discarding the promise of the
        // one async case entirely, so vitest never waited for it.
        await fn();
        count += 1;
      });
    },
    count: () => count,
  };
}
