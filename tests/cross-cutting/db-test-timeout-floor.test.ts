import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import vitestConfig from "@/vitest.config";

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
//      `extends: true`, so it covers every DB-touching file at once — the 200
//      that ride the defaults today plus any added later. A file that needs
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

const ROOT = process.cwd();
const TIMEOUT_FLOOR_MS = 30_000;
const EXEMPT_MARKER = "timeout-floor-exempt:";

// Lexical evidence that a file reaches a real database.
const DB_MARKERS = [
  /\brunPsql\b/,
  /TEST_DATABASE_URL/,
  /\bpostgres\(/,
  /@supabase\/supabase-js/,
  /\bpsql\b/,
];

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

function importedTestModules(file: string, body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/from\s+["'](@\/tests\/[^"']+|\.\.?\/[^"']+)["']/g)) {
    const spec = m[1]!;
    const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(dirname(file), spec);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (existsSync(candidate)) {
        out.push(candidate);
        break;
      }
    }
  }
  return out;
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

  const body = readFileSync(file, "utf8");
  if (DB_MARKERS.some((marker) => marker.test(body))) {
    dbFileCache.set(file, true);
    return true;
  }
  const viaImport = importedTestModules(file, body).some((dep) => isDbTouching(dep, seen));
  dbFileCache.set(file, viaImport);
  return viaImport;
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

const HOOKS = new Set(["beforeEach", "afterEach", "beforeAll", "afterAll"]);

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

  const fold = (expr: ts.Expression, seen = new Set<string>()): number | null => {
    if (ts.isNumericLiteral(expr)) return Number(expr.getText(source).replaceAll("_", ""));
    if (ts.isParenthesizedExpression(expr)) return fold(expr.expression, seen);
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

  // Vitest's entry points plus every local alias of one: a renamed import
  // (`import { it as check }`) and a re-binding (`const check = test`).
  const testNames = new Set(["test", "it", "describe"]);
  const collectAliases = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.getText(source).includes("vitest") &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const spec of node.importClause.namedBindings.elements) {
        const original = spec.propertyName?.text;
        if (original && (testNames.has(original) || HOOKS.has(original))) {
          if (HOOKS.has(original)) HOOKS.add(spec.name.text);
          else testNames.add(spec.name.text);
        }
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer)
    ) {
      if (testNames.has(node.initializer.text)) testNames.add(node.name.text);
      if (HOOKS.has(node.initializer.text)) HOOKS.add(node.name.text);
    }
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(source);

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
    if (!ts.isObjectLiteralExpression(arg)) return;
    for (const prop of arg.properties) {
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
  const isCallbackNotBudget = (arg: ts.Expression): boolean => {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return true;
    if (ts.isIdentifier(arg)) {
      const bound = consts.get(arg.text);
      if (bound && (ts.isArrowFunction(bound) || ts.isFunctionExpression(bound))) return true;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = rootName(node.expression);

      // vi.setConfig({ testTimeout, hookTimeout }) — beats the root config for
      // the whole file.
      if (
        name === "vi" &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "setConfig"
      ) {
        for (const arg of node.arguments) {
          readOptionsBag(arg, new Set(["testTimeout", "hookTimeout"]));
        }
      }

      if (name !== null && testNames.has(name)) {
        for (const arg of node.arguments) readOptionsBag(arg, new Set(["timeout"]));
        // The trailing-argument overload: test(name, fn, 15000). A budget only
        // appears in third position or later, after the callback.
        const last = node.arguments.at(-1);
        if (last && node.arguments.length >= 3 && !isCallbackNotBudget(last))
          record(last, fold(last));
      }

      // Hooks take their own trailing budget: beforeEach(fn, 15000).
      if (name !== null && HOOKS.has(name)) {
        const last = node.arguments.at(-1);
        if (last && node.arguments.length >= 2 && !isCallbackNotBudget(last))
          record(last, fold(last));
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
      if (/vi\.waitFor\s*\(/.test(code)) offenders.push(relative(ROOT, file));
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
      const rawLines = body.split("\n");
      for (const budget of testBudgets(file, body)) {
        if (budget.ms !== null && budget.ms >= TIMEOUT_FLOOR_MS) continue;
        if (rawLines[budget.line - 1]?.includes(EXEMPT_MARKER)) continue;
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
