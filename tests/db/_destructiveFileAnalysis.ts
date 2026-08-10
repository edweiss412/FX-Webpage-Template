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

  // ── (a) binding + (b) ordering, by an invariant the LANGUAGE enforces ────────
  // Rounds 1-4 each found another escape in a recognizer: a commented guard, a
  // reassigned binding, a second client, a parameter shadow, array and object
  // destructuring rebinds, cross-function and cross-block and parameter-collision scope
  // confusion, then `&&=` and for-of/for-in loop assignment. Every repair enumerated one
  // more syntax and invited the next. Enumerating JavaScript's binding and assignment
  // forms does not terminate.
  //
  // So the rule stops describing what is FORBIDDEN and states what must be TRUE:
  //
  //   every declaration of the connected name in this file is a `const` initialized
  //   directly from a trusted guard call.
  //
  // `const` is not a stylistic preference here, it is the whole mechanism. The language
  // guarantees a `const` binding is never reassigned — by `=`, by `&&=`, by
  // destructuring, by a loop head, or by any syntax not yet invented — so there is no
  // rebinding check to leak. Requiring it of EVERY same-named declaration removes the
  // scope question too: it no longer matters which one this connection resolves to,
  // because they are all guarded.
  //
  // This is deliberately conservative. A file that reuses the name for something
  // unguarded is REJECTED even if the connected one is fine. That false positive is
  // loud, local, and fixed by renaming a variable — the right direction for a guard
  // whose failure mode is silently pruning a shared project.
  const decls = declarationsOf(sf, bound);
  if (decls.length === 0) return { ok: false, reason: `\`${bound}\` has no declaration` };

  for (const d of decls) {
    if (!ts.isVariableDeclaration(d.node)) {
      return {
        ok: false,
        reason: `\`${bound}\` is declared as a ${ts.SyntaxKind[d.node.kind]}, not a guarded const`,
      };
    }
    if (!d.isConst) {
      return {
        ok: false,
        reason: `\`${bound}\` is declared with let/var, so it can be reassigned before the connection`,
      };
    }
    const init = d.node.initializer;
    const fromGuard =
      !!init &&
      ts.isCallExpression(init) &&
      ts.isIdentifier(init.expression) &&
      trusted(init.expression.text);
    if (!fromGuard) {
      return { ok: false, reason: `\`${bound}\` is not bound to a trusted guard call` };
    }
    if (d.node.getStart(sf) > connectPos) {
      return { ok: false, reason: "the guard call runs after the connection is opened" };
    }
  }

  return { ok: true };
}

/** Every declaration of `name` in the file, with whether it is a `const`. */
function declarationsOf(
  sf: ts.SourceFile,
  name: string,
): Array<{ node: ts.Node; isConst: boolean }> {
  const out: Array<{ node: ts.Node; isConst: boolean }> = [];
  const fromBindingName = (bn: ts.BindingName, node: ts.Node, isConst: boolean): void => {
    if (ts.isIdentifier(bn)) {
      if (bn.text === name) out.push({ node, isConst });
      return;
    }
    for (const el of bn.elements) {
      if (ts.isBindingElement(el)) fromBindingName(el.name, el, isConst);
    }
  };
  const walk = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n)) {
      const list = n.parent;
      const isConst = ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
      fromBindingName(n.name, n, isConst);
    } else if (ts.isParameter(n)) {
      fromBindingName(n.name, n, false);
    } else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name?.text === name) {
      out.push({ node: n, isConst: false });
    } else if (ts.isCatchClause(n) && n.variableDeclaration) {
      fromBindingName(n.variableDeclaration.name, n.variableDeclaration, false);
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);
  return out;
}
