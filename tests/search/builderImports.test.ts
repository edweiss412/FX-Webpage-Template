/**
 * Server boundary for the search index (plan Task 13, "Server boundary").
 *
 * `buildSearchIndex` and the section builders run on the server inside
 * `CrewShell`. A value imported there from a `"use client"` module is a client
 * reference, not the value (plan review round 2 probe: "Cannot access
 * INITIAL_VISIBLE.valueOf on the server"), and Vitest would not show it,
 * because Vitest ignores the directive. So this reads the source instead: every
 * file under lib/search/ (walked from disk, so a new builder is covered by
 * default) and every module those files import from `@/components` or `@/lib`
 * (one level, the modules whose exports a builder reads), and asserts none
 * starts with `"use client"`.
 *
 * A whole-statement `import type` / `export type` is skipped: it is erased at
 * compile time and imports no value. Any other import of a client module,
 * including one whose named bindings are all marked `type`, is flagged.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

const ROOT = process.cwd();
const SEARCH_DIR = join(ROOT, "lib/search");
const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function parse(path: string, source: string): ts.SourceFile {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
}

/** True when the module's directive prologue holds `"use client"`. */
function isClientModule(path: string, source: string): boolean {
  for (const stmt of parse(path, source).statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === "use client") return true;
  }
  return false;
}

/** Module specifiers of the file's value imports and re-exports. */
function valueImports(path: string, source: string): string[] {
  const specs: string[] = [];
  for (const stmt of parse(path, source).statements) {
    if (ts.isImportDeclaration(stmt)) {
      if (stmt.importClause?.isTypeOnly) continue;
      if (ts.isStringLiteral(stmt.moduleSpecifier)) specs.push(stmt.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      if (stmt.isTypeOnly) continue;
      if (ts.isStringLiteral(stmt.moduleSpecifier)) specs.push(stmt.moduleSpecifier.text);
    }
  }
  return specs;
}

/**
 * The file a followed specifier names, or `"unresolved"`; `null` for one not
 * followed (a package). `@/components`, `@/lib` and relative specifiers are
 * followed. An unresolved one is reported, so the scan fails closed.
 */
function resolveImport(fromFile: string, spec: string): string | "unresolved" | null {
  let base: string;
  if (spec.startsWith("@/components/") || spec.startsWith("@/lib/")) {
    base = join(ROOT, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = resolve(dirname(fromFile), spec);
  } else {
    return null;
  }
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return "unresolved";
}

type Scan = { followed: string[]; violations: string[] };

/** Scans the given lib/search sources and the modules they import, one level. */
function scan(files: readonly { path: string; source: string }[]): Scan {
  const followed = new Set<string>();
  const violations: string[] = [];
  const rel = (p: string) => relative(ROOT, p);
  for (const { path, source } of files) {
    if (isClientModule(path, source)) violations.push(`${rel(path)} is a "use client" module`);
    for (const spec of valueImports(path, source)) {
      const target = resolveImport(path, spec);
      if (target === null) continue;
      if (target === "unresolved") {
        violations.push(`${rel(path)} imports ${spec}, which does not resolve`);
        continue;
      }
      followed.add(rel(target));
      if (isClientModule(target, readFileSync(target, "utf8"))) {
        violations.push(`${rel(path)} imports ${rel(target)}, a "use client" module`);
      }
    }
  }
  return { followed: [...followed].sort(), violations };
}

const SEARCH_FILES = walk(SEARCH_DIR).map((path) => ({ path, source: readFileSync(path, "utf8") }));

describe("search index server boundary", () => {
  test("no lib/search module is, or imports, a client module", () => {
    const seen = SEARCH_FILES.map((f) => relative(ROOT, f.path));
    const { followed, violations } = scan(SEARCH_FILES);

    // The walk saw the composer and a builder, and followed a builder's
    // component-side import, so an empty violation list is about real files.
    premiseHolds(
      "the walk saw lib/search/buildSearchIndex.ts",
      seen.includes("lib/search/buildSearchIndex.ts"),
    );
    premiseHolds(
      "the walk saw lib/search/sections/venue.ts",
      seen.includes("lib/search/sections/venue.ts"),
    );
    premiseHolds(
      "the scan followed venue.ts's import of components/crew/diagramItems.ts",
      followed.includes("components/crew/diagramItems.ts"),
    );

    expect(violations).toEqual([]);
  });

  describe("self-check", () => {
    const GALLERY = "components/diagrams/Gallery.tsx";
    const planted = (source: string) => [{ path: join(SEARCH_DIR, "sections/planted.ts"), source }];

    test("flags a planted value import of Gallery.tsx, a client module", () => {
      premiseHolds(
        `${GALLERY} starts with "use client"`,
        isClientModule(GALLERY, readFileSync(join(ROOT, GALLERY), "utf8")),
      );
      const { violations } = scan(
        planted(
          `import { Gallery } from "@/components/diagrams/Gallery";\nexport const g = Gallery;\n`,
        ),
      );
      expect(violations).toEqual([
        `lib/search/sections/planted.ts imports ${GALLERY}, a "use client" module`,
      ]);
    });

    test("flags it through a relative path and a re-export too", () => {
      const relativePath = scan(
        planted(`import { Gallery } from "../../../components/diagrams/Gallery";\n`),
      );
      const reExport = scan(planted(`export { Gallery } from "@/components/diagrams/Gallery";\n`));
      expect(relativePath.violations).toHaveLength(1);
      expect(reExport.violations).toHaveLength(1);
    });

    test("flags a lib/search file that is itself a client module, and an import that does not resolve", () => {
      const client = scan(planted(`"use client";\nexport const x = 1;\n`));
      const missing = scan(planted(`import { x } from "@/lib/search/doesNotExist";\n`));
      expect(client.violations).toEqual([
        `lib/search/sections/planted.ts is a "use client" module`,
      ]);
      expect(missing.violations).toEqual([
        "lib/search/sections/planted.ts imports @/lib/search/doesNotExist, which does not resolve",
      ]);
    });

    test("does not flag a type-only import, which imports no value", () => {
      const { violations } = scan(
        planted(`import type { GalleryProps } from "@/components/diagrams/Gallery";\n`),
      );
      expect(violations).toEqual([]);
    });
  });
});
