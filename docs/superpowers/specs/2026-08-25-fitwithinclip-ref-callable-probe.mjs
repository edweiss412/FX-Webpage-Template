// One-off PROBE (not a shipped guard): enumerate every JSX `ref=` attribute in
// components/, app/ and lib/ whose expression TYPE is callable, using the
// TypeScript checker rather than a spelling pattern.
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const cfgPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
const cfg = ts.parseJsonConfigFileContent(
  ts.readConfigFile(cfgPath, ts.sys.readFile).config,
  ts.sys,
  root,
);
const program = ts.createProgram(cfg.fileNames, cfg.options);
const checker = program.getTypeChecker();

const ROOTS = ["components/", "app/", "lib/"];
const rows = [];

for (const sf of program.getSourceFiles()) {
  const rel = sf.fileName.startsWith(root) ? sf.fileName.slice(root.length + 1) : sf.fileName;
  if (!ROOTS.some((r) => rel.startsWith(r))) continue;
  if (/\.test\.tsx?$/.test(rel) || sf.isDeclarationFile) continue;

  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === "ref" && node.initializer) {
      let expr = node.initializer;
      if (ts.isJsxExpression(expr)) expr = expr.expression;
      if (expr) {
        const t = checker.getTypeAtLocation(expr);
        // A callable ref: the type (or any union member) has a call signature.
        const parts = t.isUnion() ? t.types : [t];
        const callable = parts.some((p) => checker.getSignaturesOfType(p, ts.SignatureKind.Call).length > 0);
        const line = sf.getLineAndCharacterOfPosition(expr.getStart()).line + 1;
        rows.push({
          rel, line, callable,
          text: expr.getText().replace(/\s+/g, " ").slice(0, 46),
          type: checker.typeToString(t).slice(0, 52),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

rows.sort((a, b) => (a.rel === b.rel ? a.line - b.line : a.rel.localeCompare(b.rel)));
const callable = rows.filter((r) => r.callable);
console.log(`ALL ref= attributes in components/ app/ lib/ (non-test): ${rows.length}`);
console.log(`CALLABLE (the shape-1 axis):                            ${callable.length}`);
console.log("");
for (const r of callable) console.log(`${r.rel}:${r.line}  ${r.text}   :: ${r.type}`);
console.log("");
console.log("NON-callable (plain ref objects), for completeness:", rows.length - callable.length);
