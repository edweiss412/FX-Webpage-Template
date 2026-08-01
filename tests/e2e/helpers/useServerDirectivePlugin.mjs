// tests/e2e/helpers/useServerDirectivePlugin.mjs
//
// Shared "use server" directive resolver for the standalone e2e harness
// (PR-C of the ci-dark descoped close-out; spec §5.1-§5.2). It replaces the two
// ad-hoc mechanisms the harness grew — the regex `useServerElision` in
// _step3ReviewModalBundle.mjs and the path-heuristic stubbing call sites relied
// on — with ONE esbuild plugin whose decision is a real TypeScript parse.
//
// CONTRACT (spec §5.1-§5.2):
//   - A module is a server module iff its directive prologue contains an
//     ExpressionStatement string literal whose COOKED text === "use server"
//     (ts cooks "use\x20server" -> "use server"; single/double quotes both count).
//     No substring prefilter — §5.1: none is sound (a `"use server"` inside a
//     value or comment must NOT trigger; only a genuine prologue directive does).
//   - A directive module must PARSE CLEANLY: parseDiagnostics.length === 0.
//     Probed on the pinned TypeScript (property present and populated: an octal
//     escape "use\040server" and trailing garbage each yield 1 diagnostic and
//     are refused; a hex escape "use\x20server" yields 0 and is accepted). Used
//     directly — no cast, plain property access — because the probe confirmed it.
//   - Stubbable export shapes: named `export async function f`, `export default
//     async function [name]`, and `export const x = async (arrow|function-expr)`.
//     Type-only exports contribute nothing (empty stub). ANY other exported
//     shape — re-export, star export, aliased local export, class, sync
//     function/const, non-async — makes the build FAIL, naming the module and
//     the offending shape. A server body is NEVER shipped to the browser.
//
// The BUILD BOUNDARY is the contract: useServerDirectivePlugin.test.ts bundles
// every fixture through a real esbuild.build and asserts on the emitted bundle,
// not on analyzeModule alone.
//
// Plain JS + JSDoc, NO TypeScript syntax (plan-R1 F14): this module is consumed
// by raw `node` (the C2 _bundleLiveEntryChild.mjs) as well as by vitest.

import { readFileSync } from "node:fs";
import ts from "typescript";

const DIRECTIVE = "use server";

/**
 * @typedef {{ directive: false }
 *   | { directive: true, stub: string }
 *   | { directive: true, error: string }} DirectiveResult
 */

/** @param {string} path */
function scriptKindFor(path) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** Modifier array, robust across TS versions (runtime read). @param {any} node */
function modsOf(node) {
  return node && Array.isArray(node.modifiers) ? node.modifiers : [];
}

/** @param {any} node @param {number} kind */
function hasMod(node, kind) {
  return modsOf(node).some((m) => m.kind === kind);
}

/**
 * True iff the module's directive prologue contains `"use server"`. The prologue
 * is the leading run of string-literal expression statements; the first
 * non-string-literal statement ends it. Cooked text is compared, so escape
 * spellings that cook to "use server" count (diagnostics are gated separately).
 * @param {ts.SourceFile} sf
 */
function hasUseServerDirective(sf) {
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === DIRECTIVE) return true;
      continue; // another prologue directive (e.g. "use strict") — keep scanning
    }
    break; // prologue ended
  }
  return false;
}

/**
 * Classify the module's exports. Returns the runtime export names to stub, or an
 * error string naming the first unsupported shape.
 * @param {ts.SourceFile} sf
 * @returns {{ runtime: string[], error: null } | { runtime: null, error: string }}
 */
function classifyExports(sf) {
  /** @type {string[]} */
  const runtime = [];
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) || ts.isImportDeclaration(st)) continue;

    // export {..}, export {..} from, export *  — never a stubbable action shape
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue; // `export type { ... }`
      return {
        runtime: null,
        error:
          "an `export { ... }` / re-export / `export *` is not a stubbable server-action shape " +
          "(only direct `export async function`, `export default async function`, and " +
          "`export const x = async ...` are supported)",
      };
    }
    // `export default <expression>` (NOT `export default async function`, which is
    // a FunctionDeclaration with a default modifier handled below) / `export =`
    if (ts.isExportAssignment(st)) {
      return {
        runtime: null,
        error: "`export default <expression>` is not a stubbable server-action shape",
      };
    }

    const isExport = hasMod(st, ts.SyntaxKind.ExportKeyword);
    if (!isExport) continue; // non-exported top-level (e.g. a local fn later aliased)

    if (ts.isFunctionDeclaration(st)) {
      const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);
      if (!hasMod(st, ts.SyntaxKind.AsyncKeyword)) {
        return {
          runtime: null,
          error: `exported ${isDefault ? "default " : ""}function ${st.name ? st.name.text : ""} is not async`,
        };
      }
      runtime.push(isDefault ? "default" : st.name ? st.name.text : "default");
      continue;
    }

    if (ts.isClassDeclaration(st)) {
      return {
        runtime: null,
        error: `exported class ${st.name ? st.name.text : ""} is not a stubbable server-action shape`,
      };
    }

    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const name = ts.isIdentifier(d.name) ? d.name.text : null;
        const init = d.initializer;
        const isAsyncFn =
          !!init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
          hasMod(init, ts.SyntaxKind.AsyncKeyword);
        if (!name || !isAsyncFn) {
          return {
            runtime: null,
            error: `exported const ${name ?? "?"} is not an async function/arrow (only \`export const x = async ...\` is stubbable)`,
          };
        }
        runtime.push(name);
      }
      continue;
    }

    if (
      ts.isTypeAliasDeclaration(st) ||
      ts.isInterfaceDeclaration(st) ||
      ts.isEnumDeclaration(st)
    ) {
      continue; // type-only surface contributes no runtime export
    }

    return {
      runtime: null,
      error: `unsupported exported declaration (${ts.SyntaxKind[st.kind]})`,
    };
  }
  return { runtime, error: null };
}

/**
 * Generate the stub module that replaces a server module in the browser bundle:
 * each runtime export becomes a throwing ASYNC function, naming the module and
 * the export. ASYNC is the §5.2 contract — server actions are async, so a call
 * must produce a REJECTED PROMISE (e.g. `stub().catch(...)` and React's awaited
 * form-action path both see the failure), never a synchronous throw that
 * bypasses promise handling. A type-only module yields an empty stub
 * (`export {}`), which ships neither a throw nor a body.
 * @param {string} path @param {string[]} names
 */
function buildStub(path, names) {
  if (names.length === 0) return "export {};\n";
  const lines = names.map((name) => {
    const msg = `[use server stub] ${path} — server action export ${name} is not callable in a browser bundle`;
    const lit = JSON.stringify(msg);
    return name === "default"
      ? `export default async function () { throw new Error(${lit}); }`
      : `export const ${name} = async function () { throw new Error(${lit}); };`;
  });
  return `${lines.join("\n")}\n`;
}

/**
 * Pure core: classify one module's source.
 * @param {string} path @param {string} source @returns {DirectiveResult}
 */
export function analyzeModule(path, source) {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKindFor(path));
  if (!hasUseServerDirective(sf)) return { directive: false };
  // parseDiagnostics: probed present + populated on the pinned TypeScript.
  const diagnostics = sf.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    return {
      directive: true,
      error: `${path}: carries the "use server" directive but has ${diagnostics.length} parse diagnostic(s); refusing to stub a module that does not cleanly parse`,
    };
  }
  const classified = classifyExports(sf);
  if (classified.error !== null) return { directive: true, error: `${path}: ${classified.error}` };
  return { directive: true, stub: buildStub(path, classified.runtime) };
}

/**
 * esbuild plugin: a thin onLoad wrapper over analyzeModule. node_modules are
 * early-returned untouched. A non-directive module is passed through to esbuild's
 * default loader (return null); a directive module is replaced by its stub or, if
 * unsupported, fails the build.
 * @param {{ disabled?: boolean }} [opts] `disabled` (test-only) installs no
 *   onLoad, so every body bundles — the mutation control proving the stub is
 *   what removes server bodies.
 * @returns {import("esbuild").Plugin}
 */
export function useServerDirectivePlugin(opts = {}) {
  const disabled = !!opts.disabled;
  return {
    name: "use-server-directive",
    setup(build) {
      if (disabled) return;
      build.onLoad({ filter: /\.[cm]?tsx?$/ }, (args) => {
        if (args.path.includes("/node_modules/")) return null;
        let source;
        try {
          source = readFileSync(args.path, "utf8");
        } catch {
          return null;
        }
        const res = analyzeModule(args.path, source);
        if (res.directive === false) return null;
        if ("error" in res) return { errors: [{ text: res.error }] };
        return { contents: res.stub, loader: "js" };
      });
    },
  };
}
