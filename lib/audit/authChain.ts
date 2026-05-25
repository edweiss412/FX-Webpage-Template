import ts from "typescript";

export type AuthAuditFinding = string;

type CallSite = {
  name: string;
  pos: number;
};

function parse(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function callName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function collectCallSites(node: ts.Node): CallSite[] {
  const calls: CallSite[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) {
      const name = callName(child.expression);
      if (name) calls.push({ name, pos: child.getStart() });
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return calls.sort((a, b) => a.pos - b.pos);
}

function firstCall(calls: CallSite[], name: string): CallSite | undefined {
  return calls.find((call) => call.name === name);
}

function firstNamedCall(calls: CallSite[], names: string[]): CallSite | undefined {
  return calls.find((call) => names.includes(call.name));
}

function hasDefaultModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

function findFunction(sourceFile: ts.SourceFile, name: string): ts.FunctionDeclaration | null {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
  }
  return null;
}

function findDefaultFunction(sourceFile: ts.SourceFile): ts.FunctionDeclaration | null {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasDefaultModifier(statement)) {
      return statement;
    }
  }
  return null;
}

function importSpecifiers(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push(statement.moduleSpecifier.text);
    }
  }
  return imports;
}

function auditShowPage(path: string, sourceFile: ts.SourceFile): AuthAuditFinding[] {
  const findings: AuthAuditFinding[] = [];
  const page = findDefaultFunction(sourceFile);
  if (!page?.body) {
    return [`${path}: missing default route function`];
  }

  const pageCalls = collectCallSites(page.body);
  const resolveShowPageAccess = firstCall(pageCalls, "resolveShowPageAccess");
  const protectedSink = firstCall(pageCalls, "getShowForViewer");
  if (resolveShowPageAccess) {
    if (protectedSink && protectedSink.pos < resolveShowPageAccess.pos) {
      findings.push(`${path}: getShowForViewer must be dominated by resolveShowPageAccess`);
    }
    return findings;
  }
  findings.push(`${path}: missing resolveShowPageAccess before protected data access`);
  return findings;
}

function auditMePage(path: string, sourceFile: ts.SourceFile): AuthAuditFinding[] {
  const findings: AuthAuditFinding[] = [];
  const imports = importSpecifiers(sourceFile);
  if (imports.includes("@/lib/auth/validateGoogleSession")) {
    findings.push(`${path}: /me must use validateGoogleIdentity, not validateGoogleSession`);
  }

  const page = findDefaultFunction(sourceFile);
  if (!page?.body) {
    findings.push(`${path}: missing default route function`);
    return findings;
  }
  const calls = collectCallSites(page.body);
  const identity = firstCall(calls, "validateGoogleIdentity");
  const sink = firstCall(calls, "listShowsForCrew");
  if (!identity) {
    findings.push(`${path}: /me must call validateGoogleIdentity`);
  }
  if (sink && (!identity || sink.pos < identity.pos)) {
    findings.push(`${path}: listShowsForCrew must be dominated by validateGoogleIdentity`);
  }
  return findings;
}

function auditCallbackRoute(path: string, sourceFile: ts.SourceFile): AuthAuditFinding[] {
  const findings: AuthAuditFinding[] = [];
  const getRoute = findFunction(sourceFile, "GET");
  if (!getRoute?.body) {
    findings.push(`${path}: missing GET route function`);
    return findings;
  }
  const calls = collectCallSites(getRoute.body);
  const nextValidation = firstNamedCall(calls, ["validateNextParamDetailed", "validateNextParam"]);
  const redirect = firstNamedCall(calls, ["redirect", "redirectTo", "signInRedirect"]);
  if (!nextValidation || (redirect && redirect.pos < nextValidation.pos)) {
    findings.push(`${path}: callback must validate next before redirecting`);
  }
  return findings;
}

function auditSignInPage(path: string, sourceFile: ts.SourceFile): AuthAuditFinding[] {
  const findings: AuthAuditFinding[] = [];
  const page = findDefaultFunction(sourceFile);
  if (!page?.body) {
    findings.push(`${path}: missing default route function`);
    return findings;
  }
  const calls = collectCallSites(page.body);
  const nextValidation = firstCall(calls, "validateNextParam");
  const redirectCall = firstCall(calls, "redirect");
  if (!nextValidation || (redirectCall && redirectCall.pos < nextValidation.pos)) {
    findings.push(`${path}: sign-in must validate next before redirecting`);
  }
  const source = sourceFile.text;
  if (!/\bvalidateErrorCodeParam\b/.test(source) || !/\bErrorExplainer\b/.test(source)) {
    findings.push(
      `${path}: sign-in error rendering must flow through validateErrorCodeParam and ErrorExplainer`,
    );
  }
  return findings;
}

function auditSignOutRoute(path: string, sourceFile: ts.SourceFile): AuthAuditFinding[] {
  const findings: AuthAuditFinding[] = [];
  const getRoute = findFunction(sourceFile, "GET");
  if (!getRoute?.body || !/\b405\b/.test(getRoute.body.getText(sourceFile))) {
    findings.push(`${path}: GET must return 405`);
  }
  const postRoute = findFunction(sourceFile, "POST");
  if (!postRoute?.body) {
    findings.push(`${path}: missing POST route function`);
  } else {
    const body = postRoute.body.getText(sourceFile);
    if (!/\bPICKER_COOKIE_NAME\b/.test(body) || !/\bMax-Age=0\b/.test(body)) {
      findings.push(`${path}: POST must clear the picker cookie with Max-Age=0`);
    }
  }
  return findings;
}

export function auditM5AuthFile(path: string, source: string): AuthAuditFinding[] {
  const sourceFile = parse(path, source);
  if (path === "app/show/[slug]/page.tsx" || path === "app/show/[slug]/[shareToken]/page.tsx") {
    return auditShowPage(path, sourceFile);
  }
  if (path === "app/me/page.tsx") {
    return auditMePage(path, sourceFile);
  }
  if (path === "app/auth/sign-in/page.tsx") {
    return auditSignInPage(path, sourceFile);
  }
  if (path === "app/auth/callback/route.ts") {
    return auditCallbackRoute(path, sourceFile);
  }
  if (path === "app/auth/sign-out/route.ts") {
    return auditSignOutRoute(path, sourceFile);
  }
  return [];
}
