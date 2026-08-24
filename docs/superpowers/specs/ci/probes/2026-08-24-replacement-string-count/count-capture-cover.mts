// The capture-preserving cover: which offenders would a blind wrap BREAK?
//
// The wrap repair (`X.replace(a, b)` -> `X.replace(a, () => b)`) is behaviour-identical unless `b`
// already carried a `$` substitution sequence. One shape inverts that: a replacement the author
// DELIBERATELY wrote with a `$n` capture reference. Wrapping one of those turns a live capture
// into literal text, so they must be found BEFORE the sweep.
//
// Classification is NOT this script's — every matcher comes from `_shared.mts`, which exists
// because spec rounds 2, 4 and 5 each found the same wrapper-resolution class in a different
// position and the repairs kept landing in one copy while siblings drifted.
//
// Three passes, because no single one covers the class:
//   A. TEXTUAL   - the replacement expression's own text carries a `$` sequence. Any node kind.
//   B. SAME-FILE - the replacement resolves to a same-file string-literal const bearing a `$`.
//   C. RESIDUAL  - every replacement B could NOT resolve, intersected against every `$`-bearing
//                  string const in the repository. Non-empty means A+B is not a cover.
//
// A and B are the finding set. C is the completeness argument, and the script exits non-zero if C
// or the spread bucket is ever non-empty, so the claim re-checks itself rather than being asserted.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { DOLLAR, PREFILTER, classify, litText, replaceCallee, trackedFiles } from "./_shared.mjs";

const textual: string[] = [];
const sameFile: string[] = [];
const unresolved = new Set<string>();
const unclassifiable: string[] = [];
const dollarConsts = new Map<string, string[]>();
let offenders = 0;

for (const file of trackedFiles()) {
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

  if (!PREFILTER.test(source)) continue;

  // EVERY binding per name, never last-write-wins. A name bound more than once in a file is
  // ambiguous to a scope-blind pass, and spec R6 declines exactly that guess: it is reported
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

  // No early `return` below: a chained `a.replace(x,y).replace(z,w)` nests the inner call inside
  // the outer call's receiver, so returning before `ts.forEachChild` drops it — which an earlier
  // draft of this file did, reading 54 offenders where the judge reads 56.
  const visit = (n: ts.Node): void => {
    if (replaceCallee(n) !== null && ts.isCallExpression(n)) {
      const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
      const where = `${file}:${line + 1}`;
      const { verdict, arg } = classify(n);
      if (verdict === "reported" && arg === null) {
        offenders++;
        unclassifiable.push(`  ! ${where}  spread at index <=1: replacement not locatable`);
      } else if (verdict === "reported" && arg !== null) {
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

// Reports the capture class only. How many sites are REPAIRED, and how the docs exclusion divides
// them, is the spec's arithmetic — restating it here would give one number two owners.
console.log(
  `\nCAPTURE-PRESERVING SITES: ${textual.length + sameFile.length}` +
    `   every other offender takes the ordinary wrap: ${offenders - textual.length - sameFile.length - unclassifiable.length}`,
);
if (residual.length > 0 || unclassifiable.length > 0) {
  console.log("\nA+B is NOT a cover here: read the ! and C entries by hand.");
  process.exitCode = 1;
}
