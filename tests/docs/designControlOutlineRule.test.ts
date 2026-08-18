// tests/docs/designControlOutlineRule.test.ts
//
// DESIGN.md §1.2a must state the rule the tree actually implements.
//
// The 2026-08-18 arc swaps 37 controls from `border-border` to the text ramp.
// Before that swap, §1.2a said the opposite in as many words — "Widening to
// `border-border` is a separate design decision this ruling did not make" — so
// shipping the swap while leaving the paragraph alone would leave the design
// document telling the next author a rule the code contradicts. That is not a
// hypothetical: the paragraph is what a designer reads before choosing a token.
//
// FIVE ASSERTIONS, EACH INDEPENDENT, and the independence is the point (plan
// review R5 F4). An earlier draft checked only that the superseded sentence was
// gone and that a divider was mentioned. A one-edit mutant — delete the
// paragraph, add a sentence about dividers — passed that pair while omitting
// the ruling, its provenance, the new rule, and the ShareHub filing. Folding
// the five into one compound expectation would recreate exactly that hole,
// because four of them could then go unenforced behind the first that fails.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";

const ROOT = process.cwd();
const DESIGN = readFileSync(join(ROOT, "DESIGN.md"), "utf8");

/**
 * §1.2a runs from its own heading to the next `###`. Extracted by heading text
 * rather than by line number: this arc has already watched a line-number
 * citation go stale inside its own branch (plan review R6 F6).
 */
function sectionOneTwoA(): string {
  const start = DESIGN.indexOf("### 1.2a ");
  if (start === -1) throw new Error("DESIGN.md has no `### 1.2a` heading");
  const rest = DESIGN.slice(start + 8);
  const end = rest.indexOf("\n### ");
  return end === -1 ? rest : rest.slice(0, end);
}

const SECTION = sectionOneTwoA();

/**
 * Whitespace-collapsed view, for any assertion about a SENTENCE.
 *
 * `DESIGN.md` hard-wraps its prose, so the superseded sentence below spans a
 * line break in the source. A `toContain` against the raw text therefore never
 * matched it and assertion (1) passed even while the sentence was still
 * present — a vacuous assertion, caught by reading the RED rather than by a
 * reviewer. Sentence-level claims run against this; token-level ones may use
 * the raw section.
 */
const FLAT = SECTION.replace(/\s+/g, " ");

describe("DESIGN.md §1.2a states the shipped control-outline rule", () => {
  /**
   * Without this, every assertion below could pass against an empty string.
   */
  it("premise: §1.2a was found and is a real section", () => {
    premise("§1.2a extracted from DESIGN.md", SECTION.length, 500);
  });

  it("(1) no longer says widening to border-border is a decision this ruling did not make", () => {
    expect(FLAT).not.toContain(
      "Widening to `border-border` is a separate design decision this ruling did not make",
    );
  });

  it("(2) records the 2026-08-18 ruling by date", () => {
    expect(SECTION).toContain("2026-08-18");
  });

  it("(3) records that the ruling was taken against a rendered mockup including the crew surfaces", () => {
    expect(SECTION).toMatch(/mockup/i);
    expect(SECTION).toMatch(/crew/i);
  });

  it("(4) states that a border-border resting outline takes the text ramp", () => {
    expect(FLAT).toMatch(/`border-border`[^.]*text ramp|text ramp[^.]*`border-border`/);
  });

  it("(5) states the divider carve-out and points at the ShareHub filing", () => {
    expect(SECTION).toMatch(/divider/i);
    expect(SECTION).toContain("BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT");
  });
});
