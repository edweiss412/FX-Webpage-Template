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
 * Resolution IS scope-aware, though. An earlier revision keyed one file-global
 * map by identifier name with last-declaration-wins, which review found unsound
 * in both directions: two handlers in one file both using the common name `url`
 * would overwrite each other, so a dangerous declaration could be masked by a
 * later safe one (false negative) or a safe one flagged by an earlier dangerous
 * one (false positive). `app/api/auth/picker-bootstrap/route.ts` already
 * declares a safe `url`, so the collision was live, not theoretical. Lookups now
 * walk outward from the reference through its enclosing scopes.
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
 * Nearest-enclosing-scope lookup for `const x = <init>` by identifier.
 *
 * Walks outward from the reference: the innermost function/block that declares
 * the name wins, so same-named locals in sibling handlers cannot collide.
 */
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

/** Declarations directly inside one scope (not nested functions' bodies). */
function declaredIn(scope: ts.Node, name: string): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined
    ) {
      found = node.initializer;
      return;
    }
    // Do not descend into a nested function: its locals are a different scope.
    if (
      node !== scope &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(scope, visit);
  return found;
}

/** Resolve an identifier to its initializer, innermost scope first. */
function initializerFor(ref: ts.Node, name: string): ts.Expression | undefined {
  let scope = scopeOf(ref);
  while (scope !== undefined) {
    const hit = declaredIn(scope, name);
    if (hit !== undefined) return hit;
    scope = ts.isSourceFile(scope) ? undefined : scopeOf(scope);
  }
  return undefined;
}

/** True for `request.url` / `req.url`, or an identifier holding one. */
function isRequestUrl(expr: ts.Expression, hops = 0): boolean {
  if (
    ts.isPropertyAccessExpression(expr) &&
    expr.name.text === "url" &&
    ts.isIdentifier(expr.expression) &&
    (expr.expression.text === "request" || expr.expression.text === "req")
  ) {
    return true;
  }
  // Captured base: `const base = request.url; new URL(p, base)`.
  if (ts.isIdentifier(expr) && hops < MAX_HOPS) {
    const init = initializerFor(expr, expr.text);
    if (init !== undefined) return isRequestUrl(init, hops + 1);
  }
  return false;
}

/** True for `new URL(<path>, request.url)`, or an identifier holding one. */
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
