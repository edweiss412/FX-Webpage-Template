/**
 * tests/components/show-panels/_metaShowPanelsBoundary.test.ts
 * (crew page redesign PR B plan, Task 4; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1 lines 286-288)
 *
 * components/show-panels/ holds the section bodies the admin review popup and
 * the crew page both render. Two contracts make that safe, and this walker pins
 * both for every file in the directory, a file added later included:
 *
 * 1. A body is a plain server function. The crew page CALLS it inside
 *    `WrappedSection`'s render callback (spec line 291), which only catches what
 *    throws while that callback runs, so a body may hold no hook, read no
 *    context and carry no module-level `"use client"`. Interactive leaves are the
 *    one exception, each named in LEAF_ACCEPT_LIST below; a leaf may use hooks,
 *    since the client boundary (`TileErrorBoundary`) contains it, but it is still
 *    under the import ban and still reads no context.
 * 2. The directory is neutral. A crew bundle that imports a body must not pull in
 *    admin code or a server-only module, so no file here imports from
 *    `components/admin/`, `lib/admin/`, `server-only`, or a module that declares
 *    `"use server"` or imports `server-only`.
 *
 * The checks read the TypeScript AST, not text, so a hook name inside a string
 * or a comment is not a call. Each rule is proven live on planted sources below
 * before it is applied to the tree.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { premise } from "@/tests/_shared/premise";

const ROOT = process.cwd();
const DIR = join("components", "show-panels");

/**
 * Interactive client leaves (spec line 288), repo-relative. Starts empty: no PR B
 * body needs one (plan clause map, L288). A row is a deliberate act with a reason.
 */
const LEAF_ACCEPT_LIST = new Set<string>([]);

type Resolver = (specifier: string, fromFile: string) => string | null;

/** The repo file an import specifier names, or null for a package. */
const resolveRepoModule: Resolver = (specifier, fromFile) => {
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
};

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Whether the module's directive prologue holds `directive`. */
function hasDirective(sf: ts.SourceFile, directive: string): boolean {
  for (const stmt of sf.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === directive) return true;
  }
  return false;
}

/** Every module specifier the file names: imports, re-exports and dynamic imports. */
function specifiers(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The called name of a call expression: `useX(...)` and `React.useX(...)` both give `useX`. */
function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

/** Whether a repo module is server-only: a `"use server"` module or one importing `server-only`. */
function isServerOnlyModule(file: string): boolean {
  const sf = parse(file, readFileSync(join(ROOT, file), "utf8"));
  return hasDirective(sf, "use server") || specifiers(sf).includes("server-only");
}

/**
 * Every boundary violation in one show-panels file. Pure over its inputs, so the
 * rules are tested on planted sources as well as on the tree.
 */
function boundaryViolations(
  file: string,
  source: string,
  opts: {
    leaf: boolean;
    resolveModule?: Resolver;
    serverOnly?: (repoFile: string) => boolean;
  },
): string[] {
  const resolveModule = opts.resolveModule ?? resolveRepoModule;
  const serverOnly = opts.serverOnly ?? isServerOnlyModule;
  const sf = parse(file, source);
  const out: string[] = [];

  if (!opts.leaf && hasDirective(sf, "use client")) {
    out.push(`${file}: module-level "use client" outside the leaf accept-list`);
  }

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && (node.text === "useContext" || node.text === "createContext")) {
      out.push(`${file}: reads context (${node.text})`);
    }
    if (ts.isCallExpression(node) && !opts.leaf) {
      const name = calleeName(node);
      if (name !== null && /^use[A-Z0-9]/.test(name)) {
        out.push(`${file}: hook call ${name}() in a body file`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const spec of specifiers(sf)) {
    if (spec === "server-only") {
      out.push(`${file}: imports server-only`);
      continue;
    }
    const target = resolveModule(spec, file);
    const path = target ?? spec;
    if (/^(@\/)?components\/admin\//.test(spec) || path.startsWith("components/admin/")) {
      out.push(`${file}: imports from components/admin (${spec})`);
    } else if (/^(@\/)?lib\/admin\//.test(spec) || path.startsWith("lib/admin/")) {
      out.push(`${file}: imports from lib/admin (${spec})`);
    } else if (target !== null && serverOnly(target)) {
      out.push(`${file}: imports a server-only module (${spec})`);
    }
  }
  return out;
}

function walk(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return [];
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out.sort();
}

describe("show-panels boundary rules, on planted sources", () => {
  const none = { resolveModule: () => null, serverOnly: () => false };
  const body = (source: string) =>
    boundaryViolations("components/show-panels/X.tsx", source, { leaf: false, ...none });
  const leaf = (source: string) =>
    boundaryViolations("components/show-panels/X.tsx", source, { leaf: true, ...none });

  test("a clean body passes (negative control for every rule below)", () => {
    expect(
      body(`import type { ReactNode } from "react";
export function Body({ x }: { x: ReactNode }) { return <div>{x}</div>; }`),
    ).toEqual([]);
  });

  test('a module-level "use client" fails in a body and passes in a leaf', () => {
    const src = `"use client";\nexport function B() { return null; }`;
    expect(body(src)).toHaveLength(1);
    expect(leaf(src)).toEqual([]);
    // A directive-shaped string that is not in the prologue is not a directive.
    expect(body(`export const x = 1;\n"use client";`)).toEqual([]);
  });

  test("context fails in a body and in a leaf, imported or called", () => {
    for (const src of [
      `import { useContext } from "react"; export function B() { return null; }`,
      `import React from "react"; export function B() { React.useContext(C); return null; }`,
      `import { createContext } from "react"; export const C = createContext(null);`,
    ]) {
      expect(
        body(src).some((v) => v.includes("reads context")),
        src,
      ).toBe(true);
      expect(
        leaf(src).some((v) => v.includes("reads context")),
        src,
      ).toBe(true);
    }
  });

  test("a hook call fails in a body, bare or namespaced, and passes in a leaf", () => {
    for (const src of [
      `import { useId } from "react"; export function B() { const id = useId(); return id; }`,
      `import React from "react"; export function B() { React.useState(0); return null; }`,
      `import { useThing } from "./thing"; export function B() { useThing(); return null; }`,
    ]) {
      expect(
        body(src).some((v) => v.includes("hook call")),
        src,
      ).toBe(true);
      expect(
        leaf(src).filter((v) => v.includes("hook call")),
        src,
      ).toEqual([]);
    }
    // A hook name in a string or a comment is not a call; a `user` call is not a hook.
    expect(body(`// useState()\nexport const s = "useId()"; user(); useless();`)).toEqual([]);
  });

  test("an admin, server-only or use-server import fails, in a body and in a leaf", () => {
    const serverOnly = (f: string) => f === "lib/srv.ts";
    const resolveModule = (s: string) => (s === "@/lib/srv" ? "lib/srv.ts" : null);
    for (const [src, why] of [
      [`import { A } from "@/components/admin/A";`, "components/admin"],
      [`export { A } from "@/lib/admin/a";`, "lib/admin"],
      [`import "server-only";`, "server-only"],
      [`import { s } from "@/lib/srv";`, "server-only module"],
      [`const m = import("@/components/admin/A");`, "components/admin"],
    ] as const) {
      for (const isLeaf of [false, true]) {
        const found = boundaryViolations("components/show-panels/X.tsx", src, {
          leaf: isLeaf,
          resolveModule,
          serverOnly,
        });
        expect(
          found.some((v) => v.includes(why)),
          `${src} (${isLeaf ? "leaf" : "body"})`,
        ).toBe(true);
      }
    }
  });
});

describe("components/show-panels/ boundary (spec §6.1)", () => {
  const files = walk(DIR);
  const bodies = files.filter((f) => !LEAF_ACCEPT_LIST.has(f));

  test("the walk sees the directory's body files", () => {
    premise("show-panels body files the walk saw", bodies.length, 0);
    // A leaf row naming a file that is not there would be a hole that cannot rot visibly.
    for (const leafFile of LEAF_ACCEPT_LIST) {
      expect(files, `${leafFile} is accept-listed but absent`).toContain(leafFile);
    }
  });

  test.each(files)("%s keeps the show-panels boundary", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(boundaryViolations(file, source, { leaf: LEAF_ACCEPT_LIST.has(file) })).toEqual([]);
  });
});
