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
  const resolveViewer = firstCall(pageCalls, "resolveViewer");
  const protectedSink = firstCall(pageCalls, "getShowForViewer");
  if (!resolveViewer) {
    findings.push(`${path}: missing resolveViewer before protected data access`);
  }
  if (protectedSink && (!resolveViewer || protectedSink.pos < resolveViewer.pos)) {
    findings.push(`${path}: getShowForViewer must be dominated by resolveViewer`);
  }

  const resolver = findFunction(sourceFile, "resolveViewer");
  if (!resolver?.body) {
    findings.push(`${path}: missing resolveViewer implementation`);
    return findings;
  }

  const resolverCalls = collectCallSites(resolver.body);
  const admin = firstCall(resolverCalls, "isAdminSession");
  const link = firstCall(resolverCalls, "validateLinkSession");
  const google = firstCall(resolverCalls, "validateGoogleSession");
  const requireAdminCalls = resolverCalls.filter((call) => call.name === "tryRequireAdmin");
  const fallback = requireAdminCalls.at(-1);
  if (!admin || !link || !google || !fallback) {
    findings.push(
      `${path}: resolveViewer must call isAdminSession, validateLinkSession, validateGoogleSession, and tryRequireAdmin`,
    );
  } else if (!(admin.pos < link.pos && link.pos < google.pos && google.pos < fallback.pos)) {
    findings.push(`${path}: resolveViewer auth chain order is invalid`);
  }
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

function auditPublicBootstrap(path: string, sourceFile: ts.SourceFile): AuthAuditFinding[] {
  const findings: AuthAuditFinding[] = [];
  const imports = importSpecifiers(sourceFile);
  const banned = new Map([
    ["@/lib/auth/validateLinkSession", "validateLinkSession"],
    ["@/lib/auth/validateGoogleSession", "validateGoogleSession"],
    ["@/lib/data/getShowForViewer", "getShowForViewer"],
  ]);
  for (const [specifier, label] of banned) {
    if (imports.includes(specifier)) {
      findings.push(`${path}: public bootstrap shell must not import ${label}`);
    }
  }
  return findings;
}

export function auditM5AuthFile(path: string, source: string): AuthAuditFinding[] {
  const sourceFile = parse(path, source);
  if (path === "app/show/[slug]/page.tsx") {
    return auditShowPage(path, sourceFile);
  }
  if (path === "app/me/page.tsx") {
    return auditMePage(path, sourceFile);
  }
  if (path === "app/show/[slug]/p/page.tsx") {
    return auditPublicBootstrap(path, sourceFile);
  }
  return [];
}
