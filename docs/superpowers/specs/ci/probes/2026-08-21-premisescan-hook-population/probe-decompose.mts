/**
 * Rule 115 decomposition. Probes 1 and 2 each report a CONJUNCTION, so a zero
 * could be about the probe rather than the corpus. Each conjunct is measured
 * ALONE below; if an ingredient does not occur at all, the compound zero is
 * explained by a fact that is independently checkable and varies one thing.
 *
 * Instrument: raw TypeScript AST walk, independent of premiseScan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";

const ROOT = process.cwd();
const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();
const HOOK = /^(beforeEach|beforeAll|afterEach|afterAll|aroundEach|aroundAll)$/;
const ROOTS = new Set(["describe", "it", "test", "suite", "bench"]);
const peel = (e: ts.Expression): string | null => {
  let n: ts.Expression = e;
  for (;;) {
    if (ts.isCallExpression(n)) n = n.expression;
    else if (ts.isPropertyAccessExpression(n)) n = n.expression;
    else break;
  }
  return ts.isIdentifier(n) && ROOTS.has(n.text) ? n.text : null;
};
const isInline = (a: ts.Expression): boolean => {
  let n: ts.Node = a;
  while (
    ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) ||
    ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n) || ts.isExpressionWithTypeArguments(n)
  ) n = (n as ts.ParenthesizedExpression).expression;
  return ts.isArrowFunction(n) || ts.isFunctionExpression(n);
};

let hooksTotal = 0;              // C1 control: hooks exist at all
let hooksNonStatement = 0;       // P1: a hook call that is NOT an expression statement
let regsFileScopeAny = 0;        // P2a: registrations not lexically inside any registration body
let eagerArgsNonString = 0;      // P2b: a file-scope registration's eager arg that is not a plain string
let factoryShapedBindings = 0;   // Q2: module-scope fn bindings that themselves register or hook
let curriedRegs = 0;             // P3: curried .each/.for registrations exist at all (control)
const nonStatementHooks: string[] = [];
const nonStringEager: string[] = [];
const factoryBindings: string[] = [];

for (const suite of suites) {
  const p = join(ROOT, suite);
  const text = readFileSync(p, "utf8");
  const sf = ts.createSourceFile(p, text, ts.ScriptTarget.ES2022, true, p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ln = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const one = (n: ts.Node) => n.getText(sf).split("\n")[0]!.slice(0, 80);

  const walk = (n: ts.Node, insideRegistrationBody: boolean): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && HOOK.test(n.expression.text)) {
      hooksTotal += 1;
      if (!(n.parent && ts.isExpressionStatement(n.parent))) {
        hooksNonStatement += 1;
        nonStatementHooks.push(`${suite}:${ln(n)}  ${one(n)}`);
      }
    }
    if (ts.isCallExpression(n)) {
      const r = peel(n.expression);
      if (r !== null) {
        if (ts.isCallExpression(n.expression)) curriedRegs += 1;
        if (!insideRegistrationBody) {
          regsFileScopeAny += 1;
          const eager: ts.Expression[] = [];
          if (ts.isCallExpression(n.expression)) eager.push(...n.expression.arguments);
          for (const a of n.arguments) if (!isInline(a)) eager.push(a);
          for (const a of eager)
            if (!ts.isStringLiteralLike(a)) {
              eagerArgsNonString += 1;
              nonStringEager.push(`${suite}:${ln(a)}  [${ts.SyntaxKind[a.kind]}]  ${one(a)}`);
            }
        }
        const bodyArg = n.arguments.find((a) => isInline(a));
        if (bodyArg) {
          for (const a of n.arguments) ts.forEachChild(a, (c) => walk(c, a === bodyArg ? true : insideRegistrationBody));
          if (ts.isCallExpression(n.expression)) for (const a of n.expression.arguments) walk(a, insideRegistrationBody);
          return;
        }
      }
    }
    ts.forEachChild(n, (c) => walk(c, insideRegistrationBody));
  };
  walk(sf, false);

  // Q2 — a module-scope binding whose initializer is a function that itself
  // registers or hooks: the INGREDIENT a named factory is made of, measured
  // without reference to whether anything passes it to describe.
  for (const st of sf.statements) {
    const fns: ts.Node[] = [];
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) fns.push(d.initializer);
    if (ts.isFunctionDeclaration(st) && st.body) fns.push(st);
    for (const f of fns) {
      let registers = false;
      const w = (n: ts.Node): void => {
        if (ts.isCallExpression(n)) {
          if (ts.isIdentifier(n.expression) && HOOK.test(n.expression.text)) registers = true;
          if (peel(n.expression) !== null) registers = true;
        }
        ts.forEachChild(n, w);
      };
      w(f);
      if (registers) {
        factoryShapedBindings += 1;
        factoryBindings.push(`${suite}:${ln(f)}  ${one(f)}`);
      }
    }
  }
}

const dump = (label: string, n: number, rows: string[]) => {
  console.log(`${label}: ${n}`);
  for (const r of rows.slice(0, 10)) console.log(`      ${r}`);
  if (rows.length > 10) console.log(`      … ${rows.length - 10} more`);
};

console.log(`CORPUS: ${suites.length} enrolled suites`);
console.log("");
console.log("--- probe 1's conjuncts, each varied alone");
console.log(`  C1 control  hook-registrar calls in the corpus, any position: ${hooksTotal}`);
dump("  P1          hook-registrar calls NOT written as a plain expression statement", hooksNonStatement, nonStatementHooks);
console.log(`  P2a         registrations outside any registration body (file suite scope): ${regsFileScopeAny}`);
dump("  P2b         file-scope eager arguments that are not a plain string literal", eagerArgsNonString, nonStringEager);
console.log(`  C2 control  curried .each/.for registrations in the corpus: ${curriedRegs}`);
console.log("");
console.log("--- probe 2's conjunct, varied alone");
dump("  Q2          module-scope function bindings that themselves register or hook", factoryShapedBindings, factoryBindings);
if (hooksTotal === 0 || regsFileScopeAny === 0) throw new Error("probe void: a control population is empty");
