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
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SHARE_LINK_FLASH_MS } from "@/components/admin/showpage/ShareHub";

const ROOT = process.cwd();
const GLOBALS_CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const SHARE_HUB_SRC = readFileSync(join(ROOT, "components/admin/showpage/ShareHub.tsx"), "utf8");

/** One leaf CSS rule, keyed by its at-rule context so a moved rule cannot match. */
type Leaf = { key: string; body: string };

const norm = (css: string) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,])\s*/g, "$1")
    .trim();

/** Split a CSS blob into its top-level `prelude { body }` rules by brace depth. */
function splitRules(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of css) {
    if (ch === "{") {
      depth++;
      if (depth === 1) {
        buf += "\u0000"; // prelude/body boundary marker
        continue;
      }
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const [prelude = "", body = ""] = buf.split("\u0000");
        if (prelude.trim() || body.trim()) out.push({ prelude: prelude.trim(), body });
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  return out;
}

/**
 * Flatten CSS to context-qualified leaves.
 *
 * `@keyframes` is a leaf: its percent stops are not selectors, so the whole
 * body is compared as one unit. Conditional at-rules (`@media`) recurse, and
 * the condition is carried into each child's key — that is what makes moving a
 * rule OUT of `prefers-reduced-motion` a mismatch instead of a silent pass.
 */
function flatten(css: string, context = ""): Leaf[] {
  return splitRules(css).flatMap(({ prelude, body }) => {
    const at = prelude.startsWith("@");
    if (at && !/^@keyframes\b/.test(prelude)) {
      return flatten(body, `${context}${norm(prelude)} > `);
    }
    return [{ key: context + norm(prelude), body: norm(body) }];
  });
}

/** The cue's own leaves, in a stable order, from either side of the comparison. */
function cueLeaves(css: string): string[] {
  return flatten(css)
    .filter((l) => `${l.key}${l.body}`.includes("share-link-flash"))
    .map((l) => `${l.key}{${l.body}}`)
    .sort();
}

describe("share-link cue motion contract (N0/N1)", () => {
  it("N0: SHARE_LINK_FLASH_MS is 1600", () => {
    // A VALUE assertion, deliberately not an equality against the CSS: the two
    // agreeing on the wrong number is a defect this alone can catch.
    expect(SHARE_LINK_FLASH_MS).toBe(1600);
    expect(SHARE_HUB_SRC).toMatch(/export const SHARE_LINK_FLASH_MS = 1600;/);
  });

  it("N1: the shipped cue rules EQUAL the spec's normative block", () => {
    // Set equality, not containment. Round-3 review broke the containment form:
    // `html [data-share-link-flash]` is valid CSS that contains the normative
    // selector as a substring, and duplicating the whole attribute rule also
    // contains it — both passed while changing specificity / cascade. Equality
    // over context-qualified leaves rejects extra rules, missing rules,
    // rewritten selectors, and rules moved between at-rule contexts.
    //
    // Whitespace and comments are normalised because prettier owns formatting
    // on both sides. Nothing else is.
    const SPEC = readFileSync(
      join(ROOT, "docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md"),
      "utf8",
    );
    const fence = [...SPEC.matchAll(/```css\n([\s\S]*?)```/g)]
      .map((m) => m[1] ?? "")
      .find((block) => block.includes("@keyframes share-link-flash-bg"));
    expect(fence, "spec §3.4 normative CSS fence not found").toBeTruthy();

    const spec = cueLeaves(fence!);
    // Guard against a vacuous pass: an empty fence would make [] === [] true.
    expect(spec.length).toBe(4);
    expect(cueLeaves(GLOBALS_CSS)).toEqual(spec);
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
