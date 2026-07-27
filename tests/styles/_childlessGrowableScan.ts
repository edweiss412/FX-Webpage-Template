/**
 * tests/styles/_childlessGrowableScan.ts
 *
 * Scanner for the childless-growable structural guard
 * (_metaChildlessGrowable.test.ts). Spec — canonical for every predicate,
 * shape, and residual: docs/superpowers/specs/2026-07-26-childless-growable-static-guard-design.md
 *
 * The rule is an ALLOWLIST (spec §1): a growable JSX element must be
 * possibly-childed, painted-with-extent (DOM tags), registered (component
 * tags), or exempted. Growability is "prove the grow factor is zero, else
 * growable" (§3.1); paint is an exact-match token set plus extent proof
 * (§4.2) — idiom membership, never a claim about rendered pixels.
 */

/** Exact-match paint members (§4.2a). Each paints on its own; color-only
 *  utilities (border-accent-edge) are deliberately absent. */
export const PAINT_TOKENS: ReadonlySet<string> = new Set([
  "bg-border",
  "bg-border-strong",
  "bg-accent",
  "border",
]);

/** Tokens in the flex/grow family that configure layout, never growth (§3.1). */
const FLEX_LAYOUT_TOKENS = new Set([
  "flex",
  "flex-row",
  "flex-col",
  "flex-row-reverse",
  "flex-col-reverse",
  "flex-wrap",
  "flex-nowrap",
  "flex-wrap-reverse",
]);

/** Bare unitless number (optionally signed): the ONLY form that can prove a
 *  zero grow factor (§3.1) — anything unitful is a flex-basis shorthand. */
const BARE_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Strip variant prefixes: everything up to the last colon at zero
 * bracket/paren depth, so `[&>*]:`, `min-[480px]:` and `flex-(--x)` survive.
 * Then strip ONE leading or trailing important marker. Variant-first order is
 * load-bearing: `sm:!flex-1` must normalize to `flex-1` (spec §3.1).
 */
export function normalizeToken(raw: string): string {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) cut = i;
  }
  let t = cut >= 0 ? raw.slice(cut + 1) : raw;
  if (t.startsWith("!")) t = t.slice(1);
  else if (t.endsWith("!")) t = t.slice(0, -1);
  return t;
}

/**
 * Decide growth for the first segment of a CSS `flex` shorthand value:
 * a bare unitless number decides (0 → not growable, >0 → growable, negative →
 * invalid CSS so grow stays initial 0); anything else — unitful (`0px` is a
 * one-value BASIS with implicit grow 1), calc(), var() — is growable, the
 * unitful case by CSS semantics and the rest fail-closed (§3.1).
 */
function flexShorthandGrows(value: string): boolean {
  const first = value.split(/[_\s]/)[0] ?? "";
  if (BARE_NUMBER.test(first)) return parseFloat(first) > 0;
  return true;
}

/** Growability over a single className token — total, prove-zero-else-growable (§3.1). */
export function growableFromToken(raw: string): boolean {
  const t = normalizeToken(raw);

  // Arbitrary properties: [flex-grow:v] / [flex:v…]
  let m = t.match(/^\[flex-grow:(.+)\]$/);
  if (m) {
    const v = m[1] ?? "";
    if (BARE_NUMBER.test(v)) return parseFloat(v) > 0;
    return true; // unitful / unparseable — fail closed
  }
  m = t.match(/^\[flex:(.+)\]$/);
  if (m) return flexShorthandGrows(m[1] ?? "");

  if (FLEX_LAYOUT_TOKENS.has(t)) return false;
  if (t === "basis" || t.startsWith("basis-")) return false;
  if (t === "shrink" || t.startsWith("shrink-")) return false;

  if (t === "grow") return true;
  if (t === "flex-auto") return true;
  if (t === "flex-none" || t === "flex-initial") return false;

  m = t.match(/^(flex|grow)-(.+)$/);
  if (!m) return false;
  const family = m[1];
  const v = m[2] ?? "";

  if (v.startsWith("(--")) return true; // custom property — fail closed

  const bracket = v.match(/^\[(.+)\]$/);
  if (bracket) {
    const inner = bracket[1] ?? "";
    if (family === "flex") return flexShorthandGrows(inner);
    // grow-[v]: bare unitless number decides; anything else fail-closed.
    if (BARE_NUMBER.test(inner)) return parseFloat(inner) > 0;
    return true;
  }

  // Fractions are one-value percentage bases (implicit grow 1) for ANY
  // numerator: Tailwind emits flex-0/1 as flex: calc(0/1 * 100%) (§3.1).
  if (family === "flex" && /^\d+(\.\d+)?\/\d+(\.\d+)?$/.test(v)) return true;

  if (BARE_NUMBER.test(v)) return parseFloat(v) > 0;
  return false; // named non-numeric suffix outside the family grammar
}

const EXTENT_PREFIX = /^(min-h|min-w|size|py|px|h|w)-(.+)$/;
/** Bracketed extent: UNSIGNED positive number + closed unit list (§4.2b). */
const EXTENT_BRACKET = /^(\d+(?:\.\d+)?)(px|rem|em|vh|vw)$/;

/** Provably-positive cross-axis extent — closed lexical partition (§4.2b). */
export function extentFromToken(raw: string): boolean {
  const t = normalizeToken(raw);
  if (t === "self-stretch") return true;
  const m = t.match(EXTENT_PREFIX);
  if (!m) return false;
  const v = m[2] ?? "";
  if (v === "px") return true;
  if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v) > 0;
  const bracket = v.match(/^\[(.+)\]$/);
  if (bracket) {
    const inner = (bracket[1] ?? "").match(EXTENT_BRACKET);
    if (inner) return parseFloat(inner[1] ?? "0") > 0;
  }
  return false;
}
