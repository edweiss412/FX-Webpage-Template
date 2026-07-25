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

/** `NextResponse.redirect(...)`, however its argument is spelled. */
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
