// The saved-copy bar's text pairs (spec 2026-10-26 §4.7.2 "Accessibility";
// DESIGN.md §1.2).
//
// Two halves. The COMPUTED half reads the live hex values out of
// app/globals.css, the way tests/styles/status-token-contrast.test.ts does, and
// asserts each pair the bar paints clears the 4.5:1 AA body floor in both
// themes: a regression pin, since the pairs passed before the bar existed. The
// DOCUMENTED half requires DESIGN.md §1.2 to carry exactly one row per pair
// whose stated light and dark ratios are each within 0.05 of the computed ones,
// so the contrast record cannot drift from the tokens without failing here.
//
// The bar's four pairs, by state (lib/offline/barState.ts): text on info-bg
// (saved-fresh, updating), text on stale-tint (saved-old, ended), warning-text
// on warning-bg (sheet-gone, sheet-gone-saved), status-positive-text on
// surface (updated). The info and stale tones set no text colour, so their
// text is the inherited `--color-text` (app/globals.css, the `html` rule).
//
// Two more figures this pass corrected are pinned the same way: the "on bg"
// half of the old "status-positive-text on bg/surface" row, and the
// warning-text token row in §1.1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "@/tests/_shared/premise";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const design = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8");

const TEXT_FLOOR = 4.5;
const TOLERANCE = 0.05;

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

/** The brace-balanced body of the first block that starts with `selectorStart`. */
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

// Light values live in the top-level `:root {` block, dark values in the
// explicit `[data-theme="dark"] {` block, which mirrors the media block.
const THEMES = { light: block(":root {"), dark: block('[data-theme="dark"] {') } as const;
type Theme = keyof typeof THEMES;

/** A `--token-runtime: #rrggbb;` value, or null when the theme does not declare one. */
function runtimeHex(theme: Theme, token: string): string | null {
  const match = THEMES[theme].match(new RegExp(`${token}-runtime\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  return match?.[1] ?? null;
}

type Pair = { label: string; text: string; ground: string };

const pairLabel = (text: string, ground: string) => `\`${text}\` on \`${ground}\``;
const pair = (text: string, ground: string): Pair => ({
  label: pairLabel(text, ground),
  text,
  ground,
});

const BAR_PAIRS: readonly Pair[] = [
  pair("--color-text", "--color-info-bg"),
  pair("--color-text", "--color-stale-tint"),
  pair("--color-warning-text", "--color-warning-bg"),
  pair("--color-status-positive-text", "--color-surface"),
];

/** Corrected alongside the bar pairs; documented-figure pin only. */
const CORRECTED_PAIRS: readonly Pair[] = [pair("--color-status-positive-text", "--color-bg")];

const THEME_NAMES = Object.keys(THEMES) as Theme[];

function computed(p: Pair, theme: Theme): number {
  const text = runtimeHex(theme, p.text);
  const ground = runtimeHex(theme, p.ground);
  if (text === null || ground === null) throw new Error(`${p.label}: ${theme} hex missing`);
  return contrast(text, ground);
}

/** The §1.2 table, one entry per row: the pair cell and the two ratio cells, trimmed. */
function contrastSummaryRows(): Array<{ pair: string; light: string; dark: string }> {
  const start = design.indexOf("### 1.2 Contrast summary");
  const end = design.indexOf("\n### ", start + 1);
  premiseHolds(
    "DESIGN.md still has a §1.2 that ends at a later heading",
    start >= 0 && end > start,
  );
  return design
    .slice(start, end)
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"))
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .map((cells) => ({ pair: cells[1] ?? "", light: cells[2] ?? "", dark: cells[3] ?? "" }));
}

/** `14.8:1` to 14.8; anything else (a range, a `min`, a blank) is not a single figure. */
function ratio(cell: string): number | null {
  const match = /^(\d+(?:\.\d+)?):1$/.exec(cell);
  return match ? parseFloat(match[1]!) : null;
}

describe("saved-copy bar text contrast", () => {
  it("every token the pairs name parsed as a hex value in both themes", () => {
    const tokens = new Set([...BAR_PAIRS, ...CORRECTED_PAIRS].flatMap((p) => [p.text, p.ground]));
    const parsed = THEME_NAMES.flatMap((theme) =>
      [...tokens].map((token) => runtimeHex(theme, token)),
    ).filter((hex) => hex !== null);
    premise("the pairs name more than one token", tokens.size, 1);
    expect(parsed).toHaveLength(tokens.size * THEME_NAMES.length);
  });

  for (const p of BAR_PAIRS) {
    for (const theme of THEME_NAMES) {
      it(`${theme}: ${p.label} clears the ${TEXT_FLOOR}:1 AA body floor`, () => {
        expect(computed(p, theme)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      });
    }
  }
});

describe("DESIGN.md §1.2 records each pair at its computed ratio", () => {
  const rows = contrastSummaryRows();

  it("the §1.2 table parsed into a real population", () => {
    premise("§1.2 holds more than ten rows", rows.length, 10);
  });

  for (const p of [...BAR_PAIRS, ...CORRECTED_PAIRS]) {
    it(`${p.label}: one row, light and dark within ${TOLERANCE} of computed`, () => {
      const matching = rows.filter((row) => row.pair === p.label);
      expect(matching, `§1.2 rows for ${p.label}`).toHaveLength(1);
      const row = matching[0]!;
      const light = ratio(row.light);
      const dark = ratio(row.dark);
      expect(light, `${p.label} light cell "${row.light}"`).not.toBeNull();
      expect(dark, `${p.label} dark cell "${row.dark}"`).not.toBeNull();
      expect(Math.abs(light! - computed(p, "light"))).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(dark! - computed(p, "dark"))).toBeLessThanOrEqual(TOLERANCE);
    });
  }

  it("no §1.2 row still claims one figure for status-positive-text on bg and surface together", () => {
    expect(rows.filter((row) => row.pair.includes("status-positive-text` on bg/surface"))).toEqual(
      [],
    );
  });
});

describe("DESIGN.md §1.1 warning-text token row", () => {
  it("states the computed warning-text on warning-bg figures", () => {
    const rows = design
      .split("\n")
      .filter((line) => /^\|\s*`--color-warning-text`\s*\|/.test(line));
    expect(rows).toHaveLength(1);
    const match = /Light ([\d.]+):1, dark ([\d.]+):1/.exec(rows[0]!);
    expect(match, rows[0]).not.toBeNull();
    const warning = BAR_PAIRS.find((p) => p.text === "--color-warning-text")!;
    expect(Math.abs(parseFloat(match![1]!) - computed(warning, "light"))).toBeLessThanOrEqual(
      TOLERANCE,
    );
    expect(Math.abs(parseFloat(match![2]!) - computed(warning, "dark"))).toBeLessThanOrEqual(
      TOLERANCE,
    );
  });
});
