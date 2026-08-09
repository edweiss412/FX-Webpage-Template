// The canonicalization changed no VALUE — asserted deterministically.
//
// Spec: docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §6, §9.4
// Plan: docs/superpowers/plans/2026-08-07-classname-array-join-cn.md, Task 6
//
// Stage 2 rewrites six class tokens. Four are shorthands whose equivalence is a Tailwind
// fact (`size-*` sets height and width; `text-<size>/<leading>` sets font-size and
// line-height). The other two substitute a CANONICAL UTILITY for a bracket/arrow form, and
// those are the ones that could in principle resolve differently:
//
//   C1  `max-w-[60px]`                       -> `max-w-confirm-box`
//   C5  `min-h-(--spacing-right-now-min-h)`  -> `min-h-right-now-min-h`
//
// The risk is a TOKEN question, not a timing or layout question: does the utility resolve
// to the value the form it replaced encoded? So it is answered here — no browser, no
// clock, no flake — rather than in the e2e dimension spec.
//
// THIS IS THE DISCRIMINATING PROOF FOR C1, not a redundant second opinion. Measured
// 2026-08-08, the step-indicator connector is 0x1 at every viewport: StepIndicator's
// <nav> is a content-sized flex item inside a row flex container, so its `flex-1`
// connectors receive no free space and `max-w` never applies. The e2e spec keeps those
// two keys as a regression tripwire and says so explicitly; the assertion that actually
// discriminates a wrong `--spacing-confirm-box` is the one below.
//
// It replaces the mid-crossfade sampler the plan descoped for the same reason: three
// consecutive review rounds on that sampler were all about driving framer-motion
// deterministically, and none of them was about the canonicalization.
//
// AUTHORED GREEN, DELIBERATELY, AND THAT IS DECLARED. Both facts are already true at
// base, so this is a PIN rather than Task 6's red (`pnpm lint` is). Its discriminating
// power was observed once at authoring by editing the `60px` literal, watching this fail,
// and reverting — recorded in the task log rather than asserted here.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripCssComments } from "../_shared/stripComments";

const GLOBALS = path.join(process.cwd(), "app/globals.css");

/**
 * Every ACTIVE `--<name>: <value>;` declaration inside an `@theme` block, in source order.
 *
 * Two things this must not do, both probed as real holes in an earlier draft:
 *
 *  - **Read commented-out declarations.** A raw regex happily matched a token inside a
 *    `/* ... *\/` block, so a file whose ONLY matching declarations were commented out
 *    still reported `["60px"]` and passed. Comments are stripped first, by the
 *    single-source `stripCssComments` (blanks them, preserving offsets).
 *  - **Read declarations outside `@theme`.** Tailwind v4 only exposes `@theme` tokens as
 *    utilities, so a `:root` declaration of the same name proves nothing about what
 *    `max-w-confirm-box` resolves to. Only `@theme` blocks are scanned.
 */
function declarationsOf(css: string, token: string): string[] {
  const active = stripCssComments(css);
  const pattern = new RegExp(`^\\s*${token.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`, "gm");
  return themeBlocks(active).flatMap((block) =>
    [...block.matchAll(pattern)].map((m) => (m[1] ?? "").trim()),
  );
}

/** The text inside each top-level `@theme { ... }` block, brace-matched. */
function themeBlocks(css: string): string[] {
  const out: string[] = [];
  const re = /@theme[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
    }
    out.push(css.slice(start, i - 1));
    re.lastIndex = i;
  }
  return out;
}

describe("canonicalized utilities resolve to the values they replaced (spec §6)", () => {
  const css = readFileSync(GLOBALS, "utf8");

  // Premise: the file was read and holds `@theme` tokens at all. A path that silently
  // resolved to an empty string would make every "defined exactly once" assertion below
  // report a count of 0 and fail — but it would fail for the wrong reason, so this says
  // which reason it is.
  it("premise: app/globals.css was read and carries @theme spacing tokens", () => {
    expect(css.length, `${GLOBALS} is empty or unreadable`).toBeGreaterThan(0);
    expect(css).toContain("--spacing-");
    // And the @theme scoping actually finds blocks — otherwise every assertion below would
    // read an empty set and "defined exactly once" would fail for the wrong reason.
    expect(themeBlocks(stripCssComments(css)).length, "no @theme block found").toBeGreaterThan(0);
  });

  it("C1: --spacing-confirm-box is exactly the 60px `max-w-[60px]` encoded", () => {
    const values = declarationsOf(css, "--spacing-confirm-box");
    // Defined exactly once: two definitions would make "the value" depend on cascade
    // order, and this assertion would be reading whichever one it happened to match.
    expect(
      values,
      "`max-w-confirm-box` replaced the bracket literal `max-w-[60px]` on the wizard's " +
        "step-indicator connector. If this token is not exactly 60px, that substitution " +
        "changed a computed max-width and spec §6 C1's equivalence claim is false.",
    ).toEqual(["60px"]);
  });

  it("C5: --spacing-right-now-min-h is defined once — the single token BOTH spellings reference", () => {
    const values = declarationsOf(css, "--spacing-right-now-min-h");
    expect(
      values.length,
      "`min-h-(--spacing-right-now-min-h)` and `min-h-right-now-min-h` are two spellings of " +
        "the SAME token, which is what makes C5 an identity. Two definitions would mean the " +
        "arrow form and the utility could resolve to different values.",
    ).toBe(1);
    // The RightNowHero 176px card height is a ratified invariant (app/globals.css §
    // "right-now" block), so the value is pinned too, not just the cardinality.
    expect(values).toEqual(["176px"]);
  });
});
