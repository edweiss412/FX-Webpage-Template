/**
 * tests/db/_destructiveFileAnalysis.ts (Task 5b, 2026-08-09; rewritten on the AST 2026-08-10)
 *
 * `CALLS_LOCAL_GUARD` in the destructive-target guard matched a CALL WHOSE NAME LOOKS
 * RIGHT. That is three holes wide, and each one lets a file wipe or prune the validation
 * project while the meta-test stays green:
 *
 *   (a) binding — the guard runs on a different string than the one connected.
 *   (b) ordering — the guard runs AFTER the connection is opened.
 *   (c) provenance — the name resolves to something local, not the imported guard.
 *
 * **Why this is a parser and not a pile of regexes.** The first version was regex-based
 * and leaked twice to the same class of finding: whole-diff r1 caught a commented-out
 * guard, a reassigned binding, and a second unguarded client; r2 then caught a guard
 * shadowed by a FUNCTION PARAMETER and rebinding via array and object DESTRUCTURING.
 * Every one is an ordinary JavaScript binding form, and each regex repair invited the
 * next escape. Enumerating binding syntax does not terminate; asking the parser which
 * declaration a name resolves to does.
 *
 * Threat model: ordinary authoring mistakes by a contributor. Documented limits, stated
 * rather than pretended away: a guard reached through computed member access
 * (`mod["assertLocalDbUrl"]`), an aliased re-export chain, or a URL laundered through a
 * helper function are out of scope. Those are obfuscation, not mistakes.
 */
import ts from "typescript";
import { dirname, resolve } from "node:path";

export type DestructiveFileVerdict = { ok: true } | { ok: false; reason: string };

/** The guard module every destructive file must actually call into. */
const GUARD_MODULE = "tests/db/_localDbUrl";

const GUARD_NAMES: readonly string[] = ["assertLocalDbUrl", "assertSafeDestructiveTarget"];

export function analyseDestructiveFile(
  filePath: string,
  rawSource: string,
): DestructiveFileVerdict {
  const sf = ts.createSourceFile(
    filePath,
    rawSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  // ── (c) provenance ────────────────────────────────────────────────────────────
  const imported = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    const resolved = spec.startsWith(".")
      ? resolve(dirname(filePath), spec).replace(process.cwd() + "/", "")
      : spec.replace(/^@\//, "");
    if (resolved !== GUARD_MODULE) continue;
    const named = stmt.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        if (GUARD_NAMES.includes(el.name.text)) imported.add(el.name.text);
      }
    }
  }

  // Any LOCAL declaration of a guard name shadows it, whatever its syntax — a `const`,
  // a `function`, a parameter (r2 finding 3), a destructured binding element. Asking the
  // parser for declarations covers every form at once, including ones not yet invented
  // as an escape.
  const shadowed = new Set<string>();
  const noteDeclared = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      if (GUARD_NAMES.includes(name.text)) shadowed.add(name.text);
      return;
    }
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) noteDeclared(el.name);
    }
  };
  const walkDecls = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) noteDeclared(n.name);
    else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) {
      if (GUARD_NAMES.includes(n.name.text)) shadowed.add(n.name.text);
    }
    ts.forEachChild(n, walkDecls);
  };
  ts.forEachChild(sf, walkDecls);

  /** Trustworthy only if imported from the guard module AND not shadowed anywhere. */
  const trusted = (name: string): boolean => imported.has(name) && !shadowed.has(name);

  const guardCalls: ts.CallExpression[] = [];
  const connects: ts.CallExpression[] = [];
  const collect = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const callee = n.expression.text;
      if (GUARD_NAMES.includes(callee)) guardCalls.push(n);
      else if (callee === "postgres") connects.push(n);
    }
    ts.forEachChild(n, collect);
  };
  ts.forEachChild(sf, collect);

  if (guardCalls.length === 0) return { ok: false, reason: "no loopback guard is called" };
  if (!guardCalls.some((c) => trusted((c.expression as ts.Identifier).text))) {
    return {
      ok: false,
      reason:
        shadowed.size > 0
          ? "the guard name resolves to a local declaration, not the imported guard"
          : `the guard name is not imported from ${GUARD_MODULE}`,
    };
  }

  if (connects.length === 0) return { ok: false, reason: "no postgres(...) connection found" };

  // EVERY connection, not just the first (r1 finding 2: a safe client followed by an
  // unguarded one that runs the prune).
  for (const connect of connects) {
    const verdict = checkConnection(sf, connect, trusted);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

function checkConnection(
  sf: ts.SourceFile,
  connect: ts.CallExpression,
  trusted: (name: string) => boolean,
): DestructiveFileVerdict {
  const arg = connect.arguments[0];
  if (!arg) return { ok: false, reason: "postgres() is called with no target" };

  // Inline form: postgres(guard(...)). Satisfies binding and ordering by construction.
  if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) && trusted(arg.expression.text)) {
    return { ok: true };
  }

  if (!ts.isIdentifier(arg)) {
    return { ok: false, reason: "postgres() receives an expression that is not a guarded binding" };
  }
  const bound = arg.text;
  const connectPos = connect.getStart(sf);

  // ── (a) binding + (b) ordering, resolved LEXICALLY ────────────────────────────
  // r2's repair matched declarations by NAME anywhere in the file, so a safe `url` in
  // another function, a sibling block, or an outer scope shadowed by a parameter all
  // blessed an unsafe connection (r3 finding 1). The question is not "does a guarded
  // `url` exist somewhere" but "which declaration does THIS `url` resolve to" - so walk
  // outward from the connection and take the first scope that declares the name.
  const decl = resolveBinding(connect, bound);
  if (!decl) return { ok: false, reason: `\`${bound}\` has no declaration in scope` };
  if (!ts.isVariableDeclaration(decl)) {
    // A parameter, a catch binding, a function name: none is a guard call, and the
    // nearest one is what the connection actually reads.
    return {
      ok: false,
      reason: `\`${bound}\` resolves to a ${ts.SyntaxKind[decl.kind]}, not a guarded binding`,
    };
  }
  const init = decl.initializer;
  const declaredFromGuard =
    !!init &&
    ts.isCallExpression(init) &&
    ts.isIdentifier(init.expression) &&
    trusted(init.expression.text);
  if (!declaredFromGuard) {
    return { ok: false, reason: `\`${bound}\` is not bound to a trusted guard call` };
  }
  if (decl.getStart(sf) > connectPos) {
    return { ok: false, reason: "the guard call runs after the connection is opened" };
  }

  // ── rebinding, in EVERY assignment form (r1 finding 2, r2 finding 4) ──────────
  // Simple assignment, array destructuring, and object destructuring are all
  // AssignmentExpressions to the parser, so one check covers the class rather than one
  // regex per syntax.
  let rebound = false;
  const writesTo = (target: ts.Node): boolean => {
    if (ts.isIdentifier(target)) return target.text === bound;
    if (ts.isArrayLiteralExpression(target)) return target.elements.some(writesTo);
    if (ts.isObjectLiteralExpression(target)) {
      return target.properties.some((prop) => {
        if (ts.isShorthandPropertyAssignment(prop)) return prop.name.text === bound;
        if (ts.isPropertyAssignment(prop)) return writesTo(prop.initializer);
        return false;
      });
    }
    if (ts.isParenthesizedExpression(target)) return writesTo(target.expression);
    return false;
  };
  const findRebind = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      writesTo(n.left) &&
      n.getStart(sf) < connectPos
    ) {
      // A re-assignment FROM a trusted guard call is still guarded.
      const fromGuard =
        ts.isCallExpression(n.right) &&
        ts.isIdentifier(n.right.expression) &&
        trusted(n.right.expression.text);
      if (!fromGuard) rebound = true;
    }
    ts.forEachChild(n, findRebind);
  };
  ts.forEachChild(sf, findRebind);

  if (rebound) {
    return {
      ok: false,
      reason: `\`${bound}\` is reassigned from a non-guard expression before the connection`,
    };
  }

  return { ok: true };
}

/**
 * The declaration `name` resolves to AT `from`, by lexical scope.
 *
 * Walks outward and, in each scope-bearing ancestor, looks for a declaration of the
 * name among that scope's own statements and parameters. The first hit wins, which is
 * what the language does. Deliberately simple: it does not model hoisting differences
 * between `var` and `let`, because a destructive test that depends on that distinction
 * is not an ordinary authoring mistake.
 */
function resolveBinding(from: ts.Node, name: string): ts.Declaration | null {
  const declares = (n: ts.Node): ts.Declaration | null => {
    let found: ts.Declaration | null = null;
    const fromBindingName = (bn: ts.BindingName, decl: ts.Declaration): void => {
      if (found) return;
      if (ts.isIdentifier(bn)) {
        if (bn.text === name) found = decl;
        return;
      }
      for (const el of bn.elements) if (ts.isBindingElement(el)) fromBindingName(el.name, el);
    };
    const visitShallow = (child: ts.Node): void => {
      if (found) return;
      if (ts.isVariableStatement(child)) {
        for (const d of child.declarationList.declarations) fromBindingName(d.name, d);
      } else if (ts.isFunctionDeclaration(child) && child.name?.text === name) {
        found = child;
      } else if (ts.isVariableDeclarationList(child)) {
        for (const d of child.declarations) fromBindingName(d.name, d);
      }
    };
    // Parameters belong to the function scope itself.
    if (ts.isFunctionLike(n)) {
      for (const p of n.parameters) fromBindingName(p.name, p);
      if (found) return found;
    }
    if (ts.isCatchClause(n) && n.variableDeclaration) {
      fromBindingName(n.variableDeclaration.name, n.variableDeclaration);
      if (found) return found;
    }
    // Statements directly inside this scope.
    const body: ts.Node | undefined =
      ts.isFunctionLike(n) && "body" in n ? (n as { body?: ts.Node }).body : n;
    if (body && ts.isBlock(body)) {
      for (const st of body.statements) visitShallow(st);
    } else if (body && ts.isSourceFile(body)) {
      for (const st of body.statements) visitShallow(st);
    } else if (body && ts.isModuleBlock(body)) {
      for (const st of body.statements) visitShallow(st);
    }
    if (ts.isForStatement(n) && n.initializer && ts.isVariableDeclarationList(n.initializer)) {
      visitShallow(n.initializer);
    }
    return found;
  };

  for (let n: ts.Node | undefined = from; n; n = n.parent) {
    const isScope =
      ts.isSourceFile(n) ||
      ts.isBlock(n) ||
      ts.isFunctionLike(n) ||
      ts.isForStatement(n) ||
      ts.isCatchClause(n) ||
      ts.isModuleBlock(n);
    if (!isScope) continue;
    const hit = declares(n);
    if (hit) return hit;
  }
  return null;
}
