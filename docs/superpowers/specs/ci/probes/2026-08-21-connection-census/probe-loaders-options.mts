// Probe 3 (spec round 3 F1/F2/F3): AST-derived censuses that the earlier rg measurements got wrong.
//   (a) every NON-LITERAL module specifier in a parser specifier position (import(), require());
//   (b) the options object at every connect site: arity, outer keys, `connection` sub-keys, non-plain shapes;
//   (c) every vitest loader call (`vi.<member>(<literal>)`) and where its target resolves.
// Run from the repo root: pnpm tsx docs/superpowers/specs/ci/probes/2026-08-21-connection-census/probe-loaders-options.mts
import ts from "typescript";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "__generated__") continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/.test(e)) out.push(f);
  }
  return out;
}
function kindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
function isDriverAcquisitionExpr(e0: ts.Expression): boolean {
  let e: ts.Expression = e0;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) { e = e.expression; continue; }
    if (ts.isPropertyAccessExpression(e) && e.name.text === "default") { e = e.expression; continue; }
    break;
  }
  if (!ts.isCallExpression(e) || e.arguments.length !== 1) return false;
  const a = e.arguments[0];
  if (!a || !ts.isStringLiteralLike(a) || a.text !== "postgres") return false;
  return ts.isImportKeyword(e.expression) || (ts.isIdentifier(e.expression) && e.expression.text === "require");
}

// Connecting helpers at BASE, from probe-population.out (re-stated here so this probe is self-contained).
const CONNECTING_HELPERS = new Set([
  "tests/db/_b2Helpers", "tests/db/_holdsHelpers", "tests/db/_mi11Helpers", "tests/db/_remediationHelpers", "tests/e2e/helpers/devCaptureStaged",
]);
function resolveSpec(fromFile: string, spec: string): { cls: "tests" | "production" | "bare" | "unresolved"; path?: string } {
  let base: string | null = null;
  if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(fromFile), spec);
  else if (spec.startsWith("/")) base = join(ROOT, spec);
  else if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else return { cls: "bare" };
  for (const ext of ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", "/index.ts"]) {
    const cand = base + ext;
    if (existsSync(cand) && statSync(cand).isFile()) {
      const rel = relative(ROOT, cand);
      return { cls: rel.startsWith("tests/") ? "tests" : "production", path: rel };
    }
  }
  return { cls: "unresolved" };
}

const nonLiteral: string[] = [];
const arity = new Map<number, number>();
const outerKeys = new Map<string, number>();
const connKeys = new Map<string, number>();
const nonPlain: string[] = [];
const loaders = new Map<string, number>(); // member -> count
const loaderTargets: string[] = [];
let sites = 0;

for (const file of walk(join(ROOT, "tests")).sort()) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kindFor(file));
  const drv = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text === "postgres" && st.importClause?.name && !st.importClause.isTypeOnly) drv.add(st.importClause.name.text);
  }
  const pre = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isDriverAcquisitionExpr(n.initializer)) drv.add(n.name.text);
    ts.forEachChild(n, pre);
  };
  ts.forEachChild(sf, pre);
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const a0 = n.arguments[0];
      // (a) non-literal specifier in import()/require()
      const isLoaderPos = ts.isImportKeyword(n.expression) || (ts.isIdentifier(n.expression) && n.expression.text === "require");
      if (isLoaderPos && a0 && !ts.isStringLiteralLike(a0)) nonLiteral.push(`${rel}:${line(n)}:${n.getText(sf).replace(/\s+/g, " ").slice(0, 70)}`);
      // (b) options at connect sites
      if (ts.isIdentifier(n.expression) && drv.has(n.expression.text)) {
        sites++;
        arity.set(n.arguments.length, (arity.get(n.arguments.length) ?? 0) + 1);
        const opts = n.arguments[1];
        if (opts) {
          if (!ts.isObjectLiteralExpression(opts)) nonPlain.push(`${rel}:${line(n)}:non-object options`);
          else for (const p of opts.properties) {
            if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) { nonPlain.push(`${rel}:${line(n)}:${ts.SyntaxKind[p.kind]}`); continue; }
            outerKeys.set(p.name.text, (outerKeys.get(p.name.text) ?? 0) + 1);
            if (p.name.text === "connection") {
              if (!ts.isObjectLiteralExpression(p.initializer)) nonPlain.push(`${rel}:${line(n)}:connection non-object`);
              else for (const q of p.initializer.properties) {
                if (!ts.isPropertyAssignment(q) || !ts.isIdentifier(q.name)) { nonPlain.push(`${rel}:${line(n)}:connection ${ts.SyntaxKind[q.kind]}`); continue; }
                connKeys.set(q.name.text, (connKeys.get(q.name.text) ?? 0) + 1);
              }
            }
          }
        }
        if (n.arguments.length > 2) nonPlain.push(`${rel}:${line(n)}:third argument`);
      }
      // (c) vitest loader calls
      if (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "vi" && a0 && ts.isStringLiteralLike(a0)) {
        const m = n.expression.name.text;
        loaders.set(m, (loaders.get(m) ?? 0) + 1);
        const r = resolveSpec(file, a0.text);
        const helper = r.path ? r.path.replace(/\.(ts|mts|tsx)$/, "") : "";
        const tag = r.cls === "tests" && CONNECTING_HELPERS.has(helper) ? "CONNECTING-HELPER" : r.cls;
        loaderTargets.push(`${m} ${tag} ${a0.text}${n.arguments.length > 1 ? " +factory" : ""}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
}
const tally = (m: Map<string, number> | Map<number, number>) => [...m].sort((a, b) => Number(b[1]) - Number(a[1])).map(([k, v]) => `${k}=${v}`).join(" ");
console.log(`(a) non-literal specifiers in import()/require(): ${nonLiteral.length}`);
for (const x of nonLiteral) console.log(`    ${x}`);
console.log(`(b) connect sites: ${sites}; arity ${tally(arity)}`);
console.log(`    outer option keys: ${tally(outerKeys)}`);
console.log(`    connection sub-keys: ${tally(connKeys)}`);
console.log(`    non-plain shapes (spread/computed/shorthand/identifier/third arg): ${nonPlain.length}`);
for (const x of nonPlain) console.log(`    ${x}`);
console.log(`(c) vi.<member>(<literal>) calls: ${tally(loaders)}`);
const byTag = new Map<string, number>();
for (const t of loaderTargets) { const k = t.split(" ").slice(0, 2).join(" "); byTag.set(k, (byTag.get(k) ?? 0) + 1); }
console.log(`    by member and target class: ${tally(byTag)}`);
for (const t of loaderTargets.filter((t) => t.includes("CONNECTING-HELPER") || t.includes(" tests "))) console.log(`    ${t}`);
