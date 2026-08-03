import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

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
// Two independent budgets govern that, and fixing only one leaves the flake:
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
// A config default is not a floor on its own. A per-test or per-suite
// `{ timeout: N }` option wins over `runner.config.testTimeout`, so a file
// carrying one BELOW the floor keeps its old exposure while this guard's other
// assertions stay green. Every such override in the repo was written to RAISE a
// budget over the old 5s default, which the floor now does better; left alone
// they would silently become CAPS. So they are banned below the floor too, with
// an inline `timeout-floor-exempt: <reason>` escape for a test that genuinely
// wants a short budget (asserting something completes quickly, say).

const ROOT = process.cwd();
const TIMEOUT_FLOOR_MS = 30_000;

// Any of these in a test file means it reaches a real database.
const DB_MARKERS = [/\brunPsql\b/, /TEST_DATABASE_URL/, /\bpostgres\(/, /_dbHelpers/];

const rootTest = (vitestConfig as { test?: { testTimeout?: number; hookTimeout?: number } }).test;

// The resolved config THIS worker runs under. Unlike the authored config it
// reflects CLI flags and env overrides, so a `--testTimeout=1000` in some
// launcher cannot pass this guard on the strength of the file alone.
const runtimeConfig = (
  globalThis as Record<string, unknown> & {
    __vitest_worker__?: { config?: { testTimeout?: number; hookTimeout?: number } };
  }
).__vitest_worker__?.config;

const EXEMPT_MARKER = "timeout-floor-exempt:";

// Test budgets are found through the TypeScript AST, not a regex over source.
// The first version of this guard did use a regex, matched only the options-bag
// spelling, and missed all ten live cases of vitest's OTHER supported form — the
// trailing numeric argument, `test(name, fn, 15000)`, which vitest converts to
// `options.timeout` just the same. A regex able to see that one has to skip a
// function body to reach the argument after it, which is precisely what regex
// cannot do. The AST reads both spellings for free and, because it looks at
// argument POSITIONS of a test call rather than at the text `timeout:`, it also
// cannot mistake `sql.end({ timeout: 5 })`, postgres.js
// `idle_timeout`/`connect_timeout`, or an `execFileSync` options bag for a test
// budget — the over-selection risk the regex had to enumerate its way around.
//
// A budget whose value the walker cannot resolve is reported as UNRESOLVABLE
// rather than skipped. `postgrest-dml-lockdown.test.ts` passes a named constant
// (`HTTP_TEST_TIMEOUT_MS`, 35_000 — above the floor), and a guard that silently
// ignores what it cannot read would keep passing if someone later edited that
// constant below the floor. Same-file numeric consts are therefore folded; what
// survives folding fails loudly and can be exempted with a reason.
type Budget = { line: number; ms: number | null; text: string };

function testBudgets(file: string, body: string): Budget[] {
  const source = ts.createSourceFile(
    file,
    body,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: Budget[] = [];

  // Module-level `const NAME = <numeric expr>` bindings, for folding a budget
  // written as a named constant.
  const consts = new Map<string, ts.Expression>();
  const collectConsts = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      consts.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectConsts);
  };
  collectConsts(source);

  // Fold to a number, or null when the value is not statically knowable here.
  // Cycle-guarded: a self-referential const resolves to null rather than
  // recursing forever.
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

  // Vitest's test entry points, plus any local alias of one (`import { it as
  // check }`), so renaming the import does not hide a budget.
  const testNames = new Set(["test", "it", "describe"]);
  const collectAliases = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.getText(source).includes("vitest") &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const spec of node.importClause.namedBindings.elements) {
        if (spec.propertyName && testNames.has(spec.propertyName.text)) {
          testNames.add(spec.name.text);
        }
      }
    }
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(source);

  // The callee's root identifier, through property access and call chains, so
  // `test`, `test.skipIf(x)`, `it.each(rows)`, and `describe.sequential` all
  // resolve to their base name.
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

  const record = (node: ts.Node, ms: number | null): void => {
    found.push({
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      ms,
      text: node.getText(source).slice(0, 60),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = rootName(node.expression);
      if (name !== null && testNames.has(name)) {
        for (const arg of node.arguments) {
          if (!ts.isObjectLiteralExpression(arg)) continue;
          for (const prop of arg.properties) {
            // A spread could carry a timeout from anywhere; unreadable here.
            if (ts.isSpreadAssignment(prop)) record(prop, null);
            if (!ts.isPropertyAssignment(prop)) continue;
            if (prop.name.getText(source) !== "timeout") continue;
            record(prop.initializer, fold(prop.initializer));
          }
        }
        // The numeric-final-argument overload: test(name, fn, 15000). A budget
        // only ever appears in third position or later, after the callback, so
        // a two-argument call's last argument is the callback, not a budget.
        const last = node.arguments.at(-1);
        if (
          last &&
          node.arguments.length >= 3 &&
          !ts.isArrowFunction(last) &&
          !ts.isFunctionExpression(last)
        ) {
          record(last, fold(last));
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

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
      const body = readFileSync(file, "utf8");
      if (!DB_MARKERS.some((marker) => marker.test(body))) continue;
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

  it("no DB-touching test caps itself below the floor with a per-test timeout option", () => {
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const body = readFileSync(file, "utf8");
      if (!DB_MARKERS.some((marker) => marker.test(body))) continue;

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
      "a per-test or per-suite budget — `{ timeout: N }` or the trailing-numeric overload " +
        "`test(name, fn, N)` — wins over the config's testTimeout, so an " +
        "override below the floor keeps the exposure the floor exists to remove. Every one of " +
        "these was written to RAISE a budget over vitest's old 5s default, which the root " +
        `config now does — drop the option, or raise it to at least ${TIMEOUT_FLOOR_MS}ms. If ` +
        `a short budget is the POINT of the test, add an inline \`${EXEMPT_MARKER} <reason>\` ` +
        "comment on that line",
    ).toEqual([]);
  });
});
