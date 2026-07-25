/**
 * tests/cross-cutting/no-absolute-self-redirect-audit.ts
 *
 * Bans `NextResponse.redirect(...)` under `app/`, allow-listing the handful of
 * sites that legitimately redirect to an EXTERNAL absolute URL. Everything else
 * must go through `hostRelativeRedirect` (lib/http), whose Location is
 * host-relative and therefore cannot flip the host and drop host-scoped cookies.
 * See docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md section 3.
 *
 * WHY DEFAULT-DENY, after three rounds of the other approach. The first versions
 * analysed the redirect's ARGUMENT to decide whether it derived from the request:
 * a text match, then a name-keyed initializer map, then scope-aware resolution.
 * Each round a reviewer's probe found another spelling that slipped through — a
 * parenthesized `new URL(...)`, an `as URL` assertion, a request parameter named
 * `nextRequest` rather than `request`, `const { url } = request`, bare
 * `request.nextUrl`, and `request.nextUrl.clone()` with a mutated pathname. Every
 * one recreates the host flip while the guard stays green. The space of ways to
 * spell "a URL derived from this request" is unbounded, so an argument-shape
 * matcher is a losing game.
 *
 * Keying on the CALL is bounded and cannot be spelled around: there is one way to
 * invoke `NextResponse.redirect`. The cost is that a legitimate external redirect
 * needs an allow-list row — a one-line reviewable act that has to state its
 * reason, which is the right shape for a deliberate exception.
 */
import ts from "typescript";

export type SelfRedirectFinding = {
  /** 1-based line of the `NextResponse.redirect(...)` call. */
  line: number;
  text: string;
};

/**
 * Sites that redirect to an EXTERNAL absolute URL, where host-relative is wrong.
 *
 * Keyed `path:line` so a moved call re-surfaces for review instead of inheriting
 * its predecessor's exemption. Keep this tiny: every row is a standing claim that
 * the target is genuinely off-origin.
 */
export const EXTERNAL_REDIRECT_ALLOWLIST: Readonly<Record<string, string>> = {
  // Supabase-issued Google OAuth endpoint (accounts.google.com). Off-origin by
  // definition — the point of the call is to leave the app.
  "app/api/auth/google/start/route.ts:72": "Supabase-issued Google OAuth URL (data.url)",
};

export function parseSource(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Resolve which local names refer to `NextResponse` and to a bare `redirect`
 * destructured off it.
 *
 * Matching the literal text `NextResponse.redirect` was not default-deny: review
 * bypassed it with an aliased import (`import { NextResponse as NR }` then
 * `NR.redirect(...)`), element access (`NextResponse["redirect"](...)`), a
 * parenthesized receiver, and a destructured method
 * (`const { redirect } = NextResponse`). Each recreates the host flip. So the
 * receiver is resolved from the IMPORT rather than assumed, and the destructured
 * form is tracked too.
 */
function resolveBindings(sf: ts.SourceFile): { receivers: Set<string>; bare: Set<string> } {
  const receivers = new Set<string>();
  const bare = new Set<string>();

  const visitImports = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith("next/") &&
      node.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const el of node.importClause.namedBindings.elements) {
        if ((el.propertyName ?? el.name).text === "NextResponse") receivers.add(el.name.text);
      }
    }
    ts.forEachChild(node, visitImports);
  };
  ts.forEachChild(sf, visitImports);
  // Fixtures and files without the import still name it directly.
  receivers.add("NextResponse");

  const visitDestructures = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      ts.isIdentifier(unwrap(node.initializer)) &&
      receivers.has((unwrap(node.initializer) as ts.Identifier).text)
    ) {
      for (const el of node.name.elements) {
        if ((el.propertyName ?? el.name).getText(sf) === "redirect" && ts.isIdentifier(el.name)) {
          bare.add(el.name.text);
        }
      }
    }
    ts.forEachChild(node, visitDestructures);
  };
  ts.forEachChild(sf, visitDestructures);

  return { receivers, bare };
}

/** Strip parentheses and type assertions so a wrapped receiver still resolves. */
function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (
    ts.isParenthesizedExpression(cur) ||
    ts.isAsExpression(cur) ||
    ts.isTypeAssertionExpression(cur) ||
    ts.isNonNullExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

/** A call to `redirect` on the NextResponse binding, however it is spelled. */
function isRedirectCall(
  expr: ts.Expression,
  bindings: { receivers: Set<string>; bare: Set<string> },
): boolean {
  const callee = unwrap(expr);
  // Destructured: `const { redirect } = NextResponse; redirect(...)`
  if (ts.isIdentifier(callee) && bindings.bare.has(callee.text)) return true;

  const receiverIs = (recv: ts.Expression): boolean => {
    const r = unwrap(recv);
    return ts.isIdentifier(r) && bindings.receivers.has(r.text);
  };
  // `X.redirect(...)`
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "redirect" &&
    receiverIs(callee.expression)
  ) {
    return true;
  }
  // `X["redirect"](...)`
  if (
    ts.isElementAccessExpression(callee) &&
    callee.argumentExpression !== undefined &&
    ts.isStringLiteralLike(callee.argumentExpression) &&
    callee.argumentExpression.text === "redirect" &&
    receiverIs(callee.expression)
  ) {
    return true;
  }
  return false;
}

export function findSelfRedirects(sf: ts.SourceFile): SelfRedirectFinding[] {
  const bindings = resolveBindings(sf);
  const findings: SelfRedirectFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isRedirectCall(node.expression, bindings)) {
      findings.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        text: node.getText(sf).split("\n")[0]!.trim(),
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return findings;
}

export function auditSource(fileName: string, source: string): SelfRedirectFinding[] {
  return findSelfRedirects(parseSource(fileName, source));
}

/** Findings with no allow-list row, keyed `path:line`. */
export function unallowedRedirects(
  repoRelativePath: string,
  source: string,
): SelfRedirectFinding[] {
  return auditSource(repoRelativePath, source).filter(
    (f) => EXTERNAL_REDIRECT_ALLOWLIST[`${repoRelativePath}:${f.line}`] === undefined,
  );
}
