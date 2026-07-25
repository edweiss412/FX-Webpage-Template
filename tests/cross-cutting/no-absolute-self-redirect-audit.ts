/**
 * tests/cross-cutting/no-absolute-self-redirect-audit.ts
 *
 * Bans `NextResponse.redirect(...)` under `app/`, allow-listing the handful of
 * sites that legitimately redirect to an EXTERNAL absolute URL. Everything else
 * must go through `hostRelativeRedirect` (lib/http), whose Location is
 * host-relative and therefore cannot flip the host and drop host-scoped cookies.
 * See docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md section 3.
 *
 * WHAT THIS IS, STATED HONESTLY: a tripwire for the spellings anyone has actually
 * written, NOT a sound analysis. Four review rounds each found another way to
 * spell the same call, which is the nature of the problem rather than a series of
 * oversights — any expression can produce a function, so no syntactic matcher can
 * be complete. The rounds went: text match, then a name-keyed initializer map,
 * then scope-aware resolution, then default-deny on a literal `NextResponse`
 * receiver. Each closed real bypasses; none was the last one.
 *
 * So the claim is bounded. This guard catches every form below, and the tree is
 * clean of them:
 *   - `NextResponse.redirect(new URL(p, request.url))` and the `req.url` spelling
 *   - the value assigned to a variable, aliased through another, or captured base
 *   - a declaration inside a nested block
 *   - a parenthesized or type-asserted argument
 *   - `request.nextUrl`, including `.clone()` with a mutated pathname
 *   - an aliased import (`import { NextResponse as NR }`)
 *   - element access (`NextResponse["redirect"]`)
 *   - a parenthesized receiver
 *   - a destructured method (`const { redirect } = NextResponse`)
 *   - a namespace import (`import * as NS`, then `NS.NextResponse.redirect`)
 *   - a const-aliased receiver (`const NR = NextResponse`)
 *   - an extracted method (`const go = NextResponse.redirect`)
 *   - the Web API `Response.redirect`
 *
 * KNOWN RESIDUAL, filed as BL-SOUND-REDIRECT-GUARD: a value that reaches the call
 * through a helper's return, a class field, a re-export, or dynamic dispatch is not
 * resolved. Nothing in the tree does that today, and such a diff would be visible
 * in review, but the guard does not prove their absence. Treat a green run as "no
 * KNOWN spelling is present", not "the class is impossible".
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
export const EXTERNAL_REDIRECT_ALLOWLIST: Readonly<
  Record<string, { reason: string; argument: string }>
> = {
  // Supabase-issued Google OAuth endpoint (accounts.google.com). Off-origin by
  // definition — the point of the call is to leave the app.
  //
  // `argument` is pinned as well as the line: review noted that a line-keyed
  // exemption still covers the call if its argument changes IN PLACE from
  // `data.url` to `new URL(path, request.url)`, which would reintroduce the flip
  // under cover of the row.
  "app/api/auth/google/start/route.ts:72": {
    reason: "Supabase-issued Google OAuth URL",
    argument: "data.url",
  },
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

  const namespaces = new Set<string>();
  const visitImports = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith("next/") &&
      node.importClause?.namedBindings !== undefined
    ) {
      const bindings = node.importClause.namedBindings;
      if (ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if ((el.propertyName ?? el.name).text === "NextResponse") receivers.add(el.name.text);
        }
      }
      // `import * as NS from "next/server"` → `NS.NextResponse.redirect(...)`
      if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    }
    ts.forEachChild(node, visitImports);
  };
  ts.forEachChild(sf, visitImports);
  // Fixtures and files without the import still name it directly. `Response` is
  // the Web API twin, whose redirect is absolute in exactly the same way.
  receivers.add("NextResponse");
  receivers.add("Response");
  for (const ns of namespaces) receivers.add(`${ns}.NextResponse`);

  const visitAliases = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const init = unwrap(node.initializer);
      // `const NR = NextResponse`
      if (ts.isIdentifier(init) && receivers.has(init.text)) receivers.add(node.name.text);
      // `const go = NextResponse.redirect`
      if (
        ts.isPropertyAccessExpression(init) &&
        init.name.text === "redirect" &&
        receiverText(init.expression) !== null &&
        receivers.has(receiverText(init.expression)!)
      ) {
        bare.add(node.name.text);
      }
    }
    ts.forEachChild(node, visitAliases);
  };
  ts.forEachChild(sf, visitAliases);

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

/** Dotted receiver name (`NextResponse`, `NS.NextResponse`), or null. */
function receiverText(expr: ts.Expression): string | null {
  const r = unwrap(expr);
  if (ts.isIdentifier(r)) return r.text;
  if (ts.isPropertyAccessExpression(r)) {
    const left = receiverText(r.expression);
    return left === null ? null : `${left}.${r.name.text}`;
  }
  return null;
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
    const text = receiverText(recv);
    return text !== null && bindings.receivers.has(text);
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
  return auditSource(repoRelativePath, source).filter((f) => {
    const row = EXTERNAL_REDIRECT_ALLOWLIST[`${repoRelativePath}:${f.line}`];
    // Exempt only if the argument still matches what the row was granted for.
    return row === undefined || !f.text.includes(row.argument);
  });
}
