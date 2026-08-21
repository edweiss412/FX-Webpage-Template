/**
 * Population probes 1 and 2 — INDEPENDENT of the scanner under test.
 *
 * Both rows are defects in which premiseScan FAILS TO SEE a construct, so asking
 * premiseScan how many suites do it returns zero by construction. Every count
 * below therefore comes from a raw TypeScript AST walk written for this probe.
 *
 * Two recognizers are run over the same corpus and both counts are printed:
 *
 *   WIDE   — the population. A registration is any call whose callee peels, in
 *            ANY interleaving of calls and property accesses, to a root
 *            identifier in {describe, it, test, suite, bench}. It accepts every
 *            modifier spelling, so it is not blind to `describe.skipIf(...)` the
 *            way the shipped `registrarRoot` is (that blindness is probe 3's
 *            subject, and it would silently shrink probes 1 and 2 as well).
 *   SHIPPED — a LOWER BOUND. The shipped `registrarRoot` / `isSuiteBody` bytes,
 *            extracted from premiseScan.ts's own AST and evaluated, so the
 *            comparison cannot drift from a hand model of them.
 *
 * The suite list is derived from GUARD_SURFACES.suitePaths, the same expression
 * _metaPremiseContract uses, so a newly enrolled suite is covered by default.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";

const ROOT = process.cwd();
const SRC = join(ROOT, "tests/mutation/source/premiseScan.ts");
const srcText = readFileSync(SRC, "utf8");
const srcSf = ts.createSourceFile(SRC, srcText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

// ---- extract the SHIPPED predicates as bytes -------------------------------
const WANT = ["REGISTRARS", "MODIFIERS", "HOOK_REGISTRARS", "registrarRoot", "isSuiteBody", "unwrapTransparent"];
const extracted = new Map<string, string>();
for (const st of srcSf.statements) {
  if (ts.isVariableStatement(st))
    for (const d of st.declarationList.declarations)
      if (ts.isIdentifier(d.name) && WANT.includes(d.name.text))
        extracted.set(d.name.text, `const ${d.name.text} = ${d.initializer!.getText(srcSf)};`);
  if (ts.isFunctionDeclaration(st) && st.name && WANT.includes(st.name.text))
    extracted.set(st.name.text, st.getText(srcSf));
}
for (const w of WANT) if (!extracted.has(w)) throw new Error(`probe void: cannot extract ${w}`);
// The extraction must be CLOSED, not merely complete over the names typed above.
// Every top-level declaration in the shipped source that an extracted body
// references must itself be extracted, or the assembled function throws a
// ReferenceError at call time -- which is how this probe silently stopped
// running when `isSuiteBody` began delegating to `unwrapTransparent`.
{
  const topLevel = new Set<string>();
  for (const st of srcSf.statements) {
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name)) topLevel.add(d.name.text);
    if (ts.isFunctionDeclaration(st) && st.name) topLevel.add(st.name.text);
  }
  const missing = new Set<string>();
  for (const [name, text] of extracted) {
    const sf = ts.createSourceFile(`${name}.ts`, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && topLevel.has(n.text) && !extracted.has(n.text)) missing.add(n.text);
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(sf, visit);
  }
  if (missing.size > 0)
    throw new Error(
      `probe void: extracted bodies reference unextracted top-level symbols: ${[...missing].sort().join(", ")}. ` +
        `Add them to WANT (and a strip rule if they carry type annotations).`,
    );
}
const strip = (s: string) =>
  s
    .replace(/function registrarRoot\(callee: ts\.Expression\): string \| null \{/, "function registrarRoot(callee) {")
    .replace(/let node: ts\.Expression = callee;/, "let node = callee;")
    .replace(/function isSuiteBody\(arg: ts\.Expression\): boolean \{/, "function isSuiteBody(arg) {")
    .replace(/let node: ts\.Node = arg;/, "let node = arg;")
    .replace(/function unwrapTransparent\(arg: ts\.Node\): ts\.Node \{/, "function unwrapTransparent(arg) {");
const S = new Function(
  "ts",
  `${WANT.map((w) => strip(extracted.get(w)!)).join("\n")}\nreturn { REGISTRARS, MODIFIERS, HOOK_REGISTRARS, registrarRoot, isSuiteBody };`,
)(ts) as {
  REGISTRARS: Set<string>;
  MODIFIERS: Set<string>;
  HOOK_REGISTRARS: RegExp;
  registrarRoot: (c: ts.Expression) => string | null;
  isSuiteBody: (a: ts.Expression) => boolean;
};
if (!S.REGISTRARS.has("describe") || !S.MODIFIERS.has("each") || !S.HOOK_REGISTRARS.test("beforeAll"))
  throw new Error("probe void: extracted predicates do not behave like the shipped ones");
// Negative control on the extraction: the shipped set is INCOMPLETE, which is
// probe 3's subject. If this ever passes, the source moved under the probe.
if (S.MODIFIERS.has("skipIf")) throw new Error("probe stale: MODIFIERS now carries skipIf; re-derive probe 3");

// ---- WIDE recognizer, written for this probe -------------------------------
const WIDE_ROOTS = new Set(["describe", "it", "test", "suite", "bench"]);
const HOOK_WIDE = /^(beforeEach|beforeAll|afterEach|afterAll|aroundEach|aroundAll)$/;
function wideRoot(callee: ts.Expression): string | null {
  let node: ts.Expression = callee;
  // Interleaved, unlike the shipped two-phase peel: `test.skipIf(x).each` is a
  // property access ON a call, and two separate loops resolve it by neither.
  for (;;) {
    if (ts.isCallExpression(node)) node = node.expression;
    else if (ts.isPropertyAccessExpression(node)) node = node.expression;
    else break;
  }
  return ts.isIdentifier(node) && WIDE_ROOTS.has(node.text) ? node.text : null;
}
function wideSuiteBody(arg: ts.Expression): boolean {
  let node: ts.Node = arg;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isExpressionWithTypeArguments(node)
  )
    node = (node as ts.ParenthesizedExpression).expression;
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

// ---- the corpus ------------------------------------------------------------
const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();

type Hit = { suite: string; line: number; kind: string; text: string };
const mk = () => ({
  eagerDirect: [] as Hit[],
  eagerFileScope: [] as Hit[],
  factoryDescribe: [] as Hit[],
  factoryTest: [] as Hit[],
  bodyAbsent: [] as Hit[],
  registrations: 0,
  inlineDescribes: 0,
  chainForms: 0,
});
const wide = mk();
const shipped = mk();
let filesScanned = 0;

for (const suite of suites) {
  const p = join(ROOT, suite);
  let text: string;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    throw new Error(`probe void: enrolled suite unreadable: ${suite}`);
  }
  filesScanned += 1;
  const sf = ts.createSourceFile(p, text, ts.ScriptTarget.ES2022, true, p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const brief = (n: ts.Node) => n.getText(sf).split("\n")[0]!.slice(0, 90);

  const hooksIn = (nodes: ts.Node[], rx: RegExp): ts.CallExpression[] => {
    const out: ts.CallExpression[] = [];
    const walk = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && rx.test(n.expression.text)) out.push(n);
      ts.forEachChild(n, walk);
    };
    for (const n of nodes) walk(n);
    return out;
  };

  const run = (
    acc: ReturnType<typeof mk>,
    root: (c: ts.Expression) => string | null,
    isBody: (a: ts.Expression) => boolean,
    hookRx: RegExp,
  ): void => {
    const walk = (n: ts.Node, insideDescribeBody: boolean): void => {
      if (ts.isCallExpression(n)) {
        const r = root(n.expression);
        if (r !== null) {
          acc.registrations += 1;
          // a conditional chain form: a property access sitting on a call
          if (ts.isPropertyAccessExpression(n.expression) && ts.isCallExpression(n.expression.expression))
            acc.chainForms += 1;
          const bodyArg = n.arguments.find((a) => isBody(a));
          if ((r === "describe" || r === "suite") && bodyArg) acc.inlineDescribes += 1;

          // PROBE 1 — a hook in an EAGER position of a FILE-SCOPE registration
          if (!insideDescribeBody) {
            const eager: ts.Node[] = [];
            if (ts.isCallExpression(n.expression)) eager.push(...n.expression.arguments);
            for (const a of n.arguments) if (!isBody(a)) eager.push(a);
            for (const h of hooksIn(eager, hookRx)) {
              const hit = { suite, line: lineOf(h), kind: `${r} eager`, text: brief(h) };
              acc.eagerFileScope.push(hit);
              if (n.parent && ts.isExpressionStatement(n.parent) && n.parent.parent === sf) acc.eagerDirect.push(hit);
            }
          }

          // PROBE 2 — a FACTORY SLOT (index >= 1) the scanner cannot follow.
          // Ranging the body test over EVERY argument, as an earlier version did,
          // is satisfiable by a function-valued NAME in slot 0 and therefore blind
          // to `describe(function titled(){}, suiteA)` — spec review r3 finding 4.
          // Slot 0 is always `name` per Vitest's SuiteCollectorCallable.
          {
            const inert = (a: ts.Expression): boolean =>
              ts.isStringLiteralLike(a) ||
              ts.isNumericLiteral(a) ||
              ts.isObjectLiteralExpression(a) ||
              ts.isArrayLiteralExpression(a) ||
              a.kind === ts.SyntaxKind.TrueKeyword ||
              a.kind === ts.SyntaxKind.FalseKeyword;
            const slots = n.arguments.slice(1);
            if (slots.length > 0 && !slots.some((a) => isBody(a)) && !slots.every((a) => inert(a))) {
              const hit = { suite, line: lineOf(n), kind: `${r} unfollowable factory slot`, text: brief(n) };
              acc.bodyAbsent.push(hit);
              (r === "describe" || r === "suite" ? acc.factoryDescribe : acc.factoryTest).push(hit);
            }
          }

          if ((r === "describe" || r === "suite") && bodyArg) {
            for (const a of n.arguments) ts.forEachChild(a, (c) => walk(c, a === bodyArg ? true : insideDescribeBody));
            if (ts.isCallExpression(n.expression)) for (const a of n.expression.arguments) walk(a, insideDescribeBody);
            return;
          }
        }
      }
      ts.forEachChild(n, (c) => walk(c, insideDescribeBody));
    };
    walk(sf, false);
  };

  run(wide, wideRoot, wideSuiteBody, HOOK_WIDE);
  run(shipped, S.registrarRoot, S.isSuiteBody, S.HOOK_REGISTRARS);
}

// ---- POSITIVE CONTROL: the identical recognizer over constructed input ------
// A zero from a walk that never looked renders exactly like a zero from a walk
// that looked and found nothing (rule 11). This runs the SAME `run` body over a
// synthetic file carrying one instance of each construct; it must REPORT.
const CONTROL_SRC = `
import { beforeEach, describe, it } from "vitest";
describe(String(beforeEach(() => { process.env.X = "1"; })), () => { it("a", () => {}); });
const suiteA = () => { beforeEach(() => { process.env.Y = "1"; }); it("b", () => {}); };
describe("named factory", suiteA);
describe.each(beforeEach(() => {}) as never)("curried %s", () => { it("c", () => {}); });
`;
{
  const ctl = mk();
  const sf = ts.createSourceFile("control.ts", CONTROL_SRC, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const brief = (n: ts.Node) => n.getText(sf).split("\n")[0]!.slice(0, 90);
  const hooksIn = (nodes: ts.Node[], rx: RegExp): ts.CallExpression[] => {
    const out: ts.CallExpression[] = [];
    const w = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && rx.test(n.expression.text)) out.push(n);
      ts.forEachChild(n, w);
    };
    for (const n of nodes) w(n);
    return out;
  };
  const walk = (n: ts.Node, insideDescribeBody: boolean): void => {
    if (ts.isCallExpression(n)) {
      const r = wideRoot(n.expression);
      if (r !== null) {
        ctl.registrations += 1;
        const bodyArg = n.arguments.find((a) => wideSuiteBody(a));
        if ((r === "describe" || r === "suite") && bodyArg) ctl.inlineDescribes += 1;
        if (!insideDescribeBody) {
          const eager: ts.Node[] = [];
          if (ts.isCallExpression(n.expression)) eager.push(...n.expression.arguments);
          for (const a of n.arguments) if (!wideSuiteBody(a)) eager.push(a);
          for (const h of hooksIn(eager, HOOK_WIDE)) {
            const hit = { suite: "control.ts", line: lineOf(h), kind: `${r} eager`, text: brief(h) };
            ctl.eagerFileScope.push(hit);
            if (n.parent && ts.isExpressionStatement(n.parent) && n.parent.parent === sf) ctl.eagerDirect.push(hit);
          }
        }
        if (!bodyArg && n.arguments.length >= 2) {
          const cand = n.arguments[n.arguments.length - 1]!;
          const hit = { suite: "control.ts", line: lineOf(n), kind: `${r} body=${ts.SyntaxKind[cand.kind]}`, text: brief(n) };
          ctl.bodyAbsent.push(hit);
          if (ts.isIdentifier(cand)) ((r === "describe" || r === "suite") ? ctl.factoryDescribe : ctl.factoryTest).push(hit);
        }
        if ((r === "describe" || r === "suite") && bodyArg) {
          for (const a of n.arguments) ts.forEachChild(a, (c) => walk(c, a === bodyArg ? true : insideDescribeBody));
          if (ts.isCallExpression(n.expression)) for (const a of n.expression.arguments) walk(a, insideDescribeBody);
          return;
        }
      }
    }
    ts.forEachChild(n, (c) => walk(c, insideDescribeBody));
  };
  walk(sf, false);
  console.log(
    `POSITIVE CONTROL (constructed): eagerDirect ${ctl.eagerDirect.length}, eagerFileScope ${ctl.eagerFileScope.length}, factoryDescribe ${ctl.factoryDescribe.length}, registrations ${ctl.registrations}`,
  );
  if (ctl.eagerDirect.length === 0 || ctl.factoryDescribe.length === 0)
    throw new Error("probe void: the recognizer does not report on constructed instances, so the corpus zeros are not attributable");
}

// ---- which registrations does WIDE see that the SHIPPED recognizer does not?
{
  const only: string[] = [];
  for (const suite of suites) {
    const p2 = join(ROOT, suite);
    const sf = ts.createSourceFile(p2, readFileSync(p2, "utf8"), ts.ScriptTarget.ES2022, true, p2.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const w = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && wideRoot(n.expression) !== null && S.registrarRoot(n.expression) === null) {
        const ln = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        only.push(`${suite}:${ln}  ${n.getText(sf).split("\n")[0]!.slice(0, 100)}`);
      }
      ts.forEachChild(n, w);
    };
    w(sf);
  }
  console.log(`\nWIDE-ONLY REGISTRATIONS (invisible to the shipped registrarRoot): ${only.length}`);
  for (const o of only) console.log(`      ${o}`);
}

const show = (label: string, hits: Hit[], total: number) => {
  console.log(`${label}: ${hits.length} of ${total} registrations`);
  for (const h of hits.slice(0, 15)) console.log(`      ${h.suite}:${h.line}  [${h.kind}]  ${h.text}`);
  if (hits.length > 15) console.log(`      … ${hits.length - 15} more`);
};

console.log(`CORPUS: enrolled suites ${suites.length}, files read ${filesScanned}`);
console.log(`RECOGNIZER WIDE    registrations ${wide.registrations}, inline-bodied suites ${wide.inlineDescribes}, chain forms ${wide.chainForms}`);
console.log(`RECOGNIZER SHIPPED registrations ${shipped.registrations}, inline-bodied suites ${shipped.inlineDescribes}, chain forms ${shipped.chainForms}`);
if (filesScanned === 0 || wide.registrations === 0 || wide.inlineDescribes === 0)
  throw new Error("probe void: empty population or dead control");
if (wide.registrations < shipped.registrations)
  throw new Error("probe void: the wide recognizer found fewer registrations than the shipped one");
console.log("");
console.log("--- PROBE 1  file-scope eager hooks (instrument: WIDE, independent AST walk)");
show("  1a  registration is a DIRECT statement of the file", wide.eagerDirect, wide.registrations);
show("  1b  any registration outside a describe body", wide.eagerFileScope, wide.registrations);
show("  1a  SHIPPED lower bound", shipped.eagerDirect, shipped.registrations);
console.log("");
console.log("--- PROBE 2  named suite factories (instrument: WIDE, independent AST walk)");
show("  2a  describe/suite carrying an unfollowable FACTORY SLOT (index >= 1)", wide.factoryDescribe, wide.registrations);
show("  2b  it/test carrying an unfollowable slot (excluded from the shipped rule; measured anyway)", wide.factoryTest, wide.registrations);
show("  2c  any registration with an unfollowable factory slot, either root", wide.bodyAbsent, wide.registrations);
show("  2a  SHIPPED lower bound", shipped.factoryDescribe, shipped.registrations);
