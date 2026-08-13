/**
 * tests/help/_renderedTextHaystack.ts
 *
 * Rendered-text extraction for the /help UI-label crosswalk
 * (BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY, M-wave 2 spec §2.5).
 *
 * The crosswalk used to attest labels against ALL production source, so a
 * type annotation (`viewer: Viewer`), a bare constant initializer, or a
 * `data-testid` value counted as a button label — a match that proves nothing
 * about rendered UI. This module walks the TypeScript AST and yields ONLY
 * text that can reach the DOM, keyed on node kind AND RENDER POSITION:
 *
 *   (a) `JsxText` children;
 *   (b) string literals, no-substitution templates, and template FRAGMENTS
 *       (`TemplateHead`/`Middle`/`Tail` — `isStringLiteralLike` drops
 *       fragments, the L-wave scanner's probed lesson) appearing as or inside
 *       a JSX expression CHILD;
 *   (c) values of user-visible JSX attributes from a named allowlist —
 *       `aria-label`, `aria-description`, `title`, `alt`, `placeholder`,
 *       `label`. `data-testid`, `className`, and every other attribute are
 *       OUT.
 *
 * Copy defined in constants and rendered indirectly is deliberately EXCLUDED
 * and handled loud: a label attested only via such a constant FAILS the
 * crosswalk and takes a reasons-required row in
 * `_uiLabelIndirectCopySources.ts` citing its render site. Under-inclusion
 * surfaces as a failing label that gets dispositioned; over-inclusion would
 * attest silently — the design chooses the loud side (the consequence bound).
 */
import ts from "typescript";

const USER_VISIBLE_ATTRS = new Set([
  "aria-label",
  "aria-description",
  "title",
  "alt",
  "placeholder",
  "label",
]);

/** Append every string/template-fragment text within `node` (any depth). */
function collectStringy(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteralLike(node)) {
    out.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) {
      collectStringy(span.expression, out);
      out.push(span.literal.text);
    }
    return;
  }
  ts.forEachChild(node, (child) => collectStringy(child, out));
}

function attrText(attr: ts.JsxAttribute, out: string[]): void {
  if (!attr.initializer) return;
  if (ts.isStringLiteralLike(attr.initializer)) {
    out.push(attr.initializer.text);
    return;
  }
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    collectStringy(attr.initializer.expression, out);
  }
}

/**
 * The rendered text of one source file, newline-joined. Everything the AST
 * cannot place in render position contributes nothing.
 */
export function renderedTextOf(source: string, filePath: string): string {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];

  const visitChildren = (node: ts.JsxElement | ts.JsxFragment): void => {
    for (const child of node.children) {
      if (ts.isJsxText(child)) {
        const text = child.text.trim();
        if (text) out.push(text);
      } else if (ts.isJsxExpression(child) && child.expression) {
        collectStringy(child.expression, out);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) visitChildren(node);
    const attrs = ts.isJsxElement(node)
      ? node.openingElement.attributes
      : ts.isJsxSelfClosingElement(node)
        ? node.attributes
        : null;
    if (attrs) {
      for (const attr of attrs.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const name = ts.isIdentifier(attr.name) ? attr.name.text : attr.name.getText(sf);
        if (USER_VISIBLE_ATTRS.has(name)) attrText(attr, out);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.join("\n");
}
