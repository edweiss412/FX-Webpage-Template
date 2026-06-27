import { damerauLevenshtein } from "@/lib/parser/fuzzyMatch";

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ".split("");

/** Every single-edit neighbor (deletion, insertion, substitution, adjacent transposition), deduped, excluding the original. */
export function singleEditNeighbors(word: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < word.length; i++) out.add(word.slice(0, i) + word.slice(i + 1)); // deletion
  for (let i = 0; i <= word.length; i++)
    for (const c of ALPHA) out.add(word.slice(0, i) + c + word.slice(i)); // insertion
  for (let i = 0; i < word.length; i++)
    for (const c of ALPHA) if (c !== word[i]) out.add(word.slice(0, i) + c + word.slice(i + 1)); // substitution
  for (let i = 0; i + 1 < word.length; i++)
    out.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)); // adjacent transposition
  out.delete(word);
  return [...out];
}

/**
 * Neighbors that the gate SHOULD correct back to `member`: drop any neighbor that
 * (a) exactly equals another vocab member, (b) ties at the min distance with a
 * second member, or (c) is shorter than minLen. See spec §7.1 carveout.
 */
export function unambiguousTypos(
  member: string,
  vocab: readonly string[],
  opts: { minLen?: number },
): string[] {
  const minLen = opts.minLen ?? 0;
  return singleEditNeighbors(member).filter((n) => {
    if (n.length < minLen) return false;
    if (vocab.includes(n)) return false; // exact other member
    const dists = vocab.map((v) => damerauLevenshtein(n, v));
    const best = Math.min(...dists);
    const winners = dists.filter((d) => d === best).length;
    if (winners > 1) return false; // tie
    return vocab[dists.indexOf(best)] === member; // must resolve to `member`
  });
}
