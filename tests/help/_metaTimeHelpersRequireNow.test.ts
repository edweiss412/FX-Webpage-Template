/**
 * tests/help/_metaTimeHelpersRequireNow.test.ts
 * (M11 Phase C — R2 structural defense / AC-11.38)
 *
 * Structural meta-test: every exported function in `lib/time/*.ts`
 * (excluding the canonical `now.ts` factory) is FORBIDDEN from declaring
 * any parameter with a wall-clock default (`= new Date()` / `= Date.now()`)
 * and FORBIDDEN from textually invoking `new Date()` / `Date.now()` inside
 * its own body. Helpers may consume wall-clock time only through a
 * required (non-optional, non-defaulted) `now: Date` parameter threaded
 * from a caller that obtained it via `await nowDate()`.
 *
 * Why this exists (R2 finding from M11 Phase C cross-model adversarial review):
 *   The C.4 grep guard (`tests/help/_metaServerTimeGuard.test.ts`) only scans
 *   app/<segment>/ + components/ tree for direct render-side `new Date()` /
 *   `Date.now()`. Helpers in `lib/time/*.ts` whose defaults silently call
 *   `new Date()` bypass that guard, because the call site reads as
 *   `formatRelative(x)` — no wall-clock literal at the render layer. The
 *   R2 instance was `formatRelative` + `relativeDayChip` in lib/time/relative.ts.
 *
 * Per memory `feedback_meta_contract_test_for_recurring_bug_class.md` +
 * `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`:
 * after the second class-sweep iteration on the same vector, ship a
 * structural defense — not another patch. Future additions to `lib/time/`
 * are auto-pinned.
 *
 * Exemption: `lib/time/now.ts` is the canonical time source — it IS the
 * `nowDate()` factory and necessarily falls back to `new Date()` itself.
 *
 * Implementation: TypeScript AST walk via the TS Compiler API (already a
 * transitive dep). Robust against signature reformatting (multi-line
 * parameter lists, default initializer line-wraps, etc.) where a regex
 * would be brittle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const LIB_TIME_DIR = join(process.cwd(), "lib/time");
const EXEMPT_FILES = new Set([
  "now.ts", // canonical time source — IS the nowDate() factory
]);

const WALL_CLOCK_RE = /\bnew Date\(\s*\)|\bDate\.now\(\s*\)/;

type Violation = {
  file: string;
  fn: string;
  reason: string;
};

function checkFunctionLike(
  node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  sf: ts.SourceFile,
  fnName: string,
  filename: string,
  violations: Violation[],
): void {
  // 1. Forbid wall-clock defaults on ANY parameter.
  for (const p of node.parameters) {
    if (!p.initializer) continue;
    const initText = p.initializer.getText(sf);
    if (WALL_CLOCK_RE.test(initText)) {
      const paramName = ts.isIdentifier(p.name) ? p.name.text : "<destructured>";
      violations.push({
        file: filename,
        fn: fnName,
        reason: `parameter \`${paramName}\` has wall-clock default (\`= ${initText.trim()}\`) — must be required (no default)`,
      });
    }
  }

  // 2. Forbid wall-clock calls inside the function body itself.
  const body = node.body ? node.body.getText(sf) : "";
  if (WALL_CLOCK_RE.test(body)) {
    // A helper with a body wall-clock call must have a required `now: Date`
    // parameter, otherwise it has no plumbing to be deterministic. (In
    // practice, a body wall-clock call is itself the violation — but we
    // still surface a precise reason that distinguishes "no `now` plumbing"
    // from "has plumbing but ignored it".)
    const nowParam = node.parameters.find(
      (p) => ts.isIdentifier(p.name) && p.name.text === "now",
    );
    if (!nowParam) {
      violations.push({
        file: filename,
        fn: fnName,
        reason: "function body calls `new Date()` / `Date.now()` and has no `now` parameter — thread `now: Date` from caller",
      });
    } else {
      violations.push({
        file: filename,
        fn: fnName,
        reason: "function body calls `new Date()` / `Date.now()` despite having a `now` parameter — consume `now` instead",
      });
    }
  }

  // 3. If a `now: Date` parameter exists, it must be required and Date-typed.
  const nowParam = node.parameters.find(
    (p) => ts.isIdentifier(p.name) && p.name.text === "now",
  );
  if (nowParam) {
    const typeText = nowParam.type?.getText(sf) ?? "";
    if (!typeText.includes("Date")) {
      violations.push({
        file: filename,
        fn: fnName,
        reason: `\`now\` parameter type must include Date (got: ${typeText || "<no type>"})`,
      });
    }
    if (nowParam.questionToken) {
      violations.push({
        file: filename,
        fn: fnName,
        reason: "`now` parameter is optional (`now?: Date`) — must be required",
      });
    }
    // Default-initializer case is already caught by check #1 above (any
    // wall-clock default), but a non-wall-clock default (e.g.,
    // `now: Date = SOME_CONST`) is still forbidden — defaults defeat the
    // explicit-now-threading contract.
    if (nowParam.initializer) {
      const initText = nowParam.initializer.getText(sf);
      if (!WALL_CLOCK_RE.test(initText)) {
        violations.push({
          file: filename,
          fn: fnName,
          reason: `\`now\` parameter has a default initializer (\`= ${initText.trim()}\`) — must be required`,
        });
      }
    }
  }
}

function collectViolations(): Violation[] {
  const violations: Violation[] = [];
  const entries = readdirSync(LIB_TIME_DIR).filter(
    (f) => /\.ts$/.test(f) && !EXEMPT_FILES.has(f),
  );

  for (const filename of entries) {
    const fullPath = join(LIB_TIME_DIR, filename);
    const src = readFileSync(fullPath, "utf8");
    const sf = ts.createSourceFile(
      fullPath,
      src,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
    );

    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node)) return;
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (!isExported) return;
      const name = node.name?.text ?? "(anonymous)";
      checkFunctionLike(node, sf, name, filename, violations);
    });
  }

  return violations;
}

describe("lib/time/* helpers must require a `now: Date` parameter (R2 structural defense)", () => {
  it("walks lib/time/*.ts (excluding now.ts) and asserts no wall-clock-defaulting helpers exist", () => {
    const violations = collectViolations();
    const report = violations
      .map((v) => `  - ${v.file}::${v.fn} — ${v.reason}`)
      .join("\n");
    expect(violations, `Found ${violations.length} violation(s):\n${report}`).toEqual([]);
  });

  it("the meta-test predicate REJECTS a synthetic helper with `now: Date = new Date()` default", () => {
    // Inline AST check that the predicate logic recognises a defaulted `now`
    // parameter as a violation. Pins the test mechanism so a future
    // refactor cannot accidentally turn the meta-test into a tautology.
    const synthetic = `export function leaky(now: Date = new Date()): number { return now.getTime(); }\n`;
    const sf = ts.createSourceFile("synthetic.ts", synthetic, ts.ScriptTarget.Latest, true);
    const found: Violation[] = [];
    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node)) return;
      checkFunctionLike(node, sf, node.name?.text ?? "?", "synthetic.ts", found);
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((v) => /wall-clock default/.test(v.reason))).toBe(true);
  });

  it("the meta-test predicate ACCEPTS a compliant helper (required, non-defaulted, Date-typed)", () => {
    const compliant = `export function strict(iso: string, now: Date): number { return now.getTime(); }\n`;
    const sf = ts.createSourceFile("compliant.ts", compliant, ts.ScriptTarget.Latest, true);
    const found: Violation[] = [];
    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node)) return;
      checkFunctionLike(node, sf, node.name?.text ?? "?", "compliant.ts", found);
    });
    expect(found).toEqual([]);
  });

  it("the meta-test predicate REJECTS a helper whose body calls `new Date()` without a `now` parameter", () => {
    const synthetic = `export function bodyLeak(iso: string): number { return new Date().getTime() - 1; }\n`;
    const sf = ts.createSourceFile("synthetic.ts", synthetic, ts.ScriptTarget.Latest, true);
    const found: Violation[] = [];
    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node)) return;
      checkFunctionLike(node, sf, node.name?.text ?? "?", "synthetic.ts", found);
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((v) => /function body calls/.test(v.reason))).toBe(true);
  });

  it("the meta-test predicate REJECTS an optional `now?: Date` parameter", () => {
    const synthetic = `export function optional(iso: string, now?: Date): number { return (now ?? new Date()).getTime(); }\n`;
    const sf = ts.createSourceFile("synthetic.ts", synthetic, ts.ScriptTarget.Latest, true);
    const found: Violation[] = [];
    sf.forEachChild((node) => {
      if (!ts.isFunctionDeclaration(node)) return;
      checkFunctionLike(node, sf, node.name?.text ?? "?", "synthetic.ts", found);
    });
    expect(found.some((v) => /optional/.test(v.reason))).toBe(true);
  });
});
