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

/* ------------------------------------------------------------------------- *
 * scanSource: candidate discovery and classification (spec §3, §4, §5).
 * ------------------------------------------------------------------------- */
import ts from "typescript";

/**
 * Childless growable COMPONENT tags must be registered here (spec §4.3) —
 * a call-site className is a prop, not a guarantee of what renders, so
 * component tags never take the painted path. Rows carry reason + citation.
 */
export const APPROVED_GROWABLE_COMPONENTS: ReadonlySet<string> = new Set([
  // Renders a painted <div> (animate-pulse bg-surface-sunken), components/layout/Skeleton.tsx:15.
  "Skeleton",
  // Renders an <input> (painted, interactive), components/admin/telemetry/EventFilters.tsx:20.
  "FilterTextInput",
]);

/** Family negators (§4.2a) — families with no PAINT_TOKENS member have none. */
const FAMILY_NEGATORS: Readonly<Record<string, readonly string[]>> = {
  bg: ["bg-transparent", "bg-none"],
  border: ["border-0", "border-none", "border-transparent"],
};

/** Global paint neutralizers (§4.2a): keep occupancy, paint nothing. */
const GLOBAL_NEUTRALIZERS = new Set(["opacity-0", "invisible"]);

export type ViolationReason =
  | "unregistered-component"
  | "opaque-style-grow"
  | "unpainted-childless-dom";

export interface Violation {
  file: string;
  line: number;
  tag: string;
  reason: ViolationReason;
  /** The growable class token, or the style property source text (§6.1). */
  sourceLabel: string;
  /** MDX diagnostics are positionally approximate (§5). */
  approximate?: boolean;
}

export interface ScanOptions {
  /** Probe substitute for APPROVED_GROWABLE_COMPONENTS (§5). */
  registry?: ReadonlySet<string>;
  /** Probe substitute for PAINT_TOKENS (§5). */
  paintTokens?: ReadonlySet<string>;
}

interface Harvest {
  tokens: string[];
  opaque: boolean;
}

/** Static className harvesting (§3): recursive at every level, fragment-wise. */
function harvestClassName(expr: ts.Expression | undefined, out: Harvest): void {
  if (!expr) return;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    out.tokens.push(...expr.text.split(/\s+/).filter(Boolean));
    return;
  }
  if (ts.isTemplateExpression(expr)) {
    out.tokens.push(...expr.head.text.split(/\s+/).filter(Boolean));
    for (const span of expr.templateSpans) {
      harvestClassName(span.expression, out);
      out.tokens.push(...span.literal.text.split(/\s+/).filter(Boolean));
    }
    out.opaque = true;
    return;
  }
  if (ts.isCallExpression(expr)) {
    // Harvest the RECEIVER of a property-access call too: the census-v1
    // miss was ["…", …].join(" ") arriving as arguments-only harvesting.
    if (ts.isPropertyAccessExpression(expr.expression)) {
      harvestClassName(expr.expression.expression, out);
    }
    for (const a of expr.arguments) harvestClassName(a, out);
    out.opaque = true;
    return;
  }
  if (ts.isArrayLiteralExpression(expr)) {
    for (const el of expr.elements) harvestClassName(el, out);
    return;
  }
  if (ts.isConditionalExpression(expr)) {
    harvestClassName(expr.whenTrue, out);
    harvestClassName(expr.whenFalse, out);
    out.opaque = true;
    return;
  }
  if (ts.isBinaryExpression(expr)) {
    harvestClassName(expr.left, out);
    harvestClassName(expr.right, out);
    out.opaque = true;
    return;
  }
  if (ts.isParenthesizedExpression(expr)) {
    harvestClassName(expr.expression, out);
    return;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    // clsx object form: keys are class strings; truthiness deliberately
    // ignored (§7 row 5 — union model).
    for (const p of expr.properties) {
      if (
        ts.isPropertyAssignment(p) &&
        (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))
      ) {
        out.tokens.push(...String(p.name.text).split(/\s+/).filter(Boolean));
      }
    }
    out.opaque = true;
    return;
  }
  out.opaque = true; // identifier, member access, anything else — invisible fragment
}

interface StyleGrow {
  growable: boolean;
  /** Growth came from an unresolvable value/spread/computed key (§3.1). */
  opaque: boolean;
  label: string | null;
}

const NO_STYLE_GROW: StyleGrow = { growable: false, opaque: false, label: null };

function mergeStyle(a: StyleGrow, b: StyleGrow): StyleGrow {
  return {
    growable: a.growable || b.growable,
    opaque: a.opaque || b.opaque,
    label: a.label ?? b.label,
  };
}

/** Style resolution (§3.1) — TOTAL over TSX expression kinds via the default clause. */
function resolveStyleGrow(expr: ts.Expression | undefined, sf: ts.SourceFile): StyleGrow {
  if (!expr) return NO_STYLE_GROW;
  // Type-only wrappers are transparent (§3.1). Angle-bracket assertions are
  // not valid TSX, so they impose no obligation here.
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isNonNullExpression(expr)
  ) {
    return resolveStyleGrow(expr.expression, sf);
  }
  if (ts.isConditionalExpression(expr)) {
    return mergeStyle(resolveStyleGrow(expr.whenTrue, sf), resolveStyleGrow(expr.whenFalse, sf));
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return mergeStyle(resolveStyleGrow(expr.left, sf), resolveStyleGrow(expr.right, sf));
    }
    return NO_STYLE_GROW;
  }
  if (expr.kind === ts.SyntaxKind.NullKeyword) return NO_STYLE_GROW;
  if (ts.isIdentifier(expr) && expr.text === "undefined") return NO_STYLE_GROW;
  if (ts.isObjectLiteralExpression(expr)) {
    let acc = NO_STYLE_GROW;
    for (const p of expr.properties) {
      if (ts.isSpreadAssignment(p)) {
        acc = mergeStyle(acc, { growable: true, opaque: true, label: p.getText(sf) });
        continue;
      }
      if (!ts.isPropertyAssignment(p)) continue;
      if (ts.isComputedPropertyName(p.name)) {
        acc = mergeStyle(acc, { growable: true, opaque: true, label: p.getText(sf) });
        continue;
      }
      const nm = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
      if (nm !== "flex" && nm !== "flexGrow") continue;
      const init = p.initializer;
      const label = p.getText(sf);
      if (ts.isNumericLiteral(init)) {
        if (Number(init.text) > 0) acc = mergeStyle(acc, { growable: true, opaque: false, label });
        continue;
      }
      if (
        ts.isPrefixUnaryExpression(init) &&
        init.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(init.operand)
      ) {
        continue; // negative: invalid CSS, grow stays initial 0 (§3.1)
      }
      if (ts.isStringLiteral(init)) {
        // String value: CSS flex shorthand semantics — first segment decides,
        // unitful first segment is a basis with implicit grow 1 (§3.1).
        const first = init.text.trim().split(/\s+/)[0] ?? "";
        const grows = BARE_NUMBER.test(first) ? parseFloat(first) > 0 : init.text.trim() !== "";
        if (grows) acc = mergeStyle(acc, { growable: true, opaque: false, label });
        continue;
      }
      acc = mergeStyle(acc, { growable: true, opaque: true, label }); // fail closed
    }
    return acc;
  }
  return NO_STYLE_GROW; // identifier, call, member, everything else: invisible (§7 row 1)
}

/** Statically childless (§3.2). `trim()` drops every JS line terminator. */
function isChildless(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  if (ts.isJsxSelfClosingElement(node)) return true;
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      if (child.text.trim() !== "") return false;
      continue;
    }
    if (ts.isJsxExpression(child)) {
      const e = child.expression;
      if (!e) continue; // {/* comment */}
      if (e.kind === ts.SyntaxKind.NullKeyword) continue;
      if (ts.isIdentifier(e) && e.text === "undefined") continue;
      return false; // any other expression: possibly-childed (§4.1)
    }
    return false; // element / fragment child
  }
  return true;
}

/** Painted decision over the harvested union (§4.2a): member survives its
 *  family negators, and no global neutralizer is present. */
function isPainted(normalizedTokens: readonly string[], paintTokens: ReadonlySet<string>): boolean {
  for (const t of normalizedTokens) if (GLOBAL_NEUTRALIZERS.has(t)) return false;
  const present = new Set(normalizedTokens);
  for (const t of normalizedTokens) {
    if (!paintTokens.has(t)) continue;
    const family = t.split("-")[0] ?? t;
    const negators = FAMILY_NEGATORS[family] ?? [];
    if (!negators.some((n) => present.has(n))) return true;
  }
  return false;
}

/**
 * Scan one source. `.mdx` files are compiled to JSX first (§5): their
 * diagnostics are positionally APPROXIMATE and exemption comments are NOT
 * honored — compileSync hoists comments away from their elements (§4.4).
 */
export function scanSource(
  source: string,
  fileName: string,
  opts?: ScanOptions,
): { violations: Violation[]; exemptions: Exemption[] } {
  const registry = opts?.registry ?? APPROVED_GROWABLE_COMPONENTS;
  const paintTokens = opts?.paintTokens ?? PAINT_TOKENS;
  const isMdx = fileName.endsWith(".mdx");
  const scanText = isMdx ? String(compileSync(source, { jsx: true })) : source;
  const sf = ts.createSourceFile(fileName, scanText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];
  const exemptionRanges = isMdx ? [] : collectExemptions(scanText, sf);

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(sf);
      const harvest: Harvest = { tokens: [], opaque: false };
      let styleGrow: StyleGrow = NO_STYLE_GROW;
      for (const attr of opening.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attr)) continue; // §7 row 1: spread never creates a candidate
        const name = attr.name.getText(sf);
        if (name === "className" && attr.initializer) {
          const init = ts.isJsxExpression(attr.initializer)
            ? attr.initializer.expression
            : attr.initializer;
          harvestClassName(init as ts.Expression | undefined, harvest);
        } else if (name === "style" && attr.initializer && ts.isJsxExpression(attr.initializer)) {
          styleGrow = resolveStyleGrow(attr.initializer.expression, sf);
        }
      }
      const growableTokens = harvest.tokens.filter(growableFromToken);
      if ((growableTokens.length > 0 || styleGrow.growable) && isChildless(node)) {
        const isComponent = /^[A-Z]/.test(tag) || tag.includes(".");
        const sourceLabel = growableTokens[0] ?? styleGrow.label ?? "(unknown growable source)";
        const start = node.getStart(sf);
        const line = sf.getLineAndCharacterOfPosition(start).line + 1;
        // Every childless growable CANDIDATE claims its exemption BEFORE its
        // compliance is decided — template semantics (§4.4): a compliant
        // candidate consumes the comment silently.
        const exempted = claimExemption(exemptionRanges, start, node.getEnd(), line);
        const push = (reason: ViolationReason) => {
          if (!exempted) {
            violations.push({
              file: fileName,
              line,
              tag,
              reason,
              sourceLabel,
              ...(isMdx ? { approximate: true } : {}),
            });
          }
        };
        if (isComponent) {
          if (!registry.has(tag)) push("unregistered-component");
        } else {
          const normalized = harvest.tokens.map(normalizeToken);
          const painted =
            isPainted(normalized, paintTokens) && harvest.tokens.some(extentFromToken);
          if (!painted) {
            push(
              growableTokens.length === 0 && styleGrow.opaque
                ? "opaque-style-grow"
                : "unpainted-childless-dom",
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return {
    violations,
    exemptions: exemptionRanges.map((e) => ({ line: e.endLine, used: e.used })),
  };
}

/* ------------------------------------------------------------------------- *
 * Exemptions (spec §4.4) + MDX (spec §5).
 * ------------------------------------------------------------------------- */
import { compileSync } from "@mdx-js/mdx";

import { LINE_TERMINATORS } from "./_newTabScan";

export const EXEMPTION_MARKER = "childless-growable-ok:";

export interface Exemption {
  line: number;
  used: boolean;
}

interface ExemptionRange {
  end: number;
  startLine: number;
  endLine: number;
  used: boolean;
}

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = new RegExp("//[^" + LINE_TERMINATORS.source.slice(1, -1) + "]*", "g");

/** Spans whose contents are string-ish — a marker inside one is data, not an
 *  exemption (§6.4 probe). */
function stringishSpans(sf: ts.SourceFile): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      spans.push([node.getStart(sf), node.getEnd()]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return spans;
}

/**
 * Collect reasoned exemption comments (template mechanics, _newTabScan.ts:49
 * and ~:2835): trailing block delimiter stripped, then per-line jsdoc
 * decoration; a reason must remain after the marker.
 */
function collectExemptions(source: string, sf: ts.SourceFile): ExemptionRange[] {
  const strings = stringishSpans(sf);
  const inString = (pos: number) => strings.some(([a, b]) => pos >= a && pos < b);
  const out: ExemptionRange[] = [];
  for (const re of [BLOCK_COMMENT, LINE_COMMENT]) {
    re.lastIndex = 0;
    for (const match of source.matchAll(re)) {
      const start = match.index ?? 0;
      if (inString(start)) continue;
      const text = match[0]
        .replace(/\*+\/$/, "")
        .split(new RegExp(LINE_TERMINATORS.source))
        .map((l) => l.replace(/^\s*\*+\s?/, ""))
        .join("\n");
      const at = text.indexOf(EXEMPTION_MARKER);
      if (at < 0) continue;
      if (text.slice(at + EXEMPTION_MARKER.length).trim().length === 0) continue;
      const end = start + match[0].length;
      out.push({
        end,
        startLine: sf.getLineAndCharacterOfPosition(start).line + 1,
        endLine: sf.getLineAndCharacterOfPosition(end).line + 1,
        used: false,
      });
    }
  }
  return out.sort((a, b) => a.end - b.end);
}

/**
 * Claim the first adjacent exemption for a candidate. Template semantics
 * (_newTabScan.ts:2854–2910): the candidate claims BEFORE its compliance is
 * decided, so a compliant candidate consumes its exemption silently.
 * Adjacency: the comment sits inside the element's span (in-tag form), or
 * ends on the candidate's start line / the line directly above.
 */
function claimExemption(
  exemptions: ExemptionRange[],
  candStart: number,
  candEnd: number,
  candStartLine: number,
): boolean {
  for (const ex of exemptions) {
    if (ex.used) continue;
    if (ex.end > candEnd) continue;
    const inTag = ex.startLine >= candStartLine && ex.end <= candEnd;
    const adjacent = candStartLine - ex.endLine <= 1 && ex.endLine <= candStartLine;
    if (inTag || adjacent) {
      ex.used = true;
      return true;
    }
  }
  return false;
}
