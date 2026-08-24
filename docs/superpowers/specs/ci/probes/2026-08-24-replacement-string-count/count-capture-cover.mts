// The capture-preserving cover: which of the offenders would a blind wrap BREAK?
//
// The wrap repair (`X.replace(a, b)` -> `X.replace(a, () => b)`) is behaviour-identical
// unless `b` already carried a `$` substitution sequence. One shape inverts that: a
// replacement the author DELIBERATELY wrote with a `$n` capture reference. Wrapping one of
// those turns a live capture into literal text.
//
// Three complementary passes, because no single one of them covers the class:
//
//   A. TEXTUAL   — the call's own replacement expression text carries a `$` sequence.
//                  Catches any node kind: template literals, concatenations, calls.
//   B. SAME-FILE — the replacement is an identifier bound in the same file to a string
//                  literal that carries a `$` sequence. Pass A cannot see these, because
//                  the `$` is in the declaration, not at the call.
//   C. RESIDUAL  — the replacement is an identifier pass B could not resolve. Intersect
//                  those names against EVERY `$`-bearing string const in the repository.
//                  A non-empty intersection is a site that needs reading by hand.
//
// A + B are the finding set. C is the completeness argument: it is the reason the union of
// A and B can be called a cover rather than a list of what happened to be noticed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const DOLLAR = /\$(&|`|'|\d|<[A-Za-z_$][\w$]*>|\$)/;

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n")
  .filter((f) => f !== "" && EXT.test(f));

const isAccepted = (a: ts.Expression): boolean =>
  ts.isStringLiteral(a) ||
  ts.isNoSubstitutionTemplateLiteral(a) ||
  ts.isArrowFunction(a) ||
  ts.isFunctionExpression(a);

const textual: string[] = [];
const sameFile: string[] = [];
const unresolvedNames = new Set<string>();
const dollarConsts = new Map<string, string[]>();
let offenders = 0;

for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  // Every `$`-bearing string const in the repository, by name — pass C's right-hand side.
  const scanBindings = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer)) &&
      DOLLAR.test(n.initializer.text)
    ) {
      const at = `${file}: ${JSON.stringify(n.initializer.text).slice(0, 46)}`;
      dollarConsts.set(n.name.text, [...(dollarConsts.get(n.name.text) ?? []), at]);
    }
    ts.forEachChild(n, scanBindings);
  };
  scanBindings(src);

  if (!/\.replace(All)?\s*\(/.test(source)) continue;

  const consts = new Map<string, string>();
  const collect = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))
    )
      consts.set(n.name.text, n.initializer.text);
    ts.forEachChild(n, collect);
  };
  collect(src);

  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      (n.expression.name.text === "replace" || n.expression.name.text === "replaceAll")
    ) {
      const arg = n.arguments[1];
      if (arg !== undefined && !isAccepted(arg)) {
        offenders++;
        const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
        const where = `${file}:${line + 1}`;
        const text = arg.getText(src);
        if (DOLLAR.test(text)) {
          textual.push(`  A ${where}  ${ts.SyntaxKind[arg.kind]}  ${text.slice(0, 60)}`);
        } else if (ts.isIdentifier(arg)) {
          const lit = consts.get(arg.text);
          if (lit === undefined) unresolvedNames.add(arg.text);
          else if (DOLLAR.test(lit))
            sameFile.push(`  B ${where}  ${arg.text} = ${JSON.stringify(lit)}`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}

const residual = [...unresolvedNames].filter((n) => dollarConsts.has(n)).sort();

console.log(`offenders scanned: ${offenders}\n`);
console.log(`A. textual  $ at the call site:        ${textual.length}`);
for (const l of textual) console.log(l);
console.log(`\nB. same-file const bearing a $:        ${sameFile.length}`);
for (const l of sameFile) console.log(l);
console.log(`\nC. unresolved identifier names:        ${unresolvedNames.size}`);
console.log(`   $-bearing string consts repo-wide:  ${dollarConsts.size}`);
console.log(`   INTERSECTION (needs hand-reading):  ${residual.length}`);
for (const r of residual) console.log(`  C ${r} -> ${dollarConsts.get(r)!.join(" | ")}`);
// Deliberately reports the capture class only. How many sites are REPAIRED, and how the
// docs exclusion divides them, is the spec's arithmetic (§4, §6) — restating it here would
// give the same number two owners and one place to drift.
console.log(
  `\nCAPTURE-PRESERVING SITES: ${textual.length + sameFile.length}` +
    `   every other offender takes the ordinary wrap: ${offenders - textual.length - sameFile.length}`,
);
if (residual.length > 0) {
  console.log("\nPass C is non-empty: the union of A and B is NOT a cover. Read those by hand.");
  process.exitCode = 1;
}
