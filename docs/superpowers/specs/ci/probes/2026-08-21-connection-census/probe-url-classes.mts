// Probe 2: mechanical URL-provenance classification of every driver connect call in tests/.
// Classes (per connect call):
//   guarded     — arg is assertLocalDbUrl(...) inline, or a const bound to assertLocalDbUrl(...)
//   env:<NAMES> — arg resolves (through const bindings, ??, !, parens, as) to process.env reads; NAMES = env vars in the chain
//   literal     — a string/template literal
//   param/other — a parameter, call result, property access, etc. (UNCLASSIFIABLE by this walk)
// Also: value-vs-type for non-default postgres imports, and acquisition shapes (namespace / dynamic / require).
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "__generated__") continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(ts|mts|cts|tsx)$/.test(e)) out.push(f);
  }
  return out;
}

type Site = { file: string; line: number; cls: string; detail: string };
const sites: Site[] = [];
const acquisition = { namespace: [] as string[], dynamicImport: [] as string[], require: [] as string[], namedValue: [] as string[], typeOnlyNamed: 0 };
const helperImports = new Map<string, Set<string>>();


// r2 F1: a binding INITIALIZED from a non-default acquisition is a driver binding too —
// `const postgres = (await import("postgres")).default`, `const pg = require("postgres")`.
function isDriverAcquisitionExpr(e0: ts.Expression): boolean {
  let e: ts.Expression = e0;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) { e = e.expression; continue; }
    if (ts.isPropertyAccessExpression(e) && e.name.text === "default") { e = e.expression; continue; }
    break;
  }
  if (!ts.isCallExpression(e) || e.arguments.length !== 1) return false;
  const a = e.arguments[0];
  if (!a || !ts.isStringLiteral(a) || a.text !== "postgres") return false;
  return (e.expression.kind === ts.SyntaxKind.ImportKeyword) || (ts.isIdentifier(e.expression) && e.expression.text === "require");
}

for (const file of walk(join(ROOT, "tests")).sort()) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const drv = new Set<string>();
  const guards = new Set<string>();
  const hi = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (spec === "postgres") {
      if (st.importClause?.name) drv.add(st.importClause.name.text);
      const nb = st.importClause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) acquisition.namespace.push(rel);
      if (nb && ts.isNamedImports(nb)) {
        const vals = nb.elements.filter((e) => !e.isTypeOnly && !st.importClause?.isTypeOnly);
        if (vals.length) acquisition.namedValue.push(`${rel}:${vals.map((v) => v.name.text).join(",")}`);
        else acquisition.typeOnlyNamed++;
      }
    }
    if (/_localDbUrl$/.test(spec)) {
      const nb = st.importClause?.namedBindings;
      if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) guards.add(e.name.text);
    }
    let r: string | null = null;
    if (spec.startsWith(".")) r = relative(ROOT, resolve(dirname(file), spec));
    else if (spec.startsWith("@/tests/")) r = spec.slice(2);
    if (r && r.startsWith("tests/")) hi.add(r.replace(/\.(ts|mts|tsx)$/, ""));
  }
  helperImports.set(rel.replace(/\.(ts|mts|tsx)$/, ""), hi);

  // const declarations by name (file-wide, any scope — conservative)
  const decls = new Map<string, ts.VariableDeclaration[]>();
  const params = new Set<string>();
  const v = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isDriverAcquisitionExpr(n.initializer)) drv.add(n.name.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const arr = decls.get(n.name.text) ?? [];
      arr.push(n);
      decls.set(n.name.text, arr);
    }
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) params.add(n.name.text);
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword) && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === "postgres") acquisition.dynamicImport.push(rel);
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "require" && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === "postgres") acquisition.require.push(rel);
    ts.forEachChild(n, v);
  };
  ts.forEachChild(sf, v);

  const envIn = (e: ts.Expression, seen: Set<string>, out: Set<string>): "env" | "guard" | "literal" | "other" => {
    let x: ts.Expression = e;
    while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
    if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && guards.has(x.expression.text)) return "guard";
    if (ts.isStringLiteralLike(x) || ts.isTemplateExpression(x)) return "literal";
    if (ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || x.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      const a = envIn(x.left, seen, out), b = envIn(x.right, seen, out);
      if (a === "guard" || b === "guard") return "guard";
      if (a === "other" || b === "other") return "other";
      return a === "env" || b === "env" ? "env" : "literal";
    }
    if (ts.isPropertyAccessExpression(x) && ts.isPropertyAccessExpression(x.expression) && ts.isIdentifier(x.expression.expression) && x.expression.expression.text === "process" && x.expression.name.text === "env") { out.add(x.name.text); return "env"; }
    if (ts.isIdentifier(x)) {
      if (seen.has(x.text)) return "other";
      seen.add(x.text);
      const ds = decls.get(x.text);
      if (!ds || ds.length === 0) return params.has(x.text) ? "other" : "other";
      let res: "env" | "guard" | "literal" | "other" | null = null;
      for (const d of ds) {
        const isConst = !!(d.parent && ts.isVariableDeclarationList(d.parent) && d.parent.flags & ts.NodeFlags.Const);
        if (!isConst || !d.initializer) return "other";
        const r = envIn(d.initializer, seen, out);
        if (res === null) res = r; else if (res !== r) return "other";
      }
      return res ?? "other";
    }
    return "other";
  };

  const c = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && drv.has(n.expression.text)) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      const arg = n.arguments[0];
      if (!arg) sites.push({ file: rel, line, cls: "other", detail: "no arg" });
      else {
        const out = new Set<string>();
        const k = envIn(arg, new Set(), out);
        sites.push({ file: rel, line, cls: k === "env" ? `env:${[...out].sort().join("|")}` : k, detail: arg.getText(sf).slice(0, 60) });
      }
    }
    ts.forEachChild(n, c);
  };
  ts.forEachChild(sf, c);
}

const byCls = new Map<string, number>();
for (const s of sites) byCls.set(s.cls, (byCls.get(s.cls) ?? 0) + 1);
console.log(`connect call sites: ${sites.length} across ${new Set(sites.map((s) => s.file)).size} files`);
for (const [k, n] of [...byCls].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log(`\nUNCLASSIFIABLE sites (class other):`);
for (const s of sites.filter((s) => s.cls === "other" || s.cls === "literal")) console.log(`  ${s.file}:${s.line}  ${s.detail}`);
console.log(`\nacquisition shapes: namespace=${acquisition.namespace.length} dynamicImport=${acquisition.dynamicImport.length} require=${acquisition.require.length} namedValue=${acquisition.namedValue.length} typeOnlyNamed=${acquisition.typeOnlyNamed}`);
for (const x of [...acquisition.namespace, ...acquisition.dynamicImport, ...acquisition.require, ...acquisition.namedValue]) console.log(`  ${x}`);

// Per-file class: a file's class is the set of its site classes; plus files that reach a connecting helper.
const fileCls = new Map<string, Set<string>>();
for (const s of sites) { const set = fileCls.get(s.file) ?? new Set(); set.add(s.cls.replace(/^env:.*/, "env")); fileCls.set(s.file, set); }
const mixed = [...fileCls].filter(([, v]) => v.size > 1);
console.log(`\nfiles with MIXED site classes: ${mixed.length}`);
for (const [f, v] of mixed) console.log(`  ${f}: ${[...v].join("+")}`);
const envNames = new Map<string, number>();
for (const s of sites) if (s.cls.startsWith("env:")) envNames.set(s.cls, (envNames.get(s.cls) ?? 0) + 1);
console.log(`\nenv-chain shapes:`);
for (const [k, n] of [...envNames].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

// Plan round 2 F5: a per-FILE class tally, so "targets validation" is counted by site class, not by
// the absence of a guard call. A direct file's class is its (single, at BASE) site class.
const perFile = new Map<string, string>();
for (const s of sites) perFile.set(s.file, s.cls.startsWith("env:") ? "validation-env" : s.cls === "guard" ? "guard-bound" : s.cls === "literal" ? "loopback-literal" : "unclassifiable");
const fileTally = new Map<string, number>();
for (const c of perFile.values()) fileTally.set(c, (fileTally.get(c) ?? 0) + 1);
console.log(`\nper-FILE class of the ${perFile.size} direct-calling files: ${[...fileTally].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ")}`);
