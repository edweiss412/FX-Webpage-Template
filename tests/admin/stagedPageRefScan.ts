/**
 * tests/admin/stagedPageRefScan.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §3.3)
 *
 * AST primitives for the retired-staged-page guard, extracted from
 * step3DeletionSafety.test.ts so every branch can be exercised against SYNTHETIC
 * sources. The hole this module closes (BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS)
 * survived precisely because the old predicate was only ever run against the live
 * tree, which contains no instance of the bypass.
 *
 * TWO INDEPENDENT QUESTIONS, deliberately kept separate:
 *   - classifyRetiredPathOccurrences: WHERE does the retired path appear, and in
 *     what KIND of position? The guard pins kinds, not just counts, so converting
 *     a ratified comment into code fails even at an unchanged count.
 *   - resolveNavHrefs: does any <Link>/<a> href RESOLVE to the retired path,
 *     including through a helper, a const, an object property, or a `+` chain?
 *
 * NEVER shell out to grep to answer either: components/admin/wizard/Step3Review.tsx
 * carries a raw NUL byte, so `file(1)` calls it `data` and grep skips it silently
 * (spec §3.2a). Callers read with readFileSync(path, "utf8").
 */
import ts from "typescript";

/** The retired standalone re-apply page. `/api/...` paths are legitimate endpoints. */
export const RETIRED_PATH = "/admin/onboarding/staged/";
const API_PREFIX = "/api";

/** Stands in for a dynamic `${…}` part when a template or `+` chain is flattened. */
const SUBSTITUTION = "\u0001";

export type OccurrenceKind = "comment" | "string-literal" | "assembled" | "other";

function isApiPrefixed(haystack: string, index: number): boolean {
  return haystack.slice(0, index).endsWith(API_PREFIX);
}

/** Every index of RETIRED_PATH in `text` that is NOT part of an `/api/...` path. */
function retiredPathIndexes(text: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(RETIRED_PATH, from);
    if (idx === -1) return out;
    if (!isApiPrefixed(text, idx)) out.push(idx);
    from = idx + 1;
  }
}

function commentRanges(src: string, sourceFile: ts.SourceFile): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const visit = (node: ts.Node): void => {
    for (const r of ts.getLeadingCommentRanges(src, node.pos) ?? []) ranges.push([r.pos, r.end]);
    for (const r of ts.getTrailingCommentRanges(src, node.end) ?? []) ranges.push([r.pos, r.end]);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
}

/** Spans of every string/template literal, so a raw hit can be attributed to one. */
function literalSpans(sourceFile: ts.SourceFile): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      spans.push([node.getStart(sourceFile), node.end]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return spans;
}

function within(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/** Static text of an expression, with `\u0001` for every dynamic part. Null when nothing is static. */
function flatten(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text + node.templateSpans.map((span) => SUBSTITUTION + span.literal.text).join("")
    );
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = flatten(node.left) ?? SUBSTITUTION;
    const right = flatten(node.right) ?? SUBSTITUTION;
    return left + right;
  }
  if (ts.isParenthesizedExpression(node)) return flatten(node.expression);
  return null;
}

/**
 * Where the retired path appears in `src`, and in what kind of position.
 *
 * "assembled" is the R1-5a case: `"/admin/onboarding/" + "staged/" + id` contains
 * the path in NO single literal, so a per-literal scan and the raw-text scan both
 * miss it. Those are found by flattening every template and `+` chain.
 * "other" is a fail-safe bucket — an occurrence we could not attribute still shows
 * up and still has to be ratified.
 */
export function classifyRetiredPathOccurrences(
  src: string,
  fileName = "source.tsx",
): OccurrenceKind[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );

  const comments = commentRanges(src, sourceFile);
  const literals = literalSpans(sourceFile);

  const kinds: OccurrenceKind[] = retiredPathIndexes(src).map((idx) => {
    if (within(comments, idx)) return "comment";
    if (within(literals, idx)) return "string-literal";
    return "other";
  });

  // Assembled occurrences leave no contiguous match in the raw source, so they are
  // additional to (never double-counted with) the raw hits above.
  const visit = (node: ts.Node): void => {
    if (
      ts.isTemplateExpression(node) ||
      (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    ) {
      const flat = flatten(node as ts.Expression);
      if (flat) {
        const rawInThisNode = retiredPathIndexes(node.getText(sourceFile)).length;
        const flatHits = retiredPathIndexes(flat).length;
        for (let i = 0; i < flatHits - rawInThisNode; i += 1) kinds.push("assembled");
      }
      // Do not descend into a `+` chain we already flattened: its inner nodes would
      // re-report the same assembled hit.
      if (ts.isBinaryExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return kinds;
}

export type ResolvedHref = { value: string; line: number };

function unwrap(node: ts.Expression): ts.Expression {
  let cur = node;
  for (;;) {
    if (ts.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isNonNullExpression(cur))
      cur = cur.expression;
    else return cur;
  }
}

type FileScope = {
  consts: Map<string, ts.Expression>;
  /** Function-ish declarations whose body is a single `return <expr>`. */
  returns: Map<string, ts.Expression>;
  objects: Map<string, Map<string, ts.Expression>>;
};

function singleReturnExpression(node: ts.Node): ts.Expression | null {
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return node.body;
  const body = (node as ts.FunctionLikeDeclaration).body;
  if (!body || !ts.isBlock(body)) return null;
  const [only] = body.statements;
  if (body.statements.length === 1 && only && ts.isReturnStatement(only) && only.expression) {
    return only.expression;
  }
  return null;
}

function collectScope(sourceFile: ts.SourceFile): FileScope {
  const scope: FileScope = { consts: new Map(), returns: new Map(), objects: new Map() };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const ret = singleReturnExpression(node);
      if (ret) scope.returns.set(node.name.text, ret);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        const ret = singleReturnExpression(init);
        if (ret) scope.returns.set(node.name.text, ret);
      } else if (ts.isObjectLiteralExpression(init)) {
        const props = new Map<string, ts.Expression>();
        for (const prop of init.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
          ) {
            props.set(prop.name.text, prop.initializer);
          }
        }
        scope.objects.set(node.name.text, props);
      } else {
        scope.consts.set(node.name.text, init);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return scope;
}

/** Static value of an href expression, resolving up to two identifier hops. */
function resolveExpression(node: ts.Expression, scope: FileScope, hops = 0): string | null {
  if (hops > 2) return null;
  const expr = unwrap(node);

  const flat = flatten(expr);
  if (flat !== null) {
    // A `+` chain may still contain identifiers we can resolve; re-flatten with them.
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolveExpression(expr.left, scope, hops + 1) ?? SUBSTITUTION;
      const right = resolveExpression(expr.right, scope, hops + 1) ?? SUBSTITUTION;
      return left + right;
    }
    return flat;
  }

  if (ts.isIdentifier(expr)) {
    const bound = scope.consts.get(expr.text);
    return bound ? resolveExpression(bound, scope, hops + 1) : null;
  }

  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const obj = scope.objects.get(expr.expression.text);
    const value = obj?.get(expr.name.text);
    return value ? resolveExpression(value, scope, hops + 1) : null;
  }

  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    const ret = scope.returns.get(expr.expression.text);
    return ret ? resolveExpression(ret, scope, hops + 1) : null;
  }

  return null;
}

/** Every statically resolvable `href` on a `<Link>` / `<a>` / `<*Link>` element. */
export function resolveNavHrefs(src: string, fileName = "source.tsx"): ResolvedHref[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const scope = collectScope(sourceFile);
  const out: ResolvedHref[] = [];

  const isNavTag = (tagName: ts.JsxTagNameExpression): boolean => {
    const text = tagName.getText(sourceFile);
    return text === "a" || text === "Link" || /Link$/.test(text);
  };

  const visitAttributes = (attrs: ts.JsxAttributes, tagName: ts.JsxTagNameExpression): void => {
    if (!isNavTag(tagName)) return;
    for (const attr of attrs.properties) {
      if (!ts.isJsxAttribute(attr) || attr.name.getText(sourceFile) !== "href") continue;
      const init = attr.initializer;
      if (!init) continue;
      const expr = ts.isJsxExpression(init) ? init.expression : init;
      if (!expr) continue;
      const value = resolveExpression(expr as ts.Expression, scope);
      if (value === null) continue;
      out.push({
        value,
        line: sourceFile.getLineAndCharacterOfPosition(attr.getStart(sourceFile)).line + 1,
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node)) visitAttributes(node.attributes, node.tagName);
    if (ts.isJsxOpeningElement(node)) visitAttributes(node.attributes, node.tagName);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return out;
}

/** True when a resolved href points at the retired page (not an `/api/...` route). */
export function hrefHitsRetiredPage(value: string): boolean {
  return retiredPathIndexes(value).length > 0;
}
