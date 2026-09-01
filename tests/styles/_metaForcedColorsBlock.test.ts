/**
 * AC-8: every rule the forced-colors pass adds is UNLAYERED, and there is exactly
 * ONE forced-colors block.
 *
 * WHY BOTH, AND WHY COMPILED CSS. Placing the block correctly is not verifying it,
 * and the failure mode is silent: a rule inside a cascade layer loses to the
 * unlayered `:focus-visible` rule at `app/globals.css:899` and renders exactly like
 * a rule that is not there. The probe's cascade table measured that directly — a
 * candidate inside `@layer base` and one inside `@layer utilities` both lost, while
 * the unlayered one won.
 *
 * The single-block half is separate and was added because the first version of this
 * guard did not have it: checking that forced-colors rules are unlayered says
 * nothing about how MANY such blocks exist, so a contributor could add a second one
 * anywhere in the file and every assertion here would stay green while the pattern
 * lived in two places. Plan review R4 named it.
 *
 * Compiled rather than source, because the question is what reaches the DOM: a
 * layer wrapper in a nested import, or a `@source not` exclusion, changes the
 * answer and only the compiler knows.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

/** Same shape as `tests/styles/_metaZIndexBands.test.ts:156`, and for its reason. */
function compileApp(): string {
  const dir = mkdtempSync(join(tmpdir(), "forced-colors-block-"));
  try {
    const out = join(dir, "out.css");
    // No --content: `@import "tailwindcss"` auto-detects sources and honours the
    // `@source not` exclusions, and that detection IS the authority on what
    // reaches the DOM.
    execFileSync("pnpm", ["exec", "tailwindcss", "-i", "app/globals.css", "-o", out], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return readFileSync(out, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CSS = compileApp();

premise("the app compiled to real CSS", CSS.length, 5000);

type AtRule = postcss.AtRule;

const isForcedColors = (node: postcss.Node): node is AtRule =>
  node.type === "atrule" &&
  (node as AtRule).name === "media" &&
  /forced-colors/.test((node as AtRule).params);

describe("the forced-colors block", () => {
  const root = postcss.parse(CSS);
  const blocks: AtRule[] = [];
  root.walkAtRules("media", (at) => {
    if (isForcedColors(at)) blocks.push(at);
  });

  it("exists in the compiled output", () => {
    // Without this the two cases below are vacuously true on a stylesheet that
    // never shipped the pass at all.
    expect(blocks.length, "no forced-colors block reached the compiled CSS").toBeGreaterThan(0);
  });

  it("is exactly one block", () => {
    expect(
      blocks.map((b) => b.params),
      "the pattern must live in one place; a second block splits it in two",
    ).toHaveLength(1);
  });

  it("is unlayered, so it can actually win", () => {
    const layered: string[] = [];
    for (const block of blocks) {
      // Walked as a loose node rather than through postcss's container union: a
      // Document_ can appear in the parent chain and does not satisfy
      // ContainerWithChildren under exactOptionalPropertyTypes.
      type Ancestor = { type: string; name?: string; params?: string; parent?: Ancestor };
      for (
        let parent = (block as unknown as Ancestor).parent;
        parent !== undefined;
        parent = parent.parent
      ) {
        if (parent.type === "atrule" && parent.name === "layer") {
          layered.push(`@layer ${parent.params ?? ""} > ${block.params}`);
        }
      }
    }
    expect(
      layered,
      "a layered forced-colors rule loses to the unlayered :focus-visible rule and renders as if absent",
    ).toEqual([]);
  });

  it("carries rules, not just a comment", () => {
    // A block that compiled to nothing satisfies "unlayered" trivially.
    const ruleCount = blocks.reduce((n, block) => {
      let count = 0;
      block.walkRules(() => {
        count += 1;
      });
      return n + count;
    }, 0);
    premise("the block carries repair rules", ruleCount, 3);
  });
});
