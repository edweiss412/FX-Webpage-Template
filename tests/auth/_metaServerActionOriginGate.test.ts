/**
 * tests/auth/_metaServerActionOriginGate.test.ts
 *
 * The same-origin gate census, as a DERIVATION rather than a list
 * (docs/superpowers/specs/2026-08-16-server-action-origin-sweep-design.md §3.6).
 *
 * Every Server Action surface unit under `app/`, `lib/`, and `components/` is
 * discovered by the invariant-10 AST engine — the SAME `collectSurfaceUnits`
 * the mutation-surface observability meta-test runs, so the two walks can never
 * disagree about what a Server Action is — and each discovered non-route unit
 * must either open with a gate this file ACCEPTS, or be one of three pinned
 * read-only exemptions. A newly authored ungated destructive action fails here
 * by default, which is the whole point: the census cannot rot.
 *
 * WHY ACCEPT-SETS AND NOT "THE FIRST STATEMENT MENTIONS THE GATE". A predicate
 * that asks whether the first statement CONTAINS a call to the helper accepts a
 * gate that cannot gate: flip the polarity, or drop the `await`, or let control
 * fall past the refusal, and the token is still there while the mutation runs on
 * a cross-site request. Spec review round 1 defeated exactly that predicate with
 * a polarity flip on the live `clearIdentityCore`. So each idiom states what it
 * ACCEPTS and rejects everything else.
 *
 * THE GOVERNING RULE, from which every clause follows: in an accepted gate,
 * nothing the author writes may execute before the gate's decision is taken.
 * Every expression position the accept-set leaves unpinned is an execution site,
 * and an execution site reached on a cross-site request is a mutation the gate
 * did not stop. So the accept-sets admit exactly two kinds of expression — a
 * string literal, and one call to a designated refusal export whose arguments
 * are string literals — and the parameter list is pinned too, because parameter
 * initializers run BEFORE the first body statement.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO: decide whether an author-written body
 * can mutate. Spec review rounds 2 and 3 each found a silent acceptance in a
 * design that leaned on `scanBody` for that, the second by editing a
 * module-local refusal helper to write a cookie while satisfying every clause.
 * `scanBody` models write builders, `.rpc(`, and `logAdminOutcome` — not
 * `cookies().set(...)`, not `signOut`, not a filesystem write, not delegation.
 * Teaching it one more verb per round makes a bigger recognizer and a bigger
 * target. So refusals resolve BY NAME against four designated exports of one
 * reviewed module, and the exemption is a CLOSED three-name set cross-checked
 * against two independently maintained registries. A fourth exemption is a spec
 * change with a review, not a row somebody appends.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import ts from "typescript";

import {
  collectSurfaceUnits,
  isLocallyRebound,
  moduleHasUseServer,
  parse,
  scanBody,
  type SurfaceUnit,
} from "../log/mutationSurface/enumerate";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { premiseHolds } from "../_shared/premise";
import { ADMIN_SURFACE_EXEMPTIONS } from "../log/mutationSurface/exemptions";
import { AUDITABLE_MUTATIONS } from "../log/_auditableMutations";

// ── the designated names (spec §3.6) ───────────────────────────────────────

const GATE_MODULE = "@/lib/auth/sameOriginServerAction";
const ASSERT_EXPORT = "assertSameOriginServerAction";
const CHECK_EXPORT = "isSameOriginServerAction";
/** The three refusal exports admissible in accept-set B's return position. */
const REFUSAL_EXPORTS: ReadonlySet<string> = new Set([
  "rejectCrossOriginPicker",
  "rejectCrossOriginNeutral",
  "rejectCrossOriginVoid",
]);

// ── the closed exemption set (spec §3.5) ───────────────────────────────────

/**
 * The ONE exemption kind, covering exactly three units, pinned by name.
 *
 * A cross-site POST to a read-only action mutates nothing, and the same-origin
 * policy already prevents the attacker reading the response. Two of these three
 * are additionally load-bearing to exempt rather than merely safe to exempt:
 * `listFixtures` and `getStagedResult` are awaited during the dev panel's
 * RENDER, and a top-level navigation from an external link carries
 * `sec-fetch-site: cross-site`, so gating them would 403 that page.
 */
const READ_ONLY_EXEMPT = [
  { file: "app/admin/_devCaptureAction.ts", fn: "captureShowTelemetry" },
  { file: "app/admin/dev/actions.ts", fn: "getStagedResult" },
  { file: "app/admin/dev/actions.ts", fn: "listFixtures" },
] as const;

// ── AST predicates ─────────────────────────────────────────────────────────

const keyOf = (r: { file: string; fn: string }): string => `${r.file}::${r.fn}`;

function fnLikeOf(unit: SurfaceUnit): ts.FunctionLikeDeclaration | null {
  const n = unit.node;
  if (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  )
    return n;
  return null;
}

/**
 * Is `exportName` imported from the gate module under that EXACT export name,
 * unaliased?
 *
 * Written locally rather than reusing `importBindingOk`, which hardcodes `log` /
 * `logAdminOutcome` (tests/log/mutationSurface/enumerate.ts). Both fields are
 * read: `propertyName ?? name` is the EXPORT name, `name` is the local binding.
 * Requiring them to agree is what rejects `import { assertSameOriginServerAction
 * as gate }` — under an alias the export name still matches, so reading only
 * `propertyName` would accept it.
 */
function importsGateExport(sf: ts.SourceFile, exportName: string): boolean {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== GATE_MODULE) continue;
    const nb = st.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) continue;
    for (const el of nb.elements) {
      const exported = (el.propertyName ?? el.name).text;
      if (exported === exportName && el.name.text === exportName) return true;
    }
  }
  return false;
}

/**
 * A parameter initializer that cannot execute anything.
 *
 * Parameter defaults run before the first body statement, so an unpinned one
 * sits UPSTREAM of the gate and would run on a cross-site request. This costs
 * the live corpus nothing: exactly one of the 56 units has an initializer at
 * all (`prior: ParseResult | null = null`) and none destructures.
 */
function isInertInitializer(e: ts.Expression): boolean {
  if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
    return true;
  if (
    e.kind === ts.SyntaxKind.TrueKeyword ||
    e.kind === ts.SyntaxKind.FalseKeyword ||
    e.kind === ts.SyntaxKind.NullKeyword
  )
    return true;
  if (ts.isIdentifier(e) && e.text === "undefined") return true;
  if (ts.isObjectLiteralExpression(e) && e.properties.length === 0) return true;
  if (ts.isArrayLiteralExpression(e) && e.elements.length === 0) return true;
  // `= -1` parses as a PrefixUnaryExpression over a numeric literal.
  if (
    ts.isPrefixUnaryExpression(e) &&
    (e.operator === ts.SyntaxKind.MinusToken || e.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(e.operand)
  )
    return true;
  return false;
}

function parametersAreInert(fn: ts.FunctionLikeDeclaration): boolean {
  for (const p of fn.parameters) {
    if (!ts.isIdentifier(p.name)) return false;
    if (p.initializer && !isInertInitializer(p.initializer)) return false;
  }
  return true;
}

/** The first statement that is not a leading directive (`"use server"`). */
function firstNonDirectiveStatement(fn: ts.FunctionLikeDeclaration): ts.Statement | null {
  if (!fn.body || !ts.isBlock(fn.body)) return null;
  for (const st of fn.body.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) continue;
    return st;
  }
  return null;
}

function unwrapParens(e: ts.Expression): ts.Expression {
  let n = e;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
}

/**
 * ACCEPT-SET A — the admin idiom.
 *
 *     await assertSameOriginServerAction("<fn>", "<source>");
 *
 * The `await` is load-bearing and therefore structural: the helper refuses by
 * THROWING the `forbidden()` interrupt, so an unawaited call yields a floating
 * rejected promise and the body runs on to the mutation. The second argument is
 * pinned to a literal for the same class of reason — JavaScript evaluates
 * arguments before entering the callee, so `assertSameOriginServerAction("fn",
 * mutate())` would run `mutate()` on a cross-site request while satisfying
 * every other clause.
 */
function matchesAcceptSetA(unit: SurfaceUnit, fn: ts.FunctionLikeDeclaration): boolean {
  const st = firstNonDirectiveStatement(fn);
  if (!st || !ts.isExpressionStatement(st)) return false;
  if (!ts.isAwaitExpression(st.expression)) return false;
  const call = st.expression.expression;
  if (!ts.isCallExpression(call)) return false;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== ASSERT_EXPORT) return false;
  if (!importsGateExport(fn.getSourceFile(), ASSERT_EXPORT)) return false;
  if (isLocallyRebound(call, ASSERT_EXPORT)) return false;
  if (call.arguments.length !== 2) return false;
  const [action, source] = call.arguments;
  if (!action || !ts.isStringLiteral(action)) return false;
  if (!source || !ts.isStringLiteral(source)) return false;
  // The forensic emit can never mis-attribute: the name it logs IS this unit's.
  return action.text === unit.fn;
}

/**
 * ACCEPT-SET B — the typed-refusal idiom.
 *
 *     if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("<fn>");
 *
 * The polarity, the `await`, the absence of an `else`, the terminating
 * then-branch, and the returned expression are EACH individually sufficient to
 * void the gate, so each is pinned rather than inferred. A `ThrowStatement` is
 * deliberately not admitted: no live refusal throws, and admitting one would
 * add an expression position for nothing.
 *
 * The returned expression resolves BY NAME against the three designated refusal
 * exports. No body analysis of the callee, anywhere — that is the spec's round-3
 * narrowing and must not be re-widened.
 */
function matchesAcceptSetB(fn: ts.FunctionLikeDeclaration): boolean {
  const st = firstNonDirectiveStatement(fn);
  if (!st || !ts.isIfStatement(st)) return false;
  if (st.elseStatement) return false;

  const cond = unwrapParens(st.expression);
  if (!ts.isPrefixUnaryExpression(cond) || cond.operator !== ts.SyntaxKind.ExclamationToken)
    return false;
  const awaited = unwrapParens(cond.operand);
  if (!ts.isAwaitExpression(awaited)) return false;
  const check = awaited.expression;
  if (!ts.isCallExpression(check)) return false;
  if (!ts.isIdentifier(check.expression) || check.expression.text !== CHECK_EXPORT) return false;
  if (check.arguments.length !== 0) return false;
  const sf = fn.getSourceFile();
  if (!importsGateExport(sf, CHECK_EXPORT)) return false;
  if (isLocallyRebound(check, CHECK_EXPORT)) return false;

  let then: ts.Statement = st.thenStatement;
  if (ts.isBlock(then)) {
    if (then.statements.length !== 1) return false;
    const only = then.statements[0];
    if (!only) return false;
    then = only;
  }
  if (!ts.isReturnStatement(then) || !then.expression) return false;
  const refusal = then.expression;
  if (!ts.isCallExpression(refusal)) return false;
  if (!ts.isIdentifier(refusal.expression)) return false;
  const name = refusal.expression.text;
  if (!REFUSAL_EXPORTS.has(name)) return false;
  if (!refusal.arguments.every((a) => ts.isStringLiteral(a))) return false;
  if (!importsGateExport(sf, name)) return false;
  return !isLocallyRebound(refusal, name);
}

/** Does this unit satisfy the walk? Exemptions are decided elsewhere. */
function conformsToAnAcceptSet(unit: SurfaceUnit): boolean {
  const fn = fnLikeOf(unit);
  if (!fn) return false;
  if (!parametersAreInert(fn)) return false;
  return matchesAcceptSetA(unit, fn) || matchesAcceptSetB(fn);
}

// ── the exemption set's three assertions, plus its tripwire ────────────────

/**
 * `scanBody`'s own `adminOutcome` models the durable AWAITED form only, so a
 * bare `logAdminOutcome(...)` slips past it. The sibling guard carries the same
 * helper beside `scanBody` for the same reason, and it is not exported.
 */
function containsAnyLogAdminOutcomeCall(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "logAdminOutcome"
    )
      found = true;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * The regression tripwire over an exempt body — belt-and-braces, NOT the
 * classifier.
 *
 * It never decides WHICH units are exempt; the closed set and its two registry
 * cross-checks do that. Its reach is exactly what `scanBody` models, which is
 * very little (spec §7 says so plainly). Do NOT widen it when a round names a
 * mutation verb it misses — that is the ratchet the round-3 narrowing exists to
 * prevent, and the residual is a documented limit rather than a chase.
 */
function readOnlyTripwire(unit: SurfaceUnit): string | null {
  const p = scanBody(unit.node, { descend: true });
  if (p.writeBuilder) return `${keyOf(unit)}: read-only exemption on a body with a write builder`;
  if (p.rpc) return `${keyOf(unit)}: read-only exemption on a body with an .rpc( call`;
  if (containsAnyLogAdminOutcomeCall(unit.node))
    return `${keyOf(unit)}: read-only exemption on a body that emits logAdminOutcome`;
  return null;
}

type ExemptionRow = { file: string; fn: string };

/**
 * The three assertions that make a closed set safe to state by name. Returns
 * every problem, so one run names them all rather than one per re-run.
 */
function checkExemptionSet(input: {
  exempt: readonly ExemptionRow[];
  units: readonly SurfaceUnit[];
  siblingReadOnly: readonly ExemptionRow[];
  auditable: readonly ExemptionRow[];
}): string[] {
  const { exempt, units, siblingReadOnly, auditable } = input;
  const problems: string[] = [];
  const auditableKeys = new Set(auditable.map(keyOf));

  // 1. Each row resolves to exactly one discovered unit, and that unit is admin.
  for (const row of exempt) {
    const matches = units.filter((u) => u.file === row.file && u.fn === row.fn);
    if (matches.length !== 1) {
      problems.push(`${keyOf(row)}: exemption row resolves to ${matches.length} discovered units`);
      continue;
    }
    const unit = matches[0]!;
    if (!unit.admin) {
      problems.push(`${keyOf(row)}: exemption row names a NON-admin unit`);
      continue;
    }
    // 3. Independent authority on what mutates.
    if (auditableKeys.has(keyOf(row))) {
      problems.push(`${keyOf(row)}: exemption row names a unit registered in AUDITABLE_MUTATIONS`);
      continue;
    }
    const tripped = readOnlyTripwire(unit);
    if (tripped) problems.push(tripped);
  }

  // 2. The set EQUALS the sibling guard's own claim — the anti-drift device. A
  //    `read-only` row added over there cannot silently widen this exemption; it
  //    breaks this equality, loudly, in review.
  const discovered = new Set(units.map(keyOf));
  const siblingClaim = siblingReadOnly
    .filter((r) => discovered.has(keyOf(r)))
    .map(keyOf)
    .sort();
  const ours = exempt.map(keyOf).sort();
  if (JSON.stringify(siblingClaim) !== JSON.stringify(ours)) {
    problems.push(
      `READ_ONLY_EXEMPT disagrees with the sibling guard's read-only rows: ` +
        `here [${ours.join(", ")}] vs there [${siblingClaim.join(", ")}]`,
    );
  }
  return problems;
}

// ── the discovery tripwire: fail CLOSED on what the engine cannot classify ──

/**
 * DISCOVERY IS NOT TOTAL, AND THIS IS WHY THAT IS SAFE ANYWAY.
 *
 * `collectSurfaceUnits` models specific export and action forms
 * (`tests/log/mutationSurface/enumerate.ts`). Diff review round 1 defeated the
 * walk by probing forms it does NOT model — a paren-wrapped module export, an
 * export aliased through an intermediate binding, an ANONYMOUS inline action
 * passed straight to a JSX `action={...}` prop, an inline object method. Next
 * registers all of them as Server Actions; the engine discovers none of them.
 * Re-probed independently against the live engine: each returns ZERO units. So
 * a destructive action written in one of those forms was invisible here, and
 * `gated + exempted === discovered` still balanced — because the unit was never
 * counted on either side.
 *
 * THE REPAIR IS NARROWING, NOT GRAMMAR GROWTH. Teaching the shared invariant-10
 * engine eight more forms would grow a recognizer this arc does not own, and
 * each widening is a bigger target for the next round (AGENTS.md repair-direction
 * rule). Instead the walk DECLINES to pass on anything it cannot classify: the
 * two counters below are deliberately dumb and TOTAL over their domain, and any
 * surplus over what the engine discovered fails by name.
 *
 * The consequence bound is then satisfied in the only form that closes: a
 * Server Action is gated, or exempt, or SIGNALLED — never silently ungated.
 */

/** Every function-like node in a file whose body opens with `"use server"`. Total over function-likes: it models no naming, no position, and no call shape, so an anonymous JSX action and an object method are counted exactly like a named one. */
function inlineDirectiveBearingCount(sf: ts.SourceFile): number {
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      const first = node.body.statements[0];
      if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) {
        if (first.expression.text === "use server") n += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/**
 * Every VALUE name a module-level `"use server"` file exports.
 *
 * Total over export forms because it reads names, not initializers: a
 * paren-wrapped arrow, a higher-order call, a conditional, and an alias chain
 * all export a name, and the name is what this collects. Type-only exports are
 * excluded — they are not addressable endpoints.
 */
function exportedValueNames(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const st of sf.statements) {
    if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) continue;
    if (ts.canHaveModifiers(st)) {
      const mods = ts.getModifiers(st);
      if (mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(st) && st.name) names.push(st.name.text);
        if (ts.isVariableStatement(st))
          for (const d of st.declarationList.declarations)
            if (ts.isIdentifier(d.name)) names.push(d.name.text);
      }
    }
    if (
      ts.isExportDeclaration(st) &&
      !st.moduleSpecifier &&
      st.exportClause &&
      ts.isNamedExports(st.exportClause)
    ) {
      if (st.isTypeOnly) continue;
      for (const el of st.exportClause.elements) {
        if (el.isTypeOnly) continue;
        names.push(el.name.text);
      }
    }
  }
  return names;
}

/** Files the engine walked, so the tripwire ranges over exactly the same corpus. */
function walkedFiles(roots: string[]): string[] {
  return walkSourceFiles(roots).filter(
    (f) => !f.includes("/node_modules/") && !f.includes("/.next/") && !f.includes("/.git/"),
  );
}

/**
 * Every construct the engine could not turn into a unit. Returns one message per
 * offender; empty means discovery was total over this tree.
 */
function undiscoverableConstructs(roots: string[], units: readonly SurfaceUnit[]): string[] {
  const problems: string[] = [];
  const byFile = new Map<string, SurfaceUnit[]>();
  for (const u of units) byFile.set(u.file, [...(byFile.get(u.file) ?? []), u]);

  for (const file of walkedFiles(roots)) {
    if (basename(file) === "route.ts") continue;
    const sf = parse(file);
    const found = byFile.get(file) ?? [];

    if (moduleHasUseServer(sf)) {
      const exported = exportedValueNames(sf);
      const discovered = new Set(found.map((u) => u.fn));
      const missed = exported.filter((n) => !discovered.has(n));
      if (missed.length > 0) {
        problems.push(
          `${file}: "use server" module exports [${missed.join(", ")}] that discovery produced NO unit for — ` +
            `an addressable endpoint the origin walk cannot see, so it can neither be gated nor exempted`,
        );
      }
      continue;
    }

    const inlineCount = inlineDirectiveBearingCount(sf);
    const discoveredInline = found.filter((u) => u.kind === "inline-action").length;
    if (inlineCount > discoveredInline) {
      problems.push(
        `${file}: holds ${inlineCount} function-scoped "use server" bodies but discovery produced ` +
          `${discoveredInline} unit(s) — the remainder is an unnameable inline action (anonymous JSX prop, ` +
          `object method, class method) that the origin walk cannot see`,
      );
    }
  }
  return problems;
}

// ── fixture plumbing ───────────────────────────────────────────────────────

function makeFixture(relPath: string, contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "meta-origin-gate-"));
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  return root;
}

function unitsFor(relPath: string, contents: string): SurfaceUnit[] {
  return collectSurfaceUnits([makeFixture(relPath, contents)]).filter((u) => u.kind !== "route");
}

function unitFor(relPath: string, contents: string): SurfaceUnit {
  const units = unitsFor(relPath, contents);
  expect(units.length, `expected exactly 1 unit from fixture ${relPath}`).toBe(1);
  return units[0]!;
}

const MODULE_HEAD =
  '"use server";\nimport {\n' +
  `  ${ASSERT_EXPORT},\n  ${CHECK_EXPORT},\n  rejectCrossOriginPicker,\n  rejectCrossOriginNeutral,\n  rejectCrossOriginVoid,\n` +
  `} from "${GATE_MODULE}";\n`;

const action = (body: string, fn = "mutate", params = ""): string =>
  `export async function ${fn}(${params}) {\n${body}\n}\n`;

// ── the live walk ──────────────────────────────────────────────────────────

const LIVE_UNITS = collectSurfaceUnits(["app", "lib", "components"]).filter(
  (u) => u.kind !== "route",
);
const EXEMPT_KEYS = new Set(READ_ONLY_EXEMPT.map(keyOf));

/** The sibling guard's `read-only` claim, projected per-function. */
const SIBLING_READ_ONLY_ROWS: readonly ExemptionRow[] = ADMIN_SURFACE_EXEMPTIONS.flatMap((r) =>
  r.kind === "read-only" && r.fn !== undefined ? [{ file: r.file, fn: r.fn }] : [],
);

describe("the live tree: every Server Action surface unit is gated or verifiably exempt", () => {
  test("every discovered non-route unit satisfies an accept-set or the closed exemption", () => {
    const offenders = LIVE_UNITS.filter((u) => !EXEMPT_KEYS.has(keyOf(u)))
      .filter((u) => !conformsToAnAcceptSet(u))
      .map(
        (u) =>
          `${keyOf(u)} — no accepted same-origin gate as its first statement ` +
          `(see the accept-sets in ${__filename.split("/").slice(-1)[0]})`,
      );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  test("every sibling read-only row is per-function, so none can vanish from the equality", () => {
    // `AdminSurfaceExemption.fn` is optional in the sibling's own type. A
    // file-only read-only row would drop out of the projection below and take
    // the anti-drift equality with it — silently. It reds here instead.
    const fileOnly = ADMIN_SURFACE_EXEMPTIONS.filter(
      (r) => r.kind === "read-only" && r.fn === undefined,
    ).map((r) => r.file);
    expect(fileOnly).toEqual([]);
  });

  test("discovery is TOTAL over this tree, or the walk fails by name", () => {
    // The round-1 finding, closed by NARROWING. The engine models specific
    // export and action forms; anything it cannot classify is signalled here
    // rather than silently dropping out of both sides of the reconciliation.
    const problems = undiscoverableConstructs(["app", "lib", "components"], LIVE_UNITS);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("the exemption set is closed and cross-checked against two registries", () => {
    const problems = checkExemptionSet({
      exempt: READ_ONLY_EXEMPT,
      units: LIVE_UNITS,
      siblingReadOnly: SIBLING_READ_ONLY_ROWS,
      auditable: AUDITABLE_MUTATIONS,
    });
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("reconciliation: gated + exempted === discovered, over FULL discovery", () => {
    // Every unit the engine finds is
    // either gate-first under an accept-set or one of the three verified
    // exemptions; there is no third bucket and nothing goes unaccounted.
    const exemptUnits = LIVE_UNITS.filter((u) => EXEMPT_KEYS.has(keyOf(u)));
    const gatedUnits = LIVE_UNITS.filter(
      (u) => !EXEMPT_KEYS.has(keyOf(u)) && conformsToAnAcceptSet(u),
    );
    expect(gatedUnits.length + exemptUnits.length).toBe(LIVE_UNITS.length);
    const keys = [...gatedUnits, ...exemptUnits].map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("the implementation ratchet is GONE from this file's own source", () => {
    // The shipped guard has no allowlist in it. Spelled as a join so this
    // assertion cannot fail on itself, and read from disk rather than from a
    // constant, so re-introducing the array anywhere in the file reds here.
    const identifier = ["PENDING", "GATE"].join("_");
    expect(readFileSync(__filename, "utf8")).not.toContain(identifier);
  });
});

// ── fixture self-tests: every clause has a failing fixture ─────────────────

describe("accept-set A — fixture self-tests", () => {
  const A = (call: string, params = ""): SurfaceUnit =>
    unitFor(
      "lib/x/actions.ts",
      MODULE_HEAD + action(`  ${call}\n  await doIt();`, "mutate", params),
    );

  test("an ungated destructive module action FAILS", () => {
    expect(
      conformsToAnAcceptSet(unitFor("lib/x/actions.ts", MODULE_HEAD + action("  await doIt();"))),
    ).toBe(false);
  });

  test("well-formed PASSES", () => {
    expect(conformsToAnAcceptSet(A(`await ${ASSERT_EXPORT}("mutate", "src");`))).toBe(true);
  });

  test("`await` removed FAILS", () => {
    expect(conformsToAnAcceptSet(A(`${ASSERT_EXPORT}("mutate", "src");`))).toBe(false);
  });

  test("name literal not equal to the unit's fn FAILS", () => {
    expect(conformsToAnAcceptSet(A(`await ${ASSERT_EXPORT}("notMutate", "src");`))).toBe(false);
  });

  test("imported under an alias FAILS", () => {
    const src =
      '"use server";\n' +
      `import { ${ASSERT_EXPORT} as gate } from "${GATE_MODULE}";\n` +
      action('  await gate("mutate", "src");\n  await doIt();');
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });

  test("a locally shadowed binding FAILS", () => {
    const src =
      MODULE_HEAD +
      action(
        `  const ${ASSERT_EXPORT} = async () => {};\n  await ${ASSERT_EXPORT}("mutate", "src");\n  await doIt();`,
      );
    // The local const is the first statement, so this fails on placement too;
    // the shadow clause is what the next fixture isolates.
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });

  test("a shadow introduced by a PARAMETER FAILS even with the gate first", () => {
    // Isolates the rebind clause from the placement clause: the gate call IS
    // the first statement here, and the only defect is that the identifier
    // resolves to a parameter rather than to the imported export.
    const src =
      MODULE_HEAD +
      action(
        `  await ${ASSERT_EXPORT}("mutate", "src");`,
        "mutate",
        `${ASSERT_EXPORT}: (a: string, b: string) => Promise<void>`,
      );
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });

  test("the gate as the SECOND statement FAILS", () => {
    const src = MODULE_HEAD + action(`  await doIt();\n  await ${ASSERT_EXPORT}("mutate", "src");`);
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });

  test("second argument is a CALL rather than a literal FAILS", () => {
    expect(conformsToAnAcceptSet(A(`await ${ASSERT_EXPORT}("mutate", src());`))).toBe(false);
  });

  test("first argument is a CALL rather than a literal FAILS", () => {
    expect(conformsToAnAcceptSet(A(`await ${ASSERT_EXPORT}(name(), "src");`))).toBe(false);
  });

  test("a third argument FAILS", () => {
    expect(conformsToAnAcceptSet(A(`await ${ASSERT_EXPORT}("mutate", "src", "x");`))).toBe(false);
  });

  test("no import from the gate module at all FAILS", () => {
    const src = '"use server";\n' + action('  await assertSameOriginServerAction("mutate", "s");');
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });
});

describe("accept-set B — fixture self-tests", () => {
  const B = (then: string, cond = `!(await ${CHECK_EXPORT}())`): SurfaceUnit =>
    unitFor("lib/x/actions.ts", MODULE_HEAD + action(`  if (${cond}) ${then}\n  await doIt();`));

  test("well-formed with a designated refusal export PASSES", () => {
    expect(conformsToAnAcceptSet(B('return rejectCrossOriginPicker("mutate");'))).toBe(true);
  });

  test("a Block holding exactly one return PASSES", () => {
    expect(conformsToAnAcceptSet(B('{ return rejectCrossOriginNeutral("mutate"); }'))).toBe(true);
  });

  test("refusal is a MODULE-LOCAL helper rather than a designated export FAILS", () => {
    const src =
      MODULE_HEAD +
      "function refuse() { return { ok: false }; }\n" +
      action(`  if (!(await ${CHECK_EXPORT}())) return refuse();\n  await doIt();`);
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });

  test("refusal export imported under an alias FAILS", () => {
    const src =
      '"use server";\n' +
      `import { ${CHECK_EXPORT}, rejectCrossOriginPicker as refuse } from "${GATE_MODULE}";\n` +
      action(`  if (!(await ${CHECK_EXPORT}())) return refuse("mutate");\n  await doIt();`);
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });

  test("POLARITY FLIPPED FAILS", () => {
    // The shipped clearIdentityCore in this shape would fall straight through
    // to its cookie write on a cross-site request while a contains-a-call
    // predicate reported a gate. This is spec review R1's finding.
    expect(
      conformsToAnAcceptSet(
        B('return rejectCrossOriginPicker("mutate");', `await ${CHECK_EXPORT}()`),
      ),
    ).toBe(false);
  });

  test("`await` removed FAILS", () => {
    expect(
      conformsToAnAcceptSet(B('return rejectCrossOriginPicker("mutate");', `!${CHECK_EXPORT}()`)),
    ).toBe(false);
  });

  test("a then-branch that does not terminate FAILS", () => {
    expect(conformsToAnAcceptSet(B('log.warn("refused");'))).toBe(false);
  });

  test("a then-block with a statement BEFORE the return FAILS", () => {
    expect(
      conformsToAnAcceptSet(B('{ await audit(); return rejectCrossOriginPicker("mutate"); }')),
    ).toBe(false);
  });

  test("an `else` present FAILS", () => {
    const src =
      MODULE_HEAD +
      action(
        `  if (!(await ${CHECK_EXPORT}())) return rejectCrossOriginPicker("mutate");\n  else await doIt();`,
      );
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });

  test("an ARBITRARY call in the return position FAILS", () => {
    expect(conformsToAnAcceptSet(B("return mutateAndRefuse();"))).toBe(false);
  });

  test("a bare object literal in the return position FAILS", () => {
    expect(conformsToAnAcceptSet(B('return { ok: false, code: "PICKER_INVALID_INPUT" };'))).toBe(
      false,
    );
  });

  test("a refusal-helper argument that is a CALL rather than a literal FAILS", () => {
    expect(conformsToAnAcceptSet(B("return rejectCrossOriginPicker(nameOf());"))).toBe(false);
  });

  test("a THROW in the then-branch FAILS (deliberately not admitted)", () => {
    expect(conformsToAnAcceptSet(B('throw rejectCrossOriginPicker("mutate");'))).toBe(false);
  });

  test("a non-zero-argument check call FAILS", () => {
    expect(
      conformsToAnAcceptSet(
        B('return rejectCrossOriginPicker("mutate");', `!(await ${CHECK_EXPORT}(req))`),
      ),
    ).toBe(false);
  });
});

describe("the parameter precondition — fixture self-tests (both accept-sets)", () => {
  const withParams = (params: string): SurfaceUnit =>
    unitFor(
      "lib/x/actions.ts",
      MODULE_HEAD + action(`  await ${ASSERT_EXPORT}("mutate", "src");`, "mutate", params),
    );

  test("a call-valued parameter initializer FAILS", () => {
    expect(conformsToAnAcceptSet(withParams("prior = seed()"))).toBe(false);
  });

  test("a destructured parameter FAILS", () => {
    expect(conformsToAnAcceptSet(withParams("{ slug }: { slug: string }"))).toBe(false);
  });

  test("a plain-literal initializer (`= null`) PASSES", () => {
    // The live corpus's one initializer, `parseAndStage`'s `prior = null`.
    expect(conformsToAnAcceptSet(withParams("prior: string | null = null"))).toBe(true);
  });

  test("an empty-object initializer PASSES", () => {
    expect(conformsToAnAcceptSet(withParams("opts: Record<string, string> = {}"))).toBe(true);
  });

  test("the precondition applies to accept-set B too", () => {
    const src =
      MODULE_HEAD +
      action(
        `  if (!(await ${CHECK_EXPORT}())) return rejectCrossOriginVoid("mutate");\n  await doIt();`,
        "mutate",
        "prior = seed()",
      );
    expect(conformsToAnAcceptSet(unitFor("lib/x/actions.ts", src))).toBe(false);
  });
});

describe('the inline `"use server"` wrapper shape — fixture self-test', () => {
  test("a function-scoped inline action is discovered and gated the same way", () => {
    const src =
      `import { ${CHECK_EXPORT}, rejectCrossOriginVoid } from "${GATE_MODULE}";\n` +
      "export function Chip() {\n" +
      "  const formAction = async () => {\n" +
      '    "use server";\n' +
      `    if (!(await ${CHECK_EXPORT}())) return rejectCrossOriginVoid("formAction");\n` +
      "    await doIt();\n" +
      "  };\n" +
      "  return formAction;\n" +
      "}\n";
    const unit = unitFor("components/x/Chip.tsx", src);
    expect(unit.kind).toBe("inline-action");
    expect(conformsToAnAcceptSet(unit)).toBe(true);
  });

  test("the same wrapper ungated FAILS", () => {
    const src =
      "export function Chip() {\n" +
      "  const formAction = async () => {\n" +
      '    "use server";\n' +
      "    await doIt();\n" +
      "  };\n" +
      "  return formAction;\n" +
      "}\n";
    expect(conformsToAnAcceptSet(unitFor("components/x/Chip.tsx", src))).toBe(false);
  });
});

describe("the exemption set's three assertions — fixture self-tests", () => {
  const READ_ONLY_BODY =
    MODULE_HEAD +
    "export async function readIt() {\n  await requireDeveloper();\n  return await queryEvents();\n}\n";

  const setup = (relPath = "app/admin/dev/actions.ts", body = READ_ONLY_BODY) => {
    const unit = unitFor(relPath, body);
    const row = { file: unit.file, fn: unit.fn };
    return { unit, row };
  };

  test("the happy path: an admin read-only row with a matching sibling row PASSES", () => {
    const { unit, row } = setup();
    expect(
      checkExemptionSet({
        exempt: [row],
        units: [unit],
        siblingReadOnly: [row],
        auditable: [],
      }),
    ).toEqual([]);
  });

  test("a row naming a unit that is in AUDITABLE_MUTATIONS FAILS", () => {
    const { unit, row } = setup();
    const problems = checkExemptionSet({
      exempt: [row],
      units: [unit],
      siblingReadOnly: [row],
      auditable: [row],
    });
    expect(problems.join("\n")).toContain("AUDITABLE_MUTATIONS");
  });

  test("a row naming a NON-admin unit FAILS", () => {
    // No `require`-gate in the body, so `collectSurfaceUnits` classifies it
    // non-admin. The sibling registry is consulted only on the ADMIN branch of
    // the other guard, so a row for a non-admin unit is verified by nobody
    // there — this walk re-runs the predicate itself rather than trusting it.
    const { unit, row } = setup(
      "lib/x/actions.ts",
      MODULE_HEAD + "export async function readIt() {\n  return await queryEvents();\n}\n",
    );
    const problems = checkExemptionSet({
      exempt: [row],
      units: [unit],
      siblingReadOnly: [row],
      auditable: [],
    });
    expect(problems.join("\n")).toContain("NON-admin");
  });

  test("a row with no matching discovered unit FAILS", () => {
    const { unit } = setup();
    const orphan = { file: "app/admin/dev/actions.ts", fn: "noSuchThing" };
    const problems = checkExemptionSet({
      exempt: [orphan],
      units: [unit],
      siblingReadOnly: [],
      auditable: [],
    });
    expect(problems.join("\n")).toContain("resolves to 0 discovered units");
  });

  test("a sibling `read-only` row absent from READ_ONLY_EXEMPT FAILS", () => {
    const { unit, row } = setup();
    const problems = checkExemptionSet({
      exempt: [],
      units: [unit],
      siblingReadOnly: [row],
      auditable: [],
    });
    expect(problems.join("\n")).toContain("disagrees with the sibling guard");
  });

  test("a sibling row that resolves to NO discovered unit does not force a row here", () => {
    // The sibling registry also holds route rows, which this walk never
    // discovers. Filtering by discovery is what keeps the equality honest
    // rather than impossible.
    const { unit, row } = setup();
    expect(
      checkExemptionSet({
        exempt: [row],
        units: [unit],
        siblingReadOnly: [row, { file: "app/api/admin/x/route.ts", fn: "POST" }],
        auditable: [],
      }),
    ).toEqual([]);
  });
});

describe("the read-only tripwire — fixture self-tests", () => {
  const exemptLike = (body: string): SurfaceUnit =>
    unitFor(
      "app/admin/dev/actions.ts",
      MODULE_HEAD + `export async function readIt() {\n  await requireDeveloper();\n${body}\n}\n`,
    );

  test("a clean read-only body trips nothing", () => {
    expect(readOnlyTripwire(exemptLike("  return await queryEvents();"))).toBeNull();
  });

  test("a write builder trips it", () => {
    expect(readOnlyTripwire(exemptLike('  await db.from("t").update({ a: 1 });'))).toContain(
      "write builder",
    );
  });

  test("an `.rpc(` call trips it", () => {
    expect(readOnlyTripwire(exemptLike('  await db.rpc("do_it");'))).toContain(".rpc(");
  });

  test("a BARE (unawaited) logAdminOutcome trips it — scanBody models only the awaited form", () => {
    expect(readOnlyTripwire(exemptLike('  logAdminOutcome({ source: "s" });'))).toContain(
      "logAdminOutcome",
    );
  });

  test("a write nested inside a helper defined in the body trips it (descend: true)", () => {
    expect(
      readOnlyTripwire(
        exemptLike('  const go = async () => db.from("t").insert({});\n  await go();'),
      ),
    ).toContain("write builder");
  });

  test("the three live exempt bodies trip nothing", () => {
    for (const row of READ_ONLY_EXEMPT) {
      const unit = LIVE_UNITS.find((u) => u.file === row.file && u.fn === row.fn);
      expect(unit, `${keyOf(row)} not discovered`).toBeDefined();
      expect(readOnlyTripwire(unit!)).toBeNull();
    }
  });
});

describe("the discovery tripwire — fixture self-tests (the round-1 attack)", () => {
  /** Runs BOTH halves the way the live assertion does: discover, then reconcile. */
  const problemsFor = (rel: string, src: string): string[] => {
    const root = makeFixture(rel, src);
    const units = collectSurfaceUnits([root]).filter((u) => u.kind !== "route");
    return undiscoverableConstructs([root], units);
  };

  // Each of these four is a form Next registers as a Server Action and the
  // shared engine returns ZERO units for — verified against the live engine, not
  // assumed. The premise below is what makes that verification part of the test.
  const UNDISCOVERABLE: ReadonlyArray<readonly [string, string, string]> = [
    [
      "module export wrapped in parens",
      "lib/x/a.ts",
      '"use server";\nexport const doIt = async () => { await db.from("t").delete(); };\nexport const wrapped = (async () => { await db.from("t").delete(); });\n',
    ],
    [
      "module export aliased through an intermediate binding",
      "lib/x/b.ts",
      '"use server";\nconst impl = async () => { await db.from("t").delete(); };\nconst alias = impl;\nexport { alias as doIt };\n',
    ],
    [
      "ANONYMOUS inline action passed straight to a JSX action prop",
      "components/x/F.tsx",
      'export function F() {\n  return <form action={async () => { "use server"; await db.from("t").delete(); }} />;\n}\n',
    ],
    [
      "inline action as an object method",
      "components/x/G.tsx",
      'export function G() {\n  const actions = { async doIt() { "use server"; await db.from("t").delete(); } };\n  return actions;\n}\n',
    ],
  ];

  test.each(UNDISCOVERABLE)("%s is SIGNALLED, never silently dropped", (_label, rel, src) => {
    // Premise: the engine must actually fail to discover this form. If a future
    // engine change starts discovering it, this fixture stops exercising the
    // tripwire and would pass for the wrong reason — so the premise reds instead.
    const root = makeFixture(rel, src);
    const units = collectSurfaceUnits([root]).filter((u) => u.kind !== "route");
    const undiscovered =
      rel.endsWith(".tsx") || !src.startsWith('"use server"')
        ? units.filter((u) => u.kind === "inline-action").length === 0
        : units.length < 2;
    premiseHolds(
      `the shared engine still fails to discover this form; if it now discovers it, this fixture no longer exercises the tripwire (${rel})`,
      undiscovered,
    );
    expect(undiscoverableConstructs([root], units).length).toBeGreaterThan(0);
  });

  test("a fully discoverable module is QUIET — the tripwire is not a blanket failure", () => {
    // The negative half. Without it, a tripwire that fired on everything would
    // pass every case above while being useless.
    expect(
      problemsFor(
        "lib/x/ok.ts",
        MODULE_HEAD + action(`  await ${ASSERT_EXPORT}("mutate", "src");`),
      ),
    ).toEqual([]);
  });

  test("a type-only export does not trip it", () => {
    // "use server" modules legitimately export types; they are not endpoints.
    expect(
      problemsFor(
        "lib/x/types.ts",
        MODULE_HEAD +
          "export type Result = { ok: true };\n" +
          action(`  await ${ASSERT_EXPORT}("mutate", "src");`),
      ),
    ).toEqual([]);
  });

  test("a named inline action IS discovered, so it reconciles quietly", () => {
    expect(
      problemsFor(
        "components/x/H.tsx",
        `import { ${CHECK_EXPORT}, rejectCrossOriginVoid } from "${GATE_MODULE}";\n` +
          "export function H() {\n" +
          "  const doIt = async () => {\n" +
          '    "use server";\n' +
          `    if (!(await ${CHECK_EXPORT}())) return rejectCrossOriginVoid("doIt");\n` +
          "  };\n" +
          "  return doIt;\n" +
          "}\n",
      ),
    ).toEqual([]);
  });
});

describe("the walk's own wiring", () => {
  test("READ_ONLY_EXEMPT holds no duplicate rows", () => {
    const keys = READ_ONLY_EXEMPT.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("the two walks agree: this file reads the invariant-10 engine, not its own census", () => {
    // A premise, executably: if discovery ever returned nothing, every
    // assertion above would pass vacuously and would pass forever.
    expect(LIVE_UNITS.length).toBeGreaterThan(50);
    const source = readFileSync(__filename, "utf8");
    expect(source).toContain('from "../log/mutationSurface/enumerate"');
    // `parse` is re-exported through this file's import list precisely so a
    // future edit cannot silently swap engines.
    expect(typeof parse).toBe("function");
  });
});
