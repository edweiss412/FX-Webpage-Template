/**
 * AC-9 — neither retry region cancels anything.
 *
 * The check-in is a soft one: at the deadline the copy changes and a Restart is
 * offered, and the in-flight request is NEVER cancelled. That is the deferred
 * row's whole point, and it is the claim a crew member on a slow connection
 * actually feels — a cancelled request is a diagram that will not arrive.
 *
 * A SOURCE SCAN, not a runtime probe, and deliberately: the absence of a call is
 * not observable at runtime. There is no event for "no AbortController was
 * constructed". So the oracle is the code, scoped to the two files that own the
 * retry regions, with the scan's own reach asserted first — a mis-pathed read
 * would otherwise report clean having examined nothing, which is the shape this
 * arc has already shipped three times.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "../../_shared/premise";
import { PHASE_COMPONENTS } from "./phaseWriters";

/**
 * The cancellation vocabulary, as PATTERNS rather than as one grep.
 *
 * Each entry names a distinct mechanism a future edit could reach for. They are
 * separate rows so a failure says WHICH mechanism appeared, rather than that
 * something matched.
 *
 * A FOURTH ROW WAS REMOVED RATHER THAN REPAIRED, and the direction matters. It
 * matched `signal:` to catch an AbortSignal handed to a fetch, and it fired on
 * the word "signal" in a sentence of prose. The repair on offer was a comment
 * stripper, which is a parser over an open grammar and a bigger target for the
 * next edit; the repair taken was deletion, because an AbortSignal cannot exist
 * without the AbortController the first row already catches, and an `<img>`
 * does not load through `fetch` at all. The row cost coverage of nothing.
 *
 * DOCUMENTED LIMIT: the three surviving patterns run over raw source, comments
 * included. A comment that writes `.abort(` fails this suite. That is a false
 * alarm a contributor sees and resolves in one edit, which is the conservative
 * direction; the alternative fails silently on real code inside a construct the
 * stripper mis-parses.
 */
const CANCELLERS = [
  { what: "an AbortController", pattern: /\bAbortController\b/ },
  { what: "an abort() call", pattern: /\.abort\s*\(/ },
  // Clearing an `<img>` src is the cancellation that does not look like one:
  // assigning "" or null to a live element's src abandons the fetch in every
  // engine, and it reads as cleanup rather than as a cancel.
  // The empty TEMPLATE LITERAL sits in this row deliberately. Review round 2
  // finding 2 showed an assignment of an empty template literal escaped a row
  // that listed only the two quote forms, and it is the same empty string the
  // row already forbids — one mechanism, a third spelling.
  { what: "an <img> src being cleared", pattern: /\.src\s*=\s*(""|''|``|null|undefined)/ },
  // WHOLE-DIFF REVIEW FINDING 4. The row above matches the PROPERTY assignment
  // and nothing else, so the three ordinary attribute routes to the same
  // cancellation were invisible: the reviewer injected `removeAttribute("src")`
  // into both Restart handlers and every component suite stayed green, 59/59.
  //
  // Widening here rather than narrowing, and the direction is deliberate: these
  // are not obfuscations a hostile author reaches for, they are the three ways
  // an ordinary contributor clears an attribute, which is exactly the threat
  // model this guard declares. The property form and the attribute forms are one
  // defect wearing three spellings.
  { what: 'removeAttribute("src")', pattern: /removeAttribute\(\s*["'`]src["'`]\s*\)/ },
  {
    what: 'setAttribute("src", "")',
    pattern: /setAttribute\(\s*["'`]src["'`]\s*,\s*(""|''|``)\s*\)/,
  },
  {
    // ONE-ARGUMENT `toggleAttribute("src")` removes an attribute that is
    // present, so the second argument is optional and a two-argument-only
    // pattern missed it (r2 finding 2, one instance per component). Optional in
    // the pattern rather than a second row: one mechanism, one row.
    what: 'toggleAttribute("src") / toggleAttribute("src", false)',
    pattern: /toggleAttribute\(\s*["'`]src["'`]\s*(,\s*false\s*)?\)/,
  },
] as const;

describe("AC-9: the check-in cancels nothing", () => {
  const sources = PHASE_COMPONENTS.map((file) => ({
    file,
    src: readFileSync(join(process.cwd(), file), "utf8"),
  }));

  it("read both retry regions before claiming anything about them", () => {
    // THE PREMISE. Every assertion below is a `not.toMatch` over these strings,
    // and an empty string satisfies all of them.
    premiseHolds("both component sources were located", sources.length === 2);
    for (const { file, src } of sources) {
      premiseHolds(`${file} was read and is a component`, src.includes("RetryPhase"));
    }
  });

  for (const { what, pattern } of CANCELLERS) {
    it(`neither component reaches for ${what}`, () => {
      premiseHolds("there are sources to scan", sources.length === 2);
      const hits = sources.filter(({ src }) => pattern.test(src)).map(({ file }) => file);
      expect(
        hits,
        `${what} appeared in a retry region. The check-in is soft: the in-flight request is ` +
          "never cancelled, and U-1 is about what the BROWSER does when the element goes, not " +
          "about anything this code calls.",
      ).toEqual([]);
    });
  }
});
