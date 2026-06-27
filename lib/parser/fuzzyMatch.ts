/**
 * Small fuzzy-match utilities for typo-tolerant CLOSED-vocabulary matching.
 * Damerau-Levenshtein (optimal string alignment) so a single adjacent
 * transposition — "Laod"→"Load", "Stirke"→"Strike" — is distance 1 (it is 2 in
 * plain Levenshtein), since transpositions are common typos. The internal plain
 * `levenshtein` in lib/parser/invariants.ts (crew-rename pairing) is intentionally
 * left untouched. Wired to stage words only in this PR; reusable for future
 * closed-vocab consumers (see the design's deferred list).
 */

/** Damerau-Levenshtein (optimal string alignment) edit distance. O(m·n). */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1, // deletion
        d[i]![j - 1]! + 1, // insertion
        d[i - 1]![j - 1]! + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1); // adjacent transposition
      }
    }
  }
  return d[m]![n]!;
}

/**
 * Match `token` against a closed `vocab`. Exact hit → { match, exact:true }.
 * Else the nearest member within `maxDistance` → { match, exact:false }. No match
 * within the radius → null. Ties broken by smallest distance, then vocab order.
 */
export function closedVocabMatch(
  token: string,
  vocab: readonly string[],
  maxDistance: number,
): { match: string; exact: boolean } | null {
  for (const v of vocab) {
    if (v === token) return { match: v, exact: true };
  }
  let best: string | null = null;
  let bestDist = maxDistance + 1;
  for (const v of vocab) {
    const dist = damerauLevenshtein(token, v);
    if (dist <= maxDistance && dist < bestDist) {
      best = v;
      bestDist = dist;
    }
  }
  return best ? { match: best, exact: false } : null;
}
