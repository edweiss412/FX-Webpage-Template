// R3 F2: which offender sites are reachable ONLY by recursing through a matched call's receiver?
// Those are exactly the sites an early `return` in the visitor drops, and no AC currently pins them.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { PREFILTER, replaceCallee } from "./_shared.mjs";
import { skipTransparent } from "../../../../../../tests/_shared/outerExpressions";
const R = ".";
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64<<20 })
  .split("\n").filter((f) => f !== "" && EXT.test(f));
const ok = (a: ts.Expression) => ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) ||
  ts.isArrowFunction(a) || ts.isFunctionExpression(a);
const isRepl = (n: ts.Node): n is ts.CallExpression =>
  replaceCallee(n) !== null;
const offender = (n: ts.CallExpression) => {
  const a = n.arguments; const sp = a.findIndex((x) => ts.isSpreadElement(x));
  if (sp === 0 || sp === 1) return true;
  return a.length >= 2 && !ok(skipTransparent(a[1]!));
};

const nested: string[] = [];
let full = 0;
for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  if (!PREFILTER.test(source)) continue;
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const walk = (n: ts.Node, insideMatched: boolean): void => {
    const matched = isRepl(n);
    if (matched && offender(n)) {
      full++;
      if (insideMatched) {
        const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
        nested.push(`${file}:${line + 1}`);
      }
    }
    ts.forEachChild(n, (c) => walk(c, insideMatched || matched));
  };
  walk(src, false);
}
console.log(`total offenders:                              ${full}`);
console.log(`reachable ONLY through a matched receiver:    ${nested.length}`);
for (const x of nested) console.log("   " + x);
