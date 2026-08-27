// tests/log/noDoubleSerializedLogError.test.ts
//
// The logger serializes exactly ONCE. `buildRecord` (lib/log/logger.ts) runs
// `serializeError(fields.error)` on its way to the record, so a call site that ALSO wraps the
// value hands `serializeError` a plain object. Until fix/serialize-error-structure that
// non-Error branch was `String(value)` and the persisted diagnostic collapsed to the literal
// string "[object Object]" — double-serializing silently destroyed the field. The branch is
// STRUCTURAL now, so a re-serialized Error survives; the ban stands because it is shape drift
// (a `{name,message,stack}` object where a raw value belongs) plus redundant work, and this
// scanner is what enforces it statically rather than any runtime assertion.
//
// DOCUMENTED LIMIT (fix/observe-error-telemetry, spec §9 limit 3): this scanner
// does NOT see `error: X.message`. That form passes it while discarding exactly
// the code/details/hint the guard exists to preserve — a flattening it was not
// written to model, since it is neither String(e) nor JSON.stringify(e).
//
// Four in-cover instances were repaired by the lib/admin infra-emit sweep, which
// reports them for its own reason (a payload whose type is not an object):
// loadRecentAutoApplied, readShowReviewSnapshot, loadAlertSummary,
// loadTelemetryStats. FIVE remain outside that cover and outside this arc's probe
// domain: app/admin/_showReviewModal.tsx (three),
// app/api/show/[slug]/version/route.ts, and lib/log/emitDiagramVariantFailures.ts
// — the last passes `row.message` from a data row rather than a caught error and
// may well be correct.
//
// Re-run trigger, which is the whole of the finding:
//   grep -rn 'error: [a-zA-Z_][a-zA-Z0-9_]*\.message' lib/ app/ \
//     --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
//
// Widening this scanner to see `.message` is the mechanical repair and belongs to
// whoever owns this guard, not to an arc whose cover is lib/admin/**.
//
// The residual DESTRUCTIVE vector moved: flattening BEFORE the helper — `String(e)` or
// `JSON.stringify(e)` in the `error` initializer — still collapses structure, so this scanner
// flags that family too (spec
// docs/superpowers/specs/observability/2026-08-16-serialize-error-structure-design.md §2.6).
//
// Spec: docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md §2.2, AC-7.
//
// WALK-DERIVED, NOT ENUMERATED. The 18 in-class sites this guard first turned red are not
// written down here. The scanner walks `lib/`, `app/`, and `components/` from disk, so a NEW site
// fails by default rather than needing anyone to remember to add a row. An enumerated cover
// re-opens the moment someone adds a file.
//
// CLOSURE SET (the mutation families this recognizer is claimed to cover, declared up front).
// Each family is closed by a PREDICATE over node shape, not by a list of spellings, and every
// variant below is pinned by its own planted fixture:
//   1. re-wrap      — `error: serializeError(x)` at any walked `log.*` call site.
//   2. alias        — the same through a renamed import (`import { serializeError as s }`),
//                     caught by resolving the IMPORT BINDING rather than matching a bare name.
//   3. spread-carrier — the property reaching the fields object through an object spread. All
//                     four short-circuit forms count, because all four are ordinary authoring:
//                     `cond ? {} : {...}` (both picker resolvers), `cond && {...}`, `x || {...}`,
//                     `x ?? {...}`, nested combinations included.
//   4. transparent wrapper — any of the above with a TYPE-ONLY wrapper that changes the AST node
//                     while leaving the runtime value identical: `as T`, `satisfies T`, `!`,
//                     `(...)`, and the legacy `<T>x`. Applied at all three positions a wrapper
//                     can appear: the fields argument, the spread expression, and the `error`
//                     initializer.
//
// Families 3-and-4 beyond the conditional/paren forms were added in diff review R1, which probed
// three evading variants (`as`, `satisfies`, `... (cond && {...})`) against the shipped scanner
// and showed each compiling clean while persisting "[object Object]" under the collapse-era
// helper (structure survives that path today; the ban is unchanged). The repair is the
// PREDICATE above, swept across every position a wrapper can occupy, rather than three patches
// for the three reported spellings.
//
// HOW THE VALUE AXIS IS CLOSED, AND WHY IT IS CLOSED BY NARROWING. R1 widened the initializer
// shape parser; R2 immediately produced a second grammar corner on the same axis (`cond ?
// serializeError(e) : e` and the `&&` / `||` / `??` carriers). That is the one-corner-per-round
// ratchet, where each widening is a bigger target for the next round. So the value axis is NOT
// parsed at all: `mentionsWrapper` asks whether the `error` value's SUBTREE mentions a
// serializeError binding, which is a closed question over a finite tree rather than an open
// question over a grammar. Ternaries, short-circuits, nesting, and any future syntax are covered
// by construction, not by another case. A finding claiming a new VALUE-SHAPE evasion is refuted
// by that predicate; only the two limits below remain open, and both are outside the fence.
//
// `mentionsFlattener` (the pre-flatten family) is the SAME closed question over the same finite
// tree, asked of a different accept-set: global `String(...)` and `JSON.stringify(...)`. It is
// not a grammar parser either, so the narrowing argument above covers it unchanged, and a
// finding proposing a third flattening spelling is an accept-set proposal against the spec's
// §2.6 derivation rather than a value-shape evasion.
//
// The structural traversal (which object literals contribute to `fields`, and which spread forms
// carry one) is still shape-based, because that is a question about STRUCTURE, not value — it
// decides where to look, not what counts once you are looking.
//
// DOCUMENTED LIMITS, not gaps to widen the recognizer for: a helper that wraps and then forwards
// (interprocedural flow), and a computed/dynamic property name. Both are outside the threat
// model below, and a probe demonstrating either files to the spec's limits section rather than
// growing this scanner. A wider recognizer is a bigger target for the next round.
//
// CONSEQUENCE BOUND. Every input is either handled correctly or reported; there is no
// silent-wrong path. A false positive is a LOUD failure a contributor resolves by unwrapping the
// call (which is the fix in every real case) or by taking the limit to the spec. The cost of a
// MISSED site is now split by family: a missed WRAPPER site drifts the persisted shape and does
// redundant work (structure survives), while a missed PRE-FLATTEN site still destroys it — which
// is why the flattener family was added alongside the helper redesign rather than instead of it.
//
// THREAT MODEL FENCE. Ordinary authoring mistakes by a contributor who is not trying to evade
// the guard — copying a neighbouring emit that still wrapped, or reaching for the helper out of
// habit. Deliberate obfuscation (aliasing `log` itself through a local, building the property
// name at runtime, indexing the logger) is out of scope.
import { describe, expect, test } from "vitest";
import { Node, Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { premise } from "../_shared/premise";

/** The levels `lib/log` exposes. `debug` is console-only but double-serializes identically. */
const LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);

/** The module specifiers that can supply the shared `serializeError` helper. */
const SERIALIZE_ERROR_MODULES = ["@/lib/log", "@/lib/log/serializeError", "./serializeError"];

type Finding = { file: string; line: number; text: string };

/**
 * Local binding names for the shared `serializeError` helper in this file. Resolving the import
 * (rather than matching the bare identifier) is what makes the ALIAS family land: a renamed
 * import binds a different name to the same function, and a name-only scan misses it.
 */
function serializeErrorBindings(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const fromLogModule =
      SERIALIZE_ERROR_MODULES.includes(specifier) || specifier.endsWith("/log/serializeError");
    if (!fromLogModule) continue;
    for (const named of declaration.getNamedImports()) {
      if (named.getName() !== "serializeError") continue;
      names.add(named.getAliasNode()?.getText() ?? named.getName());
    }
  }
  return names;
}

/**
 * Strip every wrapper that changes the TYPE view of an expression without changing the value
 * that reaches runtime: parentheses, `as T`, `satisfies T`, `!`, and the legacy `<T>x` form.
 *
 * This is one shape, not four special cases, and it is why the sweep is written as a predicate
 * rather than a list: each of these leaves `serializeError(e)` executing exactly as before while
 * changing the AST node the scanner sees. `...(cond ? {} : {...})` also REQUIRES parentheses to
 * parse, which is the instance the planted spread-carrier fixture caught before the tree did.
 */
function unwrapTransparent(node: Node): Node {
  let current = node;
  for (;;) {
    if (
      Node.isParenthesizedExpression(current) ||
      Node.isAsExpression(current) ||
      Node.isSatisfiesExpression(current) ||
      Node.isNonNullExpression(current) ||
      Node.isTypeAssertion(current)
    ) {
      current = current.getExpression();
      continue;
    }
    return current;
  }
}

/**
 * Every expression a spread can be carrying an object literal through. All four short-circuit
 * forms are ordinary authoring, not obfuscation: `cond ? {} : {...}`, `cond && {...}`,
 * `x || {...}`, and `x ?? {...}` all appear in idiomatic conditional-property code. Recursive, so
 * a nested combination resolves.
 */
function spreadCandidates(expression: Node): Node[] {
  const node = unwrapTransparent(expression);
  if (Node.isConditionalExpression(node)) {
    return [node.getWhenTrue(), node.getWhenFalse()].flatMap(spreadCandidates);
  }
  if (Node.isBinaryExpression(node)) {
    const operator = node.getOperatorToken().getKind();
    if (
      operator === SyntaxKind.AmpersandAmpersandToken ||
      operator === SyntaxKind.BarBarToken ||
      operator === SyntaxKind.QuestionQuestionToken
    ) {
      return [node.getLeft(), node.getRight()].flatMap(spreadCandidates);
    }
  }
  return [node];
}

/** Every object literal that contributes properties to `fields`, spreads resolved through. */
function contributingObjectLiterals(root: ObjectLiteralExpression): ObjectLiteralExpression[] {
  const literals: ObjectLiteralExpression[] = [root];
  for (const property of root.getProperties()) {
    if (!Node.isSpreadAssignment(property)) continue;
    for (const candidate of spreadCandidates(property.getExpression())) {
      if (Node.isObjectLiteralExpression(candidate))
        literals.push(...contributingObjectLiterals(candidate));
    }
  }
  return literals;
}

/**
 * Does the VALUE expression for `error` mention the wrapper anywhere inside it?
 *
 * This deliberately does NOT classify the expression's shape. Diff review R1 widened the shape
 * parser once (transparent wrappers) and R2 immediately produced a second grammar corner on the
 * same axis (`cond ? serializeError(e) : e`, `cond && serializeError(e)`, `||`, `??`) — the
 * one-corner-per-round ratchet AGENTS.md names, where every widening is a bigger target for the
 * next round. So the axis is closed by NARROWING instead: stop parsing the grammar of the value
 * and ask one closed question over its subtree.
 *
 * Sound in the direction that matters. If `serializeError` appears anywhere in the value that
 * reaches `error`, then on at least one path the logger receives an already-serialized object
 * and re-serializes it — historically to "[object Object]", structurally since
 * fix/serialize-error-structure, and drifted in shape either way. A conditional
 * carrier is not a special case of that — it IS that, on one branch.
 *
 * The cost is a possible false positive: an expression that mentions the helper without its
 * result reaching `error`. That is a LOUD failure a contributor resolves by hoisting the call,
 * never silent corruption, so it sits on the correct side of this file's consequence bound. No
 * such site exists in the tree today.
 */
function mentionsWrapper(initializer: Node, wrappers: Set<string>): boolean {
  for (const call of initializer.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (Node.isIdentifier(callee) && wrappers.has(callee.getText())) return true;
  }
  if (Node.isCallExpression(initializer)) {
    const callee = initializer.getExpression();
    if (Node.isIdentifier(callee) && wrappers.has(callee.getText())) return true;
  }
  return false;
}

/**
 * Does the VALUE expression for `error` mention a structure-flattening call --
 * global `String(...)` or `JSON.stringify(...)` -- anywhere in its subtree?
 * Same closed-question-over-a-finite-tree shape as mentionsWrapper: once the
 * helper preserves structure, a call site flattening BEFORE the helper is the
 * residual regression vector (spec §2.6). Scoped to object-literal fields
 * arguments like every other family here; variable-carried fields objects are
 * the parent suite's documented limit (spec §4 limit 10).
 */
function mentionsFlattener(initializer: Node): boolean {
  const calls: Node[] = [...initializer.getDescendantsOfKind(SyntaxKind.CallExpression)];
  if (Node.isCallExpression(initializer)) calls.push(initializer);
  for (const node of calls) {
    if (!Node.isCallExpression(node)) continue;
    const callee = node.getExpression();
    if (Node.isIdentifier(callee) && callee.getText() === "String") return true;
    if (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === "stringify" &&
      Node.isIdentifier(callee.getExpression()) &&
      callee.getExpression().getText() === "JSON"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Report every `log.<level>(msg, { ... error: <anything mentioning serializeError or a
 * structure flattener> ... })`.
 */
export function findDoubleSerializedSites(sourceFile: SourceFile): Finding[] {
  // No early return on an empty wrapper set: the pre-flatten family needs no
  // serializeError import to reach the logger with the structure already gone.
  const wrappers = serializeErrorBindings(sourceFile);

  const findings: Finding[] = [];
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const receiver = callee.getExpression();
    // The `log` object itself, not `console` and not an aliased logger (threat-model fence).
    if (!Node.isIdentifier(receiver) || receiver.getText() !== "log") continue;
    if (!LOG_LEVELS.has(callee.getName())) continue;

    const secondArgument = call.getArguments()[1];
    if (!secondArgument) continue;
    const fields = unwrapTransparent(secondArgument);
    if (!Node.isObjectLiteralExpression(fields)) continue;

    for (const literal of contributingObjectLiterals(fields)) {
      for (const property of literal.getProperties()) {
        if (!Node.isPropertyAssignment(property)) continue;
        if (property.getName() !== "error") continue;
        const initializerNode = property.getInitializer();
        if (!initializerNode) continue;
        const preSerialized = wrappers.size > 0 && mentionsWrapper(initializerNode, wrappers);
        if (!preSerialized && !mentionsFlattener(initializerNode)) continue;
        findings.push({
          file: sourceFile.getFilePath(),
          line: property.getStartLineNumber(),
          text: property.getText().replace(/\s+/g, " "),
        });
      }
    }
  }
  return findings;
}

function newProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false },
  });
}

/**
 * Planted fixtures, run UNCONDITIONALLY. Without them a scanner that silently stopped
 * recognizing the banned shape (a renamed ts-morph API, a typo in the level set) would report
 * zero findings over a clean tree and read exactly like success.
 */
const BANNED_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function reWrap(e: unknown) {
  void log.error("re-wrap family", { source: "probe", error: serializeError(e) });
}
`;

const ALIAS_FIXTURE = `
import { serializeError as toLoggable } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function aliased(e: unknown) {
  void log.warn("alias family", { source: "probe", error: toLoggable(e) });
}
`;

const SPREAD_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function spreadCarrier(detail: unknown) {
  void log.info("spread-carrier family", {
    source: "probe",
    ...(detail === undefined ? {} : { error: serializeError(detail) }),
  });
}
`;

/**
 * Diff review R1's three probed evaders, plus the rest of the same shape swept in with them.
 * Each type-only wrapper leaves `serializeError(e)` executing unchanged; each short-circuit
 * spread carries the property into the fields object exactly like the conditional form.
 */
const AS_ASSERTION_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function asAssertion(e: unknown) {
  void log.error("as-wrapped", { source: "probe", error: serializeError(e) as unknown });
}
`;

const SATISFIES_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function satisfiesWrapped(e: unknown) {
  void log.error("satisfies-wrapped", { source: "probe", error: serializeError(e) satisfies unknown });
}
`;

const NON_NULL_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function nonNull(e: unknown) {
  void log.error("non-null-wrapped", { source: "probe", error: serializeError(e)! });
}
`;

const LOGICAL_AND_SPREAD_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function logicalAnd(detail: unknown) {
  void log.warn("logical-and spread", {
    source: "probe",
    ...(detail !== undefined && { error: serializeError(detail) }),
  });
}
`;

const NULLISH_SPREAD_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function nullish(fallback: Record<string, unknown> | undefined, e: unknown) {
  void log.info("nullish spread", {
    source: "probe",
    ...(fallback ?? { error: serializeError(e) }),
  });
}
`;

const WRAPPED_FIELDS_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function wrappedFields(e: unknown) {
  // The wrapper on the FIELDS ARGUMENT rather than on the error value.
  void log.error("as-wrapped fields object", { source: "probe", error: serializeError(e) } as {
    source: string;
    error: unknown;
  });
}
`;

/**
 * Diff review R2's four probed initializer carriers. These are pinned as fixtures, but they are
 * NOT four more parser cases: `mentionsWrapper` closes all of them, and every future one on the
 * same axis, by subtree containment. They are here so the closure is executable rather than
 * asserted in a comment.
 */
const INITIALIZER_CARRIER_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function ternary(e: unknown, cond: boolean) {
  void log.error("ternary", { source: "probe", error: cond ? serializeError(e) : e });
}
export function logicalAnd(e: unknown, cond: boolean) {
  void log.error("and", { source: "probe", error: cond && serializeError(e) });
}
export function logicalOr(e: unknown, prior: unknown) {
  void log.error("or", { source: "probe", error: prior || serializeError(e) });
}
export function nullish(e: unknown, prior: unknown) {
  void log.error("nullish", { source: "probe", error: prior ?? serializeError(e) });
}
`;

/** Nested inside a call argument — the shape a parser-based check would need yet another case for. */
const NESTED_ARGUMENT_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function nested(e: unknown) {
  void log.error("nested", { source: "probe", error: { cause: serializeError(e) } });
}
`;

/**
 * Pre-flatten family (spec §2.6). Once the helper preserves structure, the residual
 * regression vector is a call site that flattens BEFORE the logger ever sees the value:
 * `String(e)` and `JSON.stringify(e)` both hand `buildRecord` a string, so the structure
 * is already gone by the time `serializeError` runs and there is nothing left to preserve.
 */
const STRING_FLATTEN_FIXTURE = `
import { log } from "@/lib/log";

export function stringFlatten(e: unknown) {
  void log.error("string-flattened", { source: "probe", error: String(e) });
}
`;

const JSON_STRINGIFY_FLATTEN_FIXTURE = `
import { log } from "@/lib/log";

export function jsonFlatten(e: unknown) {
  void log.warn("json-flattened", { source: "probe", error: JSON.stringify(e) });
}
`;

const WRAPPED_FLATTEN_FIXTURE = `
import { log } from "@/lib/log";

export function wrappedFlatten(e: unknown) {
  void log.error("as-wrapped flatten", { source: "probe", error: String(e) as unknown });
}
`;

const ALLOWED_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function raw(err: unknown) {
  // The correct shape: the logger serializes this exactly once.
  void log.error("raw error", { source: "probe", error: err });
}

export function messageExtract(err: { message: string }) {
  // Property reads are legitimate site-local extraction, never flagged.
  void log.error("extracted", { source: "probe", error: err.message });
}

export function consoleDirect(e: unknown) {
  // console never re-serializes, so pre-serializing here is correct and must NOT be flagged
  // (this is the shape lib/log/persist.ts uses at both of its console sites).
  console.error("[probe] write failed", { error: serializeError(e) });
}
`;

describe("no double-serialized log.* error fields (AC-7)", () => {
  test("the scanner flags every banned family in a planted fixture", () => {
    const project = newProject();
    const banned = [
      ["re-wrap", BANNED_FIXTURE],
      ["alias", ALIAS_FIXTURE],
      ["spread-carrier", SPREAD_FIXTURE],
      // Diff review R1's probed evaders and the rest of their shape.
      ["as-assertion", AS_ASSERTION_FIXTURE],
      ["satisfies", SATISFIES_FIXTURE],
      ["non-null", NON_NULL_FIXTURE],
      ["logical-and-spread", LOGICAL_AND_SPREAD_FIXTURE],
      ["nullish-spread", NULLISH_SPREAD_FIXTURE],
      ["wrapped-fields-argument", WRAPPED_FIELDS_FIXTURE],
      ["nested-argument", NESTED_ARGUMENT_FIXTURE],
      // Pre-flatten family (spec §2.6): flattening BEFORE the logger destroys the
      // structure the redesigned helper exists to preserve.
      ["string-flatten", STRING_FLATTEN_FIXTURE],
      ["json-stringify-flatten", JSON_STRINGIFY_FLATTEN_FIXTURE],
      ["wrapped-flatten", WRAPPED_FLATTEN_FIXTURE],
    ] as const;

    for (const [family, source] of banned) {
      const fixture = project.createSourceFile(`__premise_${family}__.ts`, source);
      const found = findDoubleSerializedSites(fixture);
      expect(found, `the ${family} family must be recognized`).toHaveLength(1);
    }

    // Four carriers in ONE fixture: the subtree predicate closes them together, so they are
    // asserted together rather than as four more parser cases.
    const carriers = project.createSourceFile(
      "__premise_initializer_carriers__.ts",
      INITIALIZER_CARRIER_FIXTURE,
    );
    expect(
      findDoubleSerializedSites(carriers),
      "every short-circuit initializer carrier must be recognized",
    ).toHaveLength(4);
  });

  test("the scanner leaves a raw error field and a console-direct site alone", () => {
    const project = newProject();
    const fixture = project.createSourceFile("__premise_allowed__.ts", ALLOWED_FIXTURE);
    expect(findDoubleSerializedSites(fixture)).toEqual([]);
  });

  test("no source file passes a pre-serialized error to log.*", () => {
    const project = newProject();
    const files = walkSourceFiles(["lib", "app", "components"]);
    // The walk has to actually reach the tree, or an empty file list would report zero findings
    // and read as a pass. 500 is far below the real count and far above any accident.
    premise("the source walk reaches the repository tree", files.length, 500);

    const findings = files.flatMap((path) =>
      findDoubleSerializedSites(project.addSourceFileAtPath(path)),
    );

    expect(
      findings.map((f) => `${f.file}:${f.line} ${f.text}`),
      "pass the RAW value; buildRecord (lib/log/logger.ts) serializes it exactly once",
    ).toEqual([]);
  });
});
