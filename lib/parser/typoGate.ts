import { closedVocabMatch, damerauLevenshtein } from "@/lib/parser/fuzzyMatch";

export type GateOpts = {
  maxDistance?: number; // default 1
  minLen?: number; // reject tokens shorter than this
  tieAbort?: boolean; // ≥2 candidates at min distance → null
  exclude?: readonly string[]; // cross-vocab exclusion (raw token exactly in here → null)
};

/**
 * Confidence-gated closed-vocab correction. Exact-first; else nearest within
 * maxDistance subject to the gate. Returns {match, corrected:false} on exact,
 * {match, corrected:true} on a gated near-miss, null otherwise. See spec §2 of
 * docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md.
 */
export function gatedVocabCorrect(
  token: string,
  vocab: readonly string[],
  opts: GateOpts,
): { match: string; corrected: boolean } | null {
  const maxDistance = opts.maxDistance ?? 1;
  // Exact-first: an exact member is never a "correction".
  for (const v of vocab) {
    if (v === token) return { match: v, corrected: false };
  }
  // Cross-vocab exclusion: a token that is an exact member of a DIFFERENT vocab
  // is never fuzzed (the #155 role-exclusion generalized).
  if (opts.exclude && opts.exclude.includes(token)) return null;
  // minLen: short tokens are too collision-prone to fuzz.
  if (opts.minLen !== undefined && token.length < opts.minLen) return null;
  const m = closedVocabMatch(token, vocab, maxDistance);
  if (!m) return null;
  if (m.exact) return { match: m.match, corrected: false };
  // tie-abort: count candidates at the winning distance.
  if (opts.tieAbort) {
    const bestDist = damerauLevenshtein(token, m.match);
    const tied = vocab.filter((v) => damerauLevenshtein(token, v) === bestDist).length;
    if (tied > 1) return null;
  }
  return { match: m.match, corrected: true };
}
