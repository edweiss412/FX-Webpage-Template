import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
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
  ])("%s: text-faint clears 3:1 on every NEUTRAL ground DESIGN §1.2 pins", (_mode, block) => {
    const faint = tokenIn(block, "--color-text-faint");
    // `surface-raised` was missing here while DESIGN §1.2 carried its row, so
    // the document claimed a pin the suite did not make (whole-diff R1 F1).
    for (const ground of [
      "--color-surface",
      "--color-surface-sunken",
      "--color-bg",
      "--color-surface-raised",
    ]) {
      expect(contrast(faint, tokenIn(block, ground))).toBeGreaterThanOrEqual(3.0);
    }
  });

  /**
   * The TINTED plates, recorded rather than claimed.
   *
   * Ten shipped controls stand on a `warning-bg` / `info-bg` / `danger-bg`
   * card, and against those the outline's OUTER edge measures 2.79-2.88:1 in
   * one theme each — under 3:1. DESIGN §1.2a states that position and files the
   * design question as `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`; this case exists
   * so the numbers cannot drift silently in either direction. A token change
   * that lifts a plate over 3:1 fails here too, which is the point: the
   * document and the stylesheet move together.
   */
  it.each([
    ["light", "--color-warning-bg", 3.04],
    ["dark", "--color-warning-bg", 2.79],
    ["light", "--color-info-bg", 2.87],
    ["dark", "--color-info-bg", 3.48],
    ["light", "--color-danger-bg", 2.88],
    ["dark", "--color-danger-bg", 3.19],
  ])("%s: text-faint vs %s is the recorded %s:1", (mode, ground, expected) => {
    const block = mode === "light" ? lightBlock : darkBlock;
    const measured = contrast(
      tokenIn(block, "--color-text-faint"),
      tokenIn(block, ground as string),
    );
    expect(measured).toBeCloseTo(expected as number, 2);
  });

  /**
   * The ratios above are about a token. This is about whether the BUTTON can
   * ever wear it.
   *
   * `app/globals.css` excludes `lib/` from Tailwind's source detection, and
   * this constant is the one runtime class string that lives there. Every
   * other class in it happened to be worn by markup under `app/`/`components/`,
   * so the exclusion never bit — until the outline moved to
   * `border-text-faint`, which no scanned file wore at the time: Tailwind
   * emitted no rule, `border-color` fell back to `currentColor`, and the button
   * drew a near-black outline. Every assertion above stayed green, because a
   * token's contrast says nothing about whether a utility exists.
   *
   * That specific hole is closed twice over now — the same branch put
   * `border-text-faint` on 31 scanned sites, so `@source inline(...)` no longer
   * carries it alone. The RATIONALE is therefore historical and the GUARANTEE
   * is not: the next class added to this constant will be the one no scanned
   * file wears, and it is checked below the moment it is added.
   *
   * The subject here is therefore the COMPILED stylesheet, and the expectation
   * is DERIVED from the constant rather than enumerated: a class added to
   * `SECONDARY_ACTION_CLASS` tomorrow is checked by this test today.
   */
  const compiledClasses = (() => {
    let cache: Set<string> | null = null;
    return (): Set<string> => {
      if (cache) return cache;
      const dir = mkdtempSync(join(tmpdir(), "secondary-action-css-"));
      try {
        const out = join(dir, "out.css");
        // No --content: `@import "tailwindcss"` auto-detects sources from the
        // CSS file's project, honouring the `@source` rules in globals.css.
        // That detection IS the authority on what reaches the DOM.
        try {
          execFileSync("pnpm", ["exec", "tailwindcss", "-i", "app/globals.css", "-o", out], {
            cwd: process.cwd(),
            stdio: "pipe",
          });
        } catch (e) {
          // Without this, a compile failure reaches the reader as a bare
          // "Command failed" and the actual CSS error is discarded with stderr.
          const err = e as { stderr?: Buffer | string; message?: string };
          const detail = err.stderr ? String(err.stderr) : (err.message ?? String(e));
          throw new Error(`tailwindcss failed to compile app/globals.css:\n${detail}`);
        }
        const css = readFileSync(out, "utf8");
        const classes = new Set<string>();
        for (const m of css.matchAll(/\.((?:[^.\s,{>+~\\]|\\.)+)/g)) {
          classes.add(m[1]!.replace(/\\(.)/g, "$1"));
        }
        cache = classes;
        return cache;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
  })();

  it("every class in the constant actually compiles to a rule", () => {
    const classes = compiledClasses();
    premise("the app compiled to real utilities", classes.size, 500);
    const tokens = SECONDARY_ACTION_CLASS.split(/\s+/).filter((t) => t.length > 0);
    premise("the constant carries utilities to check", tokens.length, 5);
    expect(tokens.filter((token) => !classes.has(token))).toEqual([]);
  }, 120_000);
});
