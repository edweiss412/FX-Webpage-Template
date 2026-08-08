/**
 * lib/specLint/emDash.ts — THE em-dash character class, one definition.
 *
 * Extracted from copyRules.ts so `lib/planFences` can reuse it rather than
 * re-declare it (arc B spec §2.1, R3 F3). Two copies of a character class drift
 * the moment the policy gains a spelling, and the drift is silent: the copy that
 * missed the new form simply stops firing.
 */

/**
 * Raw U+2014 plus every non-raw spelling (spec-lint spec §6): `&mdash;`, decimal
 * NCR, hex NCR (case-insensitive x), `—`, `\u{2014}`.
 *
 * Global flag: callers MUST reset `lastIndex` before an `exec` loop, or use
 * `emDashMatches` below, which owns that hazard.
 */
export const EM_DASH_CLASS = /—|&mdash;|&#8212;|&#[xX]2014;|\\u2014|\\u\{2014\}/g;

/** Every em-dash occurrence in `text`, as `{ index, token }`. Reset-safe. */
export function emDashMatches(text: string): { index: number; token: string }[] {
  const out: { index: number; token: string }[] = [];
  EM_DASH_CLASS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EM_DASH_CLASS.exec(text)) !== null) out.push({ index: m.index, token: m[0] });
  return out;
}
