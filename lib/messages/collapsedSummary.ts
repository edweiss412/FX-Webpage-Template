/**
 * collapsedSummary.ts
 *
 * Pure, server-safe helpers for rendering the AlertBanner collapsed one-line summary.
 * No imports required.
 */

/**
 * Returns the first complete sentence of `s` — everything up to and including
 * the first `.`, `!`, or `?` that is followed by whitespace or end-of-string.
 * Decimals/version numbers (e.g. "1.5") are NOT split because the `.` is
 * followed by a digit, not whitespace.
 * If no such boundary exists, returns `s` unchanged.
 */
export function firstSentence(s: string): string {
  const m = s.match(/^(.*?[.!?])(?=\s|$)/);
  return m ? (m[1] ?? s) : s;
}

/**
 * Removes Markdown emphasis delimiters while keeping the wrapped text.
 * - `**bold**` → `bold`
 * - `*em*` → `em`
 * - `_em_` → `em` ONLY when the `_` pair is at word boundaries
 *   (start/whitespace/`(`/quote before opening; whitespace/`)`/quote/
 *    sentence-punct/end after closing). Internal underscores in tokens
 *   like `(SW-POST_SHOW)` are left intact.
 *
 * Application order: bold → *em* → _em_
 */
export function stripEmphasis(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(^|[\s("'])_(\S(?:.*?\S)?)_(?=[\s)"'.,!?;:]|$)/g, "$1$2");
}
