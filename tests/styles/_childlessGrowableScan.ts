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
 *  utilities (border-accent-edge) are deliberately absent. `bg-border-strong`
 *  was retired 2026-08-10: its last growable candidate (the wizard step
 *  connector) was resized off `flex-1` and re-ramped to text tokens per
 *  DESIGN.md §1.2a, and §6.3 forbids dead members from accumulating. Its
 *  remaining live uses are non-growable 3px dots, which are not candidates. */
export const PAINT_TOKENS: ReadonlySet<string> = new Set(["bg-border", "bg-accent", "border"]);

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
const BARE_NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

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
  // Unknown named suffix in the flex/grow family: "everything else in the
  // family" is growable (§3.1) — prove zero, else fail closed.
  return true;
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
  // `FilterTextInput` stood here until 2026-08-26. The row existed to approve a
  // call-site className on a component tag, and that call site no longer has
  // one: the control-outline-cover sweep gave the component its own outline
  // recipe and replaced the caller's className with a `grow` boolean, so no
  // caller can paint it at all (spec 2026-08-26-control-outline-cover-widening
  // §6.4). Removed rather than kept, because the occurrence-liveness assertion
  // is right that a row with no live occurrence is a row about nothing.
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
  if (ts.isSpreadElement(expr)) {
    harvestClassName(expr.expression, out);
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
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isNonNullExpression(expr)
  ) {
    // Parens and type-only wrappers (as / satisfies / !) are transparent at
    // every harvesting depth (§3, whole-diff R2 finding 2).
    harvestClassName(expr.expression, out);
    return;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    // clsx object form: keys are class strings; truthiness deliberately
    // ignored (§7 row 5 — union model). EVERY statically named member kind
    // contributes its key — shorthand ({grow}), methods, and accessors are
    // names too, and an inline spread recurses (whole-diff R1 finding 3).
    for (const p of expr.properties) {
      if (ts.isSpreadAssignment(p)) {
        harvestClassName(p.expression, out);
        continue;
      }
      const name = p.name;
      if (name && (ts.isStringLiteral(name) || ts.isIdentifier(name))) {
        out.tokens.push(...String(name.text).split(/\s+/).filter(Boolean));
      }
    }
    out.opaque = true;
    return;
  }
  out.opaque = true; // identifier, member access, anything else — invisible fragment
}

interface StyleGrow {
  /** Growth proven by a statically resolved value (§3.1). */
  resolved: boolean;
  /** Growth assumed fail-closed from an unresolvable value / spread /
   *  computed key / shorthand / method form (§3.1). Tracked separately from
   *  `resolved` so `opaque-style-grow` means SOLELY-opaque growth (whole-diff
   *  R1 finding 6): resolved growth alongside an opaque source reports
   *  `unpainted-childless-dom`. */
  opaque: boolean;
  label: string | null;
}

const NO_STYLE_GROW: StyleGrow = { resolved: false, opaque: false, label: null };

function mergeStyle(a: StyleGrow, b: StyleGrow): StyleGrow {
  return {
    resolved: a.resolved || b.resolved,
    opaque: a.opaque || b.opaque,
    label: a.label ?? b.label,
  };
}

/** Unsigned number + unit: a one-value flex BASIS, implicit grow 1 (§3.1). */
const UNITFUL_NUMBER = /^(\d+(\.\d+)?|\.\d+)[a-z%]+$/i;

/** Parens and type-only wrappers (as / satisfies / !) are transparent on
 *  every style surface — the whole attribute AND property values (§3.1,
 *  whole-diff R2 finding 3). */
function unwrapTypeOnly(expr: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isNonNullExpression(expr)
  ) {
    expr = expr.expression;
  }
  return expr;
}

/** Style resolution (§3.1) — TOTAL over TSX expression kinds via the default clause. */
function resolveStyleGrow(expr: ts.Expression | undefined, sf: ts.SourceFile): StyleGrow {
  if (!expr) return NO_STYLE_GROW;
  // Type-only wrappers are transparent (§3.1). Angle-bracket assertions are
  // not valid TSX, so they impose no obligation here.
  const unwrapped = unwrapTypeOnly(expr);
  if (unwrapped !== expr) return resolveStyleGrow(unwrapped, sf);
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
    const opaqueAt = (label: string) => ({ resolved: false, opaque: true, label });
    for (const p of expr.properties) {
      if (ts.isSpreadAssignment(p)) {
        acc = mergeStyle(acc, opaqueAt(p.getText(sf)));
        continue;
      }
      // Object-member handling is TOTAL over statically named forms
      // (whole-diff R1 finding 4): shorthand ({flexGrow}), methods, and
      // accessors named flex/flexGrow are fail-closed opaque growth; a
      // computed key is opaque regardless of name on EVERY member kind —
      // assignment, method, getter, setter (whole-diff R2 finding 1).
      if (p.name && ts.isComputedPropertyName(p.name)) {
        acc = mergeStyle(acc, opaqueAt(p.getText(sf)));
        continue;
      }
      const nm =
        p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
      if (nm !== "flex" && nm !== "flexGrow") continue;
      const label = p.getText(sf);
      if (!ts.isPropertyAssignment(p)) {
        acc = mergeStyle(acc, opaqueAt(label)); // shorthand / method / accessor
        continue;
      }
      const init = unwrapTypeOnly(p.initializer);
      if (ts.isNumericLiteral(init)) {
        if (Number(init.text) > 0) acc = mergeStyle(acc, { resolved: true, opaque: false, label });
        continue;
      }
      if (ts.isPrefixUnaryExpression(init)) {
        const operand = unwrapTypeOnly(init.operand);
        if (ts.isNumericLiteral(operand)) {
          // Signed numeric literals resolve numerically on every surface
          // (§3.1, whole-diff R2 finding 3): negative is invalid CSS (grow
          // stays initial 0); unary plus is the operand's value.
          if (init.operator === ts.SyntaxKind.MinusToken) continue;
          if (init.operator === ts.SyntaxKind.PlusToken) {
            if (Number(operand.text) > 0)
              acc = mergeStyle(acc, { resolved: true, opaque: false, label });
            continue;
          }
        }
        acc = mergeStyle(acc, opaqueAt(label)); // ~x, !x, non-literal operand — fail closed
        continue;
      }
      if (ts.isStringLiteral(init)) {
        // String value, CSS flex shorthand semantics (§3.1): a bare-number
        // first segment decides; an unsigned unitful number is a one-value
        // basis (implicit grow 1, resolved); EVERYTHING else — empty, junk,
        // calc()/var() text — is unparseable and therefore opaque growth.
        const first = init.text.trim().split(/\s+/)[0] ?? "";
        if (BARE_NUMBER.test(first)) {
          if (parseFloat(first) > 0)
            acc = mergeStyle(acc, { resolved: true, opaque: false, label });
        } else if (UNITFUL_NUMBER.test(first)) {
          acc = mergeStyle(acc, { resolved: true, opaque: false, label });
        } else {
          acc = mergeStyle(acc, opaqueAt(label));
        }
        continue;
      }
      acc = mergeStyle(acc, opaqueAt(label)); // fail closed
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
): {
  violations: Violation[];
  exemptions: Exemption[];
  meta: { childlessGrowableComponentTags: string[]; paintedCandidateTokens: string[] };
} {
  const registry = opts?.registry ?? APPROVED_GROWABLE_COMPONENTS;
  const paintTokens = opts?.paintTokens ?? PAINT_TOKENS;
  const isMdx = fileName.endsWith(".mdx");
  const scanText = isMdx ? String(compileSync(source, { jsx: true })) : source;
  const sf = ts.createSourceFile(
    fileName,
    scanText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: Violation[] = [];
  const exemptionRanges = isMdx ? [] : collectExemptions(scanText, sf);
  const meta = {
    childlessGrowableComponentTags: [] as string[],
    paintedCandidateTokens: [] as string[],
  };

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
      const styleGrowable = styleGrow.resolved || styleGrow.opaque;
      if ((growableTokens.length > 0 || styleGrowable) && isChildless(node)) {
        const isComponent = /^[A-Z]/.test(tag) || tag.includes(".");
        const sourceLabel = growableTokens[0] ?? styleGrow.label ?? "(unknown growable source)";
        const start = node.getStart(sf);
        const line = sf.getLineAndCharacterOfPosition(start).line + 1;
        // Every childless growable CANDIDATE claims its exemption BEFORE its
        // compliance is decided — template semantics (§4.4): a compliant
        // candidate consumes the comment silently.
        const exempted = claimExemption(exemptionRanges, start, line);
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
          meta.childlessGrowableComponentTags.push(tag);
          if (!registry.has(tag)) push("unregistered-component");
        } else {
          const normalized = harvest.tokens.map(normalizeToken);
          const painted =
            isPainted(normalized, paintTokens) && harvest.tokens.some(extentFromToken);
          if (painted) meta.paintedCandidateTokens.push(...normalized);
          if (!painted) {
            push(
              growableTokens.length === 0 && !styleGrow.resolved && styleGrow.opaque
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
    meta,
  };
}

/* ------------------------------------------------------------------------- *
 * Exemptions (spec §4.4) + MDX (spec §5).
 * ------------------------------------------------------------------------- */
import { compileSync } from "@mdx-js/mdx";

import { LINE_TERMINATORS, commentRanges } from "../_shared/stripComments";

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

/**
 * Collect reasoned exemption comments (template mechanics, _newTabScan.ts:49
 * and ~:2835): trailing block delimiter stripped, then per-line jsdoc
 * decoration; a reason must remain after the marker. Comment discovery is the
 * shared `commentRanges` (single-source contract,
 * tests/cross-cutting/_metaStripCommentsSingleSource.test.ts): it is literal-
 * aware — a marker inside a string/template/regex/JSX-text span is data — and
 * shebang-aware (whole-diff R1 finding 1).
 */
function collectExemptions(source: string, sf: ts.SourceFile): ExemptionRange[] {
  const out: ExemptionRange[] = [];
  for (const [start, end] of commentRanges(source, ts.ScriptKind.TSX, sf)) {
    const text = source
      .slice(start, end)
      .replace(/\*+\/$/, "")
      .split(new RegExp(LINE_TERMINATORS.source))
      .map((l) => l.replace(/^\s*\*+\s?/, ""))
      .join("\n");
    const at = text.indexOf(EXEMPTION_MARKER);
    if (at < 0) continue;
    if (text.slice(at + EXEMPTION_MARKER.length).trim().length === 0) continue;
    out.push({
      end,
      startLine: sf.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sf.getLineAndCharacterOfPosition(end).line + 1,
      used: false,
    });
  }
  return out.sort((a, b) => a.end - b.end);
}

/**
 * Claim the first adjacent exemption for a candidate. Template semantics
 * (_newTabScan.ts:2854–2910): ownership goes to the first candidate whose
 * START follows the comment's end — a comment INSIDE the candidate (in-tag or
 * as a child) never binds, so an element cannot launder itself (whole-diff R1
 * finding 2). The candidate claims BEFORE its compliance is decided, so a
 * compliant candidate consumes its exemption silently. Adjacency: the comment
 * ends on the candidate's start line or the line directly above.
 */
function claimExemption(
  exemptions: ExemptionRange[],
  candStart: number,
  candStartLine: number,
): boolean {
  for (const ex of exemptions) {
    if (ex.used) continue;
    if (ex.end > candStart) continue;
    if (candStartLine - ex.endLine <= 1 && ex.endLine <= candStartLine) {
      ex.used = true;
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------------- *
 * Live-tree walk + aggregate scan (spec §6.1–§6.3).
 * ------------------------------------------------------------------------- */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const LIVE_ROOTS = ["components", "app"] as const;
const SCAN_EXTENSIONS = /\.(tsx|mdx)$/;

function walkDir(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walkDir(p);
    return SCAN_EXTENSIONS.test(entry) ? [p] : [];
  });
}

export interface LiveScanOptions {
  /** Test seam (plan Task 4b): scan <root>/components + <root>/app instead of
   *  the repo — the fixture tree plants one violation per root and extension
   *  so a silently narrowed walk fails. */
  root?: string;
}

/** Repo-relative (or root-relative) paths of every scannable live file. */
export function walkLiveTree(opts?: LiveScanOptions): string[] {
  const root = opts?.root ?? REPO_ROOT;
  return LIVE_ROOTS.flatMap((sub) => walkDir(join(root, sub))).map((p) => relative(root, p));
}

export interface LiveScanResult {
  violations: Violation[];
  unusedExemptions: Array<{ file: string; line: number }>;
  exemptionCount: number;
  /** Every childless growable COMPONENT tag seen — §6.3 registry liveness. */
  childlessGrowableComponentTags: string[];
  /** Normalized harvest tokens of painted childless DOM candidates — §6.3
   *  paint-set liveness (occurrence semantics). */
  paintedCandidateTokens: string[];
}

export function scanLiveTree(opts?: LiveScanOptions): LiveScanResult {
  const root = opts?.root ?? REPO_ROOT;
  const result: LiveScanResult = {
    violations: [],
    unusedExemptions: [],
    exemptionCount: 0,
    childlessGrowableComponentTags: [],
    paintedCandidateTokens: [],
  };
  for (const rel of walkLiveTree(opts)) {
    const source = readFileSync(join(root, rel), "utf8");
    const { violations, exemptions, meta } = scanSource(source, rel);
    result.violations.push(...violations);
    result.exemptionCount += exemptions.length;
    for (const e of exemptions) {
      if (!e.used) result.unusedExemptions.push({ file: rel, line: e.line });
    }
    result.childlessGrowableComponentTags.push(...meta.childlessGrowableComponentTags);
    result.paintedCandidateTokens.push(...meta.paintedCandidateTokens);
  }
  return result;
}

/**
 * The §6.1 diagnostic, one line per violation: location (labelled approximate
 * for compiled MDX), tag, reason, source label, and every compliant escape.
 * Both the live gate and the fixture proofs render through this function so
 * the contract cannot drift between them.
 */
export function renderViolation(v: Violation): string {
  const pos = v.approximate
    ? `${v.file}:~${v.line} (position approximate — compiled MDX)`
    : `${v.file}:${v.line}`;
  return (
    `${pos} <${v.tag}> ${v.reason} (${v.sourceLabel}) — escapes: add real children; ` +
    `DOM: add a PAINT_TOKENS member AND a proven extent token (extend the set in review if needed); ` +
    `component: add an APPROVED_GROWABLE_COMPONENTS row with a reason; or childless-growable-ok: <reason>`
  );
}
