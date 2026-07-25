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

/** `process.env` — the only container we treat as an environment read. */
function isProcessEnv(node: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  );
}

/**
 * True for BOTH spellings — `process.env.LOCAL_TEST_DATABASE_URL` and
 * `process.env["LOCAL_TEST_DATABASE_URL"]`. Missing the bracket form would leave a
 * one-character bypass.
 */
function isEnvRead(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return isProcessEnv(node.expression) && node.name.text === ENV_VAR;
  }
  if (ts.isElementAccessExpression(node)) {
    const arg = node.argumentExpression;
    return (
      isProcessEnv(node.expression) &&
      (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
      arg.text === ENV_VAR
    );
  }
  return false;
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

  let envReads = 0;
  let unguardedReads = 0;

  const visit = (node: ts.Node): void => {
    if (isEnvRead(node)) {
      envReads += 1;
      if (!isGuarded(node)) unguardedReads += 1;
      // Do not descend: the inner `process.env` is part of this read.
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { envReads, unguardedReads, exemptReason: readExemptReason(src) };
}
