/**
 * lib/crew/normalizeMeridiem.ts — one small copy-quality normalizer for the
 * meridiem (AM/PM) in free-text clock strings coming off Doug's sheets (D3).
 *
 * The sheets are hand-typed, so a single strip/card can stack "9:00PM" (no
 * space, upper), "7:30am" (no space, lower), and "8:00 AM" (spaced, upper) in
 * one column — it reads as un-curated passthrough. This helper is applied
 * uniformly to the Set / Show / Strike anchors (resolveKeyTimes) and to the
 * schedule setup / window / showStart / showEnd meta (ScheduleSection) so every
 * rendered clock uses the same "H:MM AM/PM" shape.
 *
 * It ONLY touches the meridiem token: a single ASCII space before it and an
 * upper-cased "AM"/"PM". It never reorders, reformats the clock digits, or
 * touches separators — the window en-dash ("7:30 AM–9:00 PM") is preserved, and
 * anything without a digit-anchored meridiem (e.g. a bare "TBD", already handled
 * upstream) is returned unchanged. Idempotent.
 *
 * The `(\d)` anchor is load-bearing: it prevents a false match on ordinary
 * words that merely contain "am"/"pm" with no preceding digit (e.g. "spam",
 * "Ampitheater") — only a meridiem immediately following a digit (optional
 * whitespace) is rewritten. A real digit-led time IS rewritten by design, so
 * "9am" -> "9 AM" (and, yes, "9am team" -> "9 AM team"): the anchor is the
 * digit, not a word boundary.
 */
const MERIDIEM_RE = /(\d)\s*([ap])\.?\s*m\.?/gi;

export function normalizeMeridiem(value: string): string {
  return value.replace(
    MERIDIEM_RE,
    (_match, digit: string, ap: string) => `${digit} ${ap.toUpperCase()}M`,
  );
}
