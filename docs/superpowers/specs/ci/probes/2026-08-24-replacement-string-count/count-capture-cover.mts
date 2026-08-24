// The capture-preserving cover: which offenders would a blind wrap BREAK?
//
// The wrap repair (`X.replace(a, b)` -> `X.replace(a, () => b)`) is behaviour-identical unless
// `b` already carried a `$` substitution sequence. One shape inverts that: a replacement the
// author DELIBERATELY wrote with a `$n` capture reference. Wrapping one of those turns a live
// capture into literal text, so they must be found BEFORE the sweep.
//
// CLASSIFICATION IS THE JUDGE'S, NOT THIS SCRIPT'S. Spec round 2 found three independent ways an
// independently-derived cover drifts from the judge it is supposed to be auditing: it read the
// RAW argument while the judge strips transparent wrappers (so `(TOK)`, `TOK as string`, `TOK!`,
// `TOK satisfies string` all escaped every pass); it had no spread rule, so the judge's
// unclassifiable calls were invisible to it; and its name map was last-write-wins, the very
// shadowing unsoundness spec R6 rejects. Two of those were reported; the third was found by
// sweeping the class rather than patching the reports. The lesson is structural: a cover that
// re-derives the judge's decisions is a second implementation that will drift again. The shipped
// audit therefore consumes the judge's own reported sites (spec §6); this script is the
// pre-implementation stand-in and mirrors the judge's rules exactly so its numbers can be
// trusted until the scanner module exists.
//
// Three passes, because no single one covers the class:
//   A. TEXTUAL   - the replacement expression's own text carries a `$` sequence. Any node kind.
//   B. SAME-FILE - the replacement resolves to a same-file string-literal const bearing a `$`.
//   C. RESIDUAL  - every replacement B could NOT resolve, intersected against every `$`-bearing
//                  string const in the repository. Non-empty means A+B is not a cover.
//
// A and B are the finding set. C is the completeness argument, and the script exits non-zero if
// C is ever non-empty, so the claim re-checks itself rather than being asserted.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { skipTransparent } from "../../../../../../tests/_shared/outerExpressions";

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const DOLLAR = /\$(&|`|'|\d|<[A-Za-z_$][\w$]*>|\$)/;

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n")
  .filter((f) => f !== "" && EXT.test(f));

/**
 * A transparent wrapper denotes the same value as the expression inside it, so EVERY kind test in
 * this file resolves through `skipTransparent` first. Spec rounds 2 and 4 both landed on this one
 * class from different directions: round 2 found the ARGUMENT unresolved, round 4 the CALLEE, and
 * sweeping after round 4 found the BINDING INITIALIZERS unresolved too — a `$`-bearing
 * `const TOK = ("$1" as string)` was invisible to pass B and to pass C at once. Resolving at one
 * named helper rather than at each call site is what stops a fourth instance.
 */
const litText = (e: ts.Expression | undefined): string | null => {
  if (e === undefined) return null;
  const r = skipTransparent(e);
  return ts.isStringLiteral(r) || ts.isNoSubstitutionTemplateLiteral(r) ? r.text : null;
};

/** The `.replace` / `.replaceAll` property access a call denotes, wrappers resolved. */
const replaceCallee = (n: ts.CallExpression): ts.PropertyAccessExpression | null => {
  const c = skipTransparent(n.expression);
  return ts.isPropertyAccessExpression(c) && /^replace(All)?$/.test(c.name.text) ? c : null;
};

const isAccepted = (a: ts.Expression): boolean =>
  ts.isStringLiteral(a) ||
  ts.isNoSubstitutionTemplateLiteral(a) ||
  ts.isArrowFunction(a) ||
  ts.isFunctionExpression(a);

const textual: string[] = [];
const sameFile: string[] = [];
const unresolved = new Set<string>();
const unclassifiable: string[] = [];
const dollarConsts = new Map<string, string[]>();
let offenders = 0;

for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  // Pass C's right-hand side: every `$`-bearing string const in the repository, by name.
  const scanBindings = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const lit = litText(n.initializer);
      if (lit !== null && DOLLAR.test(lit)) {
        const at = `${file}: ${JSON.stringify(lit).slice(0, 46)}`;
        dollarConsts.set(n.name.text, [...(dollarConsts.get(n.name.text) ?? []), at]);
      }
    }
    ts.forEachChild(n, scanBindings);
  };
  scanBindings(src);

  if (!/\.replace(All)?\s*\(/.test(source)) continue;

  // EVERY binding per name, never last-write-wins. A name bound more than once in a file is
  // ambiguous to a scope-blind pass, and R6 declines exactly that guess: it is reported
  // unresolved so pass C can catch it, rather than resolved to whichever binding came last.
  const bindings = new Map<string, string[]>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const lit = litText(n.initializer);
      if (lit !== null) bindings.set(n.name.text, [...(bindings.get(n.name.text) ?? []), lit]);
    }
    ts.forEachChild(n, collect);
  };
  collect(src);

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && replaceCallee(n) !== null) {
      const args = n.arguments;
      const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
      const where = `${file}:${line + 1}`;

      // NB: no early `return` anywhere in this block. A chained `a.replace(x,y).replace(z,w)`
      // nests the inner call inside the outer call's receiver, so returning before
      // `ts.forEachChild` below silently drops it -- which is exactly what an earlier draft of
      // this rewrite did, turning 56 offenders into 54 and hiding two of shapeHoldEntry's three
      // chained sites. The repair's own tidy-up is a defect site.
      const spreadIdx = args.findIndex((a) => ts.isSpreadElement(a));
      if (spreadIdx === 0 || spreadIdx === 1) {
        // The judge's rule 1: a spread at index 0 or 1 makes positional indexing meaningless, so
        // the replacement cannot be located at all. Never silently skipped -- it needs a human.
        offenders++;
        unclassifiable.push(`  ! ${where}  spread at index ${spreadIdx}: replacement not locatable`);
      } else if (args.length >= 2) {
        // The judge's transparent-wrapper resolution, so `(TOK)` / `TOK as string` / `TOK!` /
        // `TOK satisfies string` reach the same pass a bare `TOK` would.
        const arg = skipTransparent(args[1]!);
        if (!isAccepted(arg)) {
          offenders++;
          if (DOLLAR.test(arg.getText(src))) {
            textual.push(`  A ${where}  ${ts.SyntaxKind[arg.kind]}  ${arg.getText(src).slice(0, 60)}`);
          } else if (ts.isIdentifier(arg)) {
            const bound = bindings.get(arg.text);
            if (bound === undefined || bound.length > 1) unresolved.add(arg.text);
            else if (DOLLAR.test(bound[0]!))
              sameFile.push(`  B ${where}  ${arg.text} = ${JSON.stringify(bound[0])}`);
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}

const residual = [...unresolved].filter((n) => dollarConsts.has(n)).sort();

console.log(`offenders scanned: ${offenders}\n`);
console.log(`A. textual  $ at the call site:        ${textual.length}`);
for (const l of textual) console.log(l);
console.log(`\nB. same-file const bearing a $:        ${sameFile.length}`);
for (const l of sameFile) console.log(l);
console.log(`\n!. spread: replacement not locatable:  ${unclassifiable.length}`);
for (const l of unclassifiable) console.log(l);
console.log(`\nC. unresolved / ambiguous names:       ${unresolved.size}`);
console.log(`   $-bearing string consts repo-wide:  ${dollarConsts.size}`);
console.log(`   INTERSECTION (needs hand-reading):  ${residual.length}`);
for (const r of residual) console.log(`  C ${r} -> ${dollarConsts.get(r)!.join(" | ")}`);

// Deliberately reports the capture class only. How many sites are REPAIRED, and how the docs
// exclusion divides them, is the spec's arithmetic -- restating it here would give one number
// two owners and one place to drift.
console.log(
  `\nCAPTURE-PRESERVING SITES: ${textual.length + sameFile.length}` +
    `   every other offender takes the ordinary wrap: ${offenders - textual.length - sameFile.length - unclassifiable.length}`,
);
if (residual.length > 0 || unclassifiable.length > 0) {
  console.log("\nA+B is NOT a cover here: read the ! and C entries by hand.");
  process.exitCode = 1;
}
