/**
 * Shared dims-token regex FRAGMENTS + composed matchers.
 *
 * Single source of truth so the SEVEN dims-token sites in rooms.ts cannot drift
 * (spec §C companion-surface invariant 1). The sites have DIFFERENT shapes by
 * necessity — Class A/B need a partial START matcher (locate/attest where dims
 * begin), Class C needs a FULL 2-or-3-operand capture — so they compose these
 * exported sub-fragments rather than sharing one whole-token regex.
 *
 * Accepted forms: unit `'`|`′`|`ft`/`FT`; separator `x`|`X`|`×`. A fully unit-less
 * token is admitted ONLY with both operands 2–3 digits (10–999) and bounded so it
 * cannot glue to adjacent alphanumerics. A unit-bearing operand needs no digit-count
 * gate — the unit disambiguates.
 */

// The separator: ASCII `x`/`X` (via the `i` flag) plus U+00D7 `×`.
export const DIMS_SEP = "[x×]";

// A unit-bearing operand — unit REQUIRED, so digit count is UNGATED (`8' x 10'`,
// `2026' x 40'` are real dims).
export const DIMS_OPERAND_UNIT = "\\d+\\s*(?:['′]|ft\\b)";

// A unit-less operand — gated to 2–3 digits with a negative-lookahead forbidding a
// 4th digit (so `2026`/`1200` cannot be truncated to a bare `120`/`202`, and `5 x 8`
// single-digit is not admitted). NO trailing `\b` (the ASCII separator `x`/`X` is a
// word char, so `\b` would break the no-space `120x80`).
export const DIMS_OPERAND_BARE = "\\d{2,3}(?!\\d)";

// Either kind of operand.
export const DIMS_OPERAND = "(?:" + DIMS_OPERAND_UNIT + "|" + DIMS_OPERAND_BARE + ")";

// Partial — "a dims token begins here". Unit-bearing branch needs only operand-unit +
// separator; fully-bare branch requires the WHOLE `\b NN x NN \b` token.
export const DIMS_START_SRC =
  "(?:\\d+\\s*(?:['′]|ft\\b)\\s*[x×]|\\b\\d{2,3}\\s*[x×]\\s*\\d{2,3}\\b)";

// Full 2-or-3-operand capture. Three guards: leading `\b` (rejects left-glue), per-operand
// `(?!\d)` (rejects ≥4-digit bare operands), trailing `(?![0-9A-Za-z])` on the whole token
// (rejects a letter/digit glued to the last operand).
export const DIMS_FULL_SRC =
  "(\\b" +
  DIMS_OPERAND +
  "\\s*[x×]\\s*" +
  DIMS_OPERAND +
  "(?:\\s*[x×]\\s*" +
  DIMS_OPERAND +
  ")?)(?![0-9A-Za-z])";

export function dimsStartRe(anchored: boolean): RegExp {
  return new RegExp((anchored ? "^\\s*" : "") + DIMS_START_SRC, "i");
}

export function dimsFullRe(): RegExp {
  return new RegExp(DIMS_FULL_SRC, "i");
}
