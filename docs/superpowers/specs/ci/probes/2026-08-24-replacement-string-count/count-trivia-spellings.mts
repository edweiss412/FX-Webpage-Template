// Planted-defect proof for the prefilter deletion: every spelling review named, plus the escaped
// identifier no source-text regex can see, against BOTH the old prefilter and the shipped walk.
import ts from "typescript";
import { replaceCallee } from "./_shared.mjs";

const OLD_TIGHT = /\.replace(All)?\s*\(/;
const OLD_WIDE  = /\.replace(All)?\b/;

const spellings: [string, string][] = [
  ["baseline",         `a.path.replace("$C", v)`],
  ["wrapped callee",   `(a.path.replace)("$C", v)`],
  ["space after dot",  `a.path. replace("$C", v)`],
  ["newline after dot","a.path.\n  replace(\"$C\", v)"],
  ["block comment",    `a.path./* expand $C */replace("$C", v)`],
  ["line comment",     "a.path.// why\n  replace(\"$C\", v)"],
  ["escaped identifier", `a.path.repl\\u0061ce("$C", v)`],
];

for (const [label, src0] of spellings) {
  const src = ts.createSourceFile("f.ts", src0, ts.ScriptTarget.Latest, true);
  let ast = 0;
  const visit = (n: ts.Node): void => { if (replaceCallee(n) !== null) ast++; ts.forEachChild(n, visit); };
  visit(src);
  const tight = OLD_TIGHT.test(src0), wide = OLD_WIDE.test(src0);
  const missed = (tight ? "" : "T") + (wide ? "" : "W");
  console.log(
    `${label.padEnd(20)} old-tight=${String(tight).padEnd(5)} old-wide=${String(wide).padEnd(5)} ` +
    `AST=${ast}  ${ast > 0 && missed ? `<- prefilter would have DROPPED it (${missed})` : ""}`,
  );
}
