// Class sweep for the round-1 finding: argument shapes that make POSITIONAL indexing
// meaningless, so `node.arguments[1]` is not the replacement the call actually receives.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n").filter((f) => f !== "" && EXT.test(f));

let spreadAtOrBefore1 = 0, spreadLater = 0, zeroArg = 0, oneArg = 0, dotCallApply = 0, total = 0;
for (const file of tracked) {
  const source = readFileSync(file, "utf8");
  if (!/\.replace(All)?/.test(source)) continue;
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const name = n.expression.name.text;
      const at = () => `${file}:${src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1}`;

      // `x.replace.call(...)` / `.apply(...)` — the receiver is itself a `.replace` access
      if ((name === "call" || name === "apply") &&
          ts.isPropertyAccessExpression(n.expression.expression) &&
          /^replace(All)?$/.test(n.expression.expression.name.text)) {
        dotCallApply++;
        console.log(`DOT-CALL/APPLY   ${at()}  ${n.getText(src).slice(0, 80).replace(/\s+/g, " ")}`);
      }

      if (name === "replace" || name === "replaceAll") {
        total++;
        const args = n.arguments;
        const spreadIdx = args.findIndex((a) => ts.isSpreadElement(a));
        if (spreadIdx === 0 || spreadIdx === 1) {
          spreadAtOrBefore1++;
          console.log(`SPREAD<=1        ${at()}  ${n.getText(src).slice(0, 80).replace(/\s+/g, " ")}`);
        } else if (spreadIdx > 1) spreadLater++;
        if (args.length === 0) zeroArg++;
        else if (args.length === 1 && spreadIdx !== 0) oneArg++;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
console.log(`\nreplace/replaceAll calls: ${total}`);
console.log(`  spread at index 0 or 1 (UNCLASSIFIABLE):     ${spreadAtOrBefore1}`);
console.log(`  spread only at index >1 (indexing intact):   ${spreadLater}`);
console.log(`  zero arguments:                              ${zeroArg}`);
console.log(`  exactly one non-spread argument:             ${oneArg}`);
console.log(`  replace.call / replace.apply:                ${dotCallApply}`);
