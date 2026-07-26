/**
 * tests/ci/_standaloneConfigScan.ts
 *
 * Pure readers for `tests/e2e/standalone.config.ts`, used by two suites: the
 * stale-branch guard and the workflow-coverage meta-test (which resolves
 * whole-config membership from the LIVE config rather than a hand-copied
 * list — a copy drifts the moment a spec is registered, and drift in a
 * coverage guard reads as coverage). They live here rather than in a
 * `.test.ts` because importing one test file from another re-registers its
 * `describe` blocks in the importer, and the branch assertions ran twice.
 *
 * WHY THESE PARSE INSTEAD OF MATCHING SOURCE TEXT. Both readers were first
 * written as regexes over the file, and an adversarial round found both
 * fail-open in the SAME way: a regex cannot tell code from a comment or a
 * string. A commented-out OLD `testMatch` above a narrowed live one would be
 * matched first, so the guard would validate 30 branches while Playwright ran
 * fewer — and the coverage meta-test would then delete allowlist rows for
 * specs that no longer run. The env reader had the identical hole: all of its
 * checks could be satisfied by commented-out assignments.
 *
 * Comments and strings are exactly what a real parser already gets right, so
 * these walk the TypeScript AST and read only what is genuinely evaluated.
 * Same correction PR1's toolchain guard needed — applied here as a class,
 * rather than one instance at a time.
 *
 * The config is parsed rather than IMPORTED because an imported value is a
 * compiled `RegExp` whose branch structure is gone, and a stale branch would
 * be indistinguishable from a live one.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.4.
 */
import ts from "typescript";

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("standalone.config.ts", source, ts.ScriptTarget.Latest, true);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function envTarget(node: ts.Expression): string | null {
  const m = node.getText().match(/^process\.env\.(\w+)$/);
  return m ? m[1]! : null;
}

/**
 * The alternation branches of the LIVE `testMatch` regex literal.
 *
 * Only a real `RegularExpressionLiteral` in a `testMatch:` property counts —
 * a commented-out config, or a regex inside a string, is not one. Throws when
 * the property is missing, duplicated, or not a regex literal: a reader that
 * silently returns nothing makes every caller's assertion vacuous, which is
 * the failure mode this whole module exists to avoid.
 */
export function testMatchBranches(source: string): string[] {
  let literal: string | null = null;
  walk(parse(source), (n) => {
    if (
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "testMatch" &&
      n.initializer.kind === ts.SyntaxKind.RegularExpressionLiteral
    ) {
      if (literal !== null) throw new Error("testMatchBranches: more than one live testMatch");
      literal = n.initializer.getText();
    }
  });
  if (literal === null) throw new Error("testMatchBranches: no live testMatch regex literal found");
  const alternation = (literal as string).match(/^\/\(([^)]*)\)\\?\.spec\\?\.ts\/$/);
  if (!alternation) throw new Error(`testMatchBranches: unrecognised testMatch shape: ${literal}`);
  return alternation[1]!.split("|").map((b) => b.replace(/\\/g, ""));
}

/**
 * Every `process.env.X ??= <string>` the config ACTUALLY evaluates, as
 * name -> resolved value.
 *
 * Resolves `const` indirection (`??= DEMO_ANON`) so a value parked behind a
 * binding is read rather than skipped.
 */
export function envDefaults(source: string): Map<string, string> {
  const sf = parse(source);
  const consts = new Map<string, string>();
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isStringLiteralLike(n.initializer)
    ) {
      consts.set(n.name.text, n.initializer.text);
    }
  });

  const out = new Map<string, string>();
  walk(sf, (n) => {
    if (
      !ts.isBinaryExpression(n) ||
      n.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionEqualsToken
    ) {
      return;
    }
    const name = envTarget(n.left);
    if (name === null) return;
    const value = ts.isStringLiteralLike(n.right)
      ? n.right.text
      : ts.isIdentifier(n.right)
        ? consts.get(n.right.text)
        : undefined;
    if (value !== undefined) out.set(name, value);
  });
  return out;
}

/** Names assigned with a BARE `=`, which would clobber a caller's env. */
export function envHardAssignments(source: string): string[] {
  const found: string[] = [];
  walk(parse(source), (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const name = envTarget(n.left);
      if (name !== null) found.push(name);
    }
  });
  return found;
}

/**
 * Whether every `??=` default is evaluated BEFORE `defineConfig` is called.
 *
 * Playwright loads the config before any test module, so a default set at the
 * top level lands first; one set after `defineConfig` would not.
 */
export function defaultsPrecedeDefineConfig(source: string): boolean {
  const sf = parse(source);
  let defineConfigPos = Infinity;
  let lastDefaultPos = -1;
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "defineConfig"
    ) {
      defineConfigPos = Math.min(defineConfigPos, n.getStart());
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken &&
      envTarget(n.left) !== null
    ) {
      lastDefaultPos = Math.max(lastDefaultPos, n.getStart());
    }
  });
  return lastDefaultPos > -1 && defineConfigPos < Infinity && lastDefaultPos < defineConfigPos;
}
