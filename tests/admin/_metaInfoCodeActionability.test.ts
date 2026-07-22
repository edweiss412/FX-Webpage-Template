// tests/admin/_metaInfoCodeActionability.test.ts
/**
 * Two-layer fail-closed scanner (spec 2026-07-22-warning-panel-polish §3.4).
 * Layer 1: every object literal in lib/parser/** and lib/sync/** carrying BOTH
 *   severity: "info" and a literal code must have a decision in
 *   INFO_CODE_ACTIONABILITY (discovered set == map key set).
 * Layer 2: every `severity` property key in those trees must have a literal
 *   "warn" | "info" value; anything else fails as unanalyzable. A literal
 *   "info" not attributable to a code-carrying literal also fails.
 * Residual boundary (spec §3.4): dynamically constructed property keys are out
 * of syntactic reach; the closed union at lib/parser/types.ts:49 covers them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { INFO_CODE_ACTIONABILITY } from "@/lib/admin/infoCodeActionability";

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

type Scan = { infoCodes: Set<string>; violations: string[] };

function scanFile(path: string, scan: Scan): void {
  scanSource(
    ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true),
    path,
    scan,
  );
}

function scanSource(src: ts.SourceFile, path: string, scan: Scan): void {
  const visit = (node: ts.Node): void => {
    // "severity" as a property name in ANY syntactic form: identifier key,
    // string-literal key, computed key, shorthand, method/accessor. Shorthand,
    // computed-non-literal, and method forms are unanalyzable BY CONSTRUCTION -> fail.
    const named = (name: ts.PropertyName, key: string): boolean =>
      (ts.isIdentifier(name) && name.text === key) ||
      (ts.isStringLiteral(name) && name.text === key) ||
      (ts.isComputedPropertyName(name) &&
        ts.isStringLiteral(name.expression) &&
        name.expression.text === key);
    const namedSeverity = (name: ts.PropertyName): boolean => named(name, "severity");
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === "severity") {
      scan.violations.push(
        `${path}: unanalyzable severity: extend the scanner or register the code`,
      );
    }
    if (
      (ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      namedSeverity(node.name)
    ) {
      scan.violations.push(
        `${path}: unanalyzable severity: extend the scanner or register the code`,
      );
    }
    if (ts.isPropertyAssignment(node) && namedSeverity(node.name)) {
      // Unwrap `as const` / `as "warn"` / parens around a string literal —
      // `severity: "warn" as const` (lib/parser/blocks/crew.ts:418) is fully
      // analyzable; only a non-literal expression underneath is unanalyzable.
      let v: ts.Expression = node.initializer;
      while (ts.isAsExpression(v) || ts.isParenthesizedExpression(v)) v = v.expression;
      const literal = ts.isStringLiteral(v) ? v.text : null;
      if (literal !== "warn" && literal !== "info") {
        scan.violations.push(
          `${path}: unanalyzable severity: extend the scanner or register the code`,
        );
      } else if (literal === "info") {
        const parent = node.parent;
        const codeProp = ts.isObjectLiteralExpression(parent)
          ? parent.properties.find(
              (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && named(p.name, "code"),
            )
          : undefined;
        const code =
          codeProp && ts.isStringLiteral(codeProp.initializer) ? codeProp.initializer.text : null;
        if (code === null) {
          scan.violations.push(
            `${path}: severity:"info" not attributable to a code-carrying literal`,
          );
        } else {
          scan.infoCodes.add(code);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

describe("INFO_CODE_ACTIONABILITY registry (spec §3.4)", () => {
  const scan: Scan = { infoCodes: new Set(), violations: [] };
  for (const dir of ["lib/parser", "lib/sync"])
    walkFiles(join(process.cwd(), dir)).forEach((f) => scanFile(f, scan));

  it("Layer 2: every severity property is a literal warn/info attributable to a code literal", () => {
    expect(scan.violations).toEqual([]);
  });

  it("Layer 1: discovered info-code set equals the decision map's key set", () => {
    expect([...scan.infoCodes].sort()).toEqual(Object.keys(INFO_CODE_ACTIONABILITY).sort());
  });

  it("scanner self-test: synthetic fixtures prove discovery and each fail-closed branch", () => {
    const probe = (code: string): Scan => {
      const sc: Scan = { infoCodes: new Set(), violations: [] };
      const path = "/synthetic/probe.ts";
      // reuse the same visitor via the scanSource seam
      scanSource(ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true), path, sc);
      return sc;
    };
    // info literal with code literal -> discovered, no violation
    let r = probe(`const w = { severity: "info", code: "X_CODE", message: "m" };`);
    expect([...r.infoCodes]).toEqual(["X_CODE"]);
    expect(r.violations).toEqual([]);
    // warn literal -> accepted silently
    r = probe(`const w = { severity: "warn", code: "Y", message: "m" };`);
    expect(r.infoCodes.size).toBe(0);
    expect(r.violations).toEqual([]);
    // as-const wrapped literal -> analyzed (the crew.ts:418 shape), no violation
    r = probe(`const w = { severity: "warn" as const, code: "Y2" };`);
    expect(r.violations).toEqual([]);
    r = probe(`const w = { severity: "info" as const, code: "Y3" };`);
    expect([...r.infoCodes]).toEqual(["Y3"]);
    expect(r.violations).toEqual([]);
    // variable severity -> unanalyzable
    r = probe(`const sev = "info"; const w = { severity: sev, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    // shorthand -> unanalyzable
    r = probe(`const severity = "info" as const; const w = { severity, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    // string-literal key -> analyzed like identifier key, no violation
    r = probe(`const w = { "severity": "info", code: "Q" };`);
    expect([...r.infoCodes]).toEqual(["Q"]);
    expect(r.violations).toEqual([]);
    // computed string key -> analyzed like identifier key, no violation
    r = probe(`const w = { ["severity"]: "info", ["code"]: "R" };`);
    expect([...r.infoCodes]).toEqual(["R"]);
    expect(r.violations).toEqual([]);
    // string-literal code key -> attributable, no violation
    r = probe(`const w = { severity: "info", "code": "S" };`);
    expect([...r.infoCodes]).toEqual(["S"]);
    expect(r.violations).toEqual([]);
    // method / getter / setter named severity -> unanalyzable
    r = probe(`const w = { severity() { return "info"; }, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    r = probe(`const w = { get severity() { return "info"; }, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    r = probe(`const w = { set severity(v: string) {}, code: "Z" };`);
    expect(r.violations).toHaveLength(1);
    // info without attributable code -> violation
    r = probe(`const w = { severity: "info", message: "m" };`);
    expect(r.violations).toHaveLength(1);
  });

  it("today's universe is exactly the two known codes with the ratified decisions", () => {
    expect(INFO_CODE_ACTIONABILITY).toEqual({
      DAY_RESTRICTION_DOUBLE_LOCATION: "actionable",
      TYPO_NORMALIZED: "not-actionable",
    });
  });
});
