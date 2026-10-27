/**
 * tests/styles/searchRevealCue.test.ts — the crew search reveal cue must be
 * findable (crew show search spec §6.6; impeccable gate finding A1).
 *
 * The cue was a warning-bg tint alone, easing out from the first frame: 1.10:1
 * against a light card at its peak and mostly gone by 600 ms, so a crew member
 * who tapped a result could land on the section without seeing which line it
 * meant. The repaired cue holds the tint at full strength for the first half of
 * its window and draws a 2px ring that clears the WCAG 1.4.11 non-text floor
 * (3:1) on every ground it touches, in both themes and in both motion modes.
 *
 * Every colour here is read from app/globals.css, from the token the rule
 * actually names, so a retune of the token or a swap of the token in the rule
 * moves the measurement with it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

const NON_TEXT_FLOOR = 3;

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

/** The `{...}` body that follows the first `head` at or after `from`. */
function blockAt(head: string, from = 0): { body: string; end: number } {
  const idx = css.indexOf(head, from);
  if (idx === -1) throw new Error(`${head} not found`);
  const open = css.indexOf("{", idx);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return { body: css.slice(open + 1, i), end: i + 1 };
    }
  }
  throw new Error(`unbalanced braces after ${head}`);
}

function runtimeHex(scope: string, token: string): string {
  const m = scope.match(new RegExp(`--color-${token}-runtime\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m?.[1]) throw new Error(`--color-${token}-runtime not found`);
  return m[1];
}

const MODES = [
  { name: "light", scope: blockAt(":root {").body },
  { name: "dark", scope: blockAt('[data-theme="dark"] {').body },
] as const;

/** Every `[data-search-reveal] {` rule body, with the at-rule it sits in (or ""). */
function revealRules(): { context: string; body: string }[] {
  const out: { context: string; body: string }[] = [];
  const re = /\[data-search-reveal\]\s*\{/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    const before = css.slice(0, m.index);
    const atIdx = before.lastIndexOf("@media");
    let context = "";
    if (atIdx !== -1) {
      const at = blockAt("@media", atIdx);
      if (at.end > m.index) context = css.slice(atIdx, css.indexOf("{", atIdx)).trim();
    }
    out.push({ context, body: blockAt("[data-search-reveal]", m.index).body });
  }
  return out;
}

/** The token a rule's outline names: `outline: 2px solid var(--color-<token>)`. */
function outlineToken(body: string): string | null {
  const m = body.match(/outline\s*:\s*2px\s+solid\s+var\(--color-([a-z-]+)\)/);
  return m?.[1] ?? null;
}

describe("crew search reveal cue (spec §6.6)", () => {
  const rules = revealRules();
  const base = rules.find((r) => r.context === "");
  const reduced = rules.find((r) => r.context.includes("prefers-reduced-motion: reduce"));

  it("has a base rule and a reduced-motion rule (premise)", () => {
    expect(base).toBeDefined();
    expect(reduced).toBeDefined();
  });

  // Round-2 gate R2-U1 / R2-A5: a radius on the cue replaced the line's own
  // corners (a 12px day card shrank to 6px for the window, then snapped back),
  // and an explicit transparent end frame faded a filled line to nothing before
  // its fill snapped back. The cue keeps the line's shape and fades to its fill.
  it("keeps the line's own corners in every motion mode", () => {
    for (const rule of [base, reduced]) {
      expect(rule).toBeDefined();
      expect(rule!.body).not.toMatch(/border-radius/);
    }
  });

  it("fades to the line's own fill, not to transparent", () => {
    const frames = blockAt("@keyframes search-reveal-flash").body;
    expect(frames).toMatch(/background-color\s*:\s*var\(--color-warning-bg\)/);
    expect(frames).not.toMatch(/transparent/);
    expect(frames).not.toMatch(/(^|[\s}])(to|100%)\s*\{/);
  });

  it("holds the tint at full strength through at least half the window", () => {
    const frames = blockAt("@keyframes search-reveal-flash").body;
    // Each keyframe selector list that sets the full warning-bg tint.
    const held = [...frames.matchAll(/([\d%,\s]+|from)\s*\{([^}]*)\}/g)]
      .filter(([, , decls]) => /background-color\s*:\s*var\(--color-warning-bg\)/.test(decls!))
      .flatMap(([, sel]) =>
        sel!
          .split(",")
          .map((s) => s.trim())
          .map((s) => (s === "from" ? 0 : Number.parseFloat(s))),
      );
    expect(held).toContain(0);
    expect(Math.max(...held)).toBeGreaterThanOrEqual(50);
  });

  for (const [label, pick] of [
    ["motion", () => base],
    ["reduced motion", () => reduced],
  ] as const) {
    for (const mode of MODES) {
      it(`${label}, ${mode.name}: a 2px ring clears 3:1 on every ground it touches`, () => {
        const rule = pick();
        expect(rule).toBeDefined();
        const token = outlineToken(rule!.body);
        expect(token).not.toBeNull();
        const ring = runtimeHex(mode.scope, token!);
        // Inside the ring: the tint at its peak. Outside it: the card surface,
        // a sunken plate, or the page ground.
        for (const ground of ["warning-bg", "surface", "surface-sunken", "bg"]) {
          expect(contrast(ring, runtimeHex(mode.scope, ground))).toBeGreaterThanOrEqual(
            NON_TEXT_FLOOR,
          );
        }
      });
    }
  }
});
