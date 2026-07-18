// tests/e2e/_step3ReviewModalBundle.mjs
//
// Browser-bundle builder for the LIVE <Step3ReviewModal> interaction harness
// (step3-review-modal.interactions.spec.ts step 3). Shelled out of the Playwright
// process (its test transform rewrites JSX in every spec-imported .tsx into
// component-testing payloads, so the browser bundle must be built OUT of process).
//
//   node _step3ReviewModalBundle.mjs <entry.tsx> <outfile.js> <tsconfig.json>
//
// WHY A PLUGIN BUILD (not `pnpm dlx esbuild ... --external:node:fs`):
// <Step3ReviewModal> is a real client component whose graph reaches, via the
// `<UseRawControlBoundary>` glue, two `"use server"` action modules
// (app/admin/show/[slug]/_actions/useRaw.ts, app/admin/onboarding/_actions/useRawStaged.ts).
// Next resolves a `"use server"` import to an RPC reference — the server body
// (postgres, node:crypto via requireAdmin/hashForLog, node:async_hooks via lib/log)
// NEVER enters the client bundle. esbuild has no `"use server"` semantics, so it
// follows those as ordinary value imports and fails to resolve the node builtins
// they drag in. It ALSO fails on node:crypto reached through the pure-client
// parser-overlay path (lib/parser/warnings → useRawContentHash), where only the
// regex `isContentHash` is actually used and Next/webpack tree-shakes the rest —
// but esbuild errors at RESOLVE time, before tree-shaking removes it.
//
// Both are esbuild-vs-Next-bundler-semantics gaps, NOT real client-bundle leaks.
// This build closes them structurally (by class, not by naming individual paths):
//   1. useServerElision  — replicate Next's elision: any module whose first
//      statement is a `"use server"` directive is replaced by no-op exports, so
//      its server-only dep subtree drops out entirely.
//   2. emptyNodeBuiltins — resolve node builtins (and the harness's never-run
//      main-guard `require("node:fs")`) to an empty CJS module. CJS interop lets
//      `import { createHash } from "node:crypto"` bind to `undefined` (never
//      called on the harness render path) instead of erroring on a missing
//      named export. This supersedes the old `--external:node:fs` flag.
//
// Pinned esbuild devDep (package.json) — matches the version the tailwind CLI step
// still pins via `pnpm dlx`.

import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import * as esbuild from "esbuild";

const [, , entry, outfile, tsconfig] = process.argv;
if (!entry || !outfile || !tsconfig) {
  console.error("usage: node _step3ReviewModalBundle.mjs <entry> <outfile> <tsconfig>");
  process.exit(2);
}

// Strip a leading BOM + any run of block/line comments so the `"use server"`
// directive (which must be the module's first STATEMENT, but may follow a file
// JSDoc — e.g. useRaw.ts's is ~1.3kB in) is exposed. Runs on the full source,
// never a fixed-length prefix, so a long header comment can't hide the directive.
const LEADING_NONCODE = /^﻿?(?:\s*\/\*[\s\S]*?\*\/|\s*\/\/[^\n]*)*\s*/;

/**
 * Replicate Next's `"use server"` elision: a module that starts with a
 * `"use server"` directive becomes no-op exports, so its server-only dependency
 * subtree never reaches the browser bundle. The stubbed actions are never invoked
 * by the interaction harness (which drives scroll / nav / drag only); if one were
 * ever called it throws a clear harness-only error rather than silently no-op'ing.
 */
const useServerElision = {
  name: "use-server-elision",
  setup(build) {
    build.onLoad({ filter: /\.(?:[cm]?tsx?|[cm]?jsx?)$/ }, async (args) => {
      const src = await readFile(args.path, "utf8");
      const head = src.replace(LEADING_NONCODE, "");
      if (!/^["']use server["']/.test(head)) return null;
      const names = new Set();
      for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g))
        names.add(m[1]);
      for (const m of src.matchAll(/export\s+const\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
      const stub =
        [...names]
          .map(
            (n) =>
              `export const ${n} = async () => { throw new Error("server action ${n} is not callable in the browser harness"); };`,
          )
          .join("\n") || "export {};";
      return { contents: stub, loader: "js" };
    });
  },
};

// Any Node core module that survives into the resolve pass — node:crypto on the
// pure-client parser path (lib/parser/warnings → useRawContentHash's isContentHash),
// node:fs from the harness main-guard, and whatever a not-yet-stubbed dep drags in
// — resolves to an empty CJS module. CJS interop lets named imports bind to
// `undefined`; none are called on the harness render path. The set is derived from
// `builtinModules` (both `x` and `node:x` forms) so it never drifts as new builtins
// appear in the client-reachable graph.
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const emptyNodeBuiltins = {
  name: "empty-node-builtins",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) =>
      NODE_BUILTINS.has(args.path) ? { path: args.path, namespace: "empty-builtin" } : null,
    );
    build.onLoad({ filter: /.*/, namespace: "empty-builtin" }, () => ({
      contents: "module.exports = {};",
      loader: "js",
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  loader: { ".tsx": "tsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  tsconfig,
  // Shim `process` for Next client-runtime env reads beyond NODE_ENV.
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
  plugins: [useServerElision, emptyNodeBuiltins],
  outfile,
  logLevel: "warning",
});

if (result.errors.length > 0) process.exit(1);
