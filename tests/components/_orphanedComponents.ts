// tests/components/_orphanedComponents.ts
//
// Pure core for the zero-production-importer guard. Split out of the test file
// so the family (a)-(d) proofs can run against synthetic inputs instead of
// depending on the real tree happening to contain an instance — the same layer
// split tests/docs/_invariant8Closeout.ts uses.
//
// A component file that no file under app/, components/, or lib/ imports is
// dead weight: it typechecks, it lints, it ships in no bundle, and nothing in
// the repo notices. components/admin/ParsePanel.tsx sat that way from the
// show-page-to-modal pivot (#476) until 2026-08-02 — and it had two TEST
// importers, which is exactly why a "zero importers anywhere" probe never saw
// it. Production importers are the only ones that count here.
//
// WE DO NOT IMPLEMENT MODULE RESOLUTION, AND WE DO NOT SCAN FOR IMPORTS.
// Seven rounds of spec review produced fourteen live mutants against
// successively better home-made rules: basename matching, extensionless
// comparison across several candidates, a substituted-extension specifier, a
// directory manifest, the declaration/JS/JSX/JSON candidates that allowJs and
// resolveJsonModule admit, paths / moduleSuffixes / allowArbitraryExtensions,
// an extends clause smuggling options past a raw-config assertion — and then,
// against a first replacement built on ts.preProcessFile, two more: that
// scanner reports `import("...")` occurring as ordinary JSX TEXT as a real
// dynamic import (a false green, the one direction this guard must never fail
// in), and it drops the per-site resolution mode. It also misses
// `export * as ns from`.
//
// So both halves come from the compiler: which edges exist (the AST) and what
// each resolves to (ts.resolveModuleName, with the mode taken from the site).
// Do not replace either with a regex, a candidate list, or preProcessFile;
// tests/components/_metaOrphanedComponents.test.ts keeps every escaping case as
// a regression test precisely so that change fails loudly.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ts from "typescript";

export const ROOT = process.cwd();

/** Roots whose files count as production importers. Tests are deliberately excluded. */
export const PROD_ROOTS = ["app", "components", "lib"] as const;

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "__snapshots__"]);

export type AllowRow = { file: string; reason: string; backlog: string };

/**
 * Components with zero production importers that are KNOWN debt, each owned by
 * a backlog row. Adding a row is a deliberate act of deferral, not how a new
 * failure gets silenced. Work BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS by
 * emptying this list.
 */
export const ORPHAN_ALLOWLIST: readonly AllowRow[] = [
  {
    file: "components/admin/PerShowCrewSection.tsx",
    reason: "No reference of any kind outside itself; retired-or-unmounted call pending.",
    backlog: "BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS",
  },
  {
    file: "components/admin/ResolveAlertButton.tsx",
    reason: "Referenced only as a pattern exemplar in other components' comments.",
    backlog: "BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS",
  },
  {
    file: "components/admin/RunFinalCASButton.tsx",
    reason: "Referenced only in the AccentButton header comment.",
    backlog: "BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS",
  },
  {
    file: "components/shared/WrappedTile.tsx",
    reason: "Referenced only in sibling comments; also the sole hit of an all-importers probe.",
    backlog: "BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const toPosix = (p: string): string => p.split("\\").join("/");

/** The project's EFFECTIVE compiler options, with any `extends` chain collapsed. */
export function compilerOptions(root: string = ROOT): ts.CompilerOptions {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, " "));
    },
  };
  const configPath = resolve(root, "tsconfig.json");
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, host);
  if (parsed === undefined) throw new Error(`could not parse ${configPath}`);
  return parsed.options;
}

/** Every `.ts`/`.tsx` file under components/, repo-relative, sorted. */
export function componentFiles(root: string = ROOT): string[] {
  const dir = join(root, "components");
  if (!existsSync(dir)) return [];
  return walk(dir)
    .filter((abs) => /\.tsx?$/.test(abs))
    .map((abs) => toPosix(relative(root, abs)))
    .sort();
}

/** Absolute paths of every production source the guard scans. */
export function productionSourceFiles(root: string = ROOT): string[] {
  const out: string[] = [];
  for (const dir of PROD_ROOTS) {
    const abs = join(root, dir);
    if (existsSync(abs)) out.push(...walk(abs).filter((f) => /\.tsx?$/.test(f)));
  }
  return out.sort();
}

/**
 * Every module specifier that is a real module edge, taken from the syntax tree.
 *
 * A text scan cannot do this: an import written inside a comment or a string is
 * not an edge, and `import("x")` sitting in JSX text is not one either.
 */
export function moduleSpecifiers(source: ts.SourceFile): ts.StringLiteralLike[] {
  const out: ts.StringLiteralLike[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      out.push(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteralLike(first)) out.push(first);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      out.push(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return out;
}

/** Every in-project file some production source imports, repo-relative. */
export function importedFiles(
  sourceFiles: readonly string[],
  options: ts.CompilerOptions,
  root: string = ROOT,
): Set<string> {
  const cache = ts.createModuleResolutionCache(root, (f) => f, options);
  const imported = new Set<string>();
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    for (const node of moduleSpecifiers(source)) {
      const mode = ts.getModeForUsageLocation(source, node, options);
      const resolved = ts.resolveModuleName(
        node.text,
        file,
        options,
        ts.sys,
        cache,
        undefined,
        mode,
      ).resolvedModule;
      if (resolved === undefined || resolved.isExternalLibraryImport === true) continue;
      if (resolved.resolvedFileName === file) continue; // a self-import is not an importer
      imported.add(toPosix(relative(root, resolved.resolvedFileName)));
    }
  }
  return imported;
}

/** The entries of `candidates` that no production source imports. */
export function orphansOf(candidates: readonly string[], imported: ReadonlySet<string>): string[] {
  return candidates.filter((file) => !imported.has(file)).sort();
}

/** The whole pipeline against a real directory — shared by the guard and its fixtures. */
export function orphanScan(root: string = ROOT): {
  components: string[];
  imported: Set<string>;
  orphans: string[];
} {
  const options = compilerOptions(root);
  const components = componentFiles(root);
  const imported = importedFiles(productionSourceFiles(root), options, root);
  return { components, imported, orphans: orphansOf(components, imported) };
}
