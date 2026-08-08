/**
 * lib/planFences/baselineGuard.ts — the shrink-only decision, as a pure function.
 *
 * Extracted from the generator script so it can be TESTED. It had the right
 * behavior and no regression test, which meant deleting the check left every
 * suite green — the reviewer's point in R3 finding 2, and a fair one: a rule
 * nothing exercises is a rule that will be removed by someone who cannot see it
 * working.
 */

export type CeilingDecision =
  | { ok: true; priorRows: number; priorTotal: number }
  | { ok: false; reason: string };

const ROWS_RE = /export const FROZEN_ROWS = (\d+)\s*;/;
const TOTAL_RE = /export const FROZEN_TOTAL = (\d+)\s*;/;

/**
 * Decide whether a regeneration may proceed.
 *
 * FAILS CLOSED on an unparseable committed file. Reading one as "no ceiling"
 * made the refusal bypassable by reformatting the two constants — a type
 * annotation or a numeric separator was enough (R2 finding 2). An unreadable
 * ceiling is not an absent one.
 *
 * An ABSENT file is different and is allowed: that is the first generation, or a
 * deliberate deletion, which is the documented way to raise the ceiling on
 * purpose and is visible in the diff.
 */
export function decideRegeneration(
  priorSrc: string,
  nextRows: number,
  nextTotal: number,
): CeilingDecision {
  if (priorSrc === "") return { ok: true, priorRows: Infinity, priorTotal: Infinity };

  const rows = ROWS_RE.exec(priorSrc)?.[1];
  const total = TOTAL_RE.exec(priorSrc)?.[1];
  if (rows === undefined || total === undefined) {
    return {
      ok: false,
      reason:
        "the committed baseline exists but its FROZEN_ROWS / FROZEN_TOTAL could not be parsed. " +
        "Refusing to regenerate: an unreadable ceiling is not an absent one.",
    };
  }

  const priorRows = Number(rows);
  const priorTotal = Number(total);
  if (nextRows > priorRows || nextTotal > priorTotal) {
    return {
      ok: false,
      reason:
        `refusing to raise the baseline: rows ${priorRows} -> ${nextRows}, ` +
        `total ${priorTotal} -> ${nextTotal}. The baseline is shrink-only; new violations are ` +
        "fixed or waived, not frozen. If a raise is genuinely intended, delete the committed " +
        "baseline first, which makes it a visible act rather than a rerun.",
    };
  }
  return { ok: true, priorRows, priorTotal };
}
