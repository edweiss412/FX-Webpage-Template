/**
 * Focus-ring contrast meta-test (spec 2026-08-01-focus-ring-a11y-pass §3).
 *
 * Three oracles over app/globals.css, computed from the LIVE file (never
 * hardcoded ratios — anti-tautology):
 *  1. Ratification pin: the light --color-focus-ring-runtime is exactly
 *     #E06000 (opaque, owner-ratified Option B).
 *  2. Dark-pair identity: the media-query dark declaration and the explicit
 *     data-theme dark declaration are byte-identical.
 *  3. Matrix floor: ring vs every FOCUS_BACKDROP_ALLOWLIST family >= 3.0 in
 *     both modes (dark side alpha-composited), plus per-token dark-pair
 *     backdrop identity across the two dark blocks.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOCUS_BACKDROP_ALLOWLIST } from "./_focusBackdropAllowlist";

const css = readFileSync("app/globals.css", "utf8");

function channel(hexPair: string): number {
  const v = parseInt(hexPair, 16) / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relLuminance(hex: string): number {
  const h = hex.replace("#", "");
  return 0.2126 * channel(h.slice(0, 2)) + 0.7152 * channel(h.slice(2, 4)) + 0.0722 * channel(h.slice(4, 6));
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function blend(fg: string, alpha: number, bg: string): string {
  const f = fg.replace("#", "");
  const g = bg.replace("#", "");
  const mix = (i: number): string =>
    Math.round(parseInt(f.slice(i, i + 2), 16) * alpha + parseInt(g.slice(i, i + 2), 16) * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}
function blockOf(selector: RegExp): string {
  // Line-start-anchored regex so a selector string appearing in a COMMENT
  // never matches (globals.css:45 mentions [data-theme="dark"] in prose).
  const m = selector.exec(css);
  if (m === null) throw new Error(`selector not found: ${String(selector)}`);
  const start = m.index;
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`unclosed block: ${String(selector)}`);
}
function tokenIn(block: string, token: string): string {
  const m = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
  if (m === null || m[1] === undefined) throw new Error(`token not found: ${token}`);
  return m[1];
}

const lightBlock = blockOf(/^:root \{/m);
const explicitDark = blockOf(/^\[data-theme="dark"\]\s*\{/m);
const mediaDark = blockOf(/^@media \(prefers-color-scheme: dark\)/m);

const ringDecls = [...css.matchAll(/--color-focus-ring-runtime:\s*([^;]+);/g)].map((m) =>
  (m[1] ?? "").trim(),
);
const darkRing = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(ringDecls[1] ?? "");

describe("focus ring contrast (spec 2026-08-01 §3)", () => {
  it("three declarations: light pin + identical dark pair", () => {
    expect(ringDecls).toHaveLength(3);
    expect(ringDecls[0]?.toUpperCase()).toBe("#E06000"); // oracle 1: ratification pin
    expect(ringDecls[1]).toBe(ringDecls[2]); // oracle 2: dark-pair identity
  });
  for (const token of FOCUS_BACKDROP_ALLOWLIST) {
    it(`ring >= 3.0 on --color-${token} in both modes (both dark blocks)`, () => {
      const light = tokenIn(lightBlock, `--color-${token}-runtime`);
      const darkA = tokenIn(explicitDark, `--color-${token}-runtime`);
      const darkB = tokenIn(mediaDark, `--color-${token}-runtime`);
      expect(darkA).toBe(darkB); // backdrop dark-pair identity
      expect(contrast("#E06000", light)).toBeGreaterThanOrEqual(3.0); // oracle 3, light
      if (darkRing === null) throw new Error("dark ring is not rgba()");
      const hex =
        "#" +
        [darkRing[1], darkRing[2], darkRing[3]]
          .map((c) => Number(c ?? "0").toString(16).padStart(2, "0"))
          .join("");
      expect(contrast(blend(hex, Number(darkRing[4] ?? "1"), darkA), darkA)).toBeGreaterThanOrEqual(3.0);
    });
  }
});
