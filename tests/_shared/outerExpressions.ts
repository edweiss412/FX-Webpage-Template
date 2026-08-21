/**
 * TRANSPARENCY IS ASKED OF THE COMPILER, NEVER ENUMERATED.
 *
 * "Which wrappers change how an expression is written but not which value it
 * denotes" is a question TypeScript already answers, and answers completely:
 * `OuterExpressionKinds.All` covers parentheses, both type-assertion forms
 * (`as` and the angle form), non-null (`!`), `satisfies`, partially-emitted
 * expressions and expressions-with-type-arguments.
 *
 * A HAND-WRITTEN WRAPPER LIST IS THE DEFECT THIS MODULE EXISTS TO REMOVE, and
 * it is a defect with a measured price on this repo. `premiseScan.ts` shipped
 * one covering three of the six kinds; whole-diff review round 1 at base
 * `e5d1d723d69c` probed the gap and found FALSE CERTIFICATION -
 * `(test.beforeEach satisfies any)(envHook)` left the sibling test
 * `environment-free` while the hook read `process.env`. An enumeration is a
 * claim of completeness that nothing checks, so this asks instead.
 *
 * The origin copy of this binding is `tests/paneCompaction/sendAuthScan.ts`,
 * which reached it independently on the send-auth arc. This module is the
 * shared definition; converging that file onto it is deliberately NOT done in
 * the PR that introduces this, because two sibling arcs hold that file open
 * right now and a refactor landing under them buys a merge conflict on a file
 * this PR has no other reason to touch. Class-sweep exception (c).
 */
import * as ts from "typescript";

type SkipOuterExpressions = (node: ts.Expression, kinds: ts.OuterExpressionKinds) => ts.Expression;

/**
 * PROBED, NOT ASSUMED. In the pinned TypeScript, `skipOuterExpressions` is
 * present at RUNTIME and absent from the public `.d.ts`, while
 * `OuterExpressionKinds` IS public. So it is bound through a narrow declared
 * shape rather than reached for as a public export.
 *
 * It FAILS LOUD if an upgrade removes it. A silent fallback to a hand-written
 * wrapper list would re-open exactly the class this module closes, and would do
 * it invisibly: every suite would stay green while the scanner quietly stopped
 * seeing most of the wrapper forms. That is the failure mode that shipped once
 * already, so the degradation path is not written at all.
 */
const bound: SkipOuterExpressions = ((): SkipOuterExpressions => {
  const fn = (ts as unknown as { skipOuterExpressions?: unknown }).skipOuterExpressions;
  if (typeof fn !== "function") {
    throw new Error(
      "outerExpressions: ts.skipOuterExpressions is unavailable in this TypeScript build. " +
        "Wrapper transparency is resolved THROUGH THE COMPILER deliberately; a hand-written " +
        "wrapper list is the defect this module exists to remove, so this fails rather than " +
        "degrading to one.",
    );
  }
  return fn as SkipOuterExpressions;
})();

/** Every meaning-preserving wrapper removed, to any depth. Idempotent. */
export const skipTransparent = (e: ts.Expression): ts.Expression =>
  bound(e, ts.OuterExpressionKinds.All);

/**
 * The `ts.Node` form, for walks that are not statically holding an Expression.
 * A non-expression node is returned UNCHANGED, which is the same answer
 * `skipOuterExpressions` gives and the only safe one: a statement is not
 * transparent, it is a different kind of thing.
 */
export const skipTransparentNode = (n: ts.Node): ts.Node =>
  ts.isExpression(n) ? bound(n, ts.OuterExpressionKinds.All) : n;

/**
 * Is this node itself a meaning-preserving wrapper?
 *
 * DERIVED FROM THE SKIP, never listed alongside it. A walk that climbs PARENTS
 * cannot use the skip directly — it needs to ask about one node at a time — and
 * the obvious way to serve it is a second enumeration beside the first. That is
 * how a normalizer acquires two copies, which is how the copies drift: this
 * file's subject already had four, and the two that were written last were the
 * only two that knew about `satisfies`.
 */
export const isTransparent = (n: ts.Node): boolean => skipTransparentNode(n) !== n;
