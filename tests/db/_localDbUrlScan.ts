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
/** The ONLY modules whose exports count as the guard, by RESOLVED repo path. */
const GUARD_MODULES = new Set(["tests/db/_localDbUrl", "tests/db/_remediationHelpers"]);

/**
 * Resolve an import specifier to a repo-relative path and decide whether it is the
 * guard module. A specifier is NOT trusted for merely ending in the right word: a
 * sibling `./_localDbUrl` next to some other suite would otherwise satisfy
 * provenance while exporting a no-op (whole-diff R2 finding 2).
 */
export function isGuardModule(specifier: string, fileName: string): boolean {
  if (specifier.startsWith("@/")) return GUARD_MODULES.has(specifier.slice(2));
  if (!specifier.startsWith(".")) return false;
  const segments = fileName.replace(/\\/g, "/").split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  // EXACT equality against the repo-relative module path. `endsWith` would accept a
  // nested `tests/vendor/tests/db/_localDbUrl` no-op (whole-diff R3 finding 1);
  // callers normalize fileName to a repo-relative path before classifying.
  return GUARD_MODULES.has(segments.join("/"));
}

/** Strip wrappers that change nothing about the value: `(x)`, `x as T`, `x!`, `<T>x`. */
function unwrapParens(node: ts.Expression): ts.Expression {
  let cur = node;
  for (;;) {
    if (ts.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur)) cur = cur.expression;
    else if (ts.isNonNullExpression(cur) || ts.isTypeAssertionExpression(cur)) cur = cur.expression;
    else return cur;
  }
}

/**
 * The static member name of a `.x` or `["x"]` access. A bracket key bound to a const
 * (`const KEY = "LOCAL_TEST_DATABASE_URL"; process.env[KEY]`) resolves through
 * `stringConsts`, so the indirection is not a bypass (whole-diff R2 finding 3).
 */
function memberName(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  stringConsts: ReadonlyMap<string, string> = new Map(),
): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  const arg = unwrapParens(node.argumentExpression);
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isIdentifier(arg)) return stringConsts.get(arg.text) ?? null;
  return null;
}

/** The static text of a property name / binding key, resolving const-bound keys. */
function propertyKeyText(name: ts.Node, stringConsts: ReadonlyMap<string, string>): string | null {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const key = unwrapParens(name.expression);
    if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) return key.text;
    if (ts.isIdentifier(key)) return stringConsts.get(key.text) ?? null;
  }
  return null;
}

/** Every `const X = "literal"` (and later assignment) in the file, for key resolution. */
function collectStringConsts(sourceFile: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrapParens(node.initializer);
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        out.set(node.name.text, init.text);
      }
    }
    // `let K; K = "LOCAL_TEST_DATABASE_URL"` reaches the same key.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const value = unwrapParens(node.right);
      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        out.set(node.left.text, value.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
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
function isProcessEnv(
  node: ts.Expression,
  envAliases: ReadonlySet<string>,
  stringConsts: ReadonlyMap<string, string> = new Map(),
  processAliases: ReadonlySet<string> = new Set(["process"]),
): boolean {
  const expr = unwrapParens(node);
  if (ts.isIdentifier(expr)) return envAliases.has(expr.text);
  if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) {
    const base = unwrapParens(expr.expression);
    // `process`, and anything bound to it (`const p = process`, `import * as proc`).
    return (
      ts.isIdentifier(base) &&
      processAliases.has(base.text) &&
      memberName(expr, stringConsts) === "env"
    );
  }
  return false;
}

/** Identifiers bound to the `process` OBJECT itself (whole-diff R3 finding 3). */
function collectProcessAliases(sourceFile: ts.SourceFile): Set<string> {
  const aliases = new Set<string>(["process"]);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const spec = statement.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || !/^(node:)?process$/.test(spec.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    // `import * as proc from "node:process"` and `import proc from "node:process"`.
    if (bindings && ts.isNamespaceImport(bindings)) aliases.add(bindings.name.text);
    const defaultName = statement.importClause?.name;
    if (defaultName) aliases.add(defaultName.text);
  }
  for (;;) {
    const before = aliases.size;
    const visit = (node: ts.Node): void => {
      const bind = (target: ts.Node, value: ts.Expression): void => {
        const source = unwrapParens(value);
        if (ts.isIdentifier(target) && ts.isIdentifier(source) && aliases.has(source.text)) {
          aliases.add(target.text);
        }
      };
      if (ts.isVariableDeclaration(node) && node.initializer) bind(node.name, node.initializer);
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        bind(node.left, node.right);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (aliases.size === before) return aliases;
  }
}

/** A member read of the variable off any `process.env` spelling. */
function isEnvRead(
  node: ts.Node,
  envAliases: ReadonlySet<string>,
  stringConsts: ReadonlyMap<string, string>,
  processAliases: ReadonlySet<string>,
): boolean {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return (
      isProcessEnv(node.expression, envAliases, stringConsts, processAliases) &&
      memberName(node, stringConsts) === ENV_VAR
    );
  }
  return false;
}

/**
 * Identifiers bound to `process.env` — `const env = process.env`, and transitively
 * `const e2 = env`. Collected before the read walk so an alias declared anywhere in
 * the file is recognised at every use site.
 */
function collectEnvAliases(
  sourceFile: ts.SourceFile,
  stringConsts: ReadonlyMap<string, string>,
  processAliases: ReadonlySet<string>,
): Set<string> {
  const aliases = new Set<string>();
  // Iterate to a FIXPOINT, not a fixed number of passes: `const a = process.env;
  // const b = a; const c = b; …` is a chain of arbitrary length, and a bounded pass
  // count silently stops recognising reads past the bound (whole-diff finding 1a).
  // `import { env } from "node:process"` is the same object under another name.
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const spec = statement.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || !/^(node:)?process$/.test(spec.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === "env") aliases.add(element.name.text);
      }
    }
  }

  for (;;) {
    const before = aliases.size;
    const visit = (node: ts.Node): void => {
      // const e = process.env
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (isProcessEnv(node.initializer, aliases, stringConsts, processAliases)) {
          aliases.add(node.name.text);
        }
      }
      // let e; e = process.env
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        isProcessEnv(node.right, aliases, stringConsts, processAliases)
      ) {
        aliases.add(node.left.text);
      }
      // `const { env: e } = process`, incl. a computed `{ [ENV]: e }` key.
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        ts.isIdentifier(unwrapParens(node.initializer)) &&
        processAliases.has((unwrapParens(node.initializer) as ts.Identifier).text)
      ) {
        for (const element of node.name.elements) {
          const source = element.propertyName ?? element.name;
          if (propertyKeyText(source, stringConsts) === "env" && ts.isIdentifier(element.name)) {
            aliases.add(element.name.text);
          }
        }
      }
      // Destructuring ASSIGNMENT: `({ env: e } = process)`.
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isObjectLiteralExpression(node.left) &&
        ts.isIdentifier(unwrapParens(node.right)) &&
        processAliases.has((unwrapParens(node.right) as ts.Identifier).text)
      ) {
        for (const prop of node.left.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            propertyKeyText(prop.name, stringConsts) === "env" &&
            ts.isIdentifier(prop.initializer)
          ) {
            aliases.add(prop.initializer.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (aliases.size === before) return aliases;
  }
}

/**
 * Names IMPORTED from the guard module in this file. A call is only a guard when its
 * callee resolves to one of these — a locally declared
 * `function assertLocalDbUrl(x) { return x }` would otherwise satisfy the meta-test
 * by name alone while doing nothing (whole-diff finding 1b).
 */
function collectImportedGuardNames(sourceFile: ts.SourceFile, fileName: string): Set<string> {
  const imported = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const spec = statement.moduleSpecifier;
    if (!ts.isStringLiteral(spec)) continue;
    // EXACT module, not "any path ending in the name": a sibling `./_localDbUrl`
    // exporting a no-op would otherwise satisfy provenance (whole-diff R2 finding 2).
    if (!isGuardModule(spec.text, fileName)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      // `import { assertLocalDbUrl as guard }` — the LOCAL name is what call sites use.
      const original = (element.propertyName ?? element.name).text;
      if (GUARD_NAMES.has(original)) imported.add(element.name.text);
    }
  }
  // A LOCAL declaration of the same name shadows the import at some or all call
  // sites, and we do not model block scope — so treat any local binding with a guard
  // name as poisoning that name entirely (fail-closed).
  for (const shadowed of collectLocallyDeclaredNames(sourceFile)) imported.delete(shadowed);
  return imported;
}

/**
 * Every name bound by a declaration in this file — including destructured and array
 * binding patterns, in both declarations and parameters. `function f({ assertLocalDbUrl })`
 * shadows the import just as effectively as a plain re-declaration (whole-diff R3
 * finding 2).
 */
function collectLocallyDeclaredNames(sourceFile: ts.SourceFile): Set<string> {
  const declared = new Set<string>();

  const addBinding = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      declared.add(name.text);
      return;
    }
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) addBinding(element.name);
    }
  };

  const visit = (node: ts.Node): void => {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      declared.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) addBinding(node.name);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declared;
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
  stringConsts: ReadonlyMap<string, string>,
  processAliases: ReadonlySet<string>,
): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isProcessEnv(node.initializer, envAliases, stringConsts, processAliases)
    ) {
      for (const element of node.name.elements) {
        const sourceName = element.propertyName ?? element.name;
        if (propertyKeyText(sourceName, stringConsts) === ENV_VAR) count += 1;
      }
    }
    // Destructuring ASSIGNMENT: `({ LOCAL_TEST_DATABASE_URL: u } = process.env)`.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isObjectLiteralExpression(node.left) &&
      isProcessEnv(node.right, envAliases, stringConsts, processAliases)
    ) {
      for (const prop of node.left.properties) {
        const key = ts.isPropertyAssignment(prop)
          ? prop.name
          : ts.isShorthandPropertyAssignment(prop)
            ? prop.name
            : null;
        if (key && propertyKeyText(key, stringConsts) === ENV_VAR) count += 1;
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
function isGuarded(read: ts.Node, guardNames: ReadonlySet<string>): boolean {
  let child: ts.Node = read;
  let parent: ts.Node | undefined = read.parent;
  while (parent) {
    if (
      ts.isCallExpression(parent) &&
      ts.isIdentifier(parent.expression) &&
      guardNames.has(parent.expression.text) &&
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

  const stringConsts = collectStringConsts(sourceFile);
  const processAliases = collectProcessAliases(sourceFile);
  const envAliases = collectEnvAliases(sourceFile, stringConsts, processAliases);
  const guardNames = collectImportedGuardNames(sourceFile, fileName);
  let envReads = 0;
  let unguardedReads = 0;

  const visit = (node: ts.Node): void => {
    if (isEnvRead(node, envAliases, stringConsts, processAliases)) {
      envReads += 1;
      if (!isGuarded(node, guardNames)) unguardedReads += 1;
      // Do not descend: the inner `process.env` is part of this read.
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const destructured = countDestructuredReads(sourceFile, envAliases, stringConsts, processAliases);
  envReads += destructured;
  unguardedReads += destructured;

  return { envReads, unguardedReads, exemptReason: readExemptReason(src) };
}
