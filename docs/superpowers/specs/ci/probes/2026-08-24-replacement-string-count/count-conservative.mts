// Report-only probe: judge every `.replace`/`.replaceAll` call's SECOND argument
// repo-wide. Population derived from disk (git ls-files), never enumerated.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n")
  .filter((f) => f !== "" && EXT.test(f));

type Verdict = "literal" | "function" | "one-arg" | "offender";
type Call = { file: string; line: number; verdict: Verdict; recv: string; text: string };

const calls: Call[] = [];

for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  if (!/\.replace(All)?\s*\(/.test(source)) continue;
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "replace" || node.expression.name.text === "replaceAll")
    ) {
      const arg = node.arguments[1];
      const verdict: Verdict =
        arg === undefined
          ? "one-arg"
          : ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)
            ? "literal"
            : ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)
              ? "function"
              : "offender";
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
      calls.push({
        file,
        line: line + 1,
        verdict,
        recv: node.expression.expression.getText(src).slice(0, 40).replace(/\s+/g, " "),
        text: node.getText(src).slice(0, 110).replace(/\s+/g, " "),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

const by = (v: Verdict) => calls.filter((c) => c.verdict === v);
console.log(`files scanned (tracked, JS/TS ext):   ${tracked.length}`);
console.log(`files containing a replace call:      ${new Set(calls.map((c) => c.file)).size}`);
console.log(`replace/replaceAll call sites:        ${calls.length}`);
console.log(`  literal replacement:                ${by("literal").length}`);
console.log(`  replacer function:                  ${by("function").length}`);
console.log(`  single-argument (no replacement):   ${by("one-arg").length}`);
console.log(`  OFFENDERS (runtime value):          ${by("offender").length}`);
console.log(`  offender files:                     ${new Set(by("offender").map((c) => c.file)).size}`);

if (process.argv.includes("--list")) {
  for (const c of by("offender")) console.log(`${c.file}:${c.line}  ${c.text}`);
}
if (process.argv.includes("--list-one-arg")) {
  for (const c of by("one-arg")) console.log(`ONEARG ${c.file}:${c.line}  ${c.text}`);
}
