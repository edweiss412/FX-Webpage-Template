/**
 * tests/help/_metaTimeHelpersRequireNow.test.ts
 * (M11 Phase C — R2 structural defense / AC-11.38)
 *
 * Structural meta-test: every exported function in `lib/time/*.ts`
 * (excluding the canonical `now.ts` factory) is FORBIDDEN from declaring
 * any parameter with a wall-clock default (`= new Date()` / `= Date.now()`)
 * and FORBIDDEN from textually invoking `new Date()` / `Date.now()` inside
 * its own body. Helpers may consume wall-clock time only through a
 * required (non-optional, non-defaulted) `now: Date` parameter threaded
 * from a caller that obtained it via `await nowDate()`.
 *
 * Why this exists (R2 finding from M11 Phase C cross-model adversarial review):
 *   The C.4 grep guard (`tests/help/_metaServerTimeGuard.test.ts`) only scans
 *   app/<segment>/ + components/ tree for direct render-side `new Date()` /
 *   `Date.now()`. Helpers in `lib/time/*.ts` whose defaults silently call
 *   `new Date()` bypass that guard, because the call site reads as
 *   `formatRelative(x)` — no wall-clock literal at the render layer. The
 *   R2 instance was `formatRelative` + `relativeDayChip` in lib/time/relative.ts.
 *
 * Per memory `feedback_meta_contract_test_for_recurring_bug_class.md` +
 * `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`:
 * after the second class-sweep iteration on the same vector, ship a
 * structural defense — not another patch. Future additions to `lib/time/`
 * are auto-pinned.
 *
 * Exemption: `lib/time/now.ts` is the canonical time source — it IS the
 * `nowDate()` factory and necessarily falls back to `new Date()` itself.
 *
 * Implementation: TypeScript AST walk via the TS Compiler API (already a
 * transitive dep). Robust against signature reformatting (multi-line
 * parameter lists, default initializer line-wraps, etc.) where a regex
 * would be brittle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const LIB_TIME_DIR = join(process.cwd(), "lib/time");
const EXEMPT_FILES = new Set([
  "now.ts", // canonical time source — IS the nowDate() factory
]);

const WALL_CLOCK_RE = /\bnew Date\(\s*\)|\bDate\.now\(\s*\)/;

type Violation = {
  file: string;
  fn: string;
  reason: string;
};

type FunctionLikeNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

function hasModifier(
  node: { modifiers?: ts.NodeArray<ts.ModifierLike> },
  kind: ts.SyntaxKind,
): boolean {
  return node.modifiers?.some((m) => m.kind === kind) ?? false;
}

type TypeScriptWithSkipOuterExpressions = typeof ts & {
  skipOuterExpressions: (node: ts.Expression) => ts.Expression;
};

function unwrap(node: ts.Expression): ts.Expression {
  return (ts as TypeScriptWithSkipOuterExpressions).skipOuterExpressions(node);
}

function checkFunctionLike(
  node: FunctionLikeNode,
  sf: ts.SourceFile,
  fnName: string,
  filename: string,
  violations: Violation[],
  reasonSuffix = "",
): void {
  // 1. Forbid wall-clock defaults on ANY parameter.
  for (const p of node.parameters) {
    if (!p.initializer) continue;
    const initText = p.initializer.getText(sf);
    if (WALL_CLOCK_RE.test(initText)) {
      const paramName = ts.isIdentifier(p.name) ? p.name.text : "<destructured>";
      violations.push({
        file: filename,
        fn: fnName,
        reason: `parameter \`${paramName}\` has wall-clock default (\`= ${initText.trim()}\`) — must be required (no default)${reasonSuffix}`,
      });
    }
  }

  // 2. Forbid wall-clock calls inside the function body itself.
  const body = node.body ? node.body.getText(sf) : "";
  if (WALL_CLOCK_RE.test(body)) {
    // A helper with a body wall-clock call must have a required `now: Date`
    // parameter, otherwise it has no plumbing to be deterministic. (In
    // practice, a body wall-clock call is itself the violation — but we
    // still surface a precise reason that distinguishes "no `now` plumbing"
    // from "has plumbing but ignored it".)
    const nowParam = node.parameters.find(
      (p) => ts.isIdentifier(p.name) && p.name.text === "now",
    );
    if (!nowParam) {
      violations.push({
        file: filename,
        fn: fnName,
        reason: `function body calls \`new Date()\` / \`Date.now()\` and has no \`now\` parameter — thread \`now: Date\` from caller${reasonSuffix}`,
      });
    } else {
      violations.push({
        file: filename,
        fn: fnName,
        reason: `function body calls \`new Date()\` / \`Date.now()\` despite having a \`now\` parameter — consume \`now\` instead${reasonSuffix}`,
      });
    }
  }

  // 3. If a `now: Date` parameter exists, it must be required and Date-typed.
  const nowParam = node.parameters.find(
    (p) => ts.isIdentifier(p.name) && p.name.text === "now",
  );
  if (nowParam) {
    const typeText = nowParam.type?.getText(sf) ?? "";
    if (!typeText.includes("Date")) {
      violations.push({
        file: filename,
        fn: fnName,
        reason: `\`now\` parameter type must include Date (got: ${typeText || "<no type>"})${reasonSuffix}`,
      });
    }
    if (nowParam.questionToken) {
      violations.push({
        file: filename,
        fn: fnName,
        reason: `\`now\` parameter is optional (\`now?: Date\`) — must be required${reasonSuffix}`,
      });
    }
    // Default-initializer case is already caught by check #1 above (any
    // wall-clock default), but a non-wall-clock default (e.g.,
    // `now: Date = SOME_CONST`) is still forbidden — defaults defeat the
    // explicit-now-threading contract.
    if (nowParam.initializer) {
      const initText = nowParam.initializer.getText(sf);
      if (!WALL_CLOCK_RE.test(initText)) {
        violations.push({
          file: filename,
          fn: fnName,
          reason: `\`now\` parameter has a default initializer (\`= ${initText.trim()}\`) — must be required${reasonSuffix}`,
        });
      }
    }
  }
}

type LocalFunctionBinding = {
  name: string;
  node: FunctionLikeNode;
};

/*
 * Export-function shape ceiling for this meta-test.
 *
 * In scope:
 * 1. export function foo() {}
 * 2. export default function foo() {}
 * 3. export default function() {}
 * 4. export const foo = () => ...
 * 5. export const foo = function() {}
 * 6. export default () => ...
 * 7. export default function() {} as an ExportAssignment FunctionExpression
 * 8. const foo = () => ...; export { foo };
 * 9. function foo() {}; export { foo };
 * 10. const foo = () => ...; export { foo as bar }; local binding is checked.
 *
 * Out of scope:
 * 11. export { foo } from "./other" - cross-file re-export; if "./other"
 *     is in lib/time it is independently scanned, otherwise it is not this
 *     helper-contract surface.
 * 12. export * from "./other" - same cross-file resolution boundary.
 * 13. export type Foo = ... - not callable, no render-side time risk.
 * 14. module.exports = ... - CommonJS is not used by this ESM repo.
 * 15. export class Foo { static bar = () => ... } - class methods are a
 *     separate helper pattern and deserve their own meta-test if introduced.
 * 16. export namespace Foo { ... } - rare in modern TS and intentionally deferred.
 * 17. export = ... - TS CommonJS interop and intentionally out of scope.
 *
 * Outer-expression unwrapping (R5 - ts.skipOuterExpressions):
 * The walker calls ts.skipOuterExpressions on every initializer/expression
 * before checking arrow/function-expression kind. This makes the following
 * wrappers transparent; the underlying function is matched regardless:
 * - ParenthesizedExpression - `(expr)`
 * - TypeAssertionExpression - `<T>expr`
 * - AsExpression - `expr as T`
 * - NonNullExpression - `expr!`
 * - SatisfiesExpression - `expr satisfies T`
 * - ExpressionWithTypeArguments - `expr<T>`
 * - PartiallyEmittedExpression - internal TS
 *
 * Identifier-reference exports (R6 - local map lookup):
 * The walker resolves identifier-reference exports against a map of top-level
 * local function declarations plus variable function initializers. This covers:
 * - `export { foo }` and `export { foo as bar }` (R4 - ExportDeclaration)
 * - `export default foo` (R6 - ExportAssignment with Identifier expression)
 *
 * Parenthesized / type-cast / non-null / satisfies identifiers reduce to a bare
 * Identifier via ts.skipOuterExpressions before lookup, so they flow through
 * the same path automatically. Identifier references to imported bindings or
 * identifiers not declared in the same file are not flagged; the source helper
 * lives in another module and is independently scanned if it falls in lib/time/.
 *
 * Wrappers deliberately not unwrapped because they produce computed values,
 * not declarative helpers:
 * - CallExpression - IIFE: `(() => ...)()` produces the result, not the function.
 * - AwaitExpression - `await (() => ...)` produces an awaited value.
 * - ConditionalExpression - `cond ? a : b` is a runtime helper choice.
 * - BinaryExpression (CommaToken) - `(sideEffect(), expr)` is a sequence.
 * - SpreadElement / array-element extraction - contortions outside this contract.
 *
 * If a future helper exports through a compound-expression wrapper, the
 * production-side review is the catcher: such helpers are unusual enough that
 * adversarial review should flag the call site.
 */
function scanSource(src: string, filename: string): Violation[] {
  const sf = ts.createSourceFile(
    filename,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );
  const violations: Violation[] = [];
  const localFunctions = new Map<string, LocalFunctionBinding>();

  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node)) {
      if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) return;
      if (!node.name) return;
      localFunctions.set(node.name.text, { name: node.name.text, node });
      return;
    }

    if (ts.isVariableStatement(node)) {
      if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) return;
      for (const decl of node.declarationList.declarations) {
        const initializer = decl.initializer ? unwrap(decl.initializer) : undefined;
        if (!initializer) continue;
        if (
          !ts.isArrowFunction(initializer) &&
          !ts.isFunctionExpression(initializer)
        ) {
          continue;
        }
        if (!ts.isIdentifier(decl.name)) continue;
        localFunctions.set(decl.name.text, {
          name: decl.name.text,
          node: initializer,
        });
      }
    }
  });

  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node)) {
      if (!hasModifier(node, ts.SyntaxKind.ExportKeyword)) return;
      const isDefault = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
      const name = node.name?.text ?? (isDefault ? "(default)" : "(anonymous)");
      checkFunctionLike(node, sf, name, filename, violations);
      return;
    }

    if (ts.isVariableStatement(node)) {
      if (!hasModifier(node, ts.SyntaxKind.ExportKeyword)) return;
      for (const decl of node.declarationList.declarations) {
        const initializer = decl.initializer ? unwrap(decl.initializer) : undefined;
        if (!initializer) continue;
        if (
          !ts.isArrowFunction(initializer) &&
          !ts.isFunctionExpression(initializer)
        ) {
          continue;
        }
        const name = ts.isIdentifier(decl.name) ? decl.name.text : "(destructured)";
        checkFunctionLike(initializer, sf, name, filename, violations);
      }
      return;
    }

    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const expr = unwrap(node.expression);
      if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        checkFunctionLike(expr, sf, "(default)", filename, violations);
        return;
      }
      if (ts.isIdentifier(expr)) {
        const binding = localFunctions.get(expr.text);
        if (!binding) return;
        checkFunctionLike(
          binding.node,
          sf,
          binding.name,
          filename,
          violations,
          " (via `export default <identifier>`)",
        );
      }
      return;
    }

    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) return;
      const clause = node.exportClause;
      if (!clause || !ts.isNamedExports(clause)) return;
      for (const spec of clause.elements) {
        const localName = (spec.propertyName ?? spec.name).text;
        const binding = localFunctions.get(localName);
        if (!binding) continue;
        checkFunctionLike(
          binding.node,
          sf,
          binding.name,
          filename,
          violations,
          " (via `export { ... }`)",
        );
      }
    }
  });

  return violations;
}

function collectViolations(): Violation[] {
  const violations: Violation[] = [];
  const entries = readdirSync(LIB_TIME_DIR).filter(
    (f) => /\.ts$/.test(f) && !EXEMPT_FILES.has(f),
  );

  for (const filename of entries) {
    const fullPath = join(LIB_TIME_DIR, filename);
    const src = readFileSync(fullPath, "utf8");
    violations.push(...scanSource(src, filename));
  }

  return violations;
}

describe("lib/time/* helpers must require a `now: Date` parameter (R2 structural defense)", () => {
  it("walks lib/time/*.ts (excluding now.ts) and asserts no wall-clock-defaulting helpers exist", () => {
    const violations = collectViolations();
    const report = violations
      .map((v) => `  - ${v.file}::${v.fn} — ${v.reason}`)
      .join("\n");
    expect(violations, `Found ${violations.length} violation(s):\n${report}`).toEqual([]);
  });

  it("the meta-test predicate REJECTS a synthetic helper with `now: Date = new Date()` default", () => {
    // Inline AST check that the predicate logic recognises a defaulted `now`
    // parameter as a violation. Pins the test mechanism so a future
    // refactor cannot accidentally turn the meta-test into a tautology.
    const synthetic = `export function leaky(now: Date = new Date()): number { return now.getTime(); }\n`;
    const found = scanSource(synthetic, "synthetic.ts");
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((v) => /wall-clock default/.test(v.reason))).toBe(true);
  });

  it("the meta-test predicate ACCEPTS a compliant helper (required, non-defaulted, Date-typed)", () => {
    const compliant = `export function strict(iso: string, now: Date): number { return now.getTime(); }\n`;
    const found = scanSource(compliant, "compliant.ts");
    expect(found).toEqual([]);
  });

  it("the meta-test predicate REJECTS a helper whose body calls `new Date()` without a `now` parameter", () => {
    const synthetic = `export function bodyLeak(iso: string): number { return new Date().getTime() - 1; }\n`;
    const found = scanSource(synthetic, "synthetic.ts");
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((v) => /function body calls/.test(v.reason))).toBe(true);
  });

  it("the meta-test predicate REJECTS an optional `now?: Date` parameter", () => {
    const synthetic = `export function optional(iso: string, now?: Date): number { return (now ?? new Date()).getTime(); }\n`;
    const found = scanSource(synthetic, "synthetic.ts");
    expect(found.some((v) => /optional/.test(v.reason))).toBe(true);
  });

  it("flags exported arrow with wall-clock default (`export const leaky = (now: Date = new Date()) => ...`)", () => {
    const src = `export const leaky = (now: Date = new Date()): number => now.getTime();\n`;
    const findings = scanSource(src, "synthetic-arrow-default.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fn: "leaky",
      reason: expect.stringContaining("default"),
    });
  });

  it("flags exported arrow with body-level Date.now() and no now param (`export const bodyLeak = () => Date.now()`)", () => {
    const src = `export const bodyLeak = (): number => Date.now();\n`;
    const findings = scanSource(src, "synthetic-arrow-bodyleak.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fn: "bodyLeak",
      reason: expect.stringContaining("now"),
    });
  });

  it("flags exported function-expression with wall-clock default", () => {
    const src = `export const expr = function (now: Date = new Date()): number { return now.getTime(); };\n`;
    const findings = scanSource(src, "synthetic-fnexpr-default.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags exported default arrow with body-level new Date()", () => {
    const src = `export default () => new Date().getTime();\n`;
    const findings = scanSource(src, "synthetic-default-arrow.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags exported default function-declaration with wall-clock default", () => {
    const src = `export default function defaultLeaky(now: Date = new Date()) { return now.getTime(); }\n`;
    const findings = scanSource(src, "synthetic-default-fn.ts");
    expect(findings).toHaveLength(1);
  });

  it("does NOT flag exported arrow with required `now: Date` parameter (positive control)", () => {
    const src = `export const ok = (now: Date): number => now.getTime();\n`;
    const findings = scanSource(src, "synthetic-arrow-ok.ts");
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag module-local arrow (no `export` keyword) — out of scope", () => {
    const src = `const localLeaky = (now: Date = new Date()) => now.getTime();\nexport const wrap = (n: Date) => localLeaky(n);\n`;
    const findings = scanSource(src, "synthetic-local.ts");
    expect(findings).toHaveLength(0);
  });

  it("flags export-list arrow with wall-clock default (`const foo = (now: Date = new Date()) => ...; export { foo };`)", () => {
    const src = `
const leaky = (now: Date = new Date()): number => now.getTime();
export { leaky };
`;
    const findings = scanSource(src, "synthetic-exportlist-arrow-default.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fn: "leaky",
      reason: expect.stringContaining("default"),
    });
  });

  it("flags export-list arrow with body-level Date.now() (`const foo = () => Date.now(); export { foo };`)", () => {
    const src = `
const bodyLeak = (): number => Date.now();
export { bodyLeak };
`;
    const findings = scanSource(src, "synthetic-exportlist-arrow-bodyleak.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags export-list function declaration with wall-clock default (`function foo(now: Date = new Date()) {...}; export { foo };`)", () => {
    const src = `
function fnLeaky(now: Date = new Date()): number { return now.getTime(); }
export { fnLeaky };
`;
    const findings = scanSource(src, "synthetic-exportlist-fndecl-default.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags renamed export-list arrow (`const local = (...) => ...; export { local as renamed };`) — checks LOCAL binding", () => {
    const src = `
const local = (now: Date = new Date()): number => now.getTime();
export { local as renamed };
`;
    const findings = scanSource(src, "synthetic-exportlist-renamed.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ fn: "local" });
  });

  it("does NOT flag cross-file re-export (`export { foo } from './other'`) — out of scope, cannot resolve target without project-graph", () => {
    const src = `export { foo } from "./other";\n`;
    const findings = scanSource(src, "synthetic-exportlist-crossfile.ts");
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag wildcard re-export (`export * from './other'`) — out of scope", () => {
    const src = `export * from "./other";\n`;
    const findings = scanSource(src, "synthetic-exportlist-wildcard.ts");
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag export-list of a helper that DOES have required `now: Date` (positive control)", () => {
    const src = `
const ok = (now: Date): number => now.getTime();
export { ok };
`;
    const findings = scanSource(src, "synthetic-exportlist-ok.ts");
    expect(findings).toHaveLength(0);
  });

  it("flags parenthesized default arrow (`export default (() => Date.now());`)", () => {
    const src = `export default (() => Date.now());\n`;
    const findings = scanSource(src, "synthetic-paren-default-arrow.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags parenthesized default function-expression (`export default (function () { ... });`)", () => {
    const src = `export default (function () { return Date.now(); });\n`;
    const findings = scanSource(src, "synthetic-paren-default-fnexpr.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags parenthesized const-export arrow (`export const foo = (() => Date.now());`)", () => {
    const src = `export const foo = (() => Date.now());\n`;
    const findings = scanSource(src, "synthetic-paren-const-arrow.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags parenthesized export-list arrow (`const foo = (() => Date.now()); export { foo };`)", () => {
    const src = `const foo = (() => Date.now());\nexport { foo };\n`;
    const findings = scanSource(src, "synthetic-paren-exportlist-arrow.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags double-parens (`export default ((() => Date.now()));`) — ts.skipOuterExpressions recursive", () => {
    const src = `export default ((() => Date.now()));\n`;
    const findings = scanSource(src, "synthetic-double-paren.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags `as` cast around exported arrow (`export const foo = ((() => Date.now()) as () => number);`)", () => {
    const src = `export const foo = ((() => Date.now()) as () => number);\n`;
    const findings = scanSource(src, "synthetic-as-cast.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags satisfies expression around exported arrow (`export const foo = ((() => Date.now()) satisfies () => number);`)", () => {
    // satisfies is TS 4.9+; ts.skipOuterExpressions handles it.
    const src = `export const foo = ((() => Date.now()) satisfies () => number);\n`;
    const findings = scanSource(src, "synthetic-satisfies.ts");
    expect(findings).toHaveLength(1);
  });

  it("does NOT flag IIFE-returning-arrow (`export default ((() => Date.now())())`) — call-expression produces value, not helper (out of scope)", () => {
    // The outer call makes the exported value a number, not a helper.
    // ts.skipOuterExpressions does NOT unwrap CallExpression.
    const src = `export default ((() => Date.now())());\n`;
    const findings = scanSource(src, "synthetic-iife-call.ts");
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag conditional expression (`export default cond ? () => Date.now() : () => 0;`) — conditional value, not a helper (out of scope)", () => {
    const src = `declare const cond: boolean;\nexport default cond ? () => Date.now() : () => 0;\n`;
    const findings = scanSource(src, "synthetic-conditional.ts");
    expect(findings).toHaveLength(0);
  });

  it("flags identifier-reference default export of arrow with wall-clock default (`const foo = (now: Date = new Date()) => ...; export default foo;`)", () => {
    const src = `
const idDefaultArrow = (now: Date = new Date()): number => now.getTime();
export default idDefaultArrow;
`;
    const findings = scanSource(src, "synthetic-iddefault-arrow.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fn: "idDefaultArrow",
      reason: expect.stringContaining("default"),
    });
  });

  it("flags identifier-reference default export of arrow with body Date.now() (`const foo = () => Date.now(); export default foo;`)", () => {
    const src = `
const idDefaultBody = (): number => Date.now();
export default idDefaultBody;
`;
    const findings = scanSource(src, "synthetic-iddefault-body.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags identifier-reference default export of function declaration (`function foo(now: Date = new Date()) {...}; export default foo;`)", () => {
    const src = `
function idDefaultFn(now: Date = new Date()): number { return now.getTime(); }
export default idDefaultFn;
`;
    const findings = scanSource(src, "synthetic-iddefault-fndecl.ts");
    expect(findings).toHaveLength(1);
  });

  it("flags parenthesized identifier-reference default export (`export default (foo)`)", () => {
    // R5 unwrap reduces `(foo)` to bare Identifier `foo`, then R6 local lookup
    // applies the same exported-helper contract.
    const src = `
const idDefaultParen = (): number => Date.now();
export default (idDefaultParen);
`;
    const findings = scanSource(src, "synthetic-iddefault-paren.ts");
    expect(findings).toHaveLength(1);
  });

  it("does NOT flag default export of imported identifier (`import { foo } from './x'; export default foo;`) — out of scope, source in other module", () => {
    const src = `
import { external } from "./other";
export default external;
`;
    const findings = scanSource(src, "synthetic-iddefault-import.ts");
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag default export of identifier not in local map (`export default Math.random;`) — global, out of scope", () => {
    const src = `export default Math.random;\n`;
    const findings = scanSource(src, "synthetic-iddefault-global.ts");
    expect(findings).toHaveLength(0);
  });
});
