import { describe, expect, test } from "vitest";
import ts from "typescript";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUDITABLE_MUTATIONS } from "./_auditableMutations";
import { parse, routeMutatingMethods } from "./mutationSurface/enumerate";

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
  // Codex whole-diff R3 (companion): route rows previously had to be `fn:"POST"`.
  // Invariant #10 covers ALL mutating HTTP methods (POST/PUT/PATCH/DELETE) and the
  // discovery mechanism records the ACTUAL exported method name — so a future admin
  // DELETE/PATCH/PUT route would be discovered as `fn:"DELETE"` and must be
  // registrable. Reuse the exact discovery logic (`routeMutatingMethods`) instead of
  // hard-coding POST: a route row's `fn` must be a mutating method actually EXPORTED
  // by that route file (stronger than the old literal check — a row naming a method
  // the file does not export now fails).
  test("route rows name a real exported mutating method (POST/PUT/PATCH/DELETE); action rows name a real exported fn", () => {
    for (const r of AUDITABLE_MUTATIONS) {
      if (r.file.endsWith("/route.ts")) {
        const methods = routeMutatingMethods(parse(join(REPO_ROOT, r.file)));
        expect(
          methods,
          `${r.file}::${r.fn} — route file exports mutating methods [${methods.join(", ")}]`,
        ).toContain(r.fn);
      } else {
        expect(exportedFns(r.file).has(r.fn), `${r.file}::${r.fn}`).toBe(true);
      }
    }
  });

  test("a DELETE route row is registrable under the shape guard (non-POST methods are not rejected)", () => {
    // Proves the guard accepts any mutating method, not just POST: a route file that
    // exports `DELETE` yields "DELETE" from routeMutatingMethods, so a
    // `{ file, fn: "DELETE", code }` registry row would satisfy the guard above.
    const dir = mkdtempSync(join(tmpdir(), "auditable-shape-delete-"));
    const routeFile = join(dir, "route.ts");
    writeFileSync(
      routeFile,
      "export async function DELETE(): Promise<Response> {\n  return new Response(null, { status: 204 });\n}\n",
      "utf8",
    );
    const methods = routeMutatingMethods(parse(routeFile));
    expect(methods).toContain("DELETE");
    expect(methods).not.toContain("POST");
  });
});
