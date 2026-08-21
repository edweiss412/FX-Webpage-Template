// Population re-probe for BL-DESTRUCTIVE-GUARD-DISCOVERY-BY-CONNECTION (rule 337: replay before spec).
// Run from the arc worktree root: pnpm tsx <this file>
// Derives, per file under tests/:
//   - does it import the postgres driver (default binding)?
//   - does it CALL the driver (a connection-opening site)?
//   - which URL expressions feed those calls (env var names seen in the file)?
//   - does it call assertLocalDbUrl / assertLocalDbUrlIfSet?
//   - which tests/ helper modules does it import that themselves call the driver (helper graph)?
// Also replays the row's two incidents against the shipped discovery patterns and analyzer.
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { DESTRUCTIVE_STATEMENT_PATTERNS } from "../../../../../../tests/db/_destructiveStatements.ts";
import { analyseDestructiveFile } from "../../../../../../tests/db/_destructiveFileAnalysis.ts";
import { stripCommentsForFile, stripSqlComments } from "../../../../../../tests/_shared/stripComments.ts";

const ROOT = process.cwd();
const TESTS = join(ROOT, "tests");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "__generated__") continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(ts|mts|cts|tsx)$/.test(e)) out.push(f);
  }
  return out;
}

type Row = {
  rel: string;
  driverDefault: string[]; // default import bindings of "postgres"
  driverOtherImport: boolean; // named/namespace/dynamic import of postgres
  connects: number; // calls of a default driver binding
  guardCalls: number; // assertLocalDbUrl(...) / assertLocalDbUrlIfSet(...)
  envVars: string[]; // process.env.X names seen
  helperImports: string[]; // tests/ modules imported (relative or @/tests)
  sqlUnqualifiedDestructive: string[]; // unqualified destructive names inside string/template literals
};

const DESTRUCTIVE = ["reset_validation_data", "prune_sync_log", "prune_app_events"];

function analyse(file: string): Row {
  const src = readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const row: Row = {
    rel: relative(ROOT, file),
    driverDefault: [],
    driverOtherImport: false,
    connects: 0,
    guardCalls: 0,
    envVars: [],
    helperImports: [],
    sqlUnqualifiedDestructive: [],
  };
  const env = new Set<string>();
  const helpers = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      if (spec === "postgres") {
        // r1 F3: a `import type postgres from "postgres"` clause is a TYPE, not an acquisition.
        if (st.importClause?.name && !st.importClause.isTypeOnly) row.driverDefault.push(st.importClause.name.text);
        if (st.importClause?.namedBindings) row.driverOtherImport = true;
      }
      let resolved: string | null = null;
      if (spec.startsWith(".")) resolved = relative(ROOT, resolve(dirname(file), spec));
      else if (spec.startsWith("@/tests/")) resolved = spec.slice(2);
      if (resolved && resolved.startsWith("tests/")) helpers.add(resolved.replace(/\.(ts|mts|tsx)$/, ""));
    }
  }
  const drv = new Set(row.driverDefault);
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const c = n.expression.text;
      if (drv.has(c)) row.connects++;
      if (c === "assertLocalDbUrl" || c === "assertLocalDbUrlIfSet") row.guardCalls++;
    }
    if (ts.isCallExpression(n) && ts.isImportKeyword(n.expression) && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === "postgres") row.driverOtherImport = true;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "require" && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === "postgres") row.driverOtherImport = true;
    if (ts.isPropertyAccessExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "process" && n.expression.name.text === "env") env.add(n.name.text);
    if (ts.isElementAccessExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "process" && n.expression.name.text === "env" && ts.isStringLiteral(n.argumentExpression)) env.add(n.argumentExpression.text);
    if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n)) {
      const t = stripSqlComments(n.text);
      for (const name of DESTRUCTIVE) {
        const re = new RegExp(`(?<![a-z_.\\w"])${name}\\s*\\(`, "i");
        const quoted = new RegExp(`"public"\\s*\\.\\s*"${name}"\\s*\\(`, "i");
        if (re.test(t) || quoted.test(t)) row.sqlUnqualifiedDestructive.push(t.slice(0, 80).replace(/\s+/g, " "));
      }
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  row.envVars = [...env].filter((v) => /DATABASE|SUPABASE|PG|DB_URL|LOCAL/.test(v)).sort();
  row.helperImports = [...helpers].sort();
  return row;
}

const files = walk(TESTS).sort();
const rows = files.map(analyse);
const byRel = new Map(rows.map((r) => [r.rel.replace(/\.(ts|mts|tsx)$/, ""), r]));

// helper graph: a module is a CONNECTING HELPER if it is not a *.test.* file and connects>0,
// or transitively imports one (fixpoint).
const connectingHelpers = new Set<string>();
// r1 F3: a HELPER is a non-test, non-spec module; `.spec.ts` files are Playwright consumers.
const isSuiteFile = (rel: string): boolean => /\.(test|spec)\.(ts|mts|tsx)$/.test(rel);
for (const r of rows) if (r.connects > 0 && !isSuiteFile(r.rel)) connectingHelpers.add(r.rel.replace(/\.(ts|mts|tsx)$/, ""));
let changed = true;
while (changed) {
  changed = false;
  for (const r of rows) {
    const key = r.rel.replace(/\.(ts|mts|tsx)$/, "");
    if (connectingHelpers.has(key) || isSuiteFile(r.rel)) continue;
    if (r.helperImports.some((h) => connectingHelpers.has(h))) { connectingHelpers.add(key); changed = true; }
  }
}

const direct = rows.filter((r) => r.connects > 0);
const viaHelper = rows.filter((r) => r.connects === 0 && r.helperImports.some((h) => connectingHelpers.has(h)));
const importOnly = rows.filter((r) => r.driverDefault.length > 0 && r.connects === 0 && !r.helperImports.some((h) => connectingHelpers.has(h)));
const otherImport = rows.filter((r) => r.driverOtherImport);

console.log(`files scanned under tests/: ${rows.length}`);
console.log(`default-imports postgres (value, not type-only): ${rows.filter((r) => r.driverDefault.length > 0).length}`);
console.log(`non-default import of postgres (named/ns/dynamic/require): ${otherImport.length}`);
for (const r of otherImport) console.log(`   other-import: ${r.rel}`);
console.log(`CALLS the driver directly (connection sites): ${direct.length}  (total connect calls ${direct.reduce((a, r) => a + r.connects, 0)})`);
console.log(`connecting HELPER modules (non-test, direct or transitive): ${connectingHelpers.size}`);
for (const h of [...connectingHelpers].sort()) console.log(`   helper: ${h}`);
console.log(`files connecting ONLY via a helper: ${viaHelper.length}`);
console.log(`import driver but never call it nor a connecting helper: ${importOnly.length}`);
for (const r of importOnly) console.log(`   import-only: ${r.rel}`);

const opens = [...direct, ...viaHelper];
const guarded = opens.filter((r) => r.guardCalls > 0);
const unguarded = opens.filter((r) => r.guardCalls === 0);
console.log(`\nCONNECTION-OPENING files (direct or via helper): ${opens.length}`);
console.log(`  call a loopback guard: ${guarded.length}`);
console.log(`  no guard call: ${unguarded.length}`);
const byEnv = new Map<string, number>();
for (const r of unguarded) { const k = r.envVars.join(",") || "(no env read in file)"; byEnv.set(k, (byEnv.get(k) ?? 0) + 1); }
console.log(`  unguarded, by env vars read in-file:`);
for (const [k, v] of [...byEnv].sort((a, b) => b[1] - a[1])) console.log(`    ${v.toString().padStart(3)}  ${k}`);
console.log(`\n  unguarded file list (rel | connects | env | helpers):`);
for (const r of unguarded) console.log(`    ${r.rel} | ${r.connects} | ${r.envVars.join(",") || "-"} | ${r.helperImports.filter((h) => connectingHelpers.has(h)).join(",") || "-"}`);

// Incident replay: unqualified / quoted destructive spellings live in the corpus?
const live = rows.filter((r) => r.sqlUnqualifiedDestructive.length > 0);
console.log(`\nINCIDENT REPLAY — live literals with unqualified or quoted-qualified destructive calls: ${live.length}`);
for (const r of live) for (const s of r.sqlUnqualifiedDestructive) console.log(`    ${r.rel}: ${s}`);

// Incident replay against the shipped discovery patterns (constructed, per the row's own text).
const pats = Object.values(DESTRUCTIVE_STATEMENT_PATTERNS);
const hit = (s: string) => pats.some((re) => re.test(s) || re.test(stripSqlComments(s)));
const cases = [
  `select public.prune_sync_log()`,
  `select prune_sync_log()`,
  `select "public"."prune_sync_log"()`,
  `select PUBLIC.Prune_Sync_Log()`,
  `select public .prune_sync_log()`,
  `select reset_validation_data()`,
  `select "public".reset_validation_data()`,
];
console.log(`\nshipped DISCOVERY_PATTERNS on constructed spellings:`);
for (const c of cases) console.log(`    ${hit(c) ? "DISCOVERED" : "not discovered"}  ${c}`);

// Positive control: the fixture file that IS discovered today.
const control = "tests/db/syncLogIndexesAndPrune.db.test.ts";
const csrc = readFileSync(join(ROOT, control), "utf8");
const js = stripCommentsForFile(csrc, control);
console.log(`\ncontrol ${control} discovered today: ${pats.some((re) => re.test(js) || re.test(stripSqlComments(js)))}`);
const probeFile = `import postgres from "postgres";\nconst sql = postgres(process.env.TEST_DATABASE_URL!);\nawait sql.unsafe("select prune_sync_log()");\n`;
console.log(`constructed unqualified file: discovered=${pats.some((re) => re.test(probeFile))}; analyzer verdict if it WERE discovered: ${JSON.stringify(analyseDestructiveFile("tests/db/_probe.test.ts", probeFile))}`);
