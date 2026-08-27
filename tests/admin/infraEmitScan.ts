/**
 * tests/admin/infraEmitScan.ts — the syntactic core of the lib/admin infra-emit walker.
 *
 * Pure functions over a parsed source file plus a RESOLVER the caller supplies.
 * The split exists for the reason tests/cross-cutting/replacementString/scan.ts:1-16
 * gives: a check that read its subject with readFileSync inside the assertion would
 * read unmutated bytes and pass unconditionally. Taking the source as an argument is
 * what lets a fixture suite exercise this at all.
 *
 * The resolving layer (tests/admin/_metaInfraEmitCover.test.ts) supplies a real
 * ts.TypeChecker; the unit suite supplies a stub whose answers it controls.
 *
 * Spec: docs/superpowers/specs/observability/2026-08-26-observe-error-telemetry.md §5
 *
 * DOCUMENTED LIMITS this module owns (spec §9):
 *  - limit 5: an injected test double (`opts.loadHolds ?? loadOpenIdentityHolds`) is
 *    not covered, and is not a fault — production always takes the `??` default arm,
 *    which is inside the cover. Re-run trigger:
 *    `grep -rn 'loadHolds' --include='*.ts' .` — a non-test injector is the signal.
 *  - limit 11: a reconstructed partial object (`error: { message: raw.message }`) is
 *    an object, so the payload rule accepts it while code/details/hint are gone. No
 *    static rule separates a hand-built partial from the real fault. Re-run trigger:
 *    docs/superpowers/specs/observability/probes/2026-08-26-emit-payload-predicate.ts
 *  - limit 12: this resolves types and symbols, not values or control flow. A
 *    code-carrying emit anywhere in the guard scope satisfies it, including one that
 *    runs on a different branch within the same scope, and an emit reached through a
 *    helper is not seen. The threat fence is an ordinary contributor adding a loader
 *    branch, not an author routing around a guard.
 */
import ts from "typescript";

/** What the core cannot answer from text alone. The resolving layer owns these. */
export interface Resolver {
  /** Does this identifier bind to a const initialized with an infra_error literal? */
  isConstAlias(id: ts.Identifier): boolean;
  /**
   * Where is this callee DECLARED? Not "was it imported": `runBellPipeline` is a
   * local function in lib/admin/bellFeed.ts:191, and an imported-only rule reports
   * the two propagation sites it exists to exempt (plan R2 F3). Returns null when
   * the symbol does not resolve at all.
   */
  calleeOrigin(callee: ts.Identifier): { inCover: boolean; origin: "imported" | "local" } | null;
  /**
   * Is every constituent of this expression's type an object type (or `unknown`)?
   * POSITIVE, not "is it not one of these scalars": a denylist accepts `any` and the
   * error type, so a checker that failed to resolve would mark every site satisfied —
   * a false pass exactly where the walker knows least (plan R1 F3).
   */
  isObjectPayload(expr: ts.Expression): boolean;
  /** Does this expression's type mention an infra_error `kind` member? */
  typeMentionsInfra(expr: ts.Expression): boolean;
  /**
   * Is this returned expression the result of calling a function declared inside the
   * cover? `return warn(...)` delegates to the callee, whose own constructions are in
   * the population and are checked there — the same delegation the guarded
   * propagation form makes, without the `kind` test in front of it. Sound only
   * because the sweep is total.
   */
  callProducedInCover(expr: ts.Expression): { origin: "imported" | "local" } | null;
}

export type Reason =
  | "no-emit"
  | "emit-without-code"
  | "emit-without-payload"
  | "emit-payload-not-object"
  | "emit-after-return"
  | "emit-in-nested-function"
  | "propagation-else-arm"
  | "propagation-callee-outside-cover"
  | "unclassifiable-construction";

export type Verdict =
  | { kind: "satisfied"; code: CodeLiteral }
  | { kind: "exempt-propagation"; origin: "imported" | "local" }
  | { kind: "reported"; reason: Reason };

export type Shape = "literal" | "const-alias" | "unclassified";

/**
 * What the satisfying emit stamped as its `code`, when the scanner could read it as
 * a string literal. `null` means an emit satisfied the predicate but its code is not
 * a literal — a shorthand `{ code }` or a `code: SOME_CONST`.
 *
 * Carried on the Site so registry completeness is DERIVED FROM THIS WALK rather than
 * from a second regex over the same files. A separate extractor that only understood
 * `code: "LITERAL"` let a shorthand emit satisfy the walker while registering
 * nothing, which is precisely the "derived, not listed" claim failing quietly.
 */
export type CodeLiteral = string | null;

export interface Site {
  line: number;
  shape: Shape;
  verdict: Verdict;
  text: string;
}

const strip = (e: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) {
    e = e.expression;
  }
  return e;
};

/** An object literal carrying `kind: "infra_error"`. Exported: the syntax-only cross-check needs it. */
export function isInfraLiteral(e: ts.Expression): boolean {
  return (
    ts.isObjectLiteralExpression(e) &&
    e.properties.some(
      (p) =>
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === "kind" &&
        ts.isStringLiteral(p.initializer) &&
        p.initializer.text === "infra_error",
    )
  );
}

/**
 * ACCEPT-SET for the population: a CONSTRUCTION of an infra_error. Two shapes, both
 * stated positively. A returned expression that is neither, but whose type mentions
 * the arm, is REPORTED as unclassifiable — never skipped, which is the direction a
 * static guard must fail in.
 */
export function constructionShape(e: ts.Expression, r: Resolver): "literal" | "const-alias" | null {
  const x = strip(e);
  if (isInfraLiteral(x)) return "literal";
  if (ts.isIdentifier(x) && r.isConstAlias(x)) return "const-alias";
  return null;
}

type Scope = { node: ts.Node; kind: "if" | "else" | "catch" | "fn"; test: ts.Expression | null };

/** Outward to the first if-consequent, if-alternate, catch body, or function body. */
export function guardScope(n: ts.Node): Scope {
  let cur: ts.Node = n;
  while (cur.parent) {
    const p = cur.parent;
    if (ts.isIfStatement(p) && p.thenStatement === cur)
      return { node: cur, kind: "if", test: p.expression };
    if (ts.isIfStatement(p) && p.elseStatement === cur)
      return { node: cur, kind: "else", test: p.expression };
    if (ts.isCatchClause(p)) return { node: cur, kind: "catch", test: null };
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isArrowFunction(p) ||
      ts.isFunctionExpression(p) ||
      ts.isMethodDeclaration(p)
    ) {
      return { node: cur, kind: "fn", test: null };
    }
    cur = p;
  }
  return { node: cur, kind: "fn", test: null };
}

/**
 * The identifier a guard is testing, whatever it tests ABOUT it.
 *
 * Deliberately not limited to `X.kind === "infra_error"`. The propagation
 * principle is that a value produced by a callee inside the cover carries a fault
 * the CALLEE records, and that holds however the caller detects it:
 * `if (sub.kind === "infra_error")`, `if (count === null)`, `if (row === undefined)`.
 * lib/admin/driveConnectionHealth.ts has fifteen sites of the second shape, whose
 * helpers swallow the Supabase error and return null; emitting at both layers would
 * write two app_events rows for one fault, which is the over-counting the exemption
 * exists to prevent.
 *
 * The consequent-only rule in `classify` is what keeps this safe: the caller must
 * still be RETURNING on the fault branch, and `calleeOrigin` must still resolve the
 * binding to a call declared inside the cover. A guard over a locally constructed
 * value resolves to nothing and is reported.
 */
export function propagationSubject(test: ts.Expression | null): ts.Identifier | null {
  if (!test || !ts.isBinaryExpression(test)) return null;
  const op = test.operatorToken.kind;
  // POSITIVE equality only. Polarity is the whole meaning here: in
  // `if (sub.kind !== "infra_error")` the consequent is the NON-fault branch, so a
  // return there is a locally created fault and exempting it leaves that fault
  // dark. An earlier version accepted `!==` and `!=` alongside `===` and `==`,
  // which handed the exemption to exactly the branch that must not have it.
  const isPositiveEquality =
    op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
  if (!isPositiveEquality) return null;
  const left = strip(test.left);
  const right = strip(test.right);

  // `X.kind === "infra_error"` — the callee reported a typed fault.
  if (ts.isPropertyAccessExpression(left) && left.name.text === "kind") {
    const obj = strip(left.expression);
    if (!ts.isIdentifier(obj)) return null;
    return ts.isStringLiteral(right) && right.text === "infra_error" ? obj : null;
  }

  // `X === null` / `X === undefined` — the nullish sentinel a swallowing helper
  // returns. Compared against a NULLISH literal specifically: an earlier version
  // accepted any binary test whose left side was an identifier, so `if (count > 5)`
  // and `if (rows.length === 0)` were exempted as propagations while being
  // ordinary business logic returning a locally created fault.
  if (ts.isIdentifier(left)) {
    const nullish =
      right.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(right) && right.text === "undefined");
    return nullish ? left : null;
  }
  return null;
}

/**
 * The emit search. Three exclusions are part of the predicate rather than
 * refinements: an emit past the return is unreachable, one inside a nested function
 * does not run on this path, and a payload that is not an object is a flattened fault.
 *
 * Precedence is deliberate: one satisfying emit wins over a sibling emit with a
 * scalar payload. A scope holding both is satisfied, and limit 12 already records
 * that this does not resolve which branch runs.
 */
export function findEmit(
  scope: ts.Node,
  returnPos: number,
  sf: ts.SourceFile,
  r: Resolver,
): { ok: true; code: CodeLiteral } | { ok: false; reason: Reason } {
  let satisfied = false;
  let satisfiedCode: CodeLiteral = null;
  let sawLogCall = false;
  let sawCode = false;
  let sawErrorField = false;
  let sawLate = false;
  let sawNested = false;
  let sawScalarPayload = false;

  const scan = (n: ts.Node, nested: boolean): void => {
    if (satisfied) return;
    const isFn =
      ts.isFunctionDeclaration(n) ||
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isMethodDeclaration(n);
    // NOT `debug`. lib/log/logger.ts refuses to persist a debug record
    // unconditionally — even with a code, even with persist:true — so a
    // debug-only emit leaves NO app_events row, and the consequence bound is
    // about a PERSISTED record. An earlier version accepted debug on the
    // reasoning that the contract was "attributable, not persisted"; that
    // reasoning was wrong about its own contract, and it let a future loader
    // pass this guard while staying dark.
    if (ts.isCallExpression(n) && /^log\.(error|warn|info)$/.test(n.expression.getText(sf))) {
      sawLogCall = true;
      const late = n.getStart(sf) >= returnPos;
      let code = false;
      let codeLiteral: CodeLiteral = null;
      let errExpr: ts.Expression | null = null;
      for (const a of n.arguments) {
        if (!ts.isObjectLiteralExpression(a)) continue;
        for (const p of a.properties) {
          if (ts.isShorthandPropertyAssignment(p)) {
            if (p.name.text === "code") code = true; // shorthand: no literal to read
            if (p.name.text === "error") errExpr = p.name;
          } else if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
            if (p.name.text === "code") {
              code = true;
              const init = p.initializer;
              codeLiteral = ts.isStringLiteral(init) ? init.text : null;
            }
            if (p.name.text === "error") errExpr = p.initializer;
          }
        }
      }
      if (code) sawCode = true;
      if (errExpr) sawErrorField = true;
      if (code && errExpr) {
        if (late) sawLate = true;
        else if (nested) sawNested = true;
        else if (!r.isObjectPayload(errExpr)) sawScalarPayload = true;
        else {
          satisfied = true;
          satisfiedCode = codeLiteral;
          return;
        }
      }
    }
    ts.forEachChild(n, (c) => scan(c, nested || isFn));
  };
  ts.forEachChild(scope, (c) => scan(c, false));

  if (satisfied) return { ok: true, code: satisfiedCode };
  if (sawScalarPayload) return { ok: false, reason: "emit-payload-not-object" };
  if (sawLate) return { ok: false, reason: "emit-after-return" };
  if (sawNested) return { ok: false, reason: "emit-in-nested-function" };
  if (sawCode && !sawErrorField) return { ok: false, reason: "emit-without-payload" };
  if (sawLogCall && !sawCode) return { ok: false, reason: "emit-without-code" };
  return { ok: false, reason: "no-emit" };
}

/** Classify one return already known to be in the population. */
export function classify(ret: ts.ReturnStatement, sf: ts.SourceFile, r: Resolver): Verdict {
  const g = guardScope(ret);
  const subject = propagationSubject(g.test);
  if (subject) {
    // The else arm creates the fault it claims to propagate.
    if (g.kind === "else") return { kind: "reported", reason: "propagation-else-arm" };
    if (g.kind === "if") {
      const origin = r.calleeOrigin(subject);
      // Diverting happens ONLY on a positive resolution. A subject the resolver
      // cannot trace to a call — a catch binding, a locally destructured
      // `{ error }` — is an ordinary arrival, so it falls through to the emit
      // search below and must carry its own record. Reporting it here instead
      // would let `if (error || typeof count !== "number")` skip the emit check
      // it already satisfies.
      if (origin !== null) {
        return origin.inCover
          ? { kind: "exempt-propagation", origin: origin.origin }
          : { kind: "reported", reason: "propagation-callee-outside-cover" };
      }
    }
  }
  const emit = findEmit(g.node, ret.getStart(sf), sf, r);
  return emit.ok
    ? { kind: "satisfied", code: emit.code }
    : { kind: "reported", reason: emit.reason };
}

/** Every population site in one file, with its shape and verdict. Pure over (sf, resolver). */
export function scanSourceFile(sf: ts.SourceFile, r: Resolver): Site[] {
  const out: Site[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isReturnStatement(n) && n.expression) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      const text = n.getText(sf).replace(/\s+/g, " ").slice(0, 90);
      const shape = constructionShape(n.expression, r);
      if (shape) {
        out.push({ line, shape, verdict: classify(n, sf, r), text });
      } else if (r.typeMentionsInfra(n.expression)) {
        // A call-produced value is the CALLEE's responsibility, guarded or not.
        // lib/admin/driveConnectionHealth.ts has eleven `return warn(...)` sites
        // whose helper is declared to return the whole union and constructs only
        // the warn arm; reporting them would be the type-mention over-collection
        // the spec named at §3.2, and allow-listing them would be a case list.
        const produced = r.callProducedInCover(n.expression);
        out.push({
          line,
          shape: "unclassified",
          verdict: produced
            ? { kind: "exempt-propagation", origin: produced.origin }
            : { kind: "reported", reason: "unclassifiable-construction" },
          text,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
