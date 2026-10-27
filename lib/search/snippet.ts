import type { Range } from "@/lib/search/types";

/**
 * Result-row snippet (spec §6.4): a long value shows a window of up to
 * `SNIPPET_MAX` characters around its first highlight, cut at word boundaries,
 * with "…" on each side that was cut. A snippet never rewrites the line: the
 * window is the value's own text, and the ranges are shifted onto it.
 *
 * Words are runs of non-whitespace, and the window grows one whole word at a
 * time from the word(s) holding the first highlight, smaller side first, until
 * neither neighbour fits. Edges therefore always sit on whitespace, which is why
 * a highlighted token (never whitespace-bearing; see lib/search/normalize.ts) is
 * never split. A multi-word highlight (an alias phrase) running past an edge is
 * clipped at that word boundary; one entirely outside is dropped.
 *
 * The budget counts the value's characters, not the ellipses. Documented limit:
 * when the word holding the first highlight is itself longer than the budget,
 * the window is that word, whole, because cutting into it would break the
 * word-boundary rule and could split the highlight.
 */
export const SNIPPET_MAX = 140;
const ELLIPSIS = "…";

export type Snippet = { text: string; ranges: Range[] };

type Word = { start: number; end: number };

function wordsOf(value: string): Word[] {
  const words: Word[] = [];
  for (const match of value.matchAll(/\S+/g)) {
    words.push({ start: match.index, end: match.index + match[0].length });
  }
  return words;
}

export function snippet(value: string, ranges: readonly Range[], max = SNIPPET_MAX): Snippet {
  const copies = ranges.map((r) => ({ start: r.start, end: r.end }));
  if (value.length <= max) return { text: value, ranges: copies };
  const words = wordsOf(value);
  if (words.length === 0) return { text: value, ranges: copies };

  const sorted = copies.sort((a, b) => a.start - b.start || a.end - b.end);
  const first = sorted[0];
  // The words the first highlight touches, or the first word when there is none.
  let lo = 0;
  let hi = 0;
  if (first) {
    lo = words.findIndex((w) => w.end > first.start);
    if (lo === -1) lo = words.length - 1;
    hi = lo;
    while (hi + 1 < words.length && words[hi + 1]!.start < first.end) hi++;
  }
  const focusStart = first?.start ?? words[0]!.start;
  const focusEnd = first?.end ?? words[0]!.end;
  const span = (from: number, to: number) => words[to]!.end - words[from]!.start;

  for (;;) {
    const canGrowLeft = lo > 0 && span(lo - 1, hi) <= max;
    const canGrowRight = hi < words.length - 1 && span(lo, hi + 1) <= max;
    if (!canGrowLeft && !canGrowRight) break;
    const before = focusStart - words[lo]!.start;
    const after = words[hi]!.end - focusEnd;
    if (canGrowLeft && (!canGrowRight || before <= after)) lo--;
    else hi++;
  }

  const start = words[lo]!.start;
  const end = words[hi]!.end;
  const lead = lo > 0 ? ELLIPSIS : "";
  const trail = hi < words.length - 1 ? ELLIPSIS : "";
  const shift = lead.length - start;
  return {
    text: `${lead}${value.slice(start, end)}${trail}`,
    ranges: sorted
      .filter((r) => r.end > start && r.start < end)
      .map((r) => ({ start: Math.max(r.start, start) + shift, end: Math.min(r.end, end) + shift })),
  };
}
