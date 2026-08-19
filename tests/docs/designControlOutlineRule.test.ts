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

/**
 * §1.2's contrast table must carry a row for every token this arc uses as a
 * control OUTLINE.
 *
 * This is Task 4's RED. The sixteen hover-over-rest RELATIONS in
 * `tests/styles/secondary-action-contrast.test.ts` are NOT — probed, all
 * sixteen already hold against today's tokens, so they ship green as a
 * regression pin. Only the missing rows can fail here, and saying otherwise
 * would mislabel which assertion is load-bearing.
 */
describe("DESIGN.md §1.2 carries a row for every outline token this arc ships", () => {
  const SECTION_ONE_TWO = (() => {
    const start = DESIGN.indexOf("### 1.2 ");
    if (start === -1) throw new Error("DESIGN.md has no `### 1.2` heading");
    const rest = DESIGN.slice(start + 7);
    const end = rest.indexOf("\n### ");
    return end === -1 ? rest : rest.slice(0, end);
  })();

  it("premise: §1.2 was found and is a real table", () => {
    premise("§1.2 extracted from DESIGN.md", SECTION_ONE_TWO.length, 500);
  });

  it.each([
    ["--color-border", "the before-state this arc moves away from"],
    ["--color-text-subtle", "§3.6(b)'s hover token, repurposed as an outline"],
    ["--color-accent-on-bg", "§3.6(c)'s hover token, repurposed as an outline"],
  ])("carries an OUTLINE row for %s (%s)", (token) => {
    const flat = SECTION_ONE_TWO.replace(/\s+/g, " ");
    expect(flat).toMatch(new RegExp(`\\\`${token}\\\`[^|]*(?:as )?OUTLINE`, "i"));
  });
});
