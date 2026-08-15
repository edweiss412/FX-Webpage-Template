import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SECONDARY_ACTION_CLASS } from "@/lib/ui/actionClass";

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
// Same block-scoped extraction pattern as tests/styles/status-token-contrast.test.ts:
// light values from :root, dark from the [data-theme="dark"] block.
function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}-runtime:\\s*(#[0-9a-fA-F]{6})`));
  if (!m || !m[1]) throw new Error(`token ${name} not found`);
  return m[1];
}
// Line-anchored regex anchors (plan R8 F1: bare indexOf hits a comment at css line 43 and the
// @theme alias block, leaving the dark block without runtime tokens; probed against live CSS:
// light #8b8c92/#ffffff/#f4f3f1/#fafaf9, dark #74736d/#16171c/#0b0c10/#0f1014 all resolve).
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

describe("secondary action outline (spec §3, DESIGN §1.2a control-outline rule)", () => {
  it("premise: the constant actually wears the token the ratios pin", () => {
    expect(SECONDARY_ACTION_CLASS).toContain("border-text-faint");
    expect(SECONDARY_ACTION_CLASS).not.toContain("border-border-strong");
  });
  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: text-faint clears 3:1 on surface, surface-sunken, and bg", (_mode, block) => {
    const faint = tokenIn(block, "--color-text-faint");
    for (const ground of ["--color-surface", "--color-surface-sunken", "--color-bg"]) {
      expect(contrast(faint, tokenIn(block, ground))).toBeGreaterThanOrEqual(3.0);
    }
  });
});
