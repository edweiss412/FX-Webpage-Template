/**
 * tests/adminAlerts/producerScopeAst.test.ts
 * (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §6)
 *
 * Exercises the producer-scope AST primitives against SYNTHETIC sources.
 *
 * Why synthetic: while these helpers lived inside the meta-test they were only
 * ever reached through whatever shapes the live tree happened to contain, so a
 * fail-OPEN branch was unobservable. Every case below is a shape the tree does
 * not contain today — which is the point. Each one previously returned
 * `kind: "literal"` with a PARTIAL key list, so the registry parity check
 * confirmed the rows against keys the walker had silently dropped.
 *
 * The governing invariant: anything the walker cannot read IN FULL is
 * `computed`. Computed costs a hand-authored row plus a provenance note;
 * wrongly-literal costs a vacuous guard.
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readContextShape, calleeName, propertyKeyName } from "./producerScopeAst";

function parseExpr(src: string): { expr: ts.Expression; sf: ts.SourceFile } {
  const sf = ts.createSourceFile(
    "synthetic.ts",
    `const x = ${src};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const stmt = sf.statements[0];
  if (!ts.isVariableStatement(stmt!)) throw new Error("fixture is not a variable statement");
  const init = stmt.declarationList.declarations[0]?.initializer;
  if (init === undefined) throw new Error("fixture has no initializer");
  return { expr: init, sf };
}

function shapeOf(src: string) {
  const { expr, sf } = parseExpr(src);
  return readContextShape(expr, sf);
}

function firstCalleeName(src: string): string | undefined {
  const sf = ts.createSourceFile(
    "synthetic.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let out: string | undefined;
  const visit = (n: ts.Node): void => {
    if (out === undefined && ts.isCallExpression(n)) out = calleeName(n.expression);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("readContextShape reads a shape in full or calls it computed (spec §6)", () => {
  it("reads a plain object literal", () => {
    expect(shapeOf(`{ drive_file_id: id, sheet_name: n }`)).toEqual({
      kind: "literal",
      required: ["drive_file_id", "sheet_name"],
      optional: [],
    });
  });

  it("reads a conditional spread's arms as OPTIONAL keys", () => {
    expect(shapeOf(`{ a: 1, ...(cond ? { error_code: c } : {}) }`)).toEqual({
      kind: "literal",
      required: ["a"],
      optional: ["error_code"],
    });
  });

  it("treats quoted keys as the same key as bare ones", () => {
    // `"code"` and `code` are one key. Reading the quotes as part of the name
    // made an options object look like it had no `code`/`context` property,
    // which misclassified the entire call as positional.
    expect(shapeOf(`{ "drive_file_id": id }`)).toEqual({
      kind: "literal",
      required: ["drive_file_id"],
      optional: [],
    });
  });

  describe("fail-closed cases — each returned a PARTIAL literal before", () => {
    it("a non-object conditional-spread arm collapses the shape", () => {
      // Previously: the arm was skipped, `{ known }` was reported as the
      // complete key set, and every key inside `extraContext` vanished.
      expect(shapeOf(`{ known: 1, ...(cond ? { seen: 2 } : extraContext) }`)).toEqual({
        kind: "computed",
      });
      expect(shapeOf(`{ ...(cond ? varA : varB) }`)).toEqual({ kind: "computed" });
    });

    it("a nested spread inside an arm collapses the shape", () => {
      expect(shapeOf(`{ ...(cond ? { ...extraContext } : {}) }`)).toEqual({ kind: "computed" });
    });

    it("a method / getter / setter inside an arm collapses the shape", () => {
      expect(shapeOf(`{ ...(cond ? { m() { return 1; } } : {}) }`)).toEqual({ kind: "computed" });
      expect(shapeOf(`{ ...(cond ? { get g() { return 1; } } : {}) }`)).toEqual({
        kind: "computed",
      });
    });

    it("a computed property name collapses the shape, at either level", () => {
      // Previously recorded as the source text `[key]`, a key no producer can
      // ever write and no fixture can ever supply.
      expect(shapeOf(`{ [key]: v }`)).toEqual({ kind: "computed" });
      expect(shapeOf(`{ ...(cond ? { [key]: v } : {}) }`)).toEqual({ kind: "computed" });
    });

    it("a non-conditional spread collapses the shape", () => {
      expect(shapeOf(`{ ...base, code: c }`)).toEqual({ kind: "computed" });
    });

    it("a method member at the top level collapses the shape", () => {
      expect(shapeOf(`{ m() { return 1; } }`)).toEqual({ kind: "computed" });
    });

    it("a non-object initializer collapses the shape", () => {
      expect(shapeOf(`buildContext(a, b)`)).toEqual({ kind: "computed" });
      expect(shapeOf(`contextVar`)).toEqual({ kind: "computed" });
    });
  });

  it("sees through parentheses and casts to the object underneath", () => {
    expect(shapeOf(`({ drive_file_id: id })`)).toEqual({
      kind: "literal",
      required: ["drive_file_id"],
      optional: [],
    });
    expect(shapeOf(`{ drive_file_id: id } as AlertContext`)).toEqual({
      kind: "literal",
      required: ["drive_file_id"],
      optional: [],
    });
  });
});

describe("calleeName sees the producer surface through wrappers (spec §6)", () => {
  it("finds a plain and a member call", () => {
    expect(firstCalleeName(`upsertAdminAlert({ code: "X" });`)).toBe("upsertAdminAlert");
    expect(firstCalleeName(`alerts.upsertAdminAlert({ code: "X" });`)).toBe("upsertAdminAlert");
  });

  it("finds a call hidden behind parentheses, a non-null assertion, or a cast", () => {
    // Each of these invokes the SAME surface as a plain call, so each must be
    // discovered — otherwise a new producer written this way is unregistered
    // and the unregistered-site test stays green.
    expect(firstCalleeName(`(upsertAdminAlert)({ code: "X" });`)).toBe("upsertAdminAlert");
    expect(firstCalleeName(`upsertAdminAlert!({ code: "X" });`)).toBe("upsertAdminAlert");
    expect(firstCalleeName(`(upsertAdminAlert as AlertFn)({ code: "X" });`)).toBe(
      "upsertAdminAlert",
    );
  });

  it("finds a string-keyed element-access call", () => {
    expect(firstCalleeName(`alerts["upsertAdminAlert"]({ code: "X" });`)).toBe("upsertAdminAlert");
  });

  it("returns undefined for a dynamically-keyed call it cannot name", () => {
    expect(firstCalleeName(`alerts[keyVar]({ code: "X" });`)).toBeUndefined();
  });
});

describe("propertyKeyName", () => {
  it("returns null only for a genuinely unknowable computed name", () => {
    const { expr, sf } = parseExpr(`{ plain: 1, "quoted": 2, [dyn]: 3 }`);
    if (!ts.isObjectLiteralExpression(expr)) throw new Error("fixture is not an object literal");
    const names = expr.properties.map((p) =>
      ts.isPropertyAssignment(p) ? propertyKeyName(p.name, sf) : "n/a",
    );
    expect(names).toEqual(["plain", "quoted", null]);
  });
});
