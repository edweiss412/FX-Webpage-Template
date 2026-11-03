/**
 * tests/crew/crewSectionsClientGraph.test.ts
 * (crew page redesign PR B, invariant-8 UI gate row 9)
 *
 * lib/crew/crewSections.ts is reachable from the crew page's client bundle
 * (components/crew/CrewSections.tsx imports it), and it reaches the "All
 * sections" peek (lib/crew/sectionPeek.ts). The peek read the transport leg
 * rule from components/show-panels/TransportBody.tsx and the crew leg options
 * from transportRows.ts, which imports the roster body: the production build put
 * TransportBody, CrewBody, MiniAvatar and FieldRowList (11.3 KB minified) in a
 * crew client chunk that never runs them.
 *
 * The property: no markup module (`.tsx`) is reachable from crewSections.ts
 * through value imports. Type-only imports are erased at compile time and so do
 * not count; re-exports and dynamic imports do.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

const ROOT = process.cwd();

function resolveRepoModule(specifier: string, fromFile: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(ROOT, dirname(fromFile), specifier);
  if (base === null) return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(ROOT, candidate);
  }
  return null;
}

/** Whether an import or export declaration survives compilation (is not type-only). */
function carriesValues(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return false;
    const clause = node.exportClause;
    if (clause !== undefined && ts.isNamedExports(clause))
      return clause.elements.length === 0 || clause.elements.some((e) => !e.isTypeOnly);
    return true;
  }
  const clause = node.importClause;
  if (clause === undefined) return true; // a side-effect import
  if (clause.isTypeOnly) return false;
  if (clause.name !== undefined) return true;
  const bindings = clause.namedBindings;
  if (bindings === undefined || ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.length === 0 || bindings.elements.some((e) => !e.isTypeOnly);
}

/** The repo modules a source's value imports, re-exports and dynamic imports name. */
function valueImports(file: string, source: string): string[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (carriesValues(node)) {
        const target = resolveRepoModule(node.moduleSpecifier.text, file);
        if (target !== null) out.push(target);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const target = resolveRepoModule(node.arguments[0].text, file);
      if (target !== null) out.push(target);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Every repo module reachable from `start`, each with the module that first imported it. */
function reachable(start: string): Map<string, string | null> {
  const seen = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const next of valueImports(file, readFileSync(join(ROOT, file), "utf8"))) {
      if (seen.has(next)) continue;
      seen.set(next, file);
      queue.push(next);
    }
  }
  return seen;
}

describe("the crew client graph through lib/crew/crewSections.ts (gate row 9)", () => {
  test("type-only imports are not edges; value imports, re-exports and dynamic imports are", () => {
    const edges = (src: string) => valueImports("lib/crew/probe.ts", src);
    expect(edges('import type { X } from "@/components/show-panels/PanelCard";')).toEqual([]);
    expect(edges('import { type X } from "@/components/show-panels/PanelCard";')).toEqual([]);
    expect(edges('export type { X } from "@/components/show-panels/PanelCard";')).toEqual([]);
    for (const src of [
      'import { PanelCard } from "@/components/show-panels/PanelCard";',
      'import { type X, PanelCard } from "@/components/show-panels/PanelCard";',
      'export { PanelCard } from "@/components/show-panels/PanelCard";',
      'const m = import("@/components/show-panels/PanelCard");',
      'import "@/components/show-panels/PanelCard";',
    ])
      expect(edges(src), src).toEqual(["components/show-panels/PanelCard.tsx"]);
  });

  test("no markup module is reachable from crewSections.ts", () => {
    const graph = reachable("lib/crew/crewSections.ts");
    // PREMISE: the walk reached the peek and the transport leg rule it reads, so
    // an empty result below is about those modules, not a walk that stopped early.
    premiseHolds("the walk reached lib/crew/sectionPeek.ts", graph.has("lib/crew/sectionPeek.ts"));
    premiseHolds(
      "the walk reached the transport leg derivation",
      [...graph.keys()].some((f) => f.startsWith("components/show-panels/")),
    );
    const markup = [...graph]
      .filter(([file]) => file.endsWith(".tsx"))
      .map(([file, from]) => `${file} <- ${from}`);
    expect(markup).toEqual([]);
  });
});
