import { describe, expect, test } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDITABLE_MUTATIONS } from "./_auditableMutations";

const REPO_ROOT = join(__dirname, "..", "..");

const exportedFns = (file: string) => {
  const abs = join(REPO_ROOT, file);
  const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const st of sf.statements) {
    const exp =
      ts.canHaveModifiers(st) &&
      ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exp && ts.isFunctionDeclaration(st) && st.name) names.add(st.name.text);
    if (exp && ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
  }
  return names;
};

describe("AUDITABLE_MUTATIONS {file,fn,code} shape", () => {
  test("route rows use fn:POST; action rows name a real exported fn", () => {
    for (const r of AUDITABLE_MUTATIONS) {
      if (r.file.endsWith("/route.ts")) expect(r.fn, r.file).toBe("POST");
      else expect(exportedFns(r.file).has(r.fn), `${r.file}::${r.fn}`).toBe(true);
    }
  });
});
