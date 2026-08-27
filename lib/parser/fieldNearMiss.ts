/**
 * lib/parser/fieldNearMiss.ts — the content-keyed field near-miss detector.
 *
 * Spec: docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md.
 * §3.1 is the normative rule and is transcribed here; the executable single source it
 * was calibrated against is the followup probe's `firingsV3` computation
 * (docs/superpowers/specs/parser/probes/2026-08-15-near-miss-followup-probe.ts), and
 * the committed corpus baseline is the arbiter of any disagreement.
 *
 * WHAT THIS REPLACES. `UNKNOWN_FIELD` used to come from `parseVenue`'s POSITIONAL scope
 * window, which swept ~380 junk rows out of neighbouring blocks and whose emission set
 * changed when blocks moved. The 394-emission audit found the signal that was actually
 * being delivered: rows whose LABEL nearly matches a field the parser knows. Position
 * was never the key, so this pass is keyed on content alone and is swap-invariant by
 * construction — nothing it reads depends on where a block sits in the document.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not report rows with no vocabulary
 * counterpart (that is the rejected coverage-audit product, §1.1.1), it does not
 * rewrite anything (it suggests; the operator renames), and it does not fuzz letter
 * typos (§1.1.4 — zero corpus instances; an extension needs a live one).
 */
import { FIELD_ALIASES, resolveAlias } from "./aliases";
import { clean, decodeEntities } from "./blocks/_helpers";
import { scanRowsWithOpener } from "./blocks/_rowScan";
import { matchesSectionHeader } from "./blocks/_sectionHeaderMatch";
import { isVenueBlockOpener } from "./blocks/venue";
import { isKnownSectionHeader } from "./knownSections";
import { LABEL_TO_KIND_KEYS, canonicalSectionKind } from "./sectionKind";
import { EVENT_SECTION_HEADER_TOKENS, SECTION_HEADER_TOKEN_SETS } from "./sectionHeaderTokens";
import { consumptionKey, emitUnknownField, type ParseAggregator } from "./warnings";

/** §3.1: decode HTML entities, casefold, collapse non-alphanumeric runs to one space, trim. */
export const normalizeV3 = (raw: string): string =>
  decodeEntities(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * §3.1: the same rule, but with hyphens sitting DIRECTLY between two alphanumerics
 * deleted first, so `E-mail:` reaches the `Client Email` alias as the single token
 * `email`. Free-standing hyphens are untouched — in `9:00PM - LOAD IN` the hyphen reads
 * as a real word boundary, and fusing it would widen the match surface onto agenda rows.
 */
export const fusedForm = (raw: string): string =>
  normalizeV3(decodeEntities(raw).replace(/([A-Za-z0-9])-([A-Za-z0-9])/g, "$1$2"));

const tokens = (s: string): Set<string> => new Set(s.split(" ").filter(Boolean));

export type VocabEntry = { tokens: Set<string>; raw: string };

export type NearMissMatch = {
  /** (a) normalized-string equality, or (b) token subset-or-equal. */
  type: "a" | "b";
  entry: VocabEntry;
  /** Which of the candidate's two forms produced the hit. */
  via: "plain" | "fused";
  /** The candidate form that matched — the guards read THIS, not the plain form. */
  norm: string;
};

/**
 * Re-exported so the detector's public surface is unchanged: the row scan lives in
 * `blocks/_rowScan` because `blocks/venue.ts` reads block openers too and importing this
 * module from a block file would close a cycle through `sectionHeaderTokens`. It is its
 * own module rather than part of `blocks/_helpers` so the opener derivation — the
 * load-bearing half of an occurrence identity — is inside a source-mutation surface.
 */
export { scanRowsWithOpener, type ScannedRow } from "./blocks/_rowScan";

/** §3.1 minimum normalized length. `NAME`/`LED` fall below it. */
export const MIN_LEN = 5;

/**
 * §3.1 distinctiveness ceiling: a match needs at least one candidate token whose
 * vocabulary document-frequency is at most this. The value is the frequency of
 * `address`, the LEAST distinctive token any required true positive carries, so it is
 * corpus-derived rather than chosen. Lowering it drops `Address:`; raising it admits
 * `Details?`. Both variants were measured and rejected (§3.2) — re-proposing either
 * needs a probe showing zero true-positive loss on the corpus.
 */
export const DISTINCTIVENESS_MAX = 4;

/**
 * ALL-CAPS single-token guard, in EXACTLY the calibration executable's form: the RAW
 * label is all-caps (allowing the punctuation sheets use inside such labels) AND its
 * normalized token set has size one. `ADDRESS` is suppressed; `Address` is not.
 */
const ALL_CAPS_RAW = /^[A-Z0-9&/#'.\-]+$/;
const isAllCapsSingle = (rawLabel: string, normTokens: Set<string>): boolean =>
  ALL_CAPS_RAW.test(rawLabel.trim()) && normTokens.size === 1;

/**
 * The vocabulary, derived from three live sources (§2.2) so a later alias addition is
 * covered without touching this file.
 *
 * INSERTION ORDER IS THE §3.1 TIE-BREAK, not a detail: sources are walked in derivation
 * order, the FIRST raw spelling to produce a normalized form owns that entry and later
 * duplicates never overwrite it, and matching iterates in this same order taking the
 * first hit. That is what makes `Address:` report `VENUE ADDRESS` rather than
 * `Venue Address` or `Hotel Address`, deterministically.
 */
export function buildVocabulary(): Map<string, VocabEntry> {
  const raw: string[] = [
    ...Object.values(FIELD_ALIASES).flat(),
    ...SECTION_HEADER_TOKEN_SETS.flat(),
    ...LABEL_TO_KIND_KEYS,
  ];
  const vocab = new Map<string, VocabEntry>();
  for (const r of raw) {
    const n = normalizeV3(r);
    if (n && !vocab.has(n)) vocab.set(n, { tokens: tokens(n), raw: r });
  }
  return vocab;
}

/** How many vocabulary entries each token appears in — the distinctiveness statistic. */
export function tokenDocFrequency(vocab: Map<string, VocabEntry>): Map<string, number> {
  const freq = new Map<string, number>();
  for (const entry of vocab.values()) {
    for (const t of entry.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

/**
 * §3.1 match, with NO guards applied — exported because it is how a suppression test
 * states its premise: a guard witness must first prove its input WOULD match, or the
 * test proves only that some unrelated input matched nothing.
 *
 * Both forms are tried for equality before either is tried for subset, and the
 * vocabulary is walked in insertion order, so the winner is fixed by §3.1's tie-break.
 */
export function matchVocabulary(
  rawLabel: string,
  vocab: Map<string, VocabEntry>,
): NearMissMatch | null {
  const plain = normalizeV3(rawLabel);
  const fused = fusedForm(rawLabel);
  const forms: { norm: string; via: "plain" | "fused" }[] = [{ norm: plain, via: "plain" }];
  if (fused !== plain) forms.push({ norm: fused, via: "fused" });

  for (const { norm, via } of forms) {
    // Map keys ARE the normalized forms, and the first raw spelling owns each key, so
    // this lookup is the insertion-order equality scan.
    const entry = vocab.get(norm);
    if (entry) return { type: "a", entry, via, norm };
  }
  for (const { norm, via } of forms) {
    const candTokens = tokens(norm);
    if (candTokens.size === 0) continue;
    for (const entry of vocab.values()) {
      if (candTokens.size > entry.tokens.size) continue; // subset OR equal
      let subset = true;
      for (const t of candTokens) {
        if (!entry.tokens.has(t)) {
          subset = false;
          break;
        }
      }
      if (subset) return { type: "b", entry, via, norm };
    }
  }
  return null;
}

/**
 * §3.1 guards, applied to EVERY match — type (a) equality and type (b) subset alike.
 * Guarding only type (b) lets `Details?` through as an equality against the `DETAILS`
 * entry and inflates the corpus firing count by one (cross-model r3 probe).
 */
function passesGuards(rawLabel: string, match: NearMissMatch, freq: Map<string, number>): boolean {
  if (match.norm.length < MIN_LEN) return false;
  const candTokens = tokens(match.norm);
  if (isAllCapsSingle(rawLabel, candTokens)) return false;
  return [...candTokens].some((t) => (freq.get(t) ?? Infinity) <= DISTINCTIVENESS_MAX);
}

/**
 * A row is a candidate only if the real parse left its label unresolved: not an alias,
 * not a recognized section header, not a routable section label. `TYPO_ALIASES` members
 * resolve through `resolveAlias`, so a known typo is never reported as a near-miss.
 */
function isCandidateLabel(col0: string): boolean {
  if (col0.trim() === "") return false;
  if (resolveAlias(col0) !== null) return false;
  if (isKnownSectionHeader(col0)) return false;
  if (canonicalSectionKind(col0) !== null) return false;
  return true;
}

/**
 * §2.2's anchor-namespace mapping, used for BOTH `blockRef.kind` and `opts.block`.
 *
 * `kind` is a ROUTING key with three real consumers (anchor resolution, the swap
 * oracle, the persisted `block` column), so the venue and DETAILS-family arms return
 * the namespaces `lib/drive/unknownFieldAnchors.ts` scans under. The venue arm calls
 * `isVenueBlockOpener` (`lib/parser/blocks/venue.ts`) — THE shared definition, the same
 * one the TYPO_NORMALIZED gate calls, so this mapping and that gate cannot drift apart.
 * It covers BOTH corpus venue shapes, including the v4 `VENUE NAME` opener of the
 * current template. Every other block
 * returns its own normalized opener, which resolves no anchor — the documented-safe
 * outcome ("the correct cell or null"), and correct: those blocks never had anchors.
 *
 * The DETAILS family here is event.ts's FIVE header spellings, deliberately WIDER than
 * the anchor scanner's three exact ones. Narrowing it to match would map the corpus's
 * `DETAILS/Room Diagram` and `GS DETAILS (FOR BOTH)` blocks to their own opener labels,
 * and the Stage/Storage rows AC-N9 requires to stay anchored would resolve null. Wider
 * costs nothing: a kind the scanner never emits simply matches no anchor.
 *
 * `"section"` is the fallback when the opener normalizes to nothing — a table opening on
 * a blank first cell, or one whose first `|` line is an alignment row (`| :--- | :--- |`
 * normalizes to empty, since `scanRowsWithOpener` takes the opener before the
 * alignment-row skip). Chosen to match the substitution every `canonicalSectionKind`
 * caller makes for an unrecognized label. No corpus fixture reaches it.
 */
function anchorNamespace(opener: string): string {
  if (isVenueBlockOpener(opener)) return "venue";
  if (matchesSectionHeader(opener, EVENT_SECTION_HEADER_TOKENS)) return "details";
  return normalizeV3(opener) || "section";
}

/**
 * Emit one `UNKNOWN_FIELD` per unresolved row whose label nearly matches a known field.
 *
 * Consumption is read from the ledger the block parsers wrote (§3.3), never re-derived:
 * a static exclusion list misclassifies rows resolved by block-internal maps, and a
 * payload diff cannot see a curated field whose value is empty — which is how a
 * correctly named row came to be reported as a near-miss of itself. The probe key is
 * built with the writers' own `consumptionKey`, so the two sides cannot drift.
 */
export function detectFieldNearMisses(markdown: string, agg: ParseAggregator): void {
  const vocab = buildVocabulary();
  const freq = tokenDocFrequency(vocab);
  // The ledger COUNTS occurrences (`markConsumed` increments), so the reader must DRAW THEM
  // DOWN rather than ask `.has(...)`. A set test silences every row sharing a key on the
  // strength of one resolution, and the key is a trimmed triple — so a document holding the
  // same (opener, label, value) row twice had both occurrences suppressed by one resolution,
  // one ordinary copy/paste edit away from a near-miss going silent (whole-diff r2 F1). The
  // draw-down is over a LOCAL copy: `agg.consumed` is the writers' record of what the block
  // parsers resolved, and a reader that consumed it in place would leave the aggregator
  // saying something different depending on whether the detector had run.
  const remaining = new Map(agg.consumed);
  for (const row of scanRowsWithOpener(markdown)) {
    const col0 = clean(row.cells[0] ?? "");
    if (!isCandidateLabel(col0)) continue;
    const match = matchVocabulary(col0, vocab);
    if (!match || !passesGuards(col0, match, freq)) continue;
    // `clean`ed cell text on both key components, exactly as every `markConsumed` call
    // site builds them — an uncleaned probe would miss a ledgered row and warn on it.
    const value = clean(row.cells[1] ?? "");
    const key = consumptionKey(row.opener, col0, value);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      continue;
    }
    const block = anchorNamespace(row.opener);
    emitUnknownField(agg, { block, kind: block, key: col0, value, candidate: match.entry.raw });
  }
}
