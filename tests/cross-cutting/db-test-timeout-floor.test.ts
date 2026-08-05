import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import vitestConfig from "@/vitest.config";
import { REPO_ALIAS, TEST_TIMEOUT_MS } from "@/vitest.projects";

// Structural guard for BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE.
//
// DB-touching tests shell out to psql or drive a real local Supabase. On a
// 2-core CI runner under shard load those round-trips are occasionally slow
// enough to blow a wall-clock budget, and the failure is a TIMEOUT rather than
// an assertion — the `unit-suite` gate goes red on a test that is not broken.
// Several independent budgets govern that, and fixing only one leaves the flake:
//
//   1. `testTimeout` / `hookTimeout`. Vitest's defaults are 5s and 10s. A
//      psql-per-assertion test plus an `afterEach` cleanup query fits in 5s on
//      a quiet box and does not fit reliably on a loaded one. Pinned at the
//      ROOT of vitest.config.ts, which both projects inherit via
//      `extends: true`, so it covers every DB-touching file at once — the 242
//      this guard selects today plus any added later. A file that needs
//      MORE (the 90s doc-scan in tests/scripts/validation-report-fixtures)
//      still raises its own; `vi.setConfig` wins over the config file.
//
//   2. `vi.waitFor`'s OWN timeout, which defaults to 1000ms and is NOT derived
//      from `testTimeout` — raising the test budget to 30s leaves a waitFor
//      polling a DB round-trip with one second to finish. This is what
//      actually flaked: `tests/reports/concurrentRetry.test.ts` waited on a
//      concurrent `submitReport` reaching its mocked `createIssue`.
//
//   3. Every per-test, per-suite, per-hook, and `vi.setConfig` budget, each of
//      which OVERRIDES the root config. A config default is not a floor while
//      any of them can quietly sit below it.
//
// The fix for (2) is not a bigger number. Wall-clock polling for an event the
// test can observe directly is the defect; the mock resolves a deferred when
// it is ENTERED, and the test awaits that. So this guard bans `vi.waitFor` in
// DB-touching files outright rather than requiring an explicit timeout — a
// generous timeout would pass a rule about timeouts while keeping the polling.
//
// Scope is deliberately DB-touching files only. `vi.waitFor` against a React
// state flush (tests/components, tests/admin) polls an in-process microtask
// queue with no I/O in it, and those call sites are fine.
//
// Cost of the floor, stated plainly: a genuinely hung DB test now burns 30s
// before failing instead of 5s. That is the right trade for a gate whose other
// failure mode is going red on healthy code.
//
// Known limit, recorded so nobody reads the ban as total: the vi.waitFor scan is
// textual, so an ALIASED waitFor (`const wf = vi.waitFor`) escapes it. There are
// zero such aliases across the corpus's 1,742 imports, and closing it would mean
// resolving arbitrary re-bindings of a member expression for a spelling nobody
// writes. The budget assertion below is the AST-based one; this scan is not.

const ROOT = process.cwd();
const TIMEOUT_FLOOR_MS = 30_000;
const EXEMPT_MARKER = "timeout-floor-exempt:";

// Evidence that a file reaches a real database, matched against COMMENT-STRIPPED
// source. Matching raw text instead selected an explicitly pure test on the word
// "psql" in its prose and a meta-test on the string "@supabase/supabase-js" it
// scans for, and an over-selected file cannot use vi.waitFor even where doing so
// is correct — a guard that blocks legitimate code gets switched off.
const DB_MARKERS = [
  /\brunPsql\b/,
  /TEST_DATABASE_URL/,
  /\bpostgres\(/,
  /\bcreateClient\s*\(/,
  /["']psql["']/,
];

// A value import of one of these means the file talks to a database, even with
// no other marker. Type-only imports do not count — they vanish at runtime.
const DB_MODULES = [/@supabase\/supabase-js/, /^postgres$/];

const rootTest = (vitestConfig as { test?: { testTimeout?: number; hookTimeout?: number } }).test;

// The resolved config THIS worker runs under. Unlike the authored config it
// reflects CLI flags and env overrides, so a `--testTimeout=1000` in some
// launcher cannot pass this guard on the strength of the file alone.
const runtimeConfig = (
  globalThis as Record<string, unknown> & {
    __vitest_worker__?: { config?: { testTimeout?: number; hookTimeout?: number } };
  }
).__vitest_worker__?.config;

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && /\.test\.tsx?$/.test(ent.name)) out.push(full);
    }
  };
  walk(join(ROOT, "tests"));
  return out;
}

// Selection is TRANSITIVE through test-local imports, not a list of marker
// strings that must appear in the test file itself. A suite that does all its
// database work through `@/tests/db/_b2Helpers` or `@/tests/sync/_holdAwareTestkit`
// carries no marker of its own, and a lexical-only selector silently exempted
// five such files — the "new DB file fails by default" property did not hold for
// any suite that factored its psql calls into a helper. Following the imports
// closes that by construction rather than by naming today's helpers.
const dbFileCache = new Map<string, boolean>();

// Every module specifier the file pulls in AT RUNTIME. `from "…"` alone missed
// four executable forms — a bare side-effect import, `await import()`,
// `require()`, and `import x = require()` — each of which can run a helper's
// psql at module load. `import type` is deliberately excluded: it is erased, so
// a type-only reference to a DB helper is not database work, and counting it
// selected files that touch no database.
function runtimeSpecifiers(code: string): string[] {
  // Erase `import type … from "x"` STATEMENTS, then scan what is left. An
  // earlier version instead collected type-only specifiers into a set and
  // filtered every occurrence of them, which dropped a module imported BOTH
  // ways — the split form
  //
  //   import type { SeededShow } from "@/tests/db/_b2Helpers";
  //   import { sqlClient } from "@/tests/db/_b2Helpers";
  //
  // is ordinary here, and it made a genuinely DB-touching suite invisible. An
  // inline `import { type A, b }` is a value import and is correctly kept.
  const runtime = code.replace(/\bimport\s+type\b[^;]*?from\s*["'][^"']+["']\s*;?/g, "");
  const out: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /^\s*import\s+["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const m of runtime.matchAll(pattern)) out.push(m[1]!);
  }
  return out;
}

function resolveTestModule(file: string, spec: string): string | null {
  if (!spec.startsWith("@/tests/") && !spec.startsWith(".")) return null;
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(dirname(file), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isDbTouching(file: string, seen = new Set<string>()): boolean {
  const cached = dbFileCache.get(file);
  if (cached !== undefined) return cached;
  if (seen.has(file)) return false;
  seen.add(file);

  // `foo.db.test.ts` says so in its own name.
  if (/\.db\.test\.tsx?$/.test(file)) {
    dbFileCache.set(file, true);
    return true;
  }

  const code = stripCommentsForFile(readFileSync(file, "utf8"), file);
  const specifiers = runtimeSpecifiers(code);

  const verdict =
    DB_MARKERS.some((marker) => marker.test(code)) ||
    specifiers.some((spec) => DB_MODULES.some((mod) => mod.test(spec))) ||
    specifiers.some((spec) => {
      const dep = resolveTestModule(file, spec);
      return dep !== null && isDbTouching(dep, seen);
    });

  dbFileCache.set(file, verdict);
  return verdict;
}

// Budgets are read from the TypeScript AST, not from source text. The first
// version of this guard used a regex, matched only the options-bag spelling,
// and missed all ten live cases of vitest's OTHER supported form — the trailing
// numeric argument, `test(name, fn, 15000)`. A regex able to see that one has to
// skip a function body to reach the argument after it, which is precisely what
// regex cannot do. Reading argument POSITIONS also means `sql.end({ timeout: 5 })`,
// postgres.js `idle_timeout`/`connect_timeout`, and `execFileSync` option bags
// are structurally not budgets, rather than exceptions a pattern must dodge.
//
// A budget the walker cannot resolve to a number is reported as UNRESOLVABLE
// rather than skipped: `postgrest-dml-lockdown.test.ts` passes one as a named
// constant (`HTTP_TEST_TIMEOUT_MS`, folding to 35_000 — above the floor), and a
// guard that ignores what it cannot read would go on passing if that constant
// were later edited below the floor.
type Budget = { line: number; ms: number | null; text: string };

// Vitest's budget-bearing API surface. Enumerating three names covered the two
// spellings in this repo and nothing else — `suite`, `bench`, the around/on
// hooks, and an `it.extend`-derived test all took a budget the walker never
// looked at. These are the vitest exports that accept one; alias and namespace
// resolution below means each is matched however it is spelled at the call site.
const BUDGET_APIS = new Set([
  "test",
  "it",
  "describe",
  "suite",
  "bench",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
  "aroundEach",
  "aroundAll",
  "onTestFailed",
  "onTestFinished",
]);

function testBudgets(file: string, body: string): Budget[] {
  const source = ts.createSourceFile(
    file,
    body,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: Budget[] = [];

  // MODULE-LEVEL consts only. A scope-blind collector lets a nested `const MS`
  // overwrite a top-level one and report the wrong number — a reviewer's mutant
  // shadowed a 1_000 budget with an unrelated nested 40_000 and passed. A
  // budget that depends on a nested binding folds to null and fails loudly
  // instead, which is the safe direction.
  const consts = new Map<string, ts.Expression>();
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer)
        consts.set(decl.name.text, decl.initializer);
    }
  }

  // `x as const`, `x satisfies T`, `(x)`, and `x!` are type-level wrappers with
  // no runtime effect. Not seeing through them let `const opts = { timeout: 1000 }
  // as const` — a spelling already used in DB tests here — hide a budget.
  const unwrap = (expr: ts.Expression): ts.Expression => {
    let cur = expr;
    for (;;) {
      if (
        ts.isAsExpression(cur) ||
        ts.isSatisfiesExpression(cur) ||
        ts.isParenthesizedExpression(cur) ||
        ts.isNonNullExpression(cur) ||
        ts.isTypeAssertionExpression(cur)
      ) {
        cur = cur.expression;
        continue;
      }
      return cur;
    }
  };

  const fold = (raw: ts.Expression, seen = new Set<string>()): number | null => {
    const expr = unwrap(raw);
    if (ts.isNumericLiteral(expr)) return Number(expr.getText(source).replaceAll("_", ""));
    if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken) {
      const inner = fold(expr.operand, seen);
      return inner === null ? null : -inner;
    }
    if (ts.isIdentifier(expr)) {
      if (seen.has(expr.text)) return null;
      const bound = consts.get(expr.text);
      return bound ? fold(bound, new Set(seen).add(expr.text)) : null;
    }
    if (ts.isBinaryExpression(expr)) {
      const left = fold(expr.left, seen);
      const right = fold(expr.right, seen);
      if (left === null || right === null) return null;
      switch (expr.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken:
          return left + right;
        case ts.SyntaxKind.MinusToken:
          return left - right;
        case ts.SyntaxKind.AsteriskToken:
          return left * right;
        default:
          return null;
      }
    }
    return null;
  };

  // Local names for vitest's budget-bearing APIs: the plain import, a renamed
  // one (`import { it as check }`), and a module-level re-binding — either
  // direct (`const check = test`) or derived (`const myTest = it.extend({…})`).
  //
  // Alias collection is MODULE-LEVEL ONLY. Collecting from nested scopes but
  // storing globally meant a `const check = test` inside one function made an
  // unrelated `check(a, b, c)` in another function look like a test call, which
  // is a false positive on code that is not a test at all.
  const budgetNames = new Set(BUDGET_APIS);
  // Does this initializer bind one of vitest's budget-bearing functions? Covers
  // a direct alias, a modifier or `it.extend(...)` chain, and — the form this
  // repo actually uses at five DB suites — a CONDITIONAL one:
  //
  //   const maybe = dbUp ? describe : describe.skip;
  //   maybe("DB suite", fn, 1_000);
  //
  // Either branch being a test function is enough: the budget is live whichever
  // way the condition falls.
  const bindsBudgetApi = (expr: ts.Expression): boolean => {
    const node = unwrap(expr);
    if (ts.isIdentifier(node)) return budgetNames.has(node.text);
    if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
      let base: ts.Node = node;
      while (ts.isPropertyAccessExpression(base) || ts.isCallExpression(base)) {
        base = base.expression;
      }
      return ts.isIdentifier(base) && budgetNames.has(base.text);
    }
    if (ts.isConditionalExpression(node)) {
      return bindsBudgetApi(node.whenTrue) || bindsBudgetApi(node.whenFalse);
    }
    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      if (
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.QuestionQuestionToken ||
        kind === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        return bindsBudgetApi(node.left) || bindsBudgetApi(node.right);
      }
    }
    return false;
  };

  const namespaces = new Set<string>();
  const viNames = new Set(["vi", "vitest"]);
  for (const stmt of source.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier.getText(source).includes("vitest")) {
      const bindings = stmt.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const spec of bindings.elements) {
          const original = spec.propertyName?.text ?? spec.name.text;
          if (BUDGET_APIS.has(original)) budgetNames.add(spec.name.text);
          if (original === "vi") viNames.add(spec.name.text);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        // import * as v from "vitest" → v.test(…)
        namespaces.add(bindings.name.text);
      }
      continue;
    }
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      if (bindsBudgetApi(decl.initializer)) budgetNames.add(decl.name.text);
    }
  }

  // The vitest API a call reaches, through property access and call chains, so
  // `test`, `test.skipIf(x)`, `it.each(rows)`, `describe.sequential`, and the
  // namespace form `v.test` all resolve to their API name.
  const apiName = (expr: ts.Expression): string | null => {
    const chain: string[] = [];
    let cur: ts.Node = expr;
    for (;;) {
      if (ts.isIdentifier(cur)) {
        // Namespace call: the property directly after the namespace is the API.
        if (namespaces.has(cur.text)) return chain.at(-1) ?? null;
        return cur.text;
      }
      if (ts.isPropertyAccessExpression(cur)) {
        chain.push(cur.name.text);
        cur = cur.expression;
        continue;
      }
      if (ts.isCallExpression(cur)) {
        cur = cur.expression;
        continue;
      }
      return null;
    }
  };

  const rootName = (expr: ts.Expression): string | null => {
    let cur: ts.Node = expr;
    for (;;) {
      if (ts.isIdentifier(cur)) return cur.text;
      if (ts.isPropertyAccessExpression(cur) || ts.isCallExpression(cur)) {
        cur = cur.expression;
        continue;
      }
      return null;
    }
  };

  // `timeout`, `"timeout"`, and `["timeout"]` are the same key. Reading
  // `name.getText()` keeps the quotes and misses the last two.
  const keyOf = (name: ts.PropertyName): string | null => {
    if (ts.isIdentifier(name)) return name.text;
    if (ts.isStringLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
      return name.expression.text;
    }
    return null;
  };

  const record = (node: ts.Node, ms: number | null): void => {
    found.push({
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      ms,
      text: node.getText(source).slice(0, 60),
    });
  };

  const readOptionsBag = (arg: ts.Expression, keys: Set<string>): void => {
    // A named options object — `const opts = { timeout: 1000 }; test(n, opts, fn)`
    // — is the same budget written one indirection away.
    let bag: ts.Expression = unwrap(arg);
    if (ts.isIdentifier(bag)) {
      const bound = consts.get(bag.text);
      if (bound) bag = unwrap(bound);
    }
    if (!ts.isObjectLiteralExpression(bag)) return;
    for (const prop of bag.properties) {
      // A spread could carry a budget from anywhere; unreadable here.
      if (ts.isSpreadAssignment(prop)) {
        record(prop, null);
        continue;
      }
      // Shorthand `{ timeout }` takes its value from the surrounding scope.
      if (ts.isShorthandPropertyAssignment(prop) && keys.has(prop.name.text)) {
        record(prop, fold(prop.name));
        continue;
      }
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = keyOf(prop.name);
      if (key === null || !keys.has(key)) continue;
      record(prop.initializer, fold(prop.initializer));
    }
  };

  // Is this trailing argument a budget, or the test callback? A callback is
  // either written inline or resolves to a non-numeric binding; anything else
  // is treated as a budget, so an unreadable one is reported rather than
  // mistaken for a callback.
  const isCallbackNotBudget = (raw: ts.Expression): boolean => {
    const arg = unwrap(raw);
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return true;
    if (ts.isIdentifier(arg)) {
      const bound = consts.get(arg.text);
      if (bound) {
        const inner = unwrap(bound);
        if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) return true;
      }
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = rootName(node.expression);

      // vi.setConfig({ testTimeout, hookTimeout }) — beats the root config for
      // the whole file.
      if (
        name !== null &&
        (viNames.has(name) || namespaces.has(name)) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "setConfig"
      ) {
        for (const arg of node.arguments) {
          readOptionsBag(arg, new Set(["testTimeout", "hookTimeout"]));
        }
      }

      const api = apiName(node.expression);
      const isBudgetApi = api !== null && budgetNames.has(api);

      if (isBudgetApi) {
        for (const arg of node.arguments) readOptionsBag(arg, new Set(["timeout"]));
        // The trailing-argument overload — `test(name, fn, 15000)` and the hook
        // form `beforeEach(fn, 15000)`. A budget always follows the callback, so
        // it needs at least two arguments; anything that resolves to a function
        // is the callback, not a number.
        const last = node.arguments.at(-1);
        if (last && node.arguments.length >= 2 && !isCallbackNotBudget(last)) {
          record(last, fold(last));
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

describe("DB-touching tests are not exposed to wall-clock timeout flake", () => {
  it("the authored root config pins a timeout floor both projects inherit", () => {
    expect(
      rootTest?.testTimeout,
      "vitest.config.ts must set a root-level testTimeout — the 5s default times out " +
        "psql-driven tests under CI-runner load",
    ).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
    expect(
      rootTest?.hookTimeout,
      "vitest.config.ts must set a root-level hookTimeout — beforeEach/afterEach fixture " +
        "cleanup runs the same psql round-trips the tests do",
    ).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
  });

  it("the RESOLVED config this run is using honors the floor", () => {
    expect(
      runtimeConfig,
      "expected vitest's worker context to expose the resolved config; if vitest changed " +
        "this internal, replace it with another resolved-config source rather than falling " +
        "back to the authored config, which cannot see CLI overrides",
    ).toBeDefined();
    expect(runtimeConfig!.testTimeout).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
    expect(runtimeConfig!.hookTimeout).toBeGreaterThanOrEqual(TIMEOUT_FLOOR_MS);
  });

  it("no DB-touching test polls on wall-clock time via vi.waitFor", () => {
    const offenders: string[] = [];
    for (const file of testFiles()) {
      if (!isDbTouching(file)) continue;
      const body = readFileSync(file, "utf8");
      // Comments stripped through the single shared module (spec §4), so a
      // `vi.waitFor` named in prose — including this file's own header — is not
      // read as a call site.
      const code = stripCommentsForFile(body, file);
      const rawLines = body.split("\n");
      const strippedLines = code.split("\n");

      // Transitive selection is deliberately generous: importing a helper that
      // touches a database counts, because the alternative — requiring the
      // marker in the test file itself — silently exempted five real DB suites.
      // The cost is that a file doing no database work of its own can be
      // selected through a helper, and a ban it cannot opt out of is a guard
      // people delete rather than satisfy. So the same comment-only marker
      // exempts a call site, with a reason recorded next to it.
      code.split("\n").forEach((line, index) => {
        if (!/vi\.waitFor\s*\(/.test(line)) return;
        const exempt =
          (rawLines[index]?.includes(EXEMPT_MARKER) ?? false) &&
          !(strippedLines[index]?.includes(EXEMPT_MARKER) ?? false);
        if (!exempt) offenders.push(`${relative(ROOT, file)}:${index + 1}`);
      });
    }

    expect(
      offenders,
      "vi.waitFor's own timeout defaults to 1000ms and is independent of testTimeout, so a " +
        "DB round-trip polled this way flakes no matter how high the test budget goes. Await " +
        "an explicit barrier the mock resolves instead — see awaitCreateIssueEntered in " +
        "tests/reports/_createIssueBarrier.ts",
    ).toEqual([]);
  });

  it("no DB-touching test overrides the floor downward", () => {
    const offenders: string[] = [];
    for (const file of testFiles()) {
      if (!isDbTouching(file)) continue;
      const body = readFileSync(file, "utf8");
      // The marker counts only inside a COMMENT. Testing the raw line let it be
      // claimed from a test TITLE — `test("timeout-floor-exempt: …", …)` — which
      // is a bypass anyone could hit by accident. A line whose raw text has the
      // marker and whose comment-stripped text does not is a real comment.
      const rawLines = body.split("\n");
      const strippedLines = stripCommentsForFile(body, file).split("\n");
      const exempt = (line: number): boolean =>
        (rawLines[line - 1]?.includes(EXEMPT_MARKER) ?? false) &&
        !(strippedLines[line - 1]?.includes(EXEMPT_MARKER) ?? false);

      for (const budget of testBudgets(file, body)) {
        if (budget.ms !== null && budget.ms >= TIMEOUT_FLOOR_MS) continue;
        if (exempt(budget.line)) continue;
        const value = budget.ms === null ? `UNRESOLVABLE (${budget.text})` : `${budget.ms}ms`;
        offenders.push(`${relative(ROOT, file)}:${budget.line} — ${value}`);
      }
    }

    expect(
      offenders,
      "a per-test, per-suite, per-hook, or vi.setConfig budget wins over the config's " +
        "testTimeout, so an override below the floor keeps the exposure the floor exists to " +
        "remove. Every one in this repo was written to RAISE a budget over vitest's old 5s " +
        `default, which the root config now does — drop it, or raise it to at least ` +
        `${TIMEOUT_FLOOR_MS}ms. UNRESOLVABLE means the value could not be read statically; ` +
        `inline it. If a short budget is the POINT of the test, add an inline ` +
        `\`${EXEMPT_MARKER} <reason>\` comment on that line`,
    ).toEqual([]);
  });
});

// --- guard-premise Unit 1 -------------------------------------------------
//
// The alias and the timeouts became ONE definition with two readers, because
// they had already drifted: the mutation harness's per-mutant config carried
// neither, so every suite importing through `@/` failed assertCleanBaseline on
// UNMUTATED source, and vitest's 5_000ms default did the same to any suite with
// a slower test. Spec: docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md
describe("one definition, two readers (guard-premise Unit 1)", () => {
  it("the root config reads the shared timeout rather than its own literal", () => {
    expect(TEST_TIMEOUT_MS).toBe(TIMEOUT_FLOOR_MS);
    expect(rootTest?.testTimeout).toBe(TEST_TIMEOUT_MS);
    expect(rootTest?.hookTimeout).toBe(TEST_TIMEOUT_MS);
  });

  it("the shared alias maps @ to the root it is given", () => {
    expect(REPO_ALIAS("/tmp/anywhere")).toEqual({ "@": "/tmp/anywhere" });
  });
});
