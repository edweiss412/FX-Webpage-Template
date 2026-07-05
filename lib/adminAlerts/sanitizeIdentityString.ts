// Codex P6: zero-width + bidi format chars are REMOVED (invisible -- must not
// become spaces); C0/C1 controls incl. newline/tab become a SPACE; then
// collapse. The exact code point ranges match spec section 3.1 step 1:
//   FORMAT:  U+200B-200D (zero-width space/ZWNJ/ZWJ), U+FEFF (BOM),
//            U+202A-202E (bidi embed/override), U+2066-2069 (bidi isolate)
//   CONTROL: U+0000-001F (C0, incl. \n \t), U+007F-009F (C1)
//
// Built from numeric code points (rather than inline \u literals) so the
// regex source never embeds actual invisible/control characters in this
// file -- those two forms compile to an identical character class.
function codePointRangeToClassFragment(start: number, end: number): string {
  return `${String.fromCodePoint(start)}-${String.fromCodePoint(end)}`;
}

const FORMAT_RANGES: Array<[number, number]> = [
  [0x200b, 0x200d],
  [0xfeff, 0xfeff],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const CONTROL_RANGES: Array<[number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
];

const FORMAT = new RegExp(
  `[${FORMAT_RANGES.map(([a, b]) => codePointRangeToClassFragment(a, b)).join("")}]`,
  "g",
);
const CONTROL = new RegExp(
  `[${CONTROL_RANGES.map(([a, b]) => codePointRangeToClassFragment(a, b)).join("")}]`,
  "g",
);
const TOKEN = /[A-Za-z0-9+/_-]{24,}/g;
const EMAIL = /\S+@\S+/g;

/**
 * The single chokepoint for every rendered/serialized identity string
 * (spec section 3.1). Step order is load-bearing (Codex F22): redaction
 * MUST run on the full, un-capped string before the length cap, so a
 * token/email straddling the 120-char boundary is matched and replaced
 * whole rather than being truncated to a sub-threshold prefix that escapes
 * the redactor.
 *
 *   1. Strip Unicode control/format/bidi chars, collapse whitespace.
 *   2. Redact token-like substrings (always) and email-like substrings
 *      (only when `!includePii`).
 *   3. Length-cap to 120 chars (+ "...").
 */
export function sanitizeIdentityString(raw: unknown, opts: { includePii: boolean }): string {
  let s = String(raw ?? "")
    .replace(FORMAT, "")
    .replace(CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(TOKEN, "[redacted-token]");
  if (!opts.includePii) s = s.replace(EMAIL, "[redacted-email]");
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}
