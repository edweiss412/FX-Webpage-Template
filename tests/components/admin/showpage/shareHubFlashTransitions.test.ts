/**
 * tests/components/admin/showpage/shareHubFlashTransitions.test.ts
 *
 * N0/N1 (spec 2026-07-24-share-link-chrome-backlog-design §9.1): the share-link
 * cue's motion contract.
 *
 * The spec makes the CSS block NORMATIVE, verbatim, rather than describing its
 * properties — because eight review rounds established that a prose paraphrase
 * of an executable property is never complete. Every attempt to enumerate
 * "the animation has these keyframes, this duration, this delay" admitted an
 * implementation that satisfied the list and violated the intent (a 1px linear
 * ring, a 5% hold, a stray `opacity` track). Comparing against the block itself
 * has no paraphrase gap because there is no paraphrase.
 *
 * N0 is separate and equally load-bearing: N1 locks the stylesheet, but without
 * a value assertion on the constant an implementation could ship the normative
 * CSS with a 2000ms timer, leaving the attribute up 400ms after the paint
 * settled. Neither clause does it alone.
 *
 * Companion to the component-side rows: jsdom applies no CSS, so the attribute
 * LIFECYCLE is pinned there and the motion it triggers is pinned here. Same
 * split as the shipped step3 flash (step3ReviewModal.transitions.test.tsx:723-741).
 */
import { readFileSync } from "node:fs";
import { stripCssComments } from "../../../_shared/stripComments";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SHARE_LINK_FLASH_MS } from "@/components/admin/showpage/ShareHub";

const ROOT = process.cwd();
const GLOBALS_CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");
// Comment-stripped for brace counting only (space-blanked, offsets preserved, so an
// index found in the RAW text lands on the same byte here). The byte-for-byte
// normative-block search stays on RAW: its block includes its own CSS comment.
const GLOBALS_CSS_CODE = stripCssComments(GLOBALS_CSS);
const SHARE_HUB_SRC = readFileSync(join(ROOT, "components/admin/showpage/ShareHub.tsx"), "utf8");

/**
 * Brace depth at `index`, ignoring braces inside comments and strings.
 *
 * This is NOT the rule parser that was deleted — it never splits or compares
 * anything, it only counts. That matters because it carries a SELF-CHECK the
 * parser could not: depth at end-of-file must be 0. If the scanner mishandles
 * any construct in this stylesheet, the file stops balancing and the test fails
 * loudly instead of passing for the wrong reason.
 */
function depthAt(css: string, index: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < index; i++) {
    const ch = css[i] as string;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    // A backslash escape is legal OUTSIDE strings too — `.escape\}` is a valid
    // class selector — and counting the escaped brace as structural let a
    // crafted pair of wrappers balance out while nesting the block inside
    // `@media screen`, defeating both this check and its EOF self-check
    // (round-8 review). Skip the escaped character, whatever it is.
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth;
}

/** The spec's normative CSS block, read from its §3.4 fence. */
function normativeBlock(): string {
  const spec = readFileSync(
    join(ROOT, "docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md"),
    "utf8",
  );
  const fence = [...spec.matchAll(/```css\n([\s\S]*?)```/g)]
    .map((m) => m[1] ?? "")
    .find((block) => block.includes("@keyframes share-link-flash-bg"));
  if (!fence) throw new Error("spec §3.4 normative CSS fence not found");
  return fence.trimEnd();
}

/**
 * Every `@media (forced-colors: active)` block in the stylesheet, by brace matching.
 *
 * Returned as a LIST rather than a single string so the caller asserts how many there
 * are. Finding one is the expected state; finding none would let a sum-based count pass
 * vacuously, and finding two is itself the defect the forced-colors pass forbids.
 */
function forcedColorsBlocks(): string[] {
  const out: string[] = [];
  const re = /@media\s*\(forced-colors:\s*active\)\s*\{/g;
  for (let m = re.exec(GLOBALS_CSS_CODE); m; m = re.exec(GLOBALS_CSS_CODE)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < GLOBALS_CSS_CODE.length && depth > 0; i += 1) {
      const ch = GLOBALS_CSS_CODE[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
    out.push(GLOBALS_CSS_CODE.slice(m.index, i));
  }
  return out;
}

describe("share-link cue motion contract (N0/N1)", () => {
  it("N0: SHARE_LINK_FLASH_MS is 1600", () => {
    // A VALUE assertion, deliberately not an equality against the CSS: the two
    // agreeing on the wrong number is a defect this alone can catch.
    expect(SHARE_LINK_FLASH_MS).toBe(1600);
    expect(SHARE_HUB_SRC).toMatch(/export const SHARE_LINK_FLASH_MS = 1600;/);
  });

  it("N1: the spec's normative block appears in globals.css BYTE FOR BYTE", () => {
    // A raw substring test over the exact bytes — no parser, no normalisation.
    //
    // Four review rounds went into hand-rolled CSS lexing here, and each round
    // closed one lexical hole and revealed another: comments, then quotes, then
    // url(), then escapes, then the fact that sorting leaves discarded rule
    // order. That is an unbounded space being chased with a finite list, which
    // is the same failure this milestone already hit once in prose form.
    //
    // So stop parsing. The spec fence is now literally the shipped bytes, which
    // makes "normative verbatim" true by construction rather than by
    // reconstruction. Every lexical edge case disappears with the lexer: there
    // is nothing to mis-tokenise in a byte comparison, and contiguity means rule
    // ORDER is pinned for free.
    expect(GLOBALS_CSS).toContain(normativeBlock());
  });

  it("N1: the block sits at TOP LEVEL, not nested in an at-rule", () => {
    // Contiguity pins the order of rules INSIDE the block; it says nothing about
    // what encloses it. Wrapping the whole fence in `@media screen { … }` passed
    // the byte check, the occurrence count, both keyframe checks, and the browser
    // suite — Playwright renders as screen media — while gating the entire cue
    // behind a media query (round-7 review).
    const block = normativeBlock();
    const at = GLOBALS_CSS.indexOf(block);
    expect(at, "normative block not found").toBeGreaterThanOrEqual(0);

    // Self-check first: a scanner that miscounts would make the assertion below
    // meaningless, so require the whole file to balance before trusting it.
    expect(
      depthAt(GLOBALS_CSS_CODE, GLOBALS_CSS_CODE.length),
      "stylesheet braces do not balance",
    ).toBe(0);
    expect(depthAt(GLOBALS_CSS_CODE, at), "normative block is nested inside an at-rule").toBe(0);
  });

  it("N1: nothing ELSE in the stylesheet mentions the cue", () => {
    // The byte check above proves the block is present and intact; it cannot see
    // an ADDITIONAL rule elsewhere naming the cue — a later duplicate that wins
    // the cascade, or a second reduced-motion override. Occurrence counting
    // does, and it is the other half of what the old set-equality bought.
    //
    // What neither half covers is a rule that retunes the cue WITHOUT naming it
    // (by testid, class, or ancestor). Resolved style is the only place that is
    // visible, and T-FLASH-RUN pins every animation longhand there.
    //
    // THERE ARE NOW TWO SANCTIONED SITES, not one. feat/forced-colors-pass added a
    // single unlayered `@media (forced-colors: active)` block that repairs this cue:
    // under forced colors a UA drops the ring's box-shadow outright and forces both
    // ends of the background animation onto one value, so both tracks vanish and the
    // block restores the state on a surviving carrier. That is a deliberate second
    // override of exactly the kind the paragraph above warns about, which is why it
    // is named here rather than tolerated by a looser count.
    //
    // Both halves stay exact. The forced-colors block's own contribution is PINNED,
    // so a mention added inside it is as loud as one added anywhere else; and the
    // total still equals the sum, so a THIRD site outside both reds. A guard that
    // merely subtracted the block would let it grow without limit.
    const count = (hay: string) => (hay.match(/share-link-flash/g) ?? []).length;
    const blocks = forcedColorsBlocks();
    expect(blocks.length, "the stylesheet must hold exactly one forced-colors block").toBe(1);
    expect(
      count(blocks[0]!),
      "the forced-colors block's mentions of the cue; raising this is a deliberate edit",
    ).toBe(2);
    expect(count(GLOBALS_CSS)).toBe(count(normativeBlock()) + count(blocks[0]!));
  });

  it("N1: both keyframes are declared exactly once", () => {
    const bg = GLOBALS_CSS.match(/@keyframes share-link-flash-bg\b/g) ?? [];
    const ring = GLOBALS_CSS.match(/@keyframes share-link-flash-ring\b/g) ?? [];
    // Uniqueness, not mere existence: a later duplicate wins the cascade and
    // could be empty or mis-coloured while every fragment check still passed.
    expect(bg).toHaveLength(1);
    expect(ring).toHaveLength(1);
  });

  it("N1: the component declares no keyframes of its own", () => {
    expect(SHARE_HUB_SRC).not.toMatch(/@keyframes/);
  });
});
