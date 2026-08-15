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
 * contributor). Runtime-assembled class strings and computed style objects are
 * outside recognition; adversarial obfuscation files here, not to the guard.
 *
 * The limit that matters, stated with its CONSEQUENCE (whole-diff review r4 F3).
 * Candidate discovery — used only to prove that every band class the source
 * writes actually COMPILES — is unavoidably a source-side recognizer, because a
 * typo'd band emits no CSS at all and therefore cannot be found by reading the
 * compiled stylesheet. A band class reaching the DOM through a form this scanner
 * cannot statically resolve (an object registry keyed elsewhere, a value built
 * at runtime) is not discovered, so a TYPO in such a class is not reported.
 *
 * Its worst case is loud, not silent: the utility does not exist, Tailwind emits
 * nothing, and the element renders with NO z-index — an overlay paints behind
 * its content, visibly, on first look. That is a conservative failure with a
 * surfaced signal, which is the shape this project files as a documented limit
 * rather than chasing through another round of recognizer widening. The SILENT
 * failure — a raw numeral quietly winning a stacking contest — is closed
 * completely, and by the compiler rather than by this file: every z-index the
 * app emits is checked in `_metaZIndexBands.test.ts`, which fails closed on any
 * band value it cannot attribute to a band name.
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

/**
 * A numeric `z-<n>` utility, WITH any Tailwind variant prefixes it carries.
 *
 * The prefixes are part of the match rather than something to strip, because
 * `focus:z-50` is every bit as much a raw stacking numeral as `z-50` — it just
 * applies in one state. The first version anchored on a bare token boundary and
 * therefore reported `app/help/layout.tsx`'s skip link, a `focus:z-50`, as
 * having no sites at all (whole-diff review r1 F1).
 */
const NUMERIC_Z_UTILITY = /(?:^|\s)((?:[a-z][a-z0-9-]*:)*z-\d+)(?=\s|$)/g;

/**
 * A NAMED band utility (`z-overlay`, `focus:z-nav`) in className context.
 *
 * Same recognizer, second question. The band guard needs to know which band
 * NAMES the source actually writes, so it can reject one that names no declared
 * band — a typo emits no `z-index` at all and no numeral-hunting check would
 * see it (whole-diff review r1 F2). Reading className context rather than raw
 * text is what keeps `z-index:` in a comment from counting as a class.
 */
const NAMED_Z_UTILITY_FULL = /(?:^|\s)((?:[^\s"'`]*:)?!?z-[a-z][a-z0-9-]*!?)(?=\s|$)/g;

/**
 * The numeric value of an inline-style expression, through the FINITE set of
 * TypeScript wrappers that change the type and not the value.
 *
 * Whole-diff review r4 F4: `zIndex: "100"`, a template literal, `(100)`,
 * `100 as const`, `100 satisfies number` and a quoted key all reach the DOM as
 * `z-index: 100`, and a numeric-literal-only reading saw none of them. Unlike a
 * class-name recognizer this IS a closed set — assertions, parentheses, unary
 * signs, and the two literal forms whose text is a number — so widening here
 * terminates rather than inviting the next idiom.
 */
function unwrapNumeric(expr: ts.Expression): string | null {
  let node: ts.Expression = expr;
  let sign = "";
  for (;;) {
    if (ts.isParenthesizedExpression(node)) {
      node = node.expression;
    } else if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
      node = node.expression;
    } else if (ts.isNonNullExpression(node)) {
      node = node.expression;
    } else if (ts.isPrefixUnaryExpression(node)) {
      if (node.operator === ts.SyntaxKind.MinusToken) sign = sign === "-" ? "" : "-";
      else if (node.operator !== ts.SyntaxKind.PlusToken) return null;
      node = node.operand;
    } else {
      break;
    }
  }
  if (ts.isNumericLiteral(node)) return `${sign}${node.text}`;
  // A string or a no-substitution template whose CONTENT is a number: React
  // writes it to the style attribute verbatim.
  if (ts.isStringLiteralLike(node) && /^-?\d+$/.test(node.text.trim())) {
    return `${sign}${node.text.trim()}`;
  }
  return null;
}

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

  // Numeric bindings in this file, so `const Z = 100; style={{ zIndex: Z }}`
  // resolves (r6 F3: "a bound value is not unwrapped"). One hop, same file —
  // enough for the ordinary idiom, and it stops there rather than chasing an
  // import graph, which is the documented limit stated in the header.
  const numericBindings = new Map<string, string>();
  const collectBindings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const v = unwrapNumeric(node.initializer);
      if (v !== null) numericBindings.set(node.name.text, v);
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(sf);

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
    // Idiom 1b: string consts (cn()-wrapped or bare) that feed className
    // indirectly — at ANY scope, not only module level.
    //
    // The scope restriction was the second half of r1 F1: `const overlayClass =
    // cn("... z-10 ...")` inside a component body, and ShareHub's
    // `const triggerElevation = elevateTriggers ? " relative z-30" : ""`, are
    // ordinary idioms in this repo and were both invisible. A declaration's
    // scope says nothing about whether its numerals reach the DOM.
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const text = staticClassText(node.initializer);
      if (text) pushUtilities(text, node);
    }
    // Idiom 2: inline style objects with numeric zIndex — reached wherever the
    // object literal is WRITTEN, not only where it is spread into `style=`.
    // r6 F3 named `style={EYEBROW_STYLE}` (step3ReviewSections.tsx) as an idiom
    // already in the tree: the property assignment lives in a module const, so a
    // visitor that only looked inside a `style` attribute saw nothing. Visiting
    // every PropertyAssignment named zIndex covers both, because the property is
    // the thing that reaches the DOM regardless of how it gets there.
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === "zIndex") ||
        // A quoted key is the same property: `"zIndex": 100` and `"z-index": 100`
        // both reach the DOM (whole-diff review r4 F4).
        (ts.isStringLiteralLike(node.name) &&
          (node.name.text === "zIndex" || node.name.text === "z-index")))
    ) {
      const value =
        unwrapNumeric(node.initializer) ??
        (ts.isIdentifier(node.initializer)
          ? (numericBindings.get(node.initializer.text) ?? null)
          : null);
      if (value !== null) {
        sites.push({
          file: filePath,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          token: `zIndex: ${value}`,
          idiom: "inline-style",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

/**
 * Every named band class the file writes in className context, variant prefixes
 * stripped (a `focus:` variant is the same band, applied in one state).
 */
export function scanBandClassTokens(source: string, filePath: string): string[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set<string>();
  // The FULL token, variants and `!` included: a typo in a VARIANT emits no rule
  // at all, and normalizing it away is exactly how that escapes (r3 F3).
  const collect = (text: string): void => {
    for (const m of text.matchAll(NAMED_Z_UTILITY_FULL)) names.add(m[1]!);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className") {
      const expr = !node.initializer
        ? undefined
        : ts.isStringLiteralLike(node.initializer)
          ? node.initializer
          : ts.isJsxExpression(node.initializer)
            ? node.initializer.expression
            : undefined;
      if (expr) collect(staticClassText(expr));
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      collect(staticClassText(node.initializer));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...names];
}
