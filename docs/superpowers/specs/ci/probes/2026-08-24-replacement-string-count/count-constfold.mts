// Report-only probe v2: same as v1, plus a SAME-FILE const-literal resolution so
// the report separates "a runtime value" from "a module constant that happens not
// to be spelled inline". One level, same file, no imports followed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { PREFILTER, replaceCallee } from "./_shared.mjs";

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n")
  .filter((f) => f !== "" && EXT.test(f));

type Verdict = "literal" | "function" | "one-arg" | "const-literal" | "offender";
type Call = { file: string; line: number; verdict: Verdict; text: string };
const calls: Call[] = [];

const isLit = (n: ts.Node): boolean =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  if (!PREFILTER.test(source)) continue;
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  // Same-file `const NAME = "literal"` map, threaded DOWN (never via .parent).
  const constLit = new Map<string, boolean>();
  const collect = (node: ts.Node): void => {
    if (
      ts.isVariableStatement(node) &&
      (node.declarationList.flags & ts.NodeFlags.Const) !== 0
    ) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer !== undefined && isLit(d.initializer)) {
          constLit.set(d.name.text, true);
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(src);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && replaceCallee(node) !== null) {
      const arg = node.arguments[1];
      const verdict: Verdict =
        arg === undefined
          ? "one-arg"
          : isLit(arg)
            ? "literal"
            : ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)
              ? "function"
              : ts.isIdentifier(arg) && constLit.get(arg.text) === true
                ? "const-literal"
                : "offender";
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
      calls.push({ file, line: line + 1, verdict, text: node.getText(src).slice(0, 110).replace(/\s+/g, " ") });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

const by = (v: Verdict) => calls.filter((c) => c.verdict === v);
for (const v of ["literal", "function", "const-literal", "one-arg", "offender"] as Verdict[]) {
  console.log(`${v.padEnd(16)} ${String(by(v).length).padStart(5)}`);
}
console.log(`TOTAL            ${String(calls.length).padStart(5)}   files ${new Set(calls.map((c) => c.file)).size}`);
console.log(`offender files   ${String(new Set(by("offender").map((c) => c.file)).size).padStart(5)}`);
const arg = process.argv[2];
if (arg !== undefined && arg.startsWith("--list=")) {
  for (const c of by(arg.slice(7) as Verdict)) console.log(`${c.file}:${c.line}  ${c.text}`);
}
