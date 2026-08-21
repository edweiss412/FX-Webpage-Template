import type { PinDisposition } from "../../lib/specLint/declaredLimitPins";

/**
 * Titles that MATCH the pin grammar but are NOT live declared-limit pins, because they
 * narrate a limit that CLOSED (spec §5, §2.4).
 *
 * ── PER-INSTANCE, NOT A RECOGNIZER, DELIBERATELY ───────────────────────────────
 * The honest alternative is deciding from the text whether a title narrates a closed
 * limit or declares a live one, which is tense and polarity over English — a predicate
 * that would be attacked every round and widened one corner at a time. Two rows with
 * reasons hold the same fact without parsing anything, and the derived cover in
 * `_metaDeclaredLimitPins.test.ts` is what keeps them honest.
 *
 * ── KEYED AT THE SAME GRANULARITY AS THE THING IT DISPOSES OF ──────────────────
 * A pin's identity is `(path, title)`, so a row is `(path, title)` too. A row keyed on
 * the PATH alone would absorb every future pin in that file: the suite would be
 * pre-dispositioned, and a genuinely new declared-limit pin added there tomorrow would
 * be silently exempt. That is invisible in every positive test, because the absorbed
 * thing does not exist yet.
 *
 * ── THE SAFE DIRECTION ─────────────────────────────────────────────────────────
 * A new phrase-bearing title needs no row: it simply becomes a pin. A new CLOSURE
 * narration draws an advisory until someone dispositions it — surfaced and
 * conservative, never silent.
 *
 * Two rows today, both from §2.4.
 */
export const NOT_A_PIN: readonly PinDisposition[] = [
  {
    path: "tests/cross-cutting/psqlStartupFileSuppression.test.ts",
    title: "a QUOTED Windows path is now read - the R40-era known miss closes",
    reason:
      "Not a pin but a pin's RETIREMENT: the test asserts toHaveLength(1), not a zero. " +
      "It was shipped by the very incident this arm re-enacts (fix/shell-binding-mixed-quoted-value " +
      "Step 3b), which retired the R40-era known miss. A plan editing this surface owes nothing " +
      "about a limit that already closed.",
  },
  {
    path: "tests/help/_metaUiLabelCrosswalk.test.ts",
    title: "CLOSED (was DOCUMENTED LIMIT): a type annotation no longer reaches the haystack",
    reason:
      "Its own title says CLOSED. Recognizing that from the text would mean deciding tense and " +
      "polarity over English — a predicate attacked every round and widened one corner at a time — " +
      "so the fact is held per instance instead, with the derived cover keeping it honest.",
  },
];
