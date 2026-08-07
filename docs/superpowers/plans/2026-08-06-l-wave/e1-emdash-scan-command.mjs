import { createRequire } from "node:module"; const require = createRequire(process.cwd() + "/package.json"); const ts = require("typescript");
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd();
const roots = ["components", "app", "lib"];
const files = [];
function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (!p.includes("app/api")) walk(p); }
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts")) files.push(p);
  }
}
roots.forEach((r) => walk(join(ROOT, r)));
const hits = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!src.includes("—")) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    const kinds = [ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText];
    if (kinds.includes(n.kind) && n.text && n.text.includes("—")) {
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      hits.push(`${f.slice(ROOT.length + 1)}:${line + 1} [${ts.SyntaxKind[n.kind]}] ${JSON.stringify(n.text.trim().slice(0, 70))}`);
    }
    n.forEachChild(visit);
  };
  visit(sf);
}
console.log(hits.join("\n"));
console.log(`TOTAL ${hits.length}`);
