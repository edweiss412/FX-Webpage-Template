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

describe("share-link cue motion contract (N0/N1)", () => {
  it("N0: SHARE_LINK_FLASH_MS is 1600", () => {
    // A VALUE assertion, deliberately not an equality against the CSS: the two
    // agreeing on the wrong number is a defect this alone can catch.
    expect(SHARE_LINK_FLASH_MS).toBe(1600);
    expect(SHARE_HUB_SRC).toMatch(/export const SHARE_LINK_FLASH_MS = 1600;/);
  });

  it("N1: both keyframes are declared exactly once", () => {
    const bg = GLOBALS_CSS.match(/@keyframes share-link-flash-bg\b/g) ?? [];
    const ring = GLOBALS_CSS.match(/@keyframes share-link-flash-ring\b/g) ?? [];
    // Uniqueness, not mere existence: a later duplicate wins the cascade and
    // could be empty or mis-coloured while every fragment check still passed.
    expect(bg).toHaveLength(1);
    expect(ring).toHaveLength(1);
  });

  it("N1: the wash keyframe holds accent-tint to 45% then settles to the resting surface", () => {
    const block = GLOBALS_CSS.match(/@keyframes share-link-flash-bg\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(block).toMatch(/0%,\s*45%\s*\{\s*background-color:\s*var\(--color-accent-tint\);/);
    expect(block).toMatch(/100%\s*\{\s*background-color:\s*var\(--color-surface-sunken\);/);
    // No property other than background-color animates on this track.
    const props = [...block.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
    expect([...new Set(props)]).toEqual(["background-color"]);
  });

  it("N1: the ring holds 2px accent-edge to 45%, matching the wash, then fades", () => {
    const block = GLOBALS_CSS.match(/@keyframes share-link-flash-ring\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    // The hold stop is shared with the wash ON PURPOSE. Fading the ring from
    // t=0 while the wash held to 45% drained the outline to roughly a third
    // while the fill was still at full strength, so one cue read as two events
    // (impeccable critique + audit, independently).
    expect(block).toMatch(/0%,\s*45%\s*\{\s*box-shadow:\s*0 0 0 2px var\(--color-accent-edge\);/);
    expect(block).toMatch(/100%\s*\{\s*box-shadow:\s*0 0 0 2px transparent;/);
    const props = [...block.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
    expect([...new Set(props)]).toEqual(["box-shadow"]);
  });

  it("N1: both tracks share the same 45% hold stop", () => {
    // A single cue, not two. If one track's hold moves, this fails rather than
    // shipping an outline that outlives or predeceases its own fill.
    const bg = GLOBALS_CSS.match(/@keyframes share-link-flash-bg\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    const ring = GLOBALS_CSS.match(/@keyframes share-link-flash-ring\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    const holdOf = (block: string) => block.match(/0%,\s*(\d+)%/)?.[1];
    expect(holdOf(bg)).toBe("45");
    expect(holdOf(ring)).toBe(holdOf(bg));
  });

  it("N1: the attribute runs BOTH tracks at exactly SHARE_LINK_FLASH_MS", () => {
    // Drift pin between TypeScript and CSS. Authored against prettier's actual
    // output: the two-name shorthand reflows across three lines, unlike the
    // single-line step3 template.
    expect(GLOBALS_CSS).toMatch(
      new RegExp(
        String.raw`\[data-share-link-flash\]\s*\{\s*animation:\s*` +
          String.raw`share-link-flash-bg ${SHARE_LINK_FLASH_MS}ms ease-out,\s*` +
          String.raw`share-link-flash-ring ${SHARE_LINK_FLASH_MS}ms ease-out;`,
      ),
    );
  });

  it("N1: reduced motion collapses the cue, and nothing else overrides it", () => {
    // Existence AND uniqueness. An earlier draft of this contract asserted only
    // that the ONLY `animation: none` sat inside a reduced-motion block, which
    // is vacuously true when there are zero such rules — so an implementation
    // shipping no override at all would have passed.
    expect(GLOBALS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-share-link-flash\] \{\s*animation: none;/,
    );
    const allNone =
      GLOBALS_CSS.match(/\[data-share-link-flash\][^{]*\{[^}]*animation:\s*none/g) ?? [];
    expect(allNone).toHaveLength(1);
    // No paused track, which would leave the attribute up and nothing painting.
    expect(GLOBALS_CSS).not.toMatch(/\[data-share-link-flash\][^{]*\{[^}]*animation-play-state/);
  });

  it("N1: the component declares no keyframes of its own", () => {
    expect(SHARE_HUB_SRC).not.toMatch(/@keyframes/);
  });
});
