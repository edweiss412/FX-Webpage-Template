/**
 * lib/format/phone.ts — Phone-number formatting helpers.
 *
 * `digitsOnly` is the canonical helper for stripping non-digit characters
 * before constructing a `tel:` href. The visible label on a tile or row
 * may carry parentheses, dashes, dots, or country prefixes; the dialer
 * opens cleanly only when given pure digits.
 *
 * Single source of truth — CrewTile and ContactsTile both consume it
 * (Task 4.12 review code-quality Minor 7 dedup; previously duplicated
 * in two tiles).
 */

/** Strip non-digit characters for the tel: href. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}
