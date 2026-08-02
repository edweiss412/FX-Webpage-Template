import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Structural adoption pin for the shared popover/overlay helpers
 * (spec 2026-08-01-admin-popover-overlay-cluster §7, §11 closure i-iv).
 *
 * The failure this guard exists to catch is NOT "the helper is missing" — it is
 * "the helper exists, is imported for show, and the consumer still runs its own
 * copy." Every rule below therefore resolves through the TYPE CHECKER rather
 * than matching identifier text: a same-named local const, a same-named function
 * PARAMETER shadowing the import, or a same-named export from a decoy module all
 * read identically to a text scan and all fail here.
 */

const ROOT = process.cwd();

type AdoptionRow = {
  /** Repo-relative consumer path. */
  readonly consumer: string;
  /** Exported helper the consumer must actually CALL. */
  readonly helper: string;
  /** Exact module specifier text the import must carry. */
  readonly module: string;
  /**
   * Coalescer consumers must also route their cleanup through the shared
   * instance's `.cancel()` — keeping a raw `cancelAnimationFrame(frame)` teardown
   * means the local frame bookkeeping survived the extraction (§7).
   */
  readonly requiresCancelAdoption: boolean;
};

const ROWS: readonly AdoptionRow[] = [
  {
    consumer: "components/admin/showpage/ShareHub.tsx",
    helper: "createRafCoalescer",
    module: "@/lib/popover/rafCoalescer",
    requiresCancelAdoption: true,
  },
  {
    consumer: "components/admin/HoverHelp.tsx",
    helper: "createRafCoalescer",
    module: "@/lib/popover/rafCoalescer",
    requiresCancelAdoption: true,
  },
];

/**
 * Names that must never be DECLARED inside a consumer — in any form. Importing
 * them is the point; re-declaring one is the local copy coming back.
 */
const NEVER_DECLARED_IN_CONSUMERS = [
  "createRafCoalescer",
  "useFitWithinClip",
  "findClippingAncestor",
] as const;

/** The shared coalescer's semantic marker comment. Exactly one source file may carry it. */
const COALESCER_MARKER = "cleared BEFORE running";

const CONSUMER_FILES = [...new Set(ROWS.map((r) => r.consumer))];

/**
 * Roots are the consumer files only. `noResolve` keeps the program from pulling
 * React and the rest of the graph in (this pin asks only about bindings declared
 * IN the consumer), and local alias symbols for import specifiers are bound
 * regardless of whether the target module resolves — which is what lets the RED
 * observation be "no import specifier" rather than a crash.
 */
function buildProgram(): ts.Program {
  return ts.createProgram({
    rootNames: CONSUMER_FILES.map((f) => resolve(ROOT, f)),
    options: {
      noResolve: true,
      noLib: true,
      skipLibCheck: true,
      allowJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  });
}

const program = buildProgram();
const checker = program.getTypeChecker();

function sourceOf(consumer: string): ts.SourceFile {
  const sf = program.getSourceFile(resolve(ROOT, consumer));
  if (!sf) throw new Error(`consumer not in program: ${consumer}`);
  return sf;
}

/** Every `import { x } from "mod"` specifier in this file, as declared nodes. */
function importSpecifiers(source: ts.SourceFile): ts.ImportSpecifier[] {
  const out: ts.ImportSpecifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function specifierMatches(spec: ts.ImportSpecifier, importedName: string, moduleText: string): boolean {
  if ((spec.propertyName ?? spec.name).text !== importedName) return false;
  const decl = spec.parent.parent.parent;
  return ts.isStringLiteral(decl.moduleSpecifier) && decl.moduleSpecifier.text === moduleText;
}

/**
 * Rule (ii): some call in `source` has a callee whose RAW symbol declares at an
 * ImportSpecifier in THIS file for `importedName` from exactly `moduleText`.
 *
 * The symbol is deliberately NOT alias-resolved: `getAliasedSymbol` would walk
 * through the import to the shared module's FunctionDeclaration, which is never
 * an ImportSpecifier, and would reject every legitimate consumer.
 */
function callResolvesToImport(
  source: ts.SourceFile,
  importedName: string,
  moduleText: string,
): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const sym = checker.getSymbolAtLocation(node.expression);
      const decl = sym?.declarations?.[0];
      if (
        decl &&
        ts.isImportSpecifier(decl) &&
        decl.getSourceFile() === source &&
        specifierMatches(decl, importedName, moduleText)
      ) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Rule (v): a `<receiver>.cancel()` whose receiver is a variable holding the imported factory's result. */
function cancelRoutesThroughSharedInstance(
  source: ts.SourceFile,
  importedName: string,
  moduleText: string,
): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "cancel"
    ) {
      const receiverSym = checker.getSymbolAtLocation(node.expression.expression);
      for (const decl of receiverSym?.declarations ?? []) {
        if (!ts.isVariableDeclaration(decl) || !decl.initializer) continue;
        const init = decl.initializer;
        if (!ts.isCallExpression(init)) continue;
        const factorySym = checker.getSymbolAtLocation(init.expression);
        const factoryDecl = factorySym?.declarations?.[0];
        if (
          factoryDecl &&
          ts.isImportSpecifier(factoryDecl) &&
          factoryDecl.getSourceFile() === source &&
          specifierMatches(factoryDecl, importedName, moduleText)
        ) {
          found = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Rule (iii): declarations of a forbidden name, in every form that can shadow an import. */
function declarationsOfName(source: ts.SourceFile, name: string): string[] {
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    const named =
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isParameter(node);
    if (named && node.name && ts.isIdentifier(node.name) && node.name.text === name) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      hits.push(`${ts.SyntaxKind[node.kind]} at line ${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".claude",
  "coverage",
  "dist",
  "test-results",
  "playwright-report",
  "public",
  "supabase",
]);

/** Every .ts/.tsx source file in the repo. */
function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".claude") {
      if (entry.isDirectory()) continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkSources(full, out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("shared helper adoption (spec §7, §11 closure)", () => {
  describe.each(ROWS.map((r) => [`${r.consumer} → ${r.helper}`, r] as const))("%s", (_label, row) => {
    it("(i) imports the helper from the shared module", () => {
      const source = sourceOf(row.consumer);
      const matching = importSpecifiers(source).filter((s) =>
        specifierMatches(s, row.helper, row.module),
      );
      expect(
        matching.length,
        `${row.consumer} must import { ${row.helper} } from "${row.module}"`,
      ).toBeGreaterThan(0);
    });

    it("(ii) CALLS the imported helper (checker-resolved, not by name)", () => {
      const source = sourceOf(row.consumer);
      expect(
        callResolvesToImport(source, row.helper, row.module),
        `${row.consumer} has no call whose callee resolves to its "${row.module}" import of ${row.helper} — a same-named local, parameter, or decoy-module import does not count`,
      ).toBe(true);
    });

    if (row.requiresCancelAdoption) {
      it("(v) cleanup cancels through the shared instance, not a raw frame id", () => {
        const source = sourceOf(row.consumer);
        expect(
          cancelRoutesThroughSharedInstance(source, row.helper, row.module),
          `${row.consumer} never calls .cancel() on a value produced by ${row.helper}() — the local cancelAnimationFrame teardown survived the extraction`,
        ).toBe(true);
      });
    }
  });

  it("(iii) no consumer re-declares a shared helper name in any form", () => {
    const offences: string[] = [];
    for (const consumer of CONSUMER_FILES) {
      const source = sourceOf(consumer);
      for (const name of NEVER_DECLARED_IN_CONSUMERS) {
        for (const where of declarationsOfName(source, name)) {
          offences.push(`${consumer}: ${name} declared as ${where}`);
        }
      }
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it(`(iv) the marker comment "${COALESCER_MARKER}" lives in exactly one source file`, () => {
    const carriers = walkSources(ROOT)
      .filter((f) => readFileSync(f, "utf8").includes(COALESCER_MARKER))
      .map((f) => relative(ROOT, f))
      .filter((f) => !f.startsWith("tests/"))
      .sort();
    expect(carriers, `carriers: ${carriers.join(", ") || "(none)"}`).toEqual([
      "lib/popover/rafCoalescer.ts",
    ]);
  });
});
