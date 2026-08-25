// The mechanism behind the authored-edit class (spec §5).
//
// Six sites in this repo apply an author-written `from` -> `to` edit through `String.replace`,
// two of them writing the result straight to disk. Every one validates that the ANCHOR is unique
// — `ANCHOR-NOT-UNIQUE`, `AMBIGUOUS (${hits} hits)`, `occurrences).toBe(1)`, "suite refactored;
// update the probe anchors" — and none validated the replacement side, because the replacement
// argument being a mini-language is not something the pattern side warns you about.
//
// WHAT THIS TEST DOES AND DOES NOT PROVE. It pins the MECHANISM: a replacer function inserts an
// authored `to` verbatim where a replacement string parses it. It is not a per-site behavioural
// test, because all six sites are inline in script and test bodies rather than exported helpers,
// and extracting six functions to make them callable would widen this diff well past a sweep.
// The per-site guarantee is structural and lives in replacementString.test.ts: any of the six
// regressing to a replacement string reappears in the repo-wide scan and reds the inventory.
import { describe, expect, it } from "vitest";

/** Every sequence `String.replace` interprets in a replacement STRING. */
const EVERY_SEQUENCE = "$& $` $' $1 $$";

describe("an authored replacement applies verbatim through a replacer function", () => {
  const source = "keep ANCHOR here";

  it("a replacement STRING is parsed, which is the defect", () => {
    const out = source.replace("ANCHOR", EVERY_SEQUENCE);
    expect(out, "the premise: a string replacement really is interpreted here").not.toContain(
      EVERY_SEQUENCE,
    );
    // Concretely, and the three spaces are the point rather than a typo: $& became the match
    // "ANCHOR", $` the text before it ("keep " — trailing space), $' the text after (" here" —
    // leading space), $1 stayed literal because a string pattern has no capture group, and $$
    // collapsed to one dollar.
    expect(out).toBe("keep ANCHOR keep   here $1 $ here");
  });

  it("a replacer FUNCTION inserts the same text unchanged", () => {
    expect(source.replace("ANCHOR", () => EVERY_SEQUENCE)).toBe(`keep ${EVERY_SEQUENCE} here`);
  });

  it("holds for a regex pattern with a capture group too", () => {
    // The shape the two disk-writing scripts use: a regex anchor, an authored replacement.
    const re = /(keep) ANCHOR/;
    expect("keep ANCHOR here".replace(re, () => EVERY_SEQUENCE)).toBe(`${EVERY_SEQUENCE} here`);
  });
});
