// tests/adminAlerts/producerScopeAst.ts
//
// AST primitives for the producer-scope guard
// (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §6).
//
// Extracted from `_metaAlertProducerScope.test.ts` so the shapes below can be
// exercised directly against synthetic sources. While they lived inside the
// meta-test they were only ever reached through whatever the live tree happened
// to contain, so a fail-OPEN branch could not be observed — which is exactly how
// the holes this module closes survived review.
//
// GOVERNING RULE: every shape the walker cannot fully read must resolve to
// `{ kind: "computed" }`. "Computed" costs a hand-authored registry row plus a
// provenance note; a wrongly-`literal` shape costs a silently vacuous parity
// check, because the cross-check compares the registry against key list the
// walker believes it read. When in doubt, return computed.
import ts from "typescript";

/** `kind: "literal"` means the `context:` initializer is an object literal the
 *  walker read IN FULL; `"computed"` means it is a variable, a call, a spread of
 *  one, or any member the walker cannot resolve to a literal key. */
export type ContextShape =
  | { kind: "literal"; required: string[]; optional: string[] }
  | { kind: "computed" };

const COMPUTED: ContextShape = { kind: "computed" };

/** Strip the wrappers that change nothing about the value: `(x)`, `x as T`,
 *  `x satisfies T`, `x!`. Without this a producer could hide from discovery
 *  behind a cast, and a context object behind a parenthesis. */
export function unwrapExpression(node: ts.Expression): ts.Expression {
  let cur: ts.Expression = node;
  for (;;) {
    if (ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isNonNullExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    return cur;
  }
}

/**
 * The literal key a property declares, or `null` when the walker cannot know it.
 * Quotes are stripped so `{ "code": x }` and `{ code: x }` read identically —
 * they are the same key, and treating them differently misclassified the whole
 * call as positional. A computed name (`{ [key]: v }`) is genuinely unknowable
 * and returns null rather than the source text `[key]`.
 */
export function propertyKeyName(name: ts.PropertyName, sf: ts.SourceFile): string | null {
  if (ts.isComputedPropertyName(name)) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sf).replace(/^["'`]|["'`]$/g, "");
}

/** The name of the function being called, seeing through the wrappers in
 *  `unwrapExpression` plus string-keyed element access. A producer reached as
 *  `(upsertAdminAlert)(…)`, `upsertAdminAlert!(…)`, `(upsertAdminAlert as Fn)(…)`
 *  or `alerts["upsertAdminAlert"](…)` invokes the same surface as a plain call
 *  and must be discovered identically. */
export function calleeName(expr: ts.Expression): string | undefined {
  const c = unwrapExpression(expr);
  if (ts.isIdentifier(c)) return c.text;
  if (ts.isPropertyAccessExpression(c)) return c.name.text;
  if (ts.isElementAccessExpression(c)) {
    const arg = c.argumentExpression;
    return ts.isStringLiteralLike(arg) ? arg.text : undefined;
  }
  return undefined;
}

/**
 * Keys in a conditional spread (`...(cond ? { k: v } : {})`) are OPTIONAL: the
 * walker never evaluates `cond`. Deliberately conservative — it may call an
 * always-written key optional, but never calls an optional key guaranteed,
 * which is the direction that matters for `guaranteedKeys`.
 *
 * Every member it cannot read in full collapses the WHOLE shape to computed.
 * Skipping an unreadable member while still returning `literal` would report a
 * partial key list as complete, and the parity test would then confirm the
 * registry against that partial list.
 */
export function readContextShape(init: ts.Expression, sf: ts.SourceFile): ContextShape {
  const obj = unwrapExpression(init);
  if (!ts.isObjectLiteralExpression(obj)) return COMPUTED;

  const required: string[] = [];
  const optional: string[] = [];

  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      const key = propertyKeyName(prop.name, sf);
      if (key === null) return COMPUTED;
      required.push(key);
      continue;
    }

    if (ts.isSpreadAssignment(prop)) {
      const spread = unwrapExpression(prop.expression);
      // Only a conditional spread is readable: both arms are visible. A spread
      // of a variable, a call, or anything else hides its keys entirely.
      if (!ts.isConditionalExpression(spread)) return COMPUTED;
      for (const rawArm of [spread.whenTrue, spread.whenFalse]) {
        const arm = unwrapExpression(rawArm);
        // A non-object arm (`...(cond ? { a } : extraContext)`) contributes keys
        // the walker cannot see. Previously such an arm was skipped and the
        // shape still returned `literal`, hiding every key the arm supplied.
        if (!ts.isObjectLiteralExpression(arm)) return COMPUTED;
        for (const inner of arm.properties) {
          // A nested spread, method, getter or setter inside an arm is equally
          // unreadable — same fail-open, same fix.
          if (!(ts.isPropertyAssignment(inner) || ts.isShorthandPropertyAssignment(inner))) {
            return COMPUTED;
          }
          const key = propertyKeyName(inner.name, sf);
          if (key === null) return COMPUTED;
          optional.push(key);
        }
      }
      continue;
    }

    // Method, getter, setter, or any future member kind.
    return COMPUTED;
  }

  return { kind: "literal", required: [...new Set(required)], optional: [...new Set(optional)] };
}
