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
//   1. useServerDirectivePlugin — the SHARED "use server" resolver (PR-C / C3):
//      any module whose directive prologue cooks to `"use server"` is replaced by
//      a throwing stub, so its server-only dep subtree drops out entirely. This
//      supersedes the local regex `useServerElision` this file used to carry — a
//      TypeScript-parse decision, contract-tested at the build boundary in
//      helpers/useServerDirectivePlugin.test.ts. The stubbed actions are never
//      invoked by the interaction harness (scroll / nav / drag only).
//   2. emptyNodeBuiltins — resolve node builtins (and the harness's never-run
//      main-guard `require("node:fs")`) to an empty CJS module. CJS interop lets
//      `import { createHash } from "node:crypto"` bind to `undefined` (never
//      called on the harness render path) instead of erroring on a missing
//      named export. This supersedes the old `--external:node:fs` flag.
//
// Pinned esbuild devDep (package.json) — matches the version the tailwind CLI step
// still pins via `pnpm dlx`.

import { builtinModules } from "node:module";
import * as esbuild from "esbuild";
import { useServerDirectivePlugin } from "./helpers/useServerDirectivePlugin.mjs";

const [, , entry, outfile, tsconfig] = process.argv;
if (!entry || !outfile || !tsconfig) {
  console.error("usage: node _step3ReviewModalBundle.mjs <entry> <outfile> <tsconfig>");
  process.exit(2);
}

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
  // Not a React hook — an esbuild plugin factory the spec/plan names
  // useServerDirectivePlugin; the "use" prefix trips react-hooks/rules-of-hooks.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  plugins: [useServerDirectivePlugin(), emptyNodeBuiltins],
  outfile,
  logLevel: "warning",
});

if (result.errors.length > 0) process.exit(1);
