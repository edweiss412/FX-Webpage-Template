// BL-ADMIN-BADGE-CONTRAST-TOKEN — the count badge's own token pair, pinned by
// computed contrast rather than by a snapshot.
//
// THE DEFECT. Both count badges (the nav bell and the attention tab) rendered
// `bg-accent text-accent-text`. That pair exists for accent SURFACES, where the
// near-black ink carries it; the badge is a 12px semibold numeral, which is
// ordinary body text under WCAG and needs 4.5:1. Reusing the accent pair also
// spent the brand's one signature colour on a decoration that appears whenever
// a count is non-zero — PRODUCT.md is explicit that orange means "this matters
// now", and a badge that is always orange makes the accent mean nothing.
//
// WHY NOT ~#C25E00, WHICH THE ENTRY SUGGESTED. Measured: #C25E00 against white
// is 4.29:1, under the AA floor for 12px text. The entry proposed it as an
// approximation ("~"), not a measurement. #B85800 is 4.74:1 and is what ships.
// Recording the arithmetic here so the next reader does not "restore" the
// suggested value and quietly drop below the floor.
//
// Reads the LIVE runtime hex out of app/globals.css and computes WCAG relative
// luminance, so drift in either token fails here rather than in review.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}

function contrast(a: string, b: string): number {
  const l1 = relLuminance(a);
  const l2 = relLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function tokenIn(blockText: string, token: string): string {
  const m = blockText.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m || !m[1]) throw new Error(`token ${token} not found in block`);
  return m[1];
}

function block(selectorStart: string): string {
  const idx = css.indexOf(selectorStart);
  if (idx === -1) throw new Error(`selector ${selectorStart} not found`);
  const open = css.indexOf("{", idx);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${selectorStart}`);
}

const MODES = [
  { name: "light", src: block(":root {") },
  { name: "dark", src: block('[data-theme="dark"] {') },
];

/** 12px semibold is ordinary body text under WCAG, not large text. */
const TEXT_FLOOR = 4.5;

describe("count-badge token pair contrast (BL-ADMIN-BADGE-CONTRAST-TOKEN)", () => {
  it("the arithmetic itself is right, checked against two known ratios", () => {
    // PREMISE. Every assertion below is this function applied to two hex
    // strings; a broken luminance implementation would report comfortable
    // ratios for anything and the floors would be decorative. Black on white
    // is exactly 21:1 and a colour against itself is exactly 1:1.
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#b85800", "#b85800")).toBeCloseTo(1, 5);
  });

  for (const mode of MODES) {
    it(`${mode.name}: the badge pair clears the ${TEXT_FLOOR}:1 body-text floor`, () => {
      const bg = tokenIn(mode.src, "--color-badge-count-runtime");
      const text = tokenIn(mode.src, "--color-badge-count-text-runtime");
      expect(
        contrast(bg, text),
        `badge ${bg} on ${text} in ${mode.name} — a count badge is 12px semibold, which WCAG ` +
          `treats as ordinary body text`,
      ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it(`${mode.name}: the badge is distinguishable from the surface it sits on`, () => {
      // A badge is a graphical object against the nav chrome; below 3:1 it stops
      // reading as a badge at all, which is the other way a count can go unseen.
      const bg = tokenIn(mode.src, "--color-badge-count-runtime");
      expect(contrast(bg, tokenIn(mode.src, "--color-surface-runtime"))).toBeGreaterThanOrEqual(3);
    });
  }

  it("the badge pair is NOT the accent pair — the accent stays reserved", () => {
    // PRODUCT.md: orange means "this matters now". A badge that renders whenever
    // a count is non-zero is not that, and reusing the accent token here is what
    // made the badge both low-contrast and semantically noisy. If these ever
    // become the same value, the entry has been undone.
    for (const mode of MODES) {
      expect(
        tokenIn(mode.src, "--color-badge-count-runtime"),
        `${mode.name}: badge bg must not be the accent`,
      ).not.toBe(tokenIn(mode.src, "--color-accent-runtime"));
    }
  });
});
