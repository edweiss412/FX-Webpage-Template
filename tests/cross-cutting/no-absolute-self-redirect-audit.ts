/**
 * tests/cross-cutting/no-absolute-self-redirect-audit.ts
 *
 * Matcher for the self-referential-redirect class: a `NextResponse.redirect()`
 * whose target is a `new URL(path, request.url)`. That shape emits an ABSOLUTE
 * Location built from `request.url`, whose host is whatever Next reports rather
 * than what the client typed — so it can redirect to a different spelling of the
 * same origin and drop host-scoped cookies. See
 * docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md §3.
 *
 * CONSERVATIVE BY DESIGN. The resolver follows a bounded chain of declaration
 * initializers; it deliberately does NOT resolve a `let` assigned after
 * declaration, a variable reassigned between construction and redirect, an
 * aliased callee (`const r = NextResponse.redirect`), or a value returned from a
 * helper. No current call site uses those shapes, and a diff introducing one
 * would be visible in review. The job is to stop the KNOWN class from silently
 * returning, not to be a sound dataflow analysis (spec §3.4).
 *
 * Resolution IS scope-aware, and got there in two corrections. A file-global,
 * name-keyed map with last-declaration-wins was unsound in both directions (two
 * handlers both using `url` overwrote each other). Walking enclosing scopes but
 * RECURSING into them was still unsound, which a reviewer's probe demonstrated: a
 * declaration inside a nested block was attributed to the enclosing function.
 * Lookups now read only each scope's own statement list, walking outward, and a
 * same-named parameter stops the walk instead of falling through.
 */
import ts from "typescript";

/** Max declaration-initializer hops, so an alias cycle cannot hang the walk. */
const MAX_HOPS = 3;

export type SelfRedirectFinding = {
  /** 1-based line of the offending `NextResponse.redirect(...)` call. */
  line: number;
  text: string;
};

export function parseSource(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Nearest-enclosing-scope lookup for `const x = <init>`.
 *
 * Only a scope's OWN statement list is inspected. An earlier revision recursed
 * with forEachChild and so descended into nested blocks, which a reviewer's probe
 * showed left both collision directions unsound: a safe `url` inside an `if`
 * block was treated as the enclosing function's declaration (masking a dangerous
 * outer one), and a dangerous nested `url` tainted a safe outer redirect. A
 * declaration inside a nested block belongs to THAT block, and is found when
 * resolving a reference that actually sits inside it.
 *
 * A parameter of the same name STOPS the walk rather than falling through to an
 * outer initializer: the value is a parameter, whose contents this matcher cannot
 * know, so treating it as unresolvable is the honest answer.
 */
function statementsOf(scope: ts.Node): readonly ts.Statement[] {
  if (ts.isSourceFile(scope) || ts.isBlock(scope)) return scope.statements;
  if (
    (ts.isFunctionDeclaration(scope) ||
      ts.isFunctionExpression(scope) ||
      ts.isArrowFunction(scope) ||
      ts.isMethodDeclaration(scope)) &&
    scope.body !== undefined &&
    ts.isBlock(scope.body)
  ) {
    return scope.body.statements;
  }
  return [];
}

function parametersOf(scope: ts.Node): readonly ts.ParameterDeclaration[] {
  return ts.isFunctionDeclaration(scope) ||
    ts.isFunctionExpression(scope) ||
    ts.isArrowFunction(scope) ||
    ts.isMethodDeclaration(scope)
    ? scope.parameters
    : [];
}

function scopeOf(node: ts.Node): ts.Node | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur !== undefined) {
    if (
      ts.isBlock(cur) ||
      ts.isSourceFile(cur) ||
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return undefined;
}

/** `SHADOWED` means "declared here, initializer unknowable" — stop, do not ascend. */
const SHADOWED = Symbol("shadowed");

function declaredIn(scope: ts.Node, name: string): ts.Expression | typeof SHADOWED | undefined {
  for (const param of parametersOf(scope)) {
    if (ts.isIdentifier(param.name) && param.name.text === name) return SHADOWED;
  }
  for (const stmt of statementsOf(scope)) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue;
      return decl.initializer ?? SHADOWED;
    }
  }
  return undefined;
}

/** Resolve an identifier to its initializer, innermost scope first. */
function initializerFor(ref: ts.Node, name: string): ts.Expression | undefined {
  let scope = scopeOf(ref);
  while (scope !== undefined) {
    const hit = declaredIn(scope, name);
    if (hit === SHADOWED) return undefined;
    if (hit !== undefined) return hit;
    scope = ts.isSourceFile(scope) ? undefined : scopeOf(scope);
  }
  return undefined;
}

/**
 * True for the request's own URL: `request.url` / `req.url`, `request.nextUrl`
 * (Next's parsed twin of the same self-origin value, which review flagged as an
 * undocumented bypass), one hop further down that value, or an identifier holding
 * any of them (`const base = request.url`).
 */
function isRequestUrl(expr: ts.Expression, hops = 0): boolean {
  if (
    ts.isPropertyAccessExpression(expr) &&
    (expr.name.text === "url" || expr.name.text === "nextUrl") &&
    ts.isIdentifier(expr.expression) &&
    (expr.expression.text === "request" || expr.expression.text === "req")
  ) {
    return true;
  }
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    expr.expression.name.text === "nextUrl" &&
    ts.isIdentifier(expr.expression.expression) &&
    (expr.expression.expression.text === "request" || expr.expression.expression.text === "req")
  ) {
    return true;
  }
  if (ts.isIdentifier(expr) && hops < MAX_HOPS) {
    const init = initializerFor(expr, expr.text);
    if (init !== undefined) return isRequestUrl(init, hops + 1);
  }
  return false;
}

/** True for `new URL(<path>, <request url>)`, or an identifier holding one. */
function isSelfUrl(expr: ts.Expression, hops = 0): boolean {
  if (
    ts.isNewExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "URL" &&
    expr.arguments !== undefined &&
    expr.arguments.length >= 2
  ) {
    const base = expr.arguments[1];
    return base !== undefined && isRequestUrl(base);
  }
  // Variable-assigned and alias chains: `const url = new URL(...); const u = url;`
  if (ts.isIdentifier(expr) && hops < MAX_HOPS) {
    const init = initializerFor(expr, expr.text);
    if (init !== undefined) return isSelfUrl(init, hops + 1);
  }
  return false;
}

function isNextResponseRedirect(expr: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(expr) &&
    expr.name.text === "redirect" &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "NextResponse"
  );
}

export function findSelfRedirects(sf: ts.SourceFile): SelfRedirectFinding[] {
  const findings: SelfRedirectFinding[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isNextResponseRedirect(node.expression)) {
      const target = node.arguments[0];
      if (target !== undefined && isSelfUrl(target)) {
        findings.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          text: node.getText(sf).split("\n")[0]!.trim(),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return findings;
}

export function auditSource(fileName: string, source: string): SelfRedirectFinding[] {
  return findSelfRedirects(parseSource(fileName, source));
}
