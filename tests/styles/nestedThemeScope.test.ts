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

import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { ruleDecls, themeBlockCount, themeDecls } from "./_cssDecls";

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const NESTED_SELECTOR = ':root [data-theme="dark"]';

/** `--name -> --name-runtime` for each `--name: var(--name-runtime)` declaration. */
function runtimeBindings(decls: Map<string, string> | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const [prop, value] of decls ?? []) {
    const m = /^var\((--[a-z0-9-]+-runtime)\)$/.exec(value.trim());
    if (m) out.set(prop, m[1]!);
  }
  return out;
}

/**
 * Every runtime-backed token of EVERY `@theme` block missing (or mis-bound) in
 * the nested scope. Parsed with postcss (tests/styles/_cssDecls.ts), so a
 * commented-out declaration or block does not count, and a second `@theme`
 * block is read too (whole-diff review round 2, second pass, 2C-R2-2).
 */
function missingRebindings(css: string): string[] {
  if (themeBlockCount(css) === 0) return ["@theme block not found"];
  const nested = ruleDecls(css, NESTED_SELECTOR);
  if (nested === null) return [`${NESTED_SELECTOR} block not found`];
  const want = runtimeBindings(themeDecls(css));
  const have = runtimeBindings(nested);
  return [...want].filter(([token, runtime]) => have.get(token) !== runtime).map(([t]) => t);
}

describe("nested dark scope", () => {
  it("re-binds every runtime-backed @theme token under :root [data-theme=dark]", () => {
    const theme = runtimeBindings(themeDecls(CSS));
    // PREMISE: the scan sees the token set, not an empty block.
    expect(theme.size).toBeGreaterThanOrEqual(30);
    expect(theme.get("--color-surface-raised")).toBe("--color-surface-raised-runtime");
    expect(missingRebindings(CSS)).toEqual([]);
  });

  it("re-binds nothing @theme does not declare", () => {
    const theme = runtimeBindings(themeDecls(CSS));
    const nested = runtimeBindings(ruleDecls(CSS, NESTED_SELECTOR));
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

// The reviewer's three probes (whole-diff review round 2, second pass, 2C-R2-2):
// each passed against the text-reading scan.
describe("the scan reads only live declarations, in every @theme block", () => {
  it("fails when the whole nested dark binding block is commented out", () => {
    let text = "";
    postcss.parse(CSS).walkRules((rule) => {
      if (rule.selector === NESTED_SELECTOR) text = rule.toString();
    });
    expect(CSS.includes(text) && text.length > 0, "PREMISE: the block's own text").toBe(true);
    const planted = CSS.replace(text, `/* ${text.replaceAll("*/", "* /")} */`);
    expect(missingRebindings(planted)).toEqual([`${NESTED_SELECTOR} block not found`]);
  });

  it("fails on a runtime-backed token declared in a second @theme block and bound nowhere", () => {
    const planted = `${CSS}\n@theme {\n  --color-probe: var(--color-probe-runtime);\n}\n`;
    expect(themeBlockCount(planted), "PREMISE: two @theme blocks").toBe(themeBlockCount(CSS) + 1);
    expect(missingRebindings(planted)).toEqual(["--color-probe"]);
  });

  it("fails when one nested binding is commented out rather than deleted", () => {
    const nestedStart = CSS.indexOf(`\n${NESTED_SELECTOR} {\n`);
    const row = "  --color-surface-raised: var(--color-surface-raised-runtime);\n";
    const planted =
      CSS.slice(0, nestedStart) + CSS.slice(nestedStart).replace(row, `  /* ${row.trim()} */\n`);
    expect(planted).not.toBe(CSS);
    expect(missingRebindings(planted)).toEqual(["--color-surface-raised"]);
  });
});
