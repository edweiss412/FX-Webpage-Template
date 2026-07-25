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

/** Split a CSS blob into its top-level rules by brace depth. */
function splitRules(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of css) {
    buf += ch;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = "";
      }
    }
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

  it("N1: the shipped rules match the spec's normative block VERBATIM", () => {
    // The spec makes that block normative *verbatim* (§9.1 N1). Fragment
    // matching is NOT that: round-2 review showed an extra `90%` stop holding
    // both paints would satisfy every fragment assertion while turning the
    // ratified 45% settle into a 90% hold, and the browser suite samples only
    // early motion and post-expiry rest so it stays green too.
    //
    // So compare the real thing. Whitespace is normalised because prettier owns
    // formatting on both sides; nothing else is.
    const norm = (css: string) =>
      css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .replace(/\s*([{};:,])\s*/g, "$1")
        .trim();

    const SPEC = readFileSync(
      join(ROOT, "docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md"),
      "utf8",
    );
    // The normative block is the §3.4 fence containing the cue's keyframes.
    const fence = [...SPEC.matchAll(/```css\n([\s\S]*?)```/g)]
      .map((m) => m[1] ?? "")
      .find((block) => block.includes("@keyframes share-link-flash-bg"));
    expect(fence, "spec §3.4 normative CSS fence not found").toBeTruthy();

    // Every rule the spec declares must appear, normalised, in the stylesheet.
    for (const rule of splitRules(fence!)) {
      expect(
        norm(GLOBALS_CSS),
        `normative rule missing or altered: ${rule.slice(0, 48)}`,
      ).toContain(norm(rule));
    }
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
