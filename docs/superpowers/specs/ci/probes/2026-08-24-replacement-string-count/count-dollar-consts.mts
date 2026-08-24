// Derivation: across every offender site, does the replacement expression resolve to a
// same-file const whose string literal carries a `$` substitution sequence? Those are the
// sites where a blind wrap to `() => value` CHANGES behaviour.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const DOLLAR = /\$(&|`|'|\d|<[A-Za-z_$][\w$]*>|\$)/;
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n").filter((f) => f !== "" && EXT.test(f));

for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  if (!/\.replace(All)?\s*\(/.test(source)) continue;
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  // same-file const name -> string-literal text
  const consts = new Map<string, string>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer &&
        (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) {
      consts.set(n.name.text, n.initializer.text);
    }
    ts.forEachChild(n, collect);
  };
  collect(src);

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        (n.expression.name.text === "replace" || n.expression.name.text === "replaceAll")) {
      const arg = n.arguments[1];
      const offender = arg !== undefined &&
        !ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg) &&
        !ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg);
      if (offender && ts.isIdentifier(arg)) {
        const lit = consts.get(arg.text);
        if (lit !== undefined) {
          const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
          const flag = DOLLAR.test(lit) ? "DOLLAR-BEARING" : "plain";
          console.log(`${flag}\t${file}:${line + 1}\t${arg.text} = ${JSON.stringify(lit)}`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
