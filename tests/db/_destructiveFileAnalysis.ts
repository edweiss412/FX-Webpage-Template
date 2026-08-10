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
 * Threat model: ordinary authoring mistakes by a contributor.
 *
 * **A DOCUMENTED LIMIT, stated because it is load-bearing and I got it wrong once.**
 * The BINDING questions this module answers are closed by construction: the connected
 * URL must be a `const` from a trusted guard call, every same-named declaration must
 * satisfy that, the guard and driver must be import-resolved, and the driver may appear
 * only in call position. No syntax escapes those.
 *
 * The ACQUISITION question is NOT closed. Whole-diff review found five distinct ways to
 * obtain a second driver — `import()`, `require()`, `import { default as … }`,
 * `import * as …`, `createRequire`, then `process.getBuiltinModule(…)` — and round 11 of
 * that review claimed the set was closed at four. Round 12 disproved it. Each rejection
 * below is real and worth having, but this module does NOT prove that no unchecked
 * connection exists; it raises the cost of writing one by accident.
 *
 * The sound framing is the EXECUTION SITE: every destructive statement must run on a
 * client bound to an already-checked connection, which makes acquisition irrelevant.
 * That was attempted and reverted here because real files build clients through local
 * factories (`resetValidationDataConcurrency.test.ts`'s `newConn()`), so it needs
 * interprocedural analysis. Filed as `BL-DESTRUCTIVE-GUARD-EXECUTION-SITE`.
 *
 * Also out of scope, and genuinely obfuscation rather than mistake: computed member
 * access (`mod["assertLocalDbUrl"]`), aliased re-export chains, a URL laundered through
 * a helper.
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

  // The DRIVER is resolved by import too, symmetric with the guard. r5 showed a local
  // function named `postgres` wrapping a differently-imported driver: `postgres(url)`
  // looked guarded, the wrapper discarded its argument and connected to
  // TEST_DATABASE_URL. Trusting a call because of its NAME is the same mistake on the
  // other participant, so it gets the same answer - provenance, not spelling.
  const driverNames = new Set<string>();
  let nonDefaultDriverImport = false;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== "postgres") continue;
    const clause = stmt.importClause;
    if (clause?.name) driverNames.add(clause.name.text);
    // ONE permitted import form. `import { default as pg2 }` and `import * as pg2`
    // are ordinary static ECMAScript and both produced a callable driver the analyzer
    // could not see, so a guarded first connection covered an unguarded second
    // (whole-diff r10). Rather than teach it to follow each aliasing form - the same
    // enumeration that has failed here repeatedly - a destructive file may import the
    // driver only as a default binding. Everything else is rejected, so there is no
    // alias route left to trace.
    // TYPE-only bindings are erased and cannot produce a callable driver, so
    // `import postgres, { type Sql } from "postgres"` - which the real destructive
    // files use - stays legal. Only a VALUE binding can open a connection.
    const nb = clause?.namedBindings;
    if (nb && !clause?.isTypeOnly) {
      if (ts.isNamespaceImport(nb)) nonDefaultDriverImport = true;
      else if (nb.elements.some((el) => !el.isTypeOnly)) nonDefaultDriverImport = true;
    }
  }
  if (nonDefaultDriverImport) {
    return {
      ok: false,
      reason:
        'the postgres driver is imported by a named or namespace binding; a destructive file must use the default form `import postgres from "postgres"` so every connection is visible',
    };
  }
  // A local declaration of an imported driver name shadows it, exactly as for the guard.
  const driverShadowed = new Set<string>();
  const noteDriverDecl = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      if (driverNames.has(name.text)) driverShadowed.add(name.text);
      return;
    }
    for (const el of name.elements) if (ts.isBindingElement(el)) noteDriverDecl(el.name);
  };
  const walkDriverDecls = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) noteDriverDecl(n.name);
    else if (ts.isFunctionDeclaration(n) && n.name && driverNames.has(n.name.text)) {
      driverShadowed.add(n.name.text);
    }
    ts.forEachChild(n, walkDriverDecls);
  };
  ts.forEachChild(sf, walkDriverDecls);

  const isDriver = (name: string): boolean => driverNames.has(name) && !driverShadowed.has(name);

  // The driver must be acquired by the STATIC default import, the one form this module
  // can see. r7 showed `(await import("postgres")).default` and `require("postgres")`
  // each opening a second, unchecked connection — and that is ordinary authoring here,
  // not obfuscation: tests/db/validation-schema-parity.test.ts already uses the dynamic
  // form. Rather than teach the analyzer to trace dynamic acquisition, a destructive
  // file simply may not use it. The requirement is legible and the fix is a one-line
  // import.
  // Module-loading capability, imported. `createRequire` from `node:module` produces a
  // callable `require`, and this repo already uses it
  // (tests/parser/fuzz/robustness.fuzz.test.ts), so it is ordinary authoring rather
  // than obfuscation (whole-diff r11). Node's ways to load a module are a CLOSED set —
  // static import, `import()`, `require`, and `createRequire` — which is why this
  // enumeration terminates where the aliasing ones did not.
  let dynamicAcquire = false;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    if (spec === "node:module" || spec === "module") dynamicAcquire = true;
  }
  const checkAcquire = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const isDynamicImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === "require";
      // `process.getBuiltinModule("node:module").createRequire(...)` — r12's fifth
      // acquisition route, and the one that disproved r11's "closed set" claim.
      const isBuiltinModuleGetter =
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "getBuiltinModule";
      if (isBuiltinModuleGetter) dynamicAcquire = true;
      if (isDynamicImport || isRequire) {
        const a = n.arguments[0];
        // Literal TEXT, not literal KIND. r9 slipped through on
        // `import(`postgres`)` because a NoSubstitutionTemplateLiteral is not a
        // StringLiteral — the same enumeration mistake one node type down. And an
        // argument that is neither literal form cannot be read at all, so it is
        // rejected rather than assumed innocent: in a destructive file, a module
        // specifier this check cannot evaluate is itself the hazard.
        const literalText =
          a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null;
        if (literalText === null || literalText === "postgres") dynamicAcquire = true;
      }
    }
    ts.forEachChild(n, checkAcquire);
  };
  ts.forEachChild(sf, checkAcquire);
  if (dynamicAcquire) {
    return {
      ok: false,
      reason:
        'the postgres driver is acquired dynamically (import()/require); a destructive file must use the static `import postgres from "postgres"` so every connection is visible',
    };
  }

  const guardCalls: ts.CallExpression[] = [];
  const connects: ts.CallExpression[] = [];
  /** Any call to a name that LOOKS like the driver but does not resolve to it. */
  let impostorConnect = false;
  const collect = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const callee = n.expression.text;
      if (GUARD_NAMES.includes(callee)) guardCalls.push(n);
      else if (isDriver(callee)) connects.push(n);
      else if (callee === "postgres") impostorConnect = true;
    }
    ts.forEachChild(n, collect);
  };
  ts.forEachChild(sf, collect);

  if (impostorConnect) {
    return {
      ok: false,
      reason: "`postgres(...)` is called on a name that is not the imported driver",
    };
  }

  // The driver name may appear ONLY in call position. r6 aliased it — `const connect =
  // postgres; connect(remote)` — and the aliased connection was never inspected, so
  // "every connection is checked" was false while a safe first connection satisfied the
  // count. Enumerating alias forms is the same losing game as enumerating rebinds, so
  // this takes the same exit: if the identifier is never read except to call it, no
  // alias can exist. That also covers passing it as a callback and reaching through a
  // property, without naming either.
  let nonCallUse: string | null = null;
  const checkUses = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && driverNames.has(n.text) && !driverShadowed.has(n.text)) {
      const p = n.parent;
      const isCallee = p && ts.isCallExpression(p) && p.expression === n;
      const isOwnImport = p && ts.isImportClause(p);
      if (!isCallee && !isOwnImport) nonCallUse = n.text;
    }
    ts.forEachChild(n, checkUses);
  };
  ts.forEachChild(sf, checkUses);
  if (nonCallUse !== null) {
    return {
      ok: false,
      reason: `\`${nonCallUse}\` is referenced outside call position, so an alias could open an unchecked connection`,
    };
  }

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
