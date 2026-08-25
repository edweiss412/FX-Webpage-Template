/**
 * Placing a review-round timestamp on the clock, and the only comparators that
 * may order one.
 *
 * Lifted here from `scripts/review-economy.ts` at diff R3, unchanged in
 * behaviour. It had to move because it was reachable only from `scripts/`,
 * while `lib/reviewRounds/corpus.ts` needed exactly the same judgement and
 * settled for a bare `Date.parse` instead - which is the defect R3 found. One
 * copy, in the layer both callers can import.
 */

/**
 * The accept-set for a timestamp, keyed on STRUCTURE (spec §3.2).
 *
 *  - An EXPLICIT offset, because a timezone-less string parses host-dependently:
 *    `2026-08-21T23:30:00` against `2026-08-22T00:00:00.000Z` is PRE-boundary
 *    under `TZ=UTC` and POST-boundary under `TZ=America/Chicago`, so the same
 *    accepted row silently flips the answer by environment (diff R3 P1).
 *  - The offset hour and minute BOUNDED to the real range. An unbounded
 *    `[+-]\d{2}:\d{2}` admits `+24:00` and `+00:60`, which `Date.parse` maps to
 *    NaN AFTER the structural test has already said "placeable" - every
 *    comparison then returns false with no note, which is silent invisibility.
 *  - Fractional seconds capped at MILLISECONDS, because ECMAScript compares at
 *    millisecond precision: a `.0001` past a `.000` parses EQUAL, and a
 *    chronologically-later row silently slips inside an exclusion cap.
 */
const PLACEABLE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The instant a timestamp denotes, or `null` when it cannot be placed. `null`
 * is the ONLY not-placeable signal: a NaN returned into a comparison makes
 * every `<=` false, which reads exactly like "compared and cleared".
 *
 * Three conditions, all of which must hold. The finite-parse net at the end is
 * what makes "placeable implies comparable" true BY CONSTRUCTION rather than by
 * enumerating parser quirks - any residual string the parser cannot place falls
 * out here rather than into a comparison.
 */
export function instant(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const m = PLACEABLE.exec(value);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Calendar validity, because `Date.parse` SILENTLY NORMALIZES an impossible
  // date: `2026-02-30T00:00:00.000Z` becomes Mar 2 and then compares as a real
  // instant nobody wrote.
  if (month < 1 || month > 12) return null;
  const days = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  if (day < 1 || day > days) return null;
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The two ordering helpers, and the ONLY way this family compares timestamps
 * (spec §3.1). TWO, not one: `<` and `<=` are both load-bearing - the strict
 * boundary check and the inclusive time cap - and collapsing them behind a
 * single helper would need a MODE parameter, which is a discriminating
 * parameter a mutant can flip, added to save a word.
 *
 * What makes this structural rather than per-site is the TYPE, not the count.
 * Both take `number | null` and `instant` is their only producer, so a
 * later-added site that forgets to parse is a COMPILE error rather than a
 * silent lexical compare - and valid ISO-8601 timestamps with non-Z offsets
 * order differently lexically than chronologically, so a lexical site is wrong
 * only under offsets, which is exactly the failure that ships unnoticed.
 * `tests/reviewRounds/advisoryComparatorTopology.test.ts` pins both halves: no
 * timestamp string is ever an operand of a relational operator here, and no
 * ordering helper accepts anything but parsed values.
 *
 * `null` on either side means NOT COMPARABLE, and the caller gets `false` -
 * never "equal", never "earlier".
 */
export const atOrBefore = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && a <= b;

export const strictlyBefore = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && a < b;
