// M12.2 Phase A Task 1 — status-token contrast floors (DESIGN.md §1.3).
//
// Reads the LIVE runtime hex values out of app/globals.css and computes WCAG
// relative-luminance contrast (not a hardcoded snapshot), so the floors are
// pinned against the shipped tokens and any future drift fails here.
//
// Floors (DESIGN.md §1.2 / §1.3):
//   - status DOT (graphical object, WCAG 1.4.11): >= 3:1
//   - status -text (AA body text): >= 4.5:1
// asserted on BOTH --color-bg AND --color-surface, in BOTH light and dark.
//
// `live` reuses --color-accent and `idle` reuses --color-text-faint/-subtle
// (governed by the existing accent / neutral token rows, DESIGN.md §1.1/§1.2),
// so they are out of scope here — this test covers the NET-NEW positive /
// review / warn hues introduced by the amendment.
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
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Extract a `--token-runtime: #hex;` value from a specific selector block so
// light and dark are read from their own scopes (not the first match).
function tokenIn(block: string, token: string): string {
  const re = new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`);
  const m = block.match(re);
  if (!m || !m[1]) throw new Error(`token ${token} not found in block`);
  return m[1];
}

function block(selectorStart: string): string {
  const idx = css.indexOf(selectorStart);
  if (idx === -1) throw new Error(`selector ${selectorStart} not found`);
  const open = css.indexOf("{", idx);
  // Walk to the matching close brace.
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

// Light values live in the top-level `:root {` block; dark values in the
// `[data-theme="dark"] {` block (the explicit-toggle scope mirrors the
// prefers-color-scheme media block verbatim).
const lightBlock = block(":root {");
const darkBlock = block('[data-theme="dark"] {');

const MODES = [
  {
    name: "light",
    bg: tokenIn(lightBlock, "--color-bg-runtime"),
    surface: tokenIn(lightBlock, "--color-surface-runtime"),
    src: lightBlock,
  },
  {
    name: "dark",
    bg: tokenIn(darkBlock, "--color-bg-runtime"),
    surface: tokenIn(darkBlock, "--color-surface-runtime"),
    src: darkBlock,
  },
];

const DOT_FLOOR = 3;
const TEXT_FLOOR = 4.5;

describe("status-token contrast floors (DESIGN.md §1.3)", () => {
  for (const mode of MODES) {
    for (const hue of ["positive", "review", "warn"] as const) {
      const dot = tokenIn(mode.src, `--color-status-${hue}-runtime`);
      const text = tokenIn(mode.src, `--color-status-${hue}-text-runtime`);

      it(`${mode.name}: status-${hue} dot clears the >=3:1 graphical floor on bg and surface`, () => {
        expect(contrast(dot, mode.bg)).toBeGreaterThanOrEqual(DOT_FLOOR);
        expect(contrast(dot, mode.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
      });

      it(`${mode.name}: status-${hue}-text clears the >=4.5:1 AA body floor on bg and surface`, () => {
        expect(contrast(text, mode.bg)).toBeGreaterThanOrEqual(TEXT_FLOOR);
        expect(contrast(text, mode.surface)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      });
    }
  }

  it("positive hue is NOT green (color-blind floor §1) — it is a teal (blue ≈ green)", () => {
    // A green (e.g. the prototype's #2F7D4F) has blue well below green
    // (b/g ≈ 0.63). The calm teal we ship has blue nearly level with green
    // (b/g ≈ 0.95). Require b ≥ 0.85·g so a green value fails this guard.
    for (const mode of MODES) {
      const hex = tokenIn(mode.src, "--color-status-positive-runtime").replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      expect(b).toBeGreaterThanOrEqual(g * 0.85); // teal, not green
      expect(g).toBeGreaterThan(r); // blue-green family, not a warm hue
    }
  });
});
