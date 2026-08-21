/**
 * ONE SHARED MODULE for every SYNTHETIC literal the claim-sweep fixtures use
 * (spec §2.0).
 *
 * This arm scans DOCUMENTS, and its own spec, plan and probe record ARE
 * documents in the corpus §2 measures — so a synthetic transition sentence
 * written into a fixture is a sentence a census over the corpus could count.
 * The no-collision cover (Task 9) is keyed on THIS DATA rather than on a nonce
 * token grepped across fixture titles: a nonce is a CONVENTION, so the check
 * would be blind to any literal written without it, which is the same
 * convention-keyed blindness that made a prefix-keyed ledger extractor miss 21
 * custom-id rows. Keying on the exported arrays below means a literal that
 * forgets the convention is still in the population.
 *
 * Every literal added here joins that cover automatically. A literal written
 * inline in a suite does not, which is why none are.
 */

/** The superseded/replacement pair the synthetic cases declare. */
export const SYNTHETIC_PAIR = { superseded: "8811", replacement: "8812" } as const;

/**
 * A pair that occurs NOWHERE in the incident blobs, for the
 * declared-value-appears-nowhere case. Its paired positive uses the same
 * declaration over a corpus where it DOES appear — one variable, the corpus.
 */
export const ABSENT_PAIR = { superseded: "7733", replacement: "7734" } as const;

/**
 * A transition sentence: it names BOTH values, so the co-occurrence rule
 * excludes it. This is the corpus's dominant shape (923 plain arrow sentences
 * over the declared population), which is why an arm that does not account for
 * it is switched off on first contact.
 */
export const TRANSITION_SENTENCE =
  "The tallied budget moves from 8811 slots to 8812 slots once the second lane lands.";

/**
 * The SAME sentence with the replacement deleted — one variable apart, so a
 * clean verdict on the sentence above is attributable to the co-occurrence rule
 * rather than to an implementation that failed to look.
 */
export const TRANSITION_SENTENCE_REPLACEMENT_DELETED =
  "The tallied budget moves from 8811 slots once the second lane lands.";

/** A stale claim: it names only the superseded value, so it reports. */
export const STALE_SENTENCE = "Every row of the 8811-slot ledger carries a lane identifier.";

/**
 * A line carrying a transition sentence AND a separate stale sentence. LINE
 * scope excludes the whole line and misses the stale claim; SENTENCE scope
 * reports exactly the stale one. The incident blob carries this shape live at
 * spec line 220, and this synthetic pins the same rule without depending on it.
 */
export const MIXED_LINE = `${TRANSITION_SENTENCE} ${STALE_SENTENCE}`;

/**
 * A stale claim carrying the INCIDENT's superseded value (58), for the
 * undeclared-sibling pair in the document-set suite. It has to carry the value
 * the incident declaration names, or the sibling contributes nothing whether it
 * is declared or not and the pair discriminates nothing.
 */
export const SIBLING_STALE_SENTENCE =
  "The retired 58-row manifest is still cited by the loader shim.";

/**
 * A line carrying the superseded value TWICE in ONE sentence that lacks the
 * replacement, so it reports twice at two distinct columns. A line-keyed
 * identity emits one and the loss is silent, arriving as what looks like a
 * legitimate dedup.
 */
export const DOUBLE_OCCURRENCE_LINE =
  "The 8811-row census and the 8811-entry manifest disagree about the same lane.";

/**
 * The SAME two occurrences with the second moved into a sentence that carries
 * the replacement, so exactly one reports. One variable apart from the line
 * above, which is what makes the single finding attributable to the SENTENCE
 * rule rather than to a dedup that happens to leave one behind.
 */
export const DOUBLE_OCCURRENCE_SPLIT_LINE =
  "The 8811-row census disagrees about the same lane. The manifest moved from 8811 to 8812.";

/** A sentence carrying the ABSENT pair's superseded value, for that pin's paired positive. */
export const ABSENT_PAIR_STALE_SENTENCE =
  "The retired 7733-entry manifest is still cited by the loader shim.";

/**
 * A declared identifier that occurs nowhere in the incident blobs, for the
 * not-found case's synthetic half. The incident's own truncated identifier is
 * the LIVE case; this one exists so a suite can assert the code without
 * depending on a blob.
 */
export const ABSENT_IDENTIFIER = "components/never/NoSuchFile.tsx:4242";

/**
 * Every synthetic literal this arc's fixtures introduce, as ONE array the
 * no-collision cover reads. Order is irrelevant; membership is the contract.
 */
export const SYNTHETIC_LITERALS: readonly string[] = [
  TRANSITION_SENTENCE,
  TRANSITION_SENTENCE_REPLACEMENT_DELETED,
  STALE_SENTENCE,
  MIXED_LINE,
  ABSENT_PAIR_STALE_SENTENCE,
  SIBLING_STALE_SENTENCE,
  DOUBLE_OCCURRENCE_LINE,
  DOUBLE_OCCURRENCE_SPLIT_LINE,
  ABSENT_IDENTIFIER,
];
