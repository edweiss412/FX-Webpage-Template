/**
 * tests/db/_destructiveFileAnalysis.ts (AST rewrite 2026-08-10; execution-site 2026-08-14)
 *
 * A name match answers the wrong question. `CALLS_LOCAL_GUARD` accepted a CALL WHOSE NAME
 * LOOKS RIGHT, which is three holes wide, and each one lets a file wipe or prune the
 * validation project while the meta-test stays green:
 *
 *   (a) binding — the guard runs on a different string than the one connected.
 *   (b) ordering — the guard runs AFTER the connection is opened.
 *   (c) provenance — the name resolves to something local, not the imported guard.
 *
 * Those three are closed BY CONSTRUCTION rather than by enumeration: the connected URL
 * must be a `const` initialized from a trusted guard call, EVERY same-named declaration
 * must satisfy that, and the guard must be import-resolved. Regex versions of this leaked
 * twice to the same class (a commented guard, a parameter shadow, array and object
 * destructuring rebinds); enumerating binding syntax does not terminate, and asking the
 * parser which declaration a name resolves to does.
 *
 * ACQUISITION was a fourth question and it never closed. Review found five ways to obtain
 * a second driver (`import()`, `require()`, `import { default as … }`, `import * as …`,
 * `createRequire`, `process.getBuiltinModule`); round 11 called the set closed at four and
 * round 12 disproved it. So the question is no longer asked. What is checked instead:
 *
 *   every DB execution in a discovered file runs on a client this module checked, and
 *   every recognized destructive statement sits inside one of those executions.
 *
 * A client obtained by a route nobody enumerated is simply not in the checked set. The
 * acquisition rules are DELETED, not extended (BL-DESTRUCTIVE-GUARD-EXECUTION-SITE).
 *
 * Threat model: ordinary authoring mistakes by a contributor.
 *
 * DOCUMENTED LIMITS, each conservative-plus-loud, none silent:
 *   - Rule 1's property-call leg keys on EXECUTION_METHODS, a closed set from postgres.js's
 *     own API. A method outside it is backstopped by Rule 2, whose recognizer is the same
 *     one that governs file DISCOVERY (itself spelling-sensitive —
 *     BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION).
 *   - Rule 2 does not anchor a literal whose nearest enclosing call is a non-execution
 *     method on a call RESULT: `expect(job.command).toBe("select public.prune_sync_log();")`
 *     is an assertion about a stored command (live at syncLogIndexesAndPrune.db.test.ts),
 *     not an execution. Execution methods on a call result ARE still rejected.
 *   - Rule 1's tagged-template leg is UNIVERSAL: in a discovered file, ANY identifier used
 *     as a tag must be a checked client. A discovered file that tags with something else
 *     (`dedent`, `String.raw`) is rejected — loudly, repaired by not tagging or by making
 *     the client checked. Deliberate: the tag leg is what catches a client whose
 *     acquisition route nobody enumerated.
 *   - A recognized destructive statement bound to a variable and executed later
 *     (`const S = "select public.prune_…()"; sql.unsafe(S)`) is REJECTED: the literal does
 *     not sit inside an execution. Conservative by ratified design (spec §2.2 Rule 2, "a
 *     variable initializer later laundered").
 *   - Factory summaries are one level and non-recursive; an unsummarizable factory makes
 *     its call sites reject loudly.
 *   - The REST wipe channel is unmodeled: resetValidationDataPostgrest.test.ts wipes over
 *     HTTP behind a local `assertLocalRestUrl`. Execution-site checking covers DB clients.
 */
import ts from "typescript";
import { dirname, resolve } from "node:path";

import { DESTRUCTIVE_STATEMENT_PATTERNS } from "./_destructiveStatements";
import { POSTGRES_EXECUTION_CORE } from "./__generated__/postgresExecutionMethods";

export type DestructiveFileVerdict = { ok: true } | { ok: false; reason: string };

/** The guard module every destructive file must actually call into. */
const GUARD_MODULE = "tests/db/_localDbUrl";

/**
 * `assertSafeDestructiveTarget` used to sit here too and could never be trusted: repo-wide
 * it exists only as a local, non-exported function in _validation-cleanup-helpers.ts, so
 * `imported.has(...)` was false for it at every call. A name that can satisfy a message
 * regex but not the check behind it is a premise that is false where it runs.
 */
const GUARD_NAMES: readonly string[] = ["assertLocalDbUrl"];

/**
 * A binding form all three name walkers used to miss: a NAMED function or class
 * EXPRESSION binds its own name inside its own body. `const run = function assertLocalDbUrl(u)
 * { … }` therefore shadows the guard within that body, and diff review R2 probed exactly
 * that into an `ok:true` on a discovered whole-database wipe — an unguarded URL reading as
 * guarded. Handled here so the shadow census, `declarationsOf` and the factory summary all
 * answer it the same way, since three copies of a binding rule is how the last one drifted.
 */
function isNamedFunctionLike(n: ts.Node): n is (
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ClassLikeDeclaration
) & {
  name: ts.Identifier;
} {
  return (
    (ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isClassDeclaration(n) ||
      ts.isClassExpression(n)) &&
    n.name !== undefined &&
    ts.isIdentifier(n.name)
  );
}

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

  // Any LOCAL declaration of an imported name shadows it, whatever its syntax — a
  // `const`, a `function`, a parameter (r2 finding 3), a destructured binding element.
  // Asking the parser for declarations covers every form at once, including ones not yet
  // invented as an escape. The guard and the driver get the SAME treatment, from one
  // walk: trusting either participant by spelling was the original mistake, twice.
  const shadowedAmong = (names: ReadonlySet<string> | readonly string[]): Set<string> => {
    const has = (t: string) =>
      Array.isArray(names) ? names.includes(t) : (names as Set<string>).has(t);
    const out = new Set<string>();
    const note = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) {
        if (has(name.text)) out.add(name.text);
        return;
      }
      for (const el of name.elements) if (ts.isBindingElement(el)) note(el.name);
    };
    const walk = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) || ts.isParameter(n)) note(n.name);
      else if (isNamedFunctionLike(n) && has(n.name.text)) {
        out.add(n.name.text);
      }
      ts.forEachChild(n, walk);
    };
    ts.forEachChild(sf, walk);
    return out;
  };
  const shadowed = shadowedAmong(GUARD_NAMES);

  /** Trustworthy only if imported from the guard module AND not shadowed anywhere. */
  const trusted = (name: string): boolean => imported.has(name) && !shadowed.has(name);

  // The DRIVER is resolved by import, symmetric with the guard: r5 showed a local
  // function named `postgres` wrapping a differently-imported driver, so `postgres(url)`
  // looked guarded while the wrapper connected to TEST_DATABASE_URL. Only the DEFAULT
  // binding is collected; a named or namespace import is no longer rejected outright,
  // because it simply is not the driver and its clients fail the execution rules.
  const driverNames = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== "postgres") continue;
    if (stmt.importClause?.name) driverNames.add(stmt.importClause.name.text);
  }
  const driverShadowed = shadowedAmong(driverNames);

  const isDriver = (name: string): boolean => driverNames.has(name) && !driverShadowed.has(name);

  const guardCalls: ts.CallExpression[] = [];
  const connects: ts.CallExpression[] = [];
  const collect = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const callee = n.expression.text;
      if (GUARD_NAMES.includes(callee)) guardCalls.push(n);
      else if (isDriver(callee)) connects.push(n);
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

  // EVERY connection, not just the first (r1 finding 2: a safe client followed by an
  // unguarded one that runs the prune). After this loop, every driver call in the file
  // is a CHECKED CONNECTION EXPRESSION, which is what the rules below build on.
  for (const connect of connects) {
    const verdict = checkConnection(sf, connect, trusted);
    if (!verdict.ok) return verdict;
  }

  const line = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const isCheckedConnection = (n: ts.Node): boolean =>
    ts.isCallExpression(n) && ts.isIdentifier(n.expression) && isDriver(n.expression.text);

  // ── factory summaries, ONE LEVEL ─────────────────────────────────────────────
  // The prior execution-site attempt was reverted because real files build clients
  // through a local factory (`newConn()` in resetValidationDataConcurrency.test.ts) and
  // interprocedural analysis looked like the price. It is not: a factory whose every
  // return is a checked connection is checked, summarized once, never recursively.
  // Every name that is ever an ASSIGNMENT TARGET here. `const` answers the mutability
  // question for the connected URL and for clients; it cannot answer it for a FUNCTION
  // DECLARATION (a mutable binding in JS) or for a callback PARAMETER, and diff review R1
  // probed all three: `let`, `var` and `function` factories reassigned from a guarded
  // connection to TEST_DATABASE_URL each returned ok:true on a discovered file. Any
  // appearance as a target poisons the name — the same any-occurrence rule the guard and
  // driver shadow checks already use, and for the same reason: it needs no scope
  // analysis to be sound.
  const assigned = new Set<string>();
  //
  // The unwrapping list is the COMPLETE set of node kinds TypeScript permits around an
  // assignment target, not a sample: parentheses, `as`, `<T>`, `!`, and `satisfies`. Diff
  // review R6 probed the four non-parenthesised forms and every one reassigned a checked
  // factory to an unchecked client at ok:true, and every one compiles clean under `strict`
  // -- so all four were reachable by ordinary authoring, not obfuscation.
  const noteTarget = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) assigned.add(n.text);
    else if (ts.isParenthesizedExpression(n)) noteTarget(n.expression);
    else if (ts.isAsExpression(n)) noteTarget(n.expression);
    else if (ts.isTypeAssertionExpression(n)) noteTarget(n.expression);
    else if (ts.isNonNullExpression(n)) noteTarget(n.expression);
    else if (ts.isSatisfiesExpression(n)) noteTarget(n.expression);
    else if (ts.isSpreadElement(n)) noteTarget(n.expression);
    else if (ts.isArrayLiteralExpression(n)) n.elements.forEach(noteTarget);
    else if (ts.isObjectLiteralExpression(n)) {
      for (const prop of n.properties) {
        if (ts.isPropertyAssignment(prop)) noteTarget(prop.initializer);
        else if (ts.isShorthandPropertyAssignment(prop)) assigned.add(prop.name.text);
      }
    }
  };
  const walkAssignments = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      noteTarget(n.left);
    } else if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      noteTarget(n.operand);
    } else if (
      (ts.isForInStatement(n) || ts.isForOfStatement(n)) &&
      !ts.isVariableDeclarationList(n.initializer)
    ) {
      noteTarget(n.initializer);
    }
    ts.forEachChild(n, walkAssignments);
  };
  ts.forEachChild(sf, walkAssignments);

  const factoryChecked = new Map<string, boolean>();
  const returnsOf = (fn: ts.SignatureDeclaration): ts.Expression[] | null => {
    const body = (fn as { body?: ts.Node }).body;
    if (!body) return null;
    if (!ts.isBlock(body)) return [body as ts.Expression];
    const out: ts.Expression[] = [];
    let bare = false;
    const walk = (n: ts.Node): void => {
      if (n !== body && (ts.isFunctionLike(n) || ts.isClassLike(n))) return;
      if (ts.isReturnStatement(n)) {
        if (n.expression) out.push(n.expression);
        else bare = true;
      }
      ts.forEachChild(n, walk);
    };
    ts.forEachChild(body, walk);
    return bare ? null : out;
  };
  const summarize = (name: string, fn: ts.SignatureDeclaration): void => {
    const returns = returnsOf(fn);
    const thisOne =
      returns !== null &&
      returns.length > 0 &&
      returns.every(isCheckedConnection) &&
      !assigned.has(name);
    // AND across EVERY declaration of the name, never last-one-wins. Two factories can
    // share a name across scopes, and overwriting let an outer checked `make` bless an
    // inner unchecked one: diff review R1 probed exactly that on a DISCOVERED file and
    // got ok:true, source-order dependent. This is the answer the connection leg and the
    // checked-client set already give to the shadowing question, so the analyzer still
    // resolves no scopes. Deliberately conservative: reusing a factory name for something
    // unchecked rejects the checked one's call sites too, loudly, and renaming fixes it.
    factoryChecked.set(name, (factoryChecked.get(name) ?? true) && thisOne);
  };
  const walkFactories = (n: ts.Node): void => {
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) {
      summarize(n.name.text, n);
    } else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      summarize(n.name.text, n.initializer);
    }
    ts.forEachChild(n, walkFactories);
  };
  ts.forEachChild(sf, walkFactories);

  // ...and every declaration of a factory NAME must itself be a factory. `summarize` only
  // ever sees function declarations and function-valued consts, so a same-named PARAMETER
  // or import binding was invisible to it: probed, `const make = () => postgres(DB_URL)`
  // beside `function run(make) { const sql = make(); sql`select public.prune_…()` }`
  // returned ok:true, the checked outer factory blessing a client the parameter supplied.
  // Third instance of diff review R1's class, found by sweeping the class rather than the
  // named instance.
  const isFactoryDeclaration = (n: ts.Node): boolean =>
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    (ts.isVariableDeclaration(n) &&
      !!n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)));
  for (const name of [...factoryChecked.keys()]) {
    const decls = declarationsOf(sf, name);
    if (decls.length === 0 || !decls.every((d) => isFactoryDeclaration(d.node))) {
      factoryChecked.set(name, false);
    }
  }

  const factoryCallName = (n: ts.Node): string | null =>
    ts.isCallExpression(n) && ts.isIdentifier(n.expression) && factoryChecked.has(n.expression.text)
      ? n.expression.text
      : null;

  // ── the checked set ──────────────────────────────────────────────────────────
  // A NAME is a checked client when it has at least one declaration and EVERY declaration
  // qualifies — the same closed-by-construction rule the connection leg uses, so the scope
  // question never arises. Transaction callback parameters (`sql.begin(async (tx) => …)`)
  // qualify against an already-checked receiver: that is how five of the seven real
  // destructive files run their statements, and the fixpoint is what lets a checked `tx`
  // derive from a client checked in the same pass.
  const checked = new Set<string>();
  const beginParamReceiver = (param: ts.ParameterDeclaration): string | null => {
    const fn = param.parent;
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
    // ONLY parameter 0, and only without a default. `.begin(fn)` calls fn(tx): every later
    // parameter is undefined and takes whatever default the author wrote, which diff review
    // R3 probed into a wipe — `async (tx, other = getDbClient(TEST_DATABASE_URL)) => …`
    // returned ok:true. The no-initializer half is conservative rather than reachable:
    // argument 0 is always supplied, so a default there can never be the value that runs.
    if (fn.parameters[0] !== param || param.initializer !== undefined) return null;
    const call = fn.parent;
    if (!ts.isCallExpression(call) || !call.arguments.includes(fn)) return null;
    const callee = call.expression;
    // `begin` only: it is the one postgres.js method that hands a CLIENT to a callback.
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "begin") return null;
    return ts.isIdentifier(callee.expression) ? callee.expression.text : null;
  };
  const candidates = new Set<string>();
  const walkCandidates = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      if (isCheckedConnection(n.initializer) || factoryCallName(n.initializer) !== null) {
        candidates.add(n.name.text);
      }
    } else if (ts.isParameter(n) && ts.isIdentifier(n.name) && beginParamReceiver(n) !== null) {
      candidates.add(n.name.text);
    }
    ts.forEachChild(n, walkCandidates);
  };
  ts.forEachChild(sf, walkCandidates);

  const declQualifies = (d: { node: ts.Node; isConst: boolean }): boolean => {
    if (ts.isVariableDeclaration(d.node)) {
      const init = d.node.initializer;
      if (!d.isConst || !init) return false;
      if (isCheckedConnection(init)) return true;
      const factory = factoryCallName(init);
      return factory !== null && factoryChecked.get(factory) === true;
    }
    if (ts.isParameter(d.node)) {
      const receiver = beginParamReceiver(d.node);
      return receiver !== null && checked.has(receiver);
    }
    return false;
  };
  for (let pass = 0; pass < candidates.size + 1; pass++) {
    let grew = false;
    for (const name of candidates) {
      if (checked.has(name) || assigned.has(name)) continue;
      const decls = declarationsOf(sf, name);
      if (decls.length > 0 && decls.every(declQualifies)) {
        checked.add(name);
        grew = true;
      }
    }
    if (!grew) break;
  }

  /** Why a name a reader expected to be a client is not one — factories name themselves. */
  const explainUnchecked = (name: string): string => {
    for (const d of declarationsOf(sf, name)) {
      if (!ts.isVariableDeclaration(d.node) || !d.node.initializer) continue;
      const factory = factoryCallName(d.node.initializer);
      if (factory !== null && factoryChecked.get(factory) !== true) {
        return `factory \`${factory}\` does not return a checked connection, so \`${name}\` is not a checked client`;
      }
    }
    return `\`${name}\` is not a checked client`;
  };

  // ── Rule 1: every client-shaped execution runs on a checked client ───────────
  // The tagged-template leg is UNIVERSAL: a tag is a callable receiving SQL, and in a
  // discovered file there is no innocent one. The property-call leg keys on
  // EXECUTION_METHODS, a closed set taken from postgres.js's own client API rather than
  // from an open syntax space, and its misses are backstopped by Rule 2.
  let rejection: string | null = null;
  const checkedTag = (n: ts.Node): boolean => ts.isIdentifier(n) && checked.has(n.text);
  const checkedReceiver = (call: ts.CallExpression): boolean =>
    ts.isPropertyAccessExpression(call.expression) && checkedTag(call.expression.expression);
  const walkExecutions = (n: ts.Node): void => {
    if (rejection !== null) return;
    if (ts.isTaggedTemplateExpression(n) && !checkedTag(n.tag)) {
      const who = ts.isIdentifier(n.tag)
        ? explainUnchecked(n.tag.text)
        : "the tag is not an identifier";
      rejection = `unchecked execution site at line ${line(n)}: ${who}`;
      return;
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      EXECUTION_METHODS.has(n.expression.name.text) &&
      !checkedReceiver(n)
    ) {
      const recv = n.expression.expression;
      const who = ts.isIdentifier(recv)
        ? explainUnchecked(recv.text)
        : "the receiver is not a checked client";
      rejection = `unchecked execution site at line ${line(n)}: \`.${n.expression.name.text}()\` — ${who}`;
      return;
    }
    ts.forEachChild(n, walkExecutions);
  };
  ts.forEachChild(sf, walkExecutions);
  if (rejection !== null) return { ok: false, reason: rejection };

  // ── Rule 2: every recognized destructive statement sits inside one ───────────
  // This closes the detached-method probe: `const { unsafe } = target; await
  // unsafe("select public.prune_sync_log()")` has no tagged template and no property
  // call, so acquisition stays unknown — and the STATEMENT is caught anyway.
  const patterns = Object.values(DESTRUCTIVE_STATEMENT_PATTERNS);
  const walkStatements = (n: ts.Node): void => {
    if (rejection !== null) return;
    if (
      (ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateExpression(n)) &&
      patterns.some((re) => re.test(n.getText(sf)))
    ) {
      let anc: ts.Node | undefined = n.parent;
      while (anc && !ts.isCallExpression(anc) && !ts.isTaggedTemplateExpression(anc))
        anc = anc.parent;
      const inChecked =
        anc !== undefined &&
        ((ts.isTaggedTemplateExpression(anc) && checkedTag(anc.tag)) ||
          (ts.isCallExpression(anc) && checkedReceiver(anc)));
      // Unmodeled rather than rejected: a non-execution method on a call RESULT is an
      // assertion shape (`expect(row.command).toBe(…)`), not an execution site.
      const unmodeled =
        anc !== undefined &&
        ts.isCallExpression(anc) &&
        ts.isPropertyAccessExpression(anc.expression) &&
        !ts.isIdentifier(anc.expression.expression) &&
        !EXECUTION_METHODS.has(anc.expression.name.text);
      if (!inChecked && !unmodeled) {
        rejection = `destructive statement outside a checked execution at line ${line(n)}`;
        return;
      }
    }
    ts.forEachChild(n, walkStatements);
  };
  ts.forEachChild(sf, walkStatements);
  if (rejection !== null) return { ok: false, reason: rejection };

  // ── Rule 3: a checked client cannot be laundered out of the checked set ──────
  // Destructuring, a stored method reference, a computed member, an argument position:
  // each hands the client's capability to a name this module no longer tracks, whose
  // executions then look like ordinary calls. Closing that at the SOURCE end is what
  // makes "every execution runs on a checked client" mean anything.
  const walkContainment = (n: ts.Node): void => {
    if (rejection !== null) return;
    if (ts.isIdentifier(n) && checked.has(n.text)) {
      const p = n.parent;
      const isOwnBinding =
        p !== undefined &&
        ((ts.isVariableDeclaration(p) && p.name === n) || (ts.isParameter(p) && p.name === n));
      const isTag = p !== undefined && ts.isTaggedTemplateExpression(p) && p.tag === n;
      const isReceiver =
        p !== undefined &&
        ts.isPropertyAccessExpression(p) &&
        p.expression === n &&
        p.parent !== undefined &&
        ts.isCallExpression(p.parent) &&
        p.parent.expression === p;
      if (!isOwnBinding && !isTag && !isReceiver) {
        rejection =
          `checked client \`${n.text}\` may only be used as a template tag or a method ` +
          `receiver, not at line ${line(n)}`;
        return;
      }
    }
    ts.forEachChild(n, walkContainment);
  };
  ts.forEachChild(sf, walkContainment);
  if (rejection !== null) return { ok: false, reason: rejection };

  return { ok: true };
}

/**
 * postgres.js client methods that EXECUTE, from the library's own API rather than a guess
 * at what a method call might mean. Deliberately narrow: `json`, `text`, `array`, `values`
 * and friends collide with `Response` and `Object` members that real destructive files
 * call on non-clients, and a false positive there pushes authors toward blanket
 * exemptions, which is how a guard stops guarding.
 */
// Every postgres.js method that SUBMITS sql, taken from the driver's own type surface:
// each of these returns PendingQuery / PendingRequest / ListenRequest. `file` was missing
// until diff review R6 probed `await remote.file("./destructive.sql")` on an unchecked
// client to ok:true on a DISCOVERED file -- postgres.js reads that path and submits its
// contents as a query, so it executes caller-supplied SQL as directly as `unsafe` does.
// That omission is why the query-submitting half is no longer hand-typed: it is DERIVED
// from the installed driver's own type declarations into the committed generated module
// imported above, so an upgrade that adds such a method lands as a visible diff rather
// than a silent guard gap (spec 2026-08-16-execution-methods-driver-derived-design.md).
//
// `json` and `array` return a Parameter rather than a query and stay OUT deliberately:
// they collide with Response and Object members that real destructive files call on
// non-clients, which is why this set is closed by return type rather than by name.

/** Client-capability members the derivation deliberately does not produce (spec
 *  2026-08-16-execution-methods-driver-derived-design.md §2.3): each hands out or
 *  manages client capability rather than returning a pending query. Cited to the
 *  postgres 3.4.9 driver types: begin (line 717) and savepoint (line 724) hand a
 *  TransactionSql to a callback; end (line 709) and reserve (line 720) are session
 *  lifecycle; subscribe (line 713) opens a replication subscription; cursor
 *  (line 617) is the result-iteration member, kept for shipped behavior. */
const CLIENT_CAPABILITY_METHODS = [
  "begin",
  "end",
  "reserve",
  "savepoint",
  "subscribe",
  "cursor",
] as const;

/** Exported for the composition pin in executionMethodsManifest.test.ts only. */
export const EXECUTION_METHODS = new Set<string>([
  ...POSTGRES_EXECUTION_CORE,
  ...CLIENT_CAPABILITY_METHODS,
]);

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
  // Rounds 1-4 each found one more escape in a recognizer (a reassigned binding, a
  // parameter shadow, array and object destructuring rebinds, scope confusion, `&&=`,
  // for-of heads), so the rule stops listing what is FORBIDDEN and states what must be
  // TRUE: every declaration of the connected name is a `const` initialized directly from
  // a trusted guard call. `const` is the whole mechanism — the language guarantees no
  // reassignment by any syntax, invented or not — and requiring it of EVERY same-named
  // declaration removes the scope question, since they are then all guarded.
  //
  // Deliberately conservative: a file reusing the name for something unguarded is
  // rejected even when the connected one is fine. That false positive is loud, local and
  // fixed by renaming, which is the right direction for a guard whose failure mode is
  // silently pruning a shared project.
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
    } else if (isNamedFunctionLike(n) && n.name.text === name) {
      out.push({ node: n, isConst: false });
      // A CATCH BINDING needs no branch of its own: `catch (url)` holds a real
      // ts.VariableDeclaration, and forEachChild walks it, so the first branch above
      // already collects it. The explicit branch that used to sit here was dead — proven
      // by mutation, which killed nothing when it was removed — and fixture (bb) pins
      // that a caught binding is still counted.
    } else if (ts.isImportDeclaration(n) && n.importClause) {
      // IMPORT bindings are declarations too, and omitting them broke the
      // closed-by-construction claim: an imported `targetUrl` connected directly,
      // with an unrelated guarded `const targetUrl` in a nested function, passed
      // (whole-diff r14). An import is never a `const` initialized from a guard call,
      // so counting it here rejects the file - which is the correct answer.
      const clause = n.importClause;
      if (clause.name && clause.name.text === name) out.push({ node: clause.name, isConst: false });
      const nb = clause.namedBindings;
      if (nb) {
        if (ts.isNamespaceImport(nb)) {
          if (nb.name.text === name) out.push({ node: nb.name, isConst: false });
        } else {
          for (const el of nb.elements) {
            if (el.name.text === name) out.push({ node: el.name, isConst: false });
          }
        }
      }
    } else if (ts.isImportEqualsDeclaration(n) && n.name.text === name) {
      out.push({ node: n.name, isConst: false });
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);
  return out;
}
