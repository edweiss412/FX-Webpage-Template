/**
 * The nested dark scope re-binds every runtime-backed theme token (crew page
 * redesign spec §4.3 "Color", R7; plan Task 9).
 *
 * The pass is dark in both themes by carrying `data-theme="dark"` on its own
 * subtree. That only works because app/globals.css re-binds each `@theme` token
 * whose value is `var(--…-runtime)` under `:root [data-theme="dark"]`: the
 * `@theme` declarations sit on `:root`, so without the re-binding a utility
 * under the scope resolves the page's colour, not the scope's (the browser case
 * "pass: the surface is dark in both themes" measures exactly that).
 *
 * The list is DERIVED from `@theme`, never enumerated here: a token added there
 * without its re-binding fails the first case, and the planted copies below
 * prove the scan can fail in both directions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const NESTED_SELECTOR = ':root [data-theme="dark"]';

/** `--name: var(--name-runtime);` pairs inside one block body. */
function runtimeBindings(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/^\s*(--[a-z0-9-]+):\s*var\((--[a-z0-9-]+-runtime)\);/gm)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/** The body of the first block whose selector line is exactly `selector {`. */
function blockBody(css: string, selector: string): string | null {
  const open = css.indexOf(`\n${selector} {\n`);
  if (open === -1) return null;
  const start = open + selector.length + 4;
  const end = css.indexOf("\n}\n", start);
  return end === -1 ? null : css.slice(start, end);
}

/** Every runtime-backed `@theme` token missing (or mis-bound) in the nested scope. */
function missingRebindings(css: string): string[] {
  const theme = blockBody(css, "@theme");
  const nested = blockBody(css, NESTED_SELECTOR);
  if (theme === null) return ["@theme block not found"];
  if (nested === null) return [`${NESTED_SELECTOR} block not found`];
  const want = runtimeBindings(theme);
  const have = runtimeBindings(nested);
  return [...want].filter(([token, runtime]) => have.get(token) !== runtime).map(([t]) => t);
}

describe("nested dark scope", () => {
  it("re-binds every runtime-backed @theme token under :root [data-theme=dark]", () => {
    const theme = runtimeBindings(blockBody(CSS, "@theme") ?? "");
    // PREMISE: the scan sees the token set, not an empty block.
    expect(theme.size).toBeGreaterThanOrEqual(30);
    expect(theme.get("--color-surface-raised")).toBe("--color-surface-raised-runtime");
    expect(missingRebindings(CSS)).toEqual([]);
  });

  it("re-binds nothing @theme does not declare", () => {
    const theme = runtimeBindings(blockBody(CSS, "@theme") ?? "");
    const nested = runtimeBindings(blockBody(CSS, NESTED_SELECTOR) ?? "");
    expect([...nested.keys()].filter((t) => !theme.has(t))).toEqual([]);
  });

  it("the scan fails on a planted copy missing one row, and on one with no block", () => {
    // Drop the NESTED block's row (the first textual match is the @theme one).
    const nestedStart = CSS.indexOf(`\n${NESTED_SELECTOR} {\n`);
    const row = "  --color-surface-raised: var(--color-surface-raised-runtime);\n";
    const planted = CSS.slice(0, nestedStart) + CSS.slice(nestedStart).replace(row, "");
    expect(planted).not.toBe(CSS);
    expect(missingRebindings(planted)).toEqual(["--color-surface-raised"]);
    expect(missingRebindings(CSS.replace(`\n${NESTED_SELECTOR} {\n`, "\n.elsewhere {\n"))).toEqual([
      `${NESTED_SELECTOR} block not found`,
    ]);
  });
});
