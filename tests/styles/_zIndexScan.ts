/**
 * tests/styles/_zIndexScan.ts
 *
 * Dual-idiom z-index census for the semantic band guard
 * (BL-ADMIN-SEMANTIC-Z-INDEX-SCALE, M-wave 2 spec §2.6).
 *
 * Recognizes BOTH ways a raw stacking number reaches the DOM:
 *
 *   1. Tailwind utilities `z-<number>` in className CONTEXT — read from the
 *      TSX AST's className attribute values (string literals, template static
 *      chunks, conditional branches, `cn()`/`clsx()` arguments), never from
 *      comments or arbitrary strings, which is what makes the census exact
 *      where a whole-file grep over-counts (comment mentions are not sites).
 *   2. Inline `style={{ zIndex: <number> }}` object properties with numeric
 *      literal values (the PreviewBanner idiom the spec's r2 F2 named).
 *
 * DOCUMENTED LIMIT (threat-model fence: accidental authoring by an ordinary
 * contributor): runtime-assembled class strings and computed style objects are
 *  outside recognition; adversarial obfuscation files here, not to the guard.
 */
import ts from "typescript";

export type ZSite = {
  /** Repo-relative path. */
  readonly file: string;
  /** 1-based line. */
  readonly line: number;
  /** `z-40` (utility idiom) or `zIndex: 100` (inline idiom). */
  readonly token: string;
  readonly idiom: "utility" | "inline-style";
};

const NUMERIC_Z_UTILITY = /(?:^|\s)(z-\d+)(?=\s|$)/g;

/** Static class text of a className value, per the structural accept-set. */
function staticClassText(expr: ts.Expression): string {
  if (ts.isStringLiteralLike(expr)) return expr.text;
  if (ts.isTemplateExpression(expr)) {
    let text = expr.head.text;
    for (const span of expr.templateSpans) text += ` ${span.literal.text}`;
    return text;
  }
  if (ts.isConditionalExpression(expr)) {
    return `${staticClassText(expr.whenTrue)} ${staticClassText(expr.whenFalse)}`;
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    const callee = expr.expression.text;
    if (callee === "cn" || callee === "clsx") {
      return expr.arguments.map((a) => staticClassText(a)).join(" ");
    }
  }
  if (ts.isParenthesizedExpression(expr)) return staticClassText(expr.expression);
  return "";
}

/**
 * Scan one source file for numeric z-index sites in both idioms.
 *
 * ALSO scans module-level string consts (the `const X = cn("... z-50 ...")`
 * idiom) — a numeric that reaches a className through a const is the same
 * defect at one remove, and skipping consts would leave the ReSyncButton /
 * PublishedToggle overlay skins invisible to the sweep.
 */
export function scanZIndexSites(source: string, filePath: string): ZSite[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites: ZSite[] = [];

  const pushUtilities = (text: string, node: ts.Node): void => {
    for (const m of text.matchAll(NUMERIC_Z_UTILITY)) {
      sites.push({
        file: filePath,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        token: m[1]!,
        idiom: "utility",
      });
    }
  };

  const visit = (node: ts.Node): void => {
    // Idiom 1a: className attributes.
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className") {
      const expr = !node.initializer
        ? undefined
        : ts.isStringLiteralLike(node.initializer)
          ? node.initializer
          : ts.isJsxExpression(node.initializer)
            ? node.initializer.expression
            : undefined;
      if (expr) pushUtilities(staticClassText(expr), node);
    }
    // Idiom 1b: module-level string consts (cn()-wrapped or bare) that feed
    // className indirectly.
    if (ts.isVariableStatement(node) && node.parent === sf) {
      for (const decl of node.declarationList.declarations) {
        if (!decl.initializer) continue;
        const text = staticClassText(decl.initializer);
        if (text) pushUtilities(text, decl);
      }
    }
    // Idiom 2: inline style objects with numeric zIndex.
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === "zIndex") ||
        (ts.isStringLiteralLike(node.name) && node.name.text === "z-index"))
    ) {
      let value: ts.Expression = node.initializer;
      if (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)) {
        value = value.operand;
      }
      if (ts.isNumericLiteral(value)) {
        sites.push({
          file: filePath,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          token: `zIndex: ${value.text}`,
          idiom: "inline-style",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}
