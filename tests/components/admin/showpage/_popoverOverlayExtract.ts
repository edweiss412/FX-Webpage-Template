/**
 * tests/components/admin/showpage/_popoverOverlayExtract.ts
 *
 * Per-OVERLAY extraction for the anchored-scroller registry
 * (BL-POPOVER-REGISTRY-PER-FILE-AND-TAILWIND-ONLY). The shipped guard compared
 * detected FILES against registry file rows, so a second overlay appended to a
 * registered file was invisible, and its classifier read only the Tailwind
 * class idiom, so `style={{ position: "absolute", ... }}` was never detected.
 * This module walks the TSX AST and yields one record per overlay ELEMENT.
 *
 * An element is an anchored scroller when it is POSITIONED (absolute/fixed)
 * and EITHER scrolls itself OR is edge-anchored with a scrolling descendant
 * (the AttentionMenu shape: positioning on the panel wrapper, `overflow-y-auto`
 * on the inner list). Each signal is read from the structural accept-set:
 *
 *   className — string literal · template literal's static chunks · a
 *     module-level `const NAME = "..."` referenced by identifier (directly,
 *     inside a template, or as a `cn(...)`/`clsx(...)` argument) · a
 *     conditional expression's branches (both sides read).
 *   style     — object literal with literal keys and literal values
 *     (`position` / `top` / `bottom` / `overflow` / `overflowY`).
 *
 * DOCUMENTED LIMIT (the fence, stated rather than silently under-matched):
 * runtime-assembled styles (`style={computed}`, spread values), spread-in
 * props (`{...rest}` carrying className/style), and className expressions
 * outside the accept-set contribute NOTHING to classification. An element
 * whose readable signals already qualify is classified regardless of what its
 * dynamic remainder adds; an element that qualifies as positioned but whose
 * `style` attribute is UNREADABLE (not an object literal of literals) is
 * reported in `unclassified` so the guard can refuse it by name instead of
 * silently passing it. What cannot happen under this contract: a fully
 * statically-written overlay (either idiom) shipping undetected.
 *
 * The stable per-overlay key is the element's `data-testid`: its literal value
 * when static, else the exact SOURCE TEXT of its value expression (HoverHelp's
 * `` `${testId}-body` `` is per-instance at runtime but stable as source). A
 * qualifying element with NO data-testid is reported in `needsMarker` — the
 * registry contract requires it to gain one in the same commit.
 */
import ts from "typescript";

export type ExtractedOverlay = {
  /** data-testid literal value, or the raw source text of its expression. */
  readonly marker: string;
  /** 1-based line of the element's opening tag. */
  readonly line: number;
  /** Which signal set qualified it (diagnostic, not identity). */
  readonly via: "self-scroller" | "anchored-descendant-scroller";
};

export type ExtractionReport = {
  readonly overlays: readonly ExtractedOverlay[];
  /** Positioned elements whose style attribute is outside the accept-set. */
  readonly unclassified: readonly {
    readonly marker: string | null;
    readonly line: number;
    readonly reason: string;
  }[];
  /** Qualifying overlays with no data-testid at all (must gain one). */
  readonly needsMarker: readonly { readonly line: number }[];
};

const POSITIONED_CLASS = /(?:^|\s)(?:absolute|fixed)(?:\s|$)/;
const EDGE_ANCHOR_CLASS = /(?:^|\s)(?:top-full|bottom-full)(?:\s|$)|(?:^|\s)(?:top|bottom)-\[/;
const SCROLLER_CLASS = /(?:^|\s)overflow-(?:y-auto|auto|y-scroll)(?:\s|$)/;

type Signals = {
  positioned: boolean;
  edgeAnchored: boolean;
  selfScrolls: boolean;
  styleUnreadable: string | null;
};

/** Collect module-level `const NAME = "literal"` (incl. `as const`) bindings. */
function moduleStringConsts(sf: ts.SourceFile): Map<string, string> {
  const consts = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      let init: ts.Expression = decl.initializer;
      if (ts.isAsExpression(init)) init = init.expression;
      if (ts.isStringLiteralLike(init)) consts.set(decl.name.text, init.text);
      else if (ts.isTemplateExpression(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        consts.set(decl.name.text, staticTemplateText(init, new Map()));
      } else if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
        // `const X = cn("...")` — the ReSyncButton / PublishedToggle idiom.
        const callee = init.expression.text;
        if (callee === "cn" || callee === "clsx") {
          const text = init.arguments
            .map((a) => (ts.isStringLiteralLike(a) ? a.text : ""))
            .join(" ")
            .trim();
          if (text) consts.set(decl.name.text, text);
        }
      }
    }
  }
  return consts;
}

function staticTemplateText(node: ts.TemplateLiteral, consts: Map<string, string>): string {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let text = node.head.text;
  for (const span of node.templateSpans) {
    // An identifier interpolation resolving to a module string const is part
    // of the static text (the PublishedToggle `${POPOVER_POSITION} ...` form);
    // any other interpolation contributes a separator only.
    if (ts.isIdentifier(span.expression) && consts.has(span.expression.text)) {
      text += ` ${consts.get(span.expression.text)} `;
    } else {
      text += " ";
    }
    text += span.literal.text;
  }
  return text;
}

/** Static class text of a className value expression, per the accept-set. */
function staticClassText(expr: ts.Expression, consts: Map<string, string>): string {
  if (ts.isStringLiteralLike(expr)) return expr.text;
  if (ts.isTemplateExpression(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return staticTemplateText(expr, consts);
  }
  if (ts.isIdentifier(expr)) return consts.get(expr.text) ?? "";
  if (ts.isConditionalExpression(expr)) {
    return `${staticClassText(expr.whenTrue, consts)} ${staticClassText(expr.whenFalse, consts)}`;
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    const callee = expr.expression.text;
    if (callee === "cn" || callee === "clsx") {
      return expr.arguments.map((a) => staticClassText(a, consts)).join(" ");
    }
  }
  if (ts.isParenthesizedExpression(expr)) return staticClassText(expr.expression, consts);
  return "";
}

function attrValueExpression(attr: ts.JsxAttribute): ts.Expression | undefined {
  if (!attr.initializer) return undefined;
  if (ts.isStringLiteralLike(attr.initializer)) return attr.initializer;
  if (ts.isJsxExpression(attr.initializer)) return attr.initializer.expression;
  return undefined;
}

/** Read one element's signals from className + style, per the accept-set. */
function readSignals(
  attrs: ts.JsxAttributes,
  consts: Map<string, string>,
  sf: ts.SourceFile,
): Signals {
  const s: Signals = {
    positioned: false,
    edgeAnchored: false,
    selfScrolls: false,
    styleUnreadable: null,
  };
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
    const name = attr.name.text;
    if (name === "className") {
      const expr = attrValueExpression(attr);
      const text = expr ? staticClassText(expr, consts) : "";
      if (POSITIONED_CLASS.test(text)) s.positioned = true;
      if (EDGE_ANCHOR_CLASS.test(text)) s.edgeAnchored = true;
      if (SCROLLER_CLASS.test(text)) s.selfScrolls = true;
    } else if (name === "style") {
      const expr = attrValueExpression(attr);
      if (!expr || !ts.isObjectLiteralExpression(expr)) {
        s.styleUnreadable = expr ? expr.getText(sf) : "(empty style)";
        continue;
      }
      for (const prop of expr.properties) {
        if (!ts.isPropertyAssignment(prop)) {
          s.styleUnreadable = prop.getText(sf);
          continue;
        }
        const key = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteralLike(prop.name)
            ? prop.name.text
            : null;
        if (key === null) {
          s.styleUnreadable = prop.getText(sf);
          continue;
        }
        const value = ts.isStringLiteralLike(prop.initializer) ? prop.initializer.text : null;
        if (key === "position" && (value === "absolute" || value === "fixed")) {
          s.positioned = true;
        } else if (key === "top" || key === "bottom") {
          s.edgeAnchored = true;
        } else if (
          (key === "overflowY" && (value === "auto" || value === "scroll")) ||
          (key === "overflow" && value === "auto")
        ) {
          s.selfScrolls = true;
        }
      }
    }
  }
  return s;
}

function markerOf(attrs: ts.JsxAttributes, sf: ts.SourceFile): string | null {
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
    if (attr.name.text !== "data-testid") continue;
    const expr = attrValueExpression(attr);
    if (!expr) return null;
    return ts.isStringLiteralLike(expr) ? expr.text : expr.getText(sf);
  }
  return null;
}

function elementAttrs(node: ts.Node): ts.JsxAttributes | null {
  if (ts.isJsxElement(node)) return node.openingElement.attributes;
  if (ts.isJsxSelfClosingElement(node)) return node.attributes;
  return null;
}

/** Does any DESCENDANT element self-scroll (per the same accept-set)? */
function subtreeScrolls(node: ts.Node, consts: Map<string, string>, sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    const attrs = elementAttrs(child);
    if (attrs && child !== node && readSignals(attrs, consts, sf).selfScrolls) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

export function extractAnchoredOverlays(source: string, filePath: string): ExtractionReport {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = moduleStringConsts(sf);
  const overlays: ExtractedOverlay[] = [];
  const unclassified: { marker: string | null; line: number; reason: string }[] = [];
  const needsMarker: { line: number }[] = [];

  const visit = (node: ts.Node): void => {
    const attrs = elementAttrs(node);
    if (attrs) {
      const signals = readSignals(attrs, consts, sf);
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (signals.positioned && signals.styleUnreadable !== null) {
        unclassified.push({
          marker: markerOf(attrs, sf),
          line,
          reason: `positioned element with unreadable style: ${signals.styleUnreadable}`,
        });
      } else if (
        signals.positioned &&
        (signals.selfScrolls || (signals.edgeAnchored && subtreeScrolls(node, consts, sf)))
      ) {
        const marker = markerOf(attrs, sf);
        if (marker === null) needsMarker.push({ line });
        else {
          overlays.push({
            marker,
            line,
            via: signals.selfScrolls ? "self-scroller" : "anchored-descendant-scroller",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { overlays, unclassified, needsMarker };
}
