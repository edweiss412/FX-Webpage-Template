/**
 * tests/styles/crewPassContrast.test.ts — contrast pins for the crew pass and
 * the day row (crew page redesign; impeccable gate fixes X4, X7).
 *
 * Reads the LIVE runtime hex values out of app/globals.css, parsed with postcss
 * (tests/styles/_cssDecls.ts), so a token edit that breaks a pairing fails here
 * rather than in a screenshot, and a commented-out declaration is not read as
 * live (whole-diff review round 2, second pass, 2C-R2-2).
 *
 * The pass is dark in both themes (spec §4.3 R7): everything inside it reads
 * the DARK runtime values, whatever the page theme.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { hexIn, requireRule } from "./_cssDecls";

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

/** A `--name-runtime` hex in a block's parsed declarations (tests/styles/_cssDecls.ts). */
function token(decls: Map<string, string>, name: string): string {
  return hexIn(decls, `${name}-runtime`);
}

const dark = requireRule(css, '[data-theme="dark"]');

/** WCAG 1.4.11 non-text floor. */
const GRAPHIC = 3;

describe("pass progress segments (X7, audit P3-1)", () => {
  // The inactive segment's border is what carries it: its fill
  // (`bg-border-strong`) sits near 1.3:1 on the pass. The pass's surface is
  // `surface-raised`, or `stale-tint` while a lastGood morph holds the body.
  const outline = token(dark, "--color-text-faint");
  for (const ground of ["--color-surface-raised", "--color-stale-tint"]) {
    it(`the inactive segment's text-faint border clears 3:1 on the pass's ${ground}`, () => {
      expect(contrast(outline, token(dark, ground))).toBeGreaterThanOrEqual(GRAPHIC);
    });
  }

  it("PREMISE: the inactive fill alone does not clear 3:1, so the border is load-bearing", () => {
    expect(
      contrast(token(dark, "--color-border-strong"), token(dark, "--color-surface-raised")),
    ).toBeLessThan(GRAPHIC);
  });
});

// The page's own light block (`:root {`), for pairings that live on the page.
const light = requireRule(css, ":root");
const MODES = [
  { name: "light", src: light },
  { name: "dark", src: dark },
] as const;

/** WCAG AA body text. */
const TEXT = 4.5;

describe("day row pressed state (X4, critique F6)", () => {
  // In dark, the pressed day's fill was the page's near-white text colour, the
  // brightest thing on the first screen, outshining the pass it selects. Its
  // own pair, `--color-day-pressed` / `-text`, keeps light mode's near-black
  // chip and quiets dark mode to the pass's own surface; the bright
  // `border-text` edge then carries the pressed state (DESIGN.md §1.1a).
  for (const mode of MODES) {
    const fill = token(mode.src, "--color-day-pressed");
    const text = token(mode.src, "--color-day-pressed-text");
    const edge = token(mode.src, "--color-text");
    const bg = token(mode.src, "--color-bg");

    it(`${mode.name}: the pressed day's text clears 4.5:1 on its fill`, () => {
      expect(contrast(text, fill)).toBeGreaterThanOrEqual(TEXT);
    });

    it(`${mode.name}: the pressed day's border-text edge clears 3:1 on the page`, () => {
      expect(contrast(edge, bg)).toBeGreaterThanOrEqual(GRAPHIC);
    });
  }

  // UI-gate re-run, critique N6: the pressed day carries a short accent bar, so
  // in dark, where the fills sit 1.06:1 apart, the selection has a cue beyond a
  // 1px edge.
  for (const mode of MODES) {
    it(`${mode.name}: the pressed day's accent bar clears 3:1 on the pressed fill`, () => {
      expect(
        contrast(token(mode.src, "--color-accent"), token(mode.src, "--color-day-pressed")),
      ).toBeGreaterThanOrEqual(GRAPHIC);
    });
  }

  it("light: the pressed fill is the near-black chip it was (the text colour)", () => {
    expect(token(light, "--color-day-pressed")).toBe(token(light, "--color-text"));
  });

  it("dark: the pressed fill is no brighter than the pass's surface, so the pass stays the focal point", () => {
    const pressed = relLuminance(token(dark, "--color-day-pressed"));
    expect(pressed).toBeLessThanOrEqual(relLuminance(token(dark, "--color-surface-raised")));
  });

  it("dark: with the fills close, the pressed edge alone separates pressed from unpressed by 3:1", () => {
    // Unpressed buttons carry `border-text-faint`; pressed ones `border-text`.
    expect(
      contrast(token(dark, "--color-text"), token(dark, "--color-text-faint")),
    ).toBeGreaterThanOrEqual(GRAPHIC);
    // PREMISE: the fill delta alone would not carry it.
    expect(
      contrast(token(dark, "--color-day-pressed"), token(dark, "--color-surface")),
    ).toBeLessThan(GRAPHIC);
  });
});

describe("pass edge on a dark page (X4, critique F6)", () => {
  // The pass's border is `--color-border-strong` resolved in the PAGE scope (on
  // the wrapper outside the pass's own dark scope, inherited by the card), so on
  // a dark page it stands one step above every tile's `--color-border` edge.
  it("dark: the pass edge stands out from the page more than a tile's border does", () => {
    const bg = token(dark, "--color-bg");
    expect(contrast(token(dark, "--color-border-strong"), bg)).toBeGreaterThan(
      contrast(token(dark, "--color-border"), bg),
    );
  });
});

describe("the token reader sees only live declarations (round 2, 2C-R2-2)", () => {
  it("a commented-out dark --color-surface-raised-runtime is not read", () => {
    const decl = dark.get("--color-surface-raised-runtime");
    // PREMISE: the live declaration is there to comment out.
    expect(decl).toMatch(/^#[0-9a-fA-F]{6}$/);
    const live = `  --color-surface-raised-runtime: ${decl};`;
    const at = css.indexOf('\n[data-theme="dark"] {\n');
    const offset = css.indexOf(live, at);
    expect(offset, "PREMISE: the dark block's line is found").toBeGreaterThan(at);
    const planted =
      css.slice(0, offset) + `  /* ${live.trim()} */` + css.slice(offset + live.length);
    expect(() =>
      token(requireRule(planted, '[data-theme="dark"]'), "--color-surface-raised"),
    ).toThrow(/--color-surface-raised-runtime not found/);
  });
});
