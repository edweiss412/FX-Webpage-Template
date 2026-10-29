/**
 * Server boundary for the search index (plan Task 13, "Server boundary").
 *
 * `buildSearchIndex` and the section builders run on the server inside
 * `CrewShell`. A value imported there from a `"use client"` module is a client
 * reference, not the value (plan review round 2 probe: "Cannot access
 * INITIAL_VISIBLE.valueOf on the server"), and Vitest would not show it,
 * because Vitest ignores the directive. So this reads the source instead: every
 * file under lib/search/ (walked from disk, so a new builder is covered by
 * default) and every module reached from them through value imports with an
 * `@/` or relative specifier, transitively (a rows module's own imports, such as
 * a primitive, run on the server too), and asserts none starts with
 * `"use client"`.
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
 * followed (a package). `@/` and relative specifiers are followed. An
 * unresolved one is reported, so the scan fails closed.
 */
function resolveImport(
  fromFile: string,
  spec: string,
  overlay: ReadonlyMap<string, string> = new Map(),
): string | "unresolved" | null {
  let base: string;
  if (spec.startsWith("@/")) {
    base = join(ROOT, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = resolve(dirname(fromFile), spec);
  } else {
    return null;
  }
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (overlay.has(candidate)) return candidate;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return "unresolved";
}

type Scan = { followed: string[]; violations: string[] };

/**
 * Scans the given lib/search sources and, transitively, every module they
 * import by value through `@/` or a relative specifier, so a `"use client"`
 * that lands on a module a rows file imports (a primitive, a strip) is caught
 * however deep it sits. A client module is reported and not descended into:
 * its own imports run on the client. Each module is read once, so a cycle ends
 * the walk. A violation below the first level names the root it was reached
 * from. `overlay` maps absolute paths to in-memory sources that resolve before
 * the disk, so a self-check can plant a module between a root and a real file.
 */
function scan(
  files: readonly { path: string; source: string }[],
  overlay: ReadonlyMap<string, string> = new Map(),
): Scan {
  const followed = new Set<string>();
  const violations: string[] = [];
  const rel = (p: string) => relative(ROOT, p);
  const visited = new Set(files.map((f) => f.path));
  const queue = files.map((f) => ({ ...f, root: f.path }));
  for (const { path, root } of queue) {
    if (path === root) {
      const { source } = files.find((f) => f.path === path)!;
      if (isClientModule(path, source)) violations.push(`${rel(path)} is a "use client" module`);
    }
  }
  while (queue.length > 0) {
    const { path, source, root } = queue.shift()!;
    const via = path === root ? "" : ` (via ${rel(root)})`;
    for (const spec of valueImports(path, source)) {
      const target = resolveImport(path, spec, overlay);
      if (target === null) continue;
      if (target === "unresolved") {
        violations.push(`${rel(path)} imports ${spec}, which does not resolve${via}`);
        continue;
      }
      followed.add(rel(target));
      const targetSource = overlay.get(target) ?? readFileSync(target, "utf8");
      if (isClientModule(target, targetSource)) {
        violations.push(`${rel(path)} imports ${rel(target)}, a "use client" module${via}`);
        continue;
      }
      if (visited.has(target)) continue;
      visited.add(target);
      queue.push({ path: target, source: targetSource, root });
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
    // And it went past the first level: PersonRow.tsx is imported by crewRows.ts, never by a
    // lib/search file, so only a transitive walk reaches it.
    const PERSON_ROW = "components/crew/primitives/PersonRow.tsx";
    premiseHolds(
      `no lib/search file imports ${PERSON_ROW} directly`,
      SEARCH_FILES.every(({ path, source }) =>
        valueImports(path, source).every(
          (spec) => resolveImport(path, spec) !== join(ROOT, PERSON_ROW),
        ),
      ),
    );
    premiseHolds(`the scan followed ${PERSON_ROW}`, followed.includes(PERSON_ROW));

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

    test("follows imports transitively: a client module two levels down is flagged", () => {
      // A planted row module between the root and Gallery.tsx, the shape a rows file has when
      // it imports a primitive that later gains "use client".
      const MID = "components/crew/sections/plantedRows.ts";
      const overlay = new Map([
        [
          join(ROOT, MID),
          `import { Gallery } from "@/components/diagrams/Gallery";\nexport const rows = [Gallery];\n`,
        ],
      ]);
      premiseHolds(`${MID} is not on disk`, !existsSync(join(ROOT, MID)));
      const { followed, violations } = scan(
        planted(`import { rows } from "@/components/crew/sections/plantedRows";\n`),
        overlay,
      );
      expect(followed).toContain(MID);
      expect(violations).toEqual([
        `${MID} imports ${GALLERY}, a "use client" module (via lib/search/sections/planted.ts)`,
      ]);
    });

    test("a type-only import is not followed, at any depth", () => {
      const MID = "components/crew/sections/plantedTypes.ts";
      const overlay = new Map([
        [join(ROOT, MID), `import type { GalleryProps } from "@/components/diagrams/Gallery";\n`],
      ]);
      const { violations } = scan(
        planted(`import { x } from "@/components/crew/sections/plantedTypes";\n`),
        overlay,
      );
      expect(violations).toEqual([]);
    });

    test("an import cycle ends the walk instead of looping", () => {
      const A = "components/crew/sections/plantedCycleA.ts";
      const B = "components/crew/sections/plantedCycleB.ts";
      const overlay = new Map([
        [join(ROOT, A), `import { b } from "./plantedCycleB";\nexport const a = 1;\n`],
        [join(ROOT, B), `import { a } from "./plantedCycleA";\nexport const b = 2;\n`],
      ]);
      const { followed, violations } = scan(
        planted(`import { a } from "@/components/crew/sections/plantedCycleA";\n`),
        overlay,
      );
      expect(followed).toEqual(expect.arrayContaining([A, B]));
      expect(violations).toEqual([]);
    });

    test("does not flag a type-only import, which imports no value", () => {
      const { violations } = scan(
        planted(`import type { GalleryProps } from "@/components/diagrams/Gallery";\n`),
      );
      expect(violations).toEqual([]);
    });
  });
});
