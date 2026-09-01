// Task 2's rewrite of tests/styles/progressShimmerPseudoElements.test.ts.
//
// Three things the original could not do, each a hole finding 3 named:
//
//  1. It built every regex from PB, which names only wizard-step2-progressbar,
//     so deleting the finalize selector from the Mozilla rules survived every
//     assertion. The Chromium-only Playwright suite cannot see those rules at
//     all, so nothing anywhere covered them.
//  2. Its firstBlock matched a selector IMMEDIATELY followed by `{`, so
//     appending a second selector to a rule breaks cases (a), (b) and the
//     determinate coverage even while the CSS is correct.
//  3. Case (c) required the comma-grouped reduced-motion rule BY NAME. That
//     rule is invalid as a whole in Chromium and WebKit, which know only one of
//     the two vendor pseudo-elements, so the guard asserted the defect.
//
// The replacement is selector-list aware and ranges over BOTH testids.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import { stripCssComments } from "../_shared/stripComments";

const raw = readFileSync("app/globals.css", "utf8");
/**
 * Comments stripped from the WHOLE source before scanning.
 *
 * Found by running the scanner against the real stylesheet before this file was
 * written: a CSS comment can contain a comma, and stripping per-selector AFTER
 * the comma split runs too late — the comment has already been torn in half and
 * both halves survive as phantom selectors. The block comment at
 * app/globals.css:682-689 produced exactly that.
 *
 * Through the shared module, not a local regex. `tests/cross-cutting/
 * _metaStripCommentsSingleSource.test.ts` walks every test file for exactly the
 * `/\*[\s\S]*?\*\/` idiom this line used to carry, and it is right to: the regex
 * form has no string state, so a rule declaring `content: "/*"` would have opened
 * a comment at that quote and swallowed the stylesheet from there to the next
 * `*\/`. `stripCssComments` tracks quotes and escapes, and blanks with spaces
 * rather than deleting, so every offset and line number this scanner reports
 * still points at the real file.
 */
const css = stripCssComments(raw);

const TESTIDS = ["wizard-step2-progressbar", "wizard-finalize-progressbar"] as const;
const sel = (testid: string, tail: string) => `progress[data-testid="${testid}"]${tail}`;

type Rule = { selectors: string[]; body: string; media: string | null };

/**
 * Every rule in the stylesheet, with its selector LIST split, and the @media
 * prelude it sits under when it sits under one.
 *
 * Deliberately a scanner rather than a regex per assertion: the original's
 * `selector\s*\{` form is what made a correct selector-list edit look like a
 * regression, and rewriting each assertion's regex to tolerate lists would put
 * the same fragility in eight places instead of one.
 */
function rules(source: string): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  let media: string | null = null;
  let mediaDepth = -1;
  let depth = 0;
  let chunk = "";
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "{") {
      const prelude = chunk.trim();
      if (prelude.startsWith("@media")) {
        media = prelude;
        mediaDepth = depth;
        depth += 1;
      } else if (prelude.startsWith("@")) {
        depth += 1; // @keyframes and friends: skipped, not scanned
      } else {
        // A rule. Consume to its matching brace.
        let d = 1;
        let j = i + 1;
        for (; j < source.length && d > 0; j++) {
          if (source[j] === "{") d++;
          else if (source[j] === "}") d--;
        }
        out.push({
          selectors: prelude
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          body: source.slice(i + 1, j - 1),
          media,
        });
        i = j;
        chunk = "";
        continue;
      }
      chunk = "";
    } else if (ch === "}") {
      depth -= 1;
      if (media !== null && depth <= mediaDepth) {
        media = null;
        mediaDepth = -1;
      }
      chunk = "";
    } else {
      chunk += ch;
    }
    i++;
  }
  return out;
}

const ALL = rules(css);
const ruleFor = (selector: string) => ALL.find((r) => r.selectors.includes(selector)) ?? null;

const SHIMMER_IMAGE = /background-image:\s*linear-gradient\(/;
const SHIMMER_ANIM = /animation:\s*scan-progress-indeterminate\b/;

describe("the scanner itself", () => {
  // Guards the guard. A scanner that silently matched nothing would make every
  // rule below vacuously true, which is what a conditional guard is most
  // exposed to — and this scanner is new, so it gets its own cases.
  it("splits selector lists and finds rules inside media blocks", () => {
    const r = rules(
      `a, b { color: red; }\n@media (prefers-reduced-motion: reduce) {\n  c,\n  d { animation: none; }\n}\n`,
    );
    expect(r.map((x) => x.selectors)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(r[0]!.media).toBeNull();
    expect(r[1]!.media).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("finds every rule the live stylesheet writes for these two testids", () => {
    // This is the case that keeps the whole suite honest. The scanner SKIPS
    // at-rules other than @media, which is correct today — the progress block
    // sits at top level and its at-rule neighbours are @keyframes, which hold
    // no rules this suite needs (verified on this base: app/globals.css:688-761
    // has no enclosing @layer). If someone later wraps the block in @layer, the
    // scanner would skip it and EVERY assertion below would pass vacuously.
    // This count is what turns that silent hole into a red.
    // Counted in SELECTOR OCCURRENCES, not rules. Before this arc the block is
    // seven rules holding eight occurrences, because the reduced-motion rule is
    // one rule carrying two selectors — which is the whole defect. A rule-count
    // assertion of eight would have been wrong in both directions, and was, in
    // the first draft of this file.
    const hits = ALL.filter((r) => r.selectors.some((s) => s.includes("progressbar")));
    const occurrences = hits.reduce(
      (n, r) => n + r.selectors.filter((s) => s.includes("progressbar")).length,
      0,
    );
    expect(occurrences, "the scanner reaches the progress block at all").toBeGreaterThanOrEqual(8);
  });
});

describe("both wizard progress bars are styled identically (all eight rules)", () => {
  // The eight rules, named by the tail that identifies them. This is the list
  // finding 3 said nothing covered: the Mozilla entries in particular are
  // invisible to a Chromium-only Playwright run, so the SOURCE is the only
  // place they can be pinned.
  const TAILS = [
    "",
    "::-webkit-progress-bar",
    "::-webkit-progress-value",
    "::-moz-progress-bar",
    ":indeterminate::-webkit-progress-bar",
    ":indeterminate::-moz-progress-bar",
  ] as const;

  it.each(TAILS)("the rule for %s carries BOTH testids", (tail) => {
    const rule = ruleFor(sel(TESTIDS[0], tail));
    expect(rule, `no rule whose selector list contains ${sel(TESTIDS[0], tail)}`).not.toBeNull();
    for (const id of TESTIDS) {
      expect(
        rule!.selectors,
        `${tail || "(base)"} must style ${id} too — a bar styled for one wizard step and not the other is the defect this arc closed`,
      ).toContain(sel(id, tail));
    }
  });
});

describe("prefers-reduced-motion stops the shimmer in every engine", () => {
  // Case (c), rewritten. The original required ONE comma-grouped rule holding
  // both vendor pseudo-elements. A selector list is invalid as a whole when any
  // selector in it is, and an unknown vendor pseudo-element is invalid, so that
  // rule is dropped entirely by Chromium and by WebKit and kept only by Firefox,
  // which aliases the webkit form. Probed on all three engines before this
  // rewrite. Two SEPARATE single-vendor rules is the form that survives
  // everywhere.
  it.each([":indeterminate::-webkit-progress-bar", ":indeterminate::-moz-progress-bar"])(
    "%s has its OWN reduced-motion rule, not shared with the other vendor",
    (tail) => {
      const rule = ALL.find(
        (r) =>
          r.media !== null &&
          /prefers-reduced-motion:\s*reduce/.test(r.media) &&
          r.selectors.includes(sel(TESTIDS[0], tail)),
      );
      expect(rule, `no reduced-motion rule for ${tail}`).not.toBeNull();
      expect(rule!.body).toMatch(/animation:\s*none/);
      for (const id of TESTIDS) expect(rule!.selectors).toContain(sel(id, tail));
      // The whole point: this rule must not also carry the OTHER vendor's
      // pseudo-element, because that is what invalidates it.
      const other = tail.includes("webkit") ? "-moz-" : "-webkit-";
      expect(
        rule!.selectors.some((s) => s.includes(other)),
        `mixing ${other} into this selector list invalidates the whole rule in engines that know only one vendor`,
      ).toBe(false);
    },
  );
});

describe("the shimmer itself is unchanged", () => {
  it.each([":indeterminate::-webkit-progress-bar", ":indeterminate::-moz-progress-bar"])(
    "%s still paints the moving gradient",
    (tail) => {
      const rule = ruleFor(sel(TESTIDS[0], tail));
      expect(rule).not.toBeNull();
      expect(rule!.body).toMatch(SHIMMER_IMAGE);
      expect(rule!.body).toMatch(SHIMMER_ANIM);
    },
  );

  it("the Mozilla indeterminate track still defeats Firefox's solid 100% bar", () => {
    expect(ruleFor(sel(TESTIDS[0], ":indeterminate::-moz-progress-bar"))!.body).toMatch(
      /background-color:\s*transparent/,
    );
  });

  it("the shimmer is NOT on the bare :indeterminate element (occluded in WebKit, solid in Firefox)", () => {
    for (const id of TESTIDS) expect(ruleFor(sel(id, ":indeterminate"))).toBeNull();
  });

  it("the determinate fill still paints the accent", () => {
    expect(ruleFor(sel(TESTIDS[0], "::-webkit-progress-value"))!.body).toMatch(
      /background-color:\s*var\(--color-accent\)/,
    );
    expect(ruleFor(sel(TESTIDS[0], "::-moz-progress-bar"))!.body).toMatch(
      /background-color:\s*var\(--color-accent\)/,
    );
  });
});

describe("the panel docstring claims only what the code actually shares", () => {
  it("makes no unqualified same-tokens claim", () => {
    const src = readFileSync("components/admin/FinalizeButton.tsx", "utf8");
    // Scoped to the ProgressPanel docstring. A comment elsewhere in this 1200-line
    // file mentioning tokens must neither satisfy nor trip this.
    // Tolerates line comments between the docstring and the symbol: a `//` note added
    // there is ordinary, and the guard should keep reading the docstring rather than
    // failing its own premise (found by planting exactly that as mutant (c)).
    const doc =
      /\/\*\*([\s\S]*?)\*\/(?:\s*\/\/[^\n]*\n)*\s*const ProgressPanel/.exec(src)?.[1] ?? "";
    // PREMISE: the docstring was actually found. Without it an empty string satisfies
    // every "does not contain" assertion below and the case passes vacuously.
    expect(doc, "premise: the ProgressPanel docstring is locatable").not.toBe("");
    expect(doc.length, "premise: and is a real docstring, not a stray match").toBeGreaterThan(80);

    // The panel sits on bg-surface-sunken with p-tile-pad; <Step2Verify>'s scan panel
    // does not. The two share the BAR's styling through app/globals.css and nothing
    // else, so an unqualified same-tokens claim is false — before this arc and after it.
    expect(
      doc,
      "the two panels differ in container tokens, so a same-tokens claim is false",
    ).not.toMatch(/same tokens/i);

    // The half that IS true must be earned: a shared-bar claim is only honest while the
    // stylesheet actually paints both testids from one rule set.
    if (/shares? the bar|bar's styling/i.test(doc)) {
      for (const id of TESTIDS) {
        expect(
          ruleFor(sel(id, "::-webkit-progress-value")),
          `the docstring claims a shared bar; the stylesheet must style ${id}`,
        ).not.toBeNull();
      }
    }
  });
});
