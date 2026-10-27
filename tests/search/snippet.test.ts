import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/search/normalize";
import { snippet, SNIPPET_MAX } from "@/lib/search/snippet";
import type { Range } from "@/lib/search/types";

const ELLIPSIS = "…";

/** The snippet text without its ellipses, plus which sides were cut. */
function unwrap(text: string) {
  const lead = text.startsWith(ELLIPSIS);
  const trail = text.endsWith(ELLIPSIS);
  return { lead, trail, body: text.slice(lead ? 1 : 0, trail ? -1 : undefined) };
}

function marked(text: string, ranges: readonly Range[]): string[] {
  return ranges.map((r) => text.slice(r.start, r.end));
}

function rangeOf(value: string, word: string): Range {
  const start = value.indexOf(word);
  expect(start, `premise: "${word}" is in the value`).toBeGreaterThanOrEqual(0);
  return { start, end: start + word.length };
}

// Offsets: alpha 0, beta 6, gamma 11, delta 17, epsilon 23, zeta 31, eta 36, theta 40.
const GREEK = "alpha beta gamma delta epsilon zeta eta theta";

describe("snippet (spec §6.4)", () => {
  it("is 140 characters by default", () => {
    expect(SNIPPET_MAX).toBe(140);
  });

  it("returns a value of 140 characters or fewer whole, ranges unchanged", () => {
    const value = `${"word ".repeat(27)}dock!`;
    expect(value.length).toBe(SNIPPET_MAX);
    const ranges = [rangeOf(value, "dock")];
    expect(snippet(value, ranges)).toEqual({ text: value, ranges });
    // Byte for byte, edge whitespace included (the window path trims it).
    const padded = `${"word ".repeat(27)}dock `;
    expect(padded.length).toBe(SNIPPET_MAX);
    expect(snippet(padded, ranges)).toEqual({ text: padded, ranges });
  });

  it("windows a value of 141 characters within the 140 budget", () => {
    const value = `${"word ".repeat(27)}dock!!`;
    expect(value.length).toBe(SNIPPET_MAX + 1);
    const result = snippet(value, [rangeOf(value, "dock")]);
    const { lead, trail, body } = unwrap(result.text);
    expect(lead).toBe(true);
    expect(trail).toBe(false);
    expect(body.length).toBeLessThanOrEqual(SNIPPET_MAX);
    expect(marked(result.text, result.ranges)).toEqual(["dock"]);
  });

  it("windows around a middle highlight, cut on both sides at word boundaries", () => {
    const result = snippet(GREEK, [rangeOf(GREEK, "delta")], 20);
    expect(result.text).toBe("…gamma delta epsilon…");
    expect(marked(result.text, result.ranges)).toEqual(["delta"]);
  });

  it("adds no ellipsis on a side that was not cut", () => {
    expect(snippet(GREEK, [rangeOf(GREEK, "alpha")], 20).text).toBe("alpha beta gamma…");
    expect(snippet(GREEK, [rangeOf(GREEK, "theta")], 20).text).toBe("…zeta eta theta");
  });

  it("windows around the FIRST highlight even when ranges arrive out of order", () => {
    const result = snippet(GREEK, [rangeOf(GREEK, "theta"), rangeOf(GREEK, "delta")], 20);
    expect(result.text).toBe("…gamma delta epsilon…");
    // theta falls outside the window and is dropped, not clamped onto an edge.
    expect(marked(result.text, result.ranges)).toEqual(["delta"]);
  });

  it("keeps every later highlight inside the window, shifted", () => {
    const ranges = [rangeOf(GREEK, "gamma"), rangeOf(GREEK, "delta")];
    const result = snippet(GREEK, ranges, 20);
    expect(result.text).toBe("…beta gamma delta…");
    expect(marked(result.text, result.ranges)).toEqual(["gamma", "delta"]);
  });

  it("clips a multi-word highlight at the window edge, on a word boundary", () => {
    const phrase = rangeOf(GREEK, "epsilon zeta");
    const result = snippet(GREEK, [rangeOf(GREEK, "delta"), phrase], 20);
    expect(result.text).toBe("…gamma delta epsilon…");
    expect(marked(result.text, result.ranges)).toEqual(["delta", "epsilon"]);
  });

  it("starts at the beginning when there is no highlight", () => {
    expect(snippet(GREEK, [], 20)).toEqual({ text: "alpha beta gamma…", ranges: [] });
  });

  it("keeps a word whole when the highlight starts inside it", () => {
    const value = `${"lead ".repeat(40)}session (GS) in the ballroom ${"tail ".repeat(40)}`.trim();
    const gs = normalize(value).find((t) => t.text === "gs")!;
    const result = snippet(value, [{ start: gs.start, end: gs.end }]);
    expect(unwrap(result.text).body).toContain("(GS)");
    expect(marked(result.text, result.ranges)).toEqual(["GS"]);
  });

  it("keeps a single word longer than the budget whole rather than cutting into it", () => {
    const long = "x".repeat(30);
    const value = `${long} tail words here`;
    const result = snippet(value, [{ start: 5, end: 10 }], 20);
    expect(result.text).toBe(`${long}${ELLIPSIS}`);
    expect(result.ranges).toEqual([{ start: 5, end: 10 }]);
  });
});

describe("snippet invariants over every highlight position", () => {
  // Unique words of varying length, so every word's position is unambiguous.
  const WORDS = Array.from(
    { length: 60 },
    (_, i) => `${"abcdefghijkl".slice(0, 1 + (i % 11))}${i}`,
  );
  const VALUE = WORDS.join(" ");
  const LONGEST = Math.max(...WORDS.map((w) => w.length));

  it("has a value long enough to window (premise)", () => {
    expect(VALUE.length).toBeGreaterThan(3 * SNIPPET_MAX);
  });

  it.each(WORDS.map((word, i) => [i, word] as const))("word %i (%s)", (_i, word) => {
    const range = rangeOf(VALUE, word);
    const result = snippet(VALUE, [range]);
    const { lead, trail, body } = unwrap(result.text);

    // Never rewritten: the body is the value's own text at one position.
    const at = VALUE.indexOf(body);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(body.length).toBeLessThanOrEqual(SNIPPET_MAX);
    // Cut at word boundaries, and an ellipsis exactly on each cut side.
    expect(at === 0 || VALUE[at - 1] === " ").toBe(true);
    expect(at + body.length === VALUE.length || VALUE[at + body.length] === " ").toBe(true);
    expect(body).toBe(body.trim());
    expect(lead).toBe(at > 0);
    expect(trail).toBe(at + body.length < VALUE.length);
    // The highlight survives whole, shifted onto the snippet text.
    expect(marked(result.text, result.ranges)).toEqual([word]);
    // Around the highlight: context is balanced unless a side ran out of text.
    // Bound: the sides grow one word at a time, smaller side first, so they
    // differ by at most one word, plus the budget one side could not use once
    // its next word stopped fitting (also under one word).
    const before = range.start - at;
    const after = at + body.length - range.end;
    if (lead && trail) expect(Math.abs(before - after)).toBeLessThanOrEqual(2 * (LONGEST + 1));
  });
});
