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
import { commentRanges } from "../_shared/stripComments";

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

/** Identifier / object-property / one-hop-helper resolution, shared by both scans. */
function resolveBinding(node: ts.Expression, scope: FileScope, hops: number): string | null {
  const expr = unwrap(node);
  if (ts.isIdentifier(expr)) {
    const bound = scope.consts.get(expr.text);
    return bound ? flatten(bound, scope, hops + 1) : null;
  }
  if (
    (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) &&
    ts.isIdentifier(expr.expression)
  ) {
    // `segments.base` AND `segments["base"]` reach the same value.
    const key = ts.isPropertyAccessExpression(expr)
      ? expr.name.text
      : ts.isStringLiteral(expr.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(expr.argumentExpression)
        ? expr.argumentExpression.text
        : null;
    const value = key === null ? undefined : scope.objects.get(expr.expression.text)?.get(key);
    return value ? flatten(value, scope, hops + 1) : null;
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    const ret = scope.returns.get(expr.expression.text);
    return ret ? flatten(ret, scope, hops + 1) : null;
  }
  return null;
}

/**
 * Static text of an expression, with `\u0001` for every dynamic part. Null when
 * nothing is static.
 *
 * When a FileScope is supplied, identifiers, object-literal properties and one-hop
 * helper calls are resolved first: `const A = "/admin/onboarding/"; const B = "staged/";
 * … A + B + id` composes the retired path out of same-file constants, which an
 * identifier-blind flattener renders as two sentinels and misses entirely
 * (whole-diff finding 3).
 */
function flatten(node: ts.Expression, scope?: FileScope, hops = 0): string | null {
  if (scope && hops <= 12) {
    const resolved = resolveBinding(node, scope, hops);
    if (resolved !== null) return resolved;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans
        .map(
          (span) => (flatten(span.expression, scope, hops + 1) ?? SUBSTITUTION) + span.literal.text,
        )
        .join("")
    );
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = flatten(node.left, scope, hops + 1) ?? SUBSTITUTION;
    const right = flatten(node.right, scope, hops + 1) ?? SUBSTITUTION;
    return left + right;
  }
  if (ts.isParenthesizedExpression(node)) return flatten(node.expression, scope, hops);
  // `[...].join(sep)` and `"…".concat(…)` assemble a path exactly like `+` does, and
  // are the two standard alternatives a refactor reaches for (whole-diff R2 finding 3).
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    const receiver = node.expression.expression;
    if (method === "join" && ts.isArrayLiteralExpression(receiver)) {
      const [sepArg] = node.arguments;
      const separator =
        sepArg === undefined
          ? "," // Array.prototype.join's default separator.
          : (flatten(sepArg, scope, hops + 1) ?? SUBSTITUTION);
      return receiver.elements
        .map((el) => flatten(el, scope, hops + 1) ?? SUBSTITUTION)
        .join(separator);
    }
    if (method === "concat") {
      const head = flatten(receiver, scope, hops + 1);
      if (head !== null) {
        return (
          head + node.arguments.map((arg) => flatten(arg, scope, hops + 1) ?? SUBSTITUTION).join("")
        );
      }
    }
  }
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
    // JSX-capable kinds for .tsx/.jsx, plain otherwise. Parsing a JS file as TS is
    // fine (TS is a superset) as long as JSX files get a JSX-aware kind.
    /\.(tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // Layer A/C asks WHERE the path lives, so helper CALLS are deliberately not
  // resolved here: `reApplyUrl(a, b)` is a use site, and the literal inside
  // reApplyUrl's body is already counted where it is written. Resolving calls would
  // report one "assembled" occurrence per call site for a single ratified builder.
  // Constants, object properties and join/concat composition ARE resolved — that is
  // the actual bypass (whole-diff finding 3).
  const fileScope = collectScope(sourceFile);
  const scope: FileScope = {
    consts: fileScope.consts,
    objects: fileScope.objects,
    returns: new Map(),
  };
  const comments = commentRanges(src, ts.ScriptKind.TS, sourceFile);
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
      (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
      ts.isCallExpression(node)
    ) {
      const flat = flatten(node as ts.Expression, scope);
      if (flat) {
        const rawInThisNode = retiredPathIndexes(node.getText(sourceFile)).length;
        const flatHits = retiredPathIndexes(flat).length;
        for (let i = 0; i < flatHits - rawInThisNode; i += 1) kinds.push("assembled");
        // Do not descend into a chain we already flattened: its inner nodes would
        // re-report the same assembled hit. (A call we could NOT flatten still gets
        // walked, so its arguments are scanned normally.)
        if (ts.isBinaryExpression(node) || ts.isCallExpression(node)) return;
      }
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

/**
 * MODULE-SCOPE declarations only. Collecting nested ones keyed by name lets an inner
 * `const BASE = "/safe/"` overwrite an outer retired base (false negative) or the
 * reverse (false positive) — the walker does not model block scope, so it only reads
 * the one scope where the name is unambiguous (whole-diff R2 finding 4).
 */
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
          // `{ base, leaf }` — shorthand carries the value of the same-named const.
          if (ts.isShorthandPropertyAssignment(prop)) {
            const bound = scope.consts.get(prop.name.text);
            if (bound) props.set(prop.name.text, bound);
          }
        }
        scope.objects.set(node.name.text, props);
      } else {
        scope.consts.set(node.name.text, init);
      }
    }
    // Do NOT descend into function bodies: those declarations are block-scoped.
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return scope;
}

/** Static value of an href expression (identifiers, properties, helpers, chains). */
function resolveExpression(node: ts.Expression, scope: FileScope): string | null {
  return flatten(unwrap(node), scope);
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
