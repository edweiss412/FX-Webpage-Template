/**
 * tests/db/_localDbUrlScan.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §2.6)
 *
 * AST primitives for the LOCAL_TEST_DATABASE_URL guard meta-test, extracted from
 * the test so they can be exercised against SYNTHETIC sources. While a classifier
 * like this lives inside its own meta-test it is only ever reached through
 * whatever the live tree happens to contain, so a fail-OPEN branch cannot be
 * observed — which is how the hole this module closes survived in the first place.
 * (Same rationale + shape as tests/adminAlerts/producerScopeAst.ts.)
 *
 * GOVERNING RULE: membership in the scan set is an AST-resolved READ of the
 * variable, never a textual mention. A textual predicate is self-contradictory
 * here — the guard module names the variable in its error copy and this test
 * names it in its fixtures, so both would enter their own scan set.
 */
import ts from "typescript";

export type LocalDbUrlClassification = {
  /** Real reads of process.env.LOCAL_TEST_DATABASE_URL (property OR element access). */
  envReads: number;
  /** Of those, the ones NOT passed as an argument to a guard call. */
  unguardedReads: number;
  /** Text after `// local-db-url-exempt:`, trimmed. Null when absent or empty. */
  exemptReason: string | null;
};

const GUARD_NAMES = new Set(["assertLocalDbUrl", "assertLocalDbUrlIfSet"]);
const ENV_VAR = "LOCAL_TEST_DATABASE_URL";
const EXEMPT_RE = /\/\/\s*local-db-url-exempt:(.*)$/;

function unwrapParens(node: ts.Expression): ts.Expression {
  let cur = node;
  while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
}

/** The static member name of a `.x` or `["x"]` access, when there is one. */
function memberName(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  const arg = node.argumentExpression;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  return null;
}

/**
 * `process.env` in every spelling that reaches the same object:
 * `process.env`, `process["env"]`, `(process).env`, and any identifier previously
 * bound to one of those (`const env = process.env`).
 *
 * Recognising only the canonical dot-form would leave a one-token bypass — the
 * structural test would report every file guarded while a suite read the variable
 * through an alias and connected to a remote database (whole-diff R2 finding 1).
 */
function isProcessEnv(node: ts.Expression, envAliases: ReadonlySet<string>): boolean {
  const expr = unwrapParens(node);
  if (ts.isIdentifier(expr)) return envAliases.has(expr.text);
  if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) {
    const base = unwrapParens(expr.expression);
    return ts.isIdentifier(base) && base.text === "process" && memberName(expr) === "env";
  }
  return false;
}

/** A member read of the variable off any `process.env` spelling. */
function isEnvRead(node: ts.Node, envAliases: ReadonlySet<string>): boolean {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return isProcessEnv(node.expression, envAliases) && memberName(node) === ENV_VAR;
  }
  return false;
}

/**
 * Identifiers bound to `process.env` — `const env = process.env`, and transitively
 * `const e2 = env`. Collected before the read walk so an alias declared anywhere in
 * the file is recognised at every use site.
 */
function collectEnvAliases(sourceFile: ts.SourceFile): Set<string> {
  const aliases = new Set<string>();
  // Two passes so `const a = process.env; const b = a;` resolves regardless of order.
  for (let pass = 0; pass < 2; pass += 1) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isProcessEnv(node.initializer, aliases)) aliases.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return aliases;
}

/**
 * `const { LOCAL_TEST_DATABASE_URL } = process.env` and its aliased form
 * `const { LOCAL_TEST_DATABASE_URL: url } = process.env`.
 *
 * A destructured read cannot be wrapped in the guard at the read site, so it always
 * counts as UNGUARDED — which is the fail-closed direction: the author is pushed to
 * the one shape the guard can actually protect.
 */
function countDestructuredReads(
  sourceFile: ts.SourceFile,
  envAliases: ReadonlySet<string>,
): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isProcessEnv(node.initializer, envAliases)
    ) {
      for (const element of node.name.elements) {
        const sourceName = element.propertyName ?? element.name;
        if (ts.isIdentifier(sourceName) && sourceName.text === ENV_VAR) count += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
}

/**
 * Guarded means the read sits inside the ARGUMENTS of an `assertLocalDbUrl(...)` /
 * `assertLocalDbUrlIfSet(...)` call — not merely somewhere in a file that also
 * calls one. `assertLocalDbUrl(fallback) ?? process.env.LOCAL_TEST_DATABASE_URL`
 * must classify as UNGUARDED; that shape is the whole reason this is an AST walk
 * and not a regex.
 */
function isGuarded(read: ts.Node): boolean {
  let child: ts.Node = read;
  let parent: ts.Node | undefined = read.parent;
  while (parent) {
    if (
      ts.isCallExpression(parent) &&
      ts.isIdentifier(parent.expression) &&
      GUARD_NAMES.has(parent.expression.text) &&
      parent.arguments.some((arg) => arg === child)
    ) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

function readExemptReason(src: string): string | null {
  for (const line of src.split("\n")) {
    const m = EXEMPT_RE.exec(line);
    if (!m) continue;
    const reason = (m[1] ?? "").trim();
    // A bare marker is not an exemption — it would be a free escape hatch.
    if (reason.length > 0) return reason;
  }
  return null;
}

export function classifyLocalDbUrlSource(
  src: string,
  fileName = "source.ts",
): LocalDbUrlClassification {
  const sourceFile = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const envAliases = collectEnvAliases(sourceFile);
  let envReads = 0;
  let unguardedReads = 0;

  const visit = (node: ts.Node): void => {
    if (isEnvRead(node, envAliases)) {
      envReads += 1;
      if (!isGuarded(node)) unguardedReads += 1;
      // Do not descend: the inner `process.env` is part of this read.
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const destructured = countDestructuredReads(sourceFile, envAliases);
  envReads += destructured;
  unguardedReads += destructured;

  return { envReads, unguardedReads, exemptReason: readExemptReason(src) };
}
