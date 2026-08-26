/**
 * The accent-on-bg figures `app/globals.css` states in its own voice.
 *
 * WHY THIS EXISTS. `BL-GLOBALS-STALE-ACCENT-CONTRAST-COMMENT` is doc-rot with a
 * measured cost: the prose-link comment told the reader that
 * `--color-accent-on-bg` is 4.11:1 on `--color-bg`, "below the 4.5:1
 * normal-text floor". That was true of `#c25e00`.
 * `BL-ACCENT-ON-BG-AA-CONTRAST` shipped 2026-07-16 and moved the light token to
 * `#a65000`, which measures 5.34:1 — the comment survived the fix that
 * invalidated it, and went on asserting a failure that had been repaired, for
 * six weeks, in the file where a reader is most likely to believe it.
 *
 * Correcting the numbers once fixes today and nothing else. This case is what
 * makes the next retune fail loudly instead: the comment's figures are PARSED
 * out of the stylesheet and compared against the same tokens the stylesheet
 * ships. A token change that moves a ratio now reds here, naming the sentence
 * that has to move with it.
 *
 * Parsed, not pattern-matched. The anchors below pull the declared numbers as
 * captured groups and compare them numerically; a guard that merely checked the
 * sentence still contains "a ratio" would stay green through exactly the drift
 * it exists to catch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function anchor(re: RegExp): number {
  const m = css.match(re);
  if (!m || m.index === undefined) throw new Error(`anchor ${re} not found`);
  return m.index;
}
const lightBlock = css.slice(
  anchor(/^:root \{/m),
  anchor(/^@media \(prefers-color-scheme: dark\)/m),
);
const darkBlock = css.slice(anchor(/^\[data-theme="dark"\] \{/m));
function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}-runtime:\\s*(#[0-9a-fA-F]{6})`));
  if (!m || !m[1]) throw new Error(`token ${name} not found`);
  return m[1];
}

/**
 * The prose-link comment, sliced from its own opening phrase to its close and
 * whitespace-collapsed. A CSS comment is hard-wrapped at ~80 columns, so a
 * figure and the word that labels it routinely straddle a newline plus five
 * spaces of indent. Matching the raw text would make every anchor below hostage
 * to where the wrap happened to land, which is a property of the editor, not of
 * the stylesheet.
 */
const comment = (() => {
  const start = css.indexOf("Inline cross-reference links in prose body text");
  if (start < 0) throw new Error("prose-link comment not found in app/globals.css");
  const end = css.indexOf("*/", start);
  return css.slice(start, end).replace(/\s+/g, " ");
})();

/** Every `N.NN:1` the comment declares, keyed by the phrase that introduces it. */
function declared(re: RegExp): number[] {
  const m = comment.match(re);
  if (!m) throw new Error(`the comment no longer states: ${re}`);
  return m.slice(1).map(Number);
}

describe("app/globals.css accent figures match the tokens it ships", () => {
  it("premise: the comment is present and states figures at all", () => {
    premise("the prose-link comment has body to parse", comment.length, 200);
    premiseHolds("the comment declares at least one contrast figure", /\d+\.\d+:1/.test(comment));
  });

  it("states the accent-on-bg ratio against --color-bg correctly in both themes", () => {
    const [light, dark] = declared(
      /--color-accent-on-bg measures (\d+\.\d+):1 light and (\d+\.\d+):1 dark on --color-bg/,
    ) as [number, number];
    expect(light).toBeCloseTo(
      contrast(tokenIn(lightBlock, "--color-accent-on-bg"), tokenIn(lightBlock, "--color-bg")),
      2,
    );
    expect(dark).toBeCloseTo(
      contrast(tokenIn(darkBlock, "--color-accent-on-bg"), tokenIn(darkBlock, "--color-bg")),
      2,
    );
  });

  // The tinted Callout fills are `bg-info-bg` and `bg-warning-bg`
  // (app/help/_components/Callout.tsx). The comment names both; so does this.
  it.each([
    ["info-bg", "--color-info-bg"],
    ["warning-bg", "--color-warning-bg"],
  ])("states the accent-on-bg ratio against the %s Callout fill correctly", (label, token) => {
    const [light, dark] = declared(
      new RegExp(`(\\d+\\.\\d+):1 light and (\\d+\\.\\d+):1 dark on ${label}`),
    ) as [number, number];
    expect(light).toBeCloseTo(
      contrast(tokenIn(lightBlock, "--color-accent-on-bg"), tokenIn(lightBlock, token)),
      2,
    );
    expect(dark).toBeCloseTo(
      contrast(tokenIn(darkBlock, "--color-accent-on-bg"), tokenIn(darkBlock, token)),
      2,
    );
  });

  /**
   * The figures are the rot; this is the CONCLUSION that rested on them. The
   * accent is not used in any state, and after the 2026-07-16 retune the reason
   * cannot be "it fails AA" — every figure above clears 4.5:1. If a future
   * retune pushes one back under the floor, the old reason becomes available
   * again and this case says so out loud rather than leaving the comment's
   * argument quietly load-bearing on a number nobody rechecked.
   */
  it("records that every accent figure clears the 4.5:1 normal-text floor", () => {
    const grounds = ["--color-bg", "--color-info-bg", "--color-warning-bg"] as const;
    for (const block of [lightBlock, darkBlock]) {
      for (const ground of grounds) {
        expect(
          contrast(tokenIn(block, "--color-accent-on-bg"), tokenIn(block, ground)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
