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
   * The TINTED plates, and why `--color-text-faint` is no longer painted on one.
   *
   * These six figures are the EVIDENCE, kept exactly as measured: against a
   * `warning-bg` / `info-bg` / `danger-bg` card, the shared outline token's
   * outer edge lands at 2.79-2.88:1 in one theme each, under the 3:1 non-text
   * floor. `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` filed the design question and
   * the 2026-08-25 sweep answered it (design doc
   * 2026-08-25-ui-polish-class-sweep-design.md, D2): a plate-only second token,
   * pinned in the block below, rather than retuning this one.
   *
   * So these rows now record WHY the second token exists rather than a shipped
   * boundary — no control paints `border-text-faint` on a tinted plate any more
   * (`tests/styles/tintedPlateOutline.test.ts` is what holds that). They still
   * fail loudly if the shared token or a plate is retuned, which is what keeps
   * the design doc's arithmetic and the stylesheet moving together.
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
   * The plate-only outline token (design doc 2026-08-25, D2).
   *
   * THREE RELATIONS, not six constants. A constant goes stale the moment any of
   * the four tokens involved is retuned, and a reader then has to re-derive
   * whether the pair still reads correctly; a relation fails at exactly the
   * moment a retune breaks it and stays quiet when it is harmless. This is the
   * same posture the sixteen hover comparisons below take, for the same reason.
   *
   * The third relation is the one that is easy to forget. §1.2a requires hover
   * to stay HEAVIER than rest, and raising a resting outline is precisely how
   * that pair gets inverted: `--color-text-subtle` is the hover outline where
   * the border is the only cue, so a tinted resting token that crept past it
   * would make a control read FAINTER on hover than at rest, on the plates
   * where it is hardest to notice.
   */
  const TINTED_PLATES = ["--color-warning-bg", "--color-info-bg", "--color-danger-bg"] as const;

  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: the tinted-plate outline clears 3:1 on every tinted plate", (_mode, block) => {
    const tinted = tokenIn(block, "--color-control-outline-tinted");
    for (const plate of TINTED_PLATES) {
      expect(contrast(tinted, tokenIn(block, plate))).toBeGreaterThanOrEqual(3.0);
    }
  });

  /**
   * The plate token against `--color-bg`, added 2026-08-26.
   *
   * `components/admin/MaintenanceResetButtons.tsx`'s reset-confirm field stands
   * on a `warning-bg` plate and carries its OWN `bg-bg` fill, so its OUTER edge
   * is the plate (already pinned above) and its INNER edge is this pair, which
   * nothing pinned before. Kept as a relation rather than a constant, like every
   * row in this file: a retune fails at the moment it inverts a pair and stays
   * quiet when it is harmless.
   */
  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: the tinted-plate outline clears 3:1 against --color-bg (inner edge)", (_mode, block) => {
    const tinted = tokenIn(block, "--color-control-outline-tinted");
    expect(contrast(tinted, tokenIn(block, "--color-bg"))).toBeGreaterThanOrEqual(3.0);
  });

  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: it is HEAVIER than the shared outline on every tinted plate", (_mode, block) => {
    const tinted = tokenIn(block, "--color-control-outline-tinted");
    const faint = tokenIn(block, "--color-text-faint");
    for (const plate of TINTED_PLATES) {
      const ground = tokenIn(block, plate);
      // Strictly heavier: equal would mean the second token bought nothing.
      expect(contrast(tinted, ground)).toBeGreaterThan(contrast(faint, ground));
    }
  });

  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: it stays LIGHTER than the hover outline, so hover still strengthens", (_mode, block) => {
    const tinted = tokenIn(block, "--color-control-outline-tinted");
    const subtle = tokenIn(block, "--color-text-subtle");
    for (const plate of TINTED_PLATES) {
      const ground = tokenIn(block, plate);
      expect(contrast(tinted, ground)).toBeLessThan(contrast(subtle, ground));
    }
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

/**
 * The 2026-08-18 arc's three OUTLINE rows, and the two RELATIONS that are the
 * actual guard.
 *
 * `--color-border` is the before-state this arc moves away from: pinning it
 * means a future retune cannot quietly reintroduce the weight that was removed.
 * `--color-text-subtle` and `--color-accent-on-bg` are existing tokens used as
 * a control OUTLINE for the first time by §3.6's hover repair — new roles for
 * old tokens, which the pre-code rule treats exactly like new tokens.
 *
 * THE RELATIONS ARE NOT THIS ARC'S RED. All sixteen already hold against
 * today's tokens, so they ship GREEN as a regression pin. Saying otherwise
 * would mislabel which assertion is load-bearing, and mislabelling a red is how
 * a tautological one gets shipped (plan review R5 F4, R6 F3).
 *
 * Sixteen, not eight: §3.6 introduces TWO hover tokens, so there are two pairs
 * over four grounds in both themes.
 */
const NEUTRAL_GROUNDS = [
  "--color-bg",
  "--color-surface",
  "--color-surface-raised",
  "--color-surface-sunken",
] as const;

describe("outline tokens the 2026-08-18 arc pins (DESIGN §1.2)", () => {
  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])(
    "%s: --color-border as an OUTLINE is recorded below the floor on every ground",
    (_m, block) => {
      const border = tokenIn(block, "--color-border");
      for (const ground of NEUTRAL_GROUNDS) {
        const ratio = contrast(border, tokenIn(block, ground));
        // Recorded, not required to clear 3:1 — this is the before-state.
        expect(ratio).toBeLessThan(3.0);
        expect(ratio).toBeGreaterThan(1.0);
      }
    },
  );

  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: the two hover tokens clear 3:1 as OUTLINES on every ground", (_m, block) => {
    for (const token of ["--color-text-subtle", "--color-accent-on-bg"] as const) {
      for (const ground of NEUTRAL_GROUNDS) {
        expect(contrast(tokenIn(block, token), tokenIn(block, ground))).toBeGreaterThanOrEqual(3.0);
      }
    }
  });

  /**
   * The guard that generalises: assert the RELATION, computed from the tokens,
   * rather than sixteen constants.
   *
   * Constants go stale the moment any of the three tokens is retuned and force
   * a reviewer to re-derive whether each pair still reads correctly. A relation
   * fails loudly at exactly the moment a retune inverts a pair and stays silent
   * when the retune is harmless. `DESIGN.md` §1.2 keeps the absolute figures for
   * the record; this is what stops them drifting apart.
   */
  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: every hover outline is HEAVIER than the resting outline it replaces", (_m, block) => {
    const rest = tokenIn(block, "--color-text-faint");
    for (const hover of ["--color-text-subtle", "--color-accent-on-bg"] as const) {
      for (const ground of NEUTRAL_GROUNDS) {
        const g = tokenIn(block, ground);
        expect(contrast(tokenIn(block, hover), g)).toBeGreaterThan(contrast(rest, g));
      }
    }
  });
});
