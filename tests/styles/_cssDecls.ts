/**
 * tests/styles/_cssDecls.ts: the declarations a stylesheet actually carries,
 * read through postcss (whole-diff review round 2, second pass, 2C-R2-2).
 *
 * The token guards used to read app/globals.css as text: a regex over the slice
 * between a selector and its closing brace. A declaration inside a comment still
 * matched, so commenting out a binding or a whole block left the guard green,
 * and only the FIRST `@theme` block was scanned, so a token declared in a second
 * one was never checked. postcss puts a comment in its own node and parses every
 * block, so neither can happen here.
 */
import postcss, { type AtRule, type Container, type Root } from "postcss";

/** One parse per stylesheet text: the guards call these many times over the same file. */
const parsed = new Map<string, Root>();
function parse(css: string): Root {
  let root = parsed.get(css);
  if (root === undefined) {
    root = postcss.parse(css);
    parsed.set(css, root);
  }
  return root;
}

/** A container's own declarations (not its nested blocks'), as `property -> value`. */
function ownDecls(container: Container): Map<string, string> {
  const out = new Map<string, string>();
  container.each((node) => {
    if (node.type === "decl") out.set(node.prop, node.value);
  });
  return out;
}

/** Every `@theme` block's declarations, in source order, the later block winning a repeat. */
export function themeDecls(css: string): Map<string, string> {
  const out = new Map<string, string>();
  parse(css).walkAtRules("theme", (rule) => {
    for (const [prop, value] of ownDecls(rule)) out.set(prop, value);
  });
  return out;
}

/** How many `@theme` blocks the stylesheet carries. */
export function themeBlockCount(css: string): number {
  let count = 0;
  parse(css).walkAtRules("theme", () => {
    count += 1;
  });
  return count;
}

/**
 * The declarations of the rules whose selector is exactly `selector`, inside
 * `media` (an `@media` at-rule's params) or, without it, at the top level, merged
 * in source order as the cascade merges them (a later rule's repeat wins). Null
 * when there is none. A rule's nested blocks (`@variant lg { … }`) are not its
 * own declarations and are left out.
 */
export function ruleDecls(
  css: string,
  selector: string,
  media?: string,
): Map<string, string> | null {
  let out: Map<string, string> | null = null;
  parse(css).walkRules((rule) => {
    if (rule.selector !== selector) return;
    const parent = rule.parent;
    const atMedia =
      parent?.type === "atrule" &&
      (parent as AtRule).name === "media" &&
      (parent as AtRule).params === media;
    if (media === undefined ? parent?.type !== "root" : !atMedia) return;
    out ??= new Map();
    for (const [prop, value] of ownDecls(rule)) out.set(prop, value);
  });
  return out;
}

/** `ruleDecls`, failing loudly when the rule is missing. */
export function requireRule(css: string, selector: string, media?: string): Map<string, string> {
  const decls = ruleDecls(css, selector, media);
  if (decls === null) throw new Error(`no rule ${selector}${media ? ` in @media ${media}` : ""}`);
  return decls;
}

/** A six-digit hex declared for `token` in `decls`; a throw when absent or not a hex. */
export function hexIn(decls: Map<string, string>, token: string): string {
  const value = decls.get(token);
  if (value === undefined || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`token ${token} not found as a #rrggbb value (got ${String(value)})`);
  }
  return value;
}
