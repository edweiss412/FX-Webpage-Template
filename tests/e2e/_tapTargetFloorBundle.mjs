// tests/e2e/_tapTargetFloorBundle.mjs
//
// Browser-bundle builder for the tap-target-floor live entry
// (tests/e2e/tap-target-floor.layout.spec.ts, spec 2026-08-07-step3-a11y-cluster §8).
//
//   node _tapTargetFloorBundle.mjs <entry.tsx> <outfile.js> <tsconfig.json>
//
// This is `_step3ReviewModalBundle.mjs` with ONE difference, and it exists as a
// sibling rather than as an edit to that file for a reason spec §8 states
// directly: the shared bundler backs other standalone specs, and changing its
// resolution semantics is a redesign of a surface this branch does not
// otherwise touch. That fence is honoured exactly — `_step3ReviewModalBundle.mjs`
// is untouched, byte for byte, and the two specs that invoke it are unaffected.
// The cost is a copy, and the copy is small and annotated so a reader can see
// the whole of the difference in one place.
//
// THE DIFFERENCE: `node:async_hooks` resolves to a FUNCTIONAL `AsyncLocalStorage`
// instead of an empty object.
//
// WHY IT IS NEEDED, measured rather than assumed. Spec §1.1 R10 records that
// `lib/log/requestContext.ts:15` calls `new AsyncLocalStorage()` at module scope,
// which the empty-builtin stub turns into `new undefined()`, and answers it for
// `/me` by extracting the render half — believing that removed the last path
// into the log graph. Bundling each of this entry's mounts alone shows it did
// not:
//
//   MeShowSections          AsyncLocalStorage refs: 0
//   AdministratorsSection   AsyncLocalStorage refs: 0
//   HelpSheet               AsyncLocalStorage refs: 0
//   OperatorErrorBlock      AsyncLocalStorage refs: 22
//   AdminNav                AsyncLocalStorage refs: 21
//
// Both reach `@/lib/log` through ordinary client imports that no `"use server"`
// prologue elides, so no amount of extraction removes them: the components under
// measurement ARE the importers, and spec §8 requires the REAL components.
//
// WHY IT LOOKED FINE FOR DAYS. esbuild wraps CJS modules in a lazy initializer,
// so the constructor runs on FIRST REQUIRE, not at import time — and whether the
// render path reaches that require is environment-dependent. The entry mounted
// cleanly on the dev machine AND on linux/amd64 in the pinned
// mcr.microsoft.com/playwright:v1.59.1-jammy image with a container-native
// install, and crashed every time on the GitHub runner with
// `TypeError: import_node_async_hooks.AsyncLocalStorage is not a constructor`.
// An in-bundle shim was tried first and does NOT work: esbuild gives each
// importer its own `__toESM` copy of a CJS module's exports, so seeding the
// namespace one module sees cannot reach the one another module reads.
//
// WHAT THE STUB IS NOT. It is not an AsyncLocalStorage. There is no async
// context propagation, because a browser harness measuring tap targets has no
// request scope to propagate and never reads one back — it only has to survive
// construction and the handful of methods a logger touches. Everything else
// about this file, including `useServerDirectivePlugin` and the empty mapping for
// every OTHER builtin, is identical to the shared bundler.

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { useServerDirectivePlugin } from "./helpers/useServerDirectivePlugin.mjs";

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const ASYNC_HOOKS = new Set(["async_hooks", "node:async_hooks"]);

/** The one builtin that needs a body rather than an empty object. */
const ASYNC_HOOKS_STUB = `
class AsyncLocalStorage {
  constructor() { this._store = undefined; }
  getStore() { return this._store; }
  run(store, callback, ...args) {
    const previous = this._store;
    this._store = store;
    try { return callback(...args); } finally { this._store = previous; }
  }
  enterWith(store) { this._store = store; }
  exit(callback, ...args) {
    const previous = this._store;
    this._store = undefined;
    try { return callback(...args); } finally { this._store = previous; }
  }
  disable() { this._store = undefined; }
}
class AsyncResource {
  constructor(type) { this.type = type; }
  runInAsyncScope(fn, thisArg, ...args) { return fn.apply(thisArg, args); }
  emitDestroy() { return this; }
  bind(fn) { return fn; }
}
module.exports = { AsyncLocalStorage, AsyncResource, executionAsyncId: () => 0, triggerAsyncId: () => 0 };
`;

const nodeBuiltins = {
  name: "node-builtins-with-async-hooks",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!NODE_BUILTINS.has(args.path)) return null;
      return {
        path: args.path,
        namespace: ASYNC_HOOKS.has(args.path) ? "async-hooks-stub" : "empty-builtin",
      };
    });
    build.onLoad({ filter: /.*/, namespace: "empty-builtin" }, () => ({
      contents: "module.exports = {};",
      loader: "js",
    }));
    build.onLoad({ filter: /.*/, namespace: "async-hooks-stub" }, () => ({
      contents: ASYNC_HOOKS_STUB,
      loader: "js",
    }));
  },
};

/**
 * Absolute path, with symlinks resolved.
 *
 * Both halves are load-bearing. `resolve` alone compares `/var/folders/...`
 * against the `/private/var/folders/...` esbuild reports on macOS and misses
 * every time, silently serving DISK text — the exact "overlay never applied,
 * perfect score" failure the sentinel exists to catch. `realpathSync` alone
 * throws for a path that does not exist, which a module id can legitimately be
 * mid-resolution, so it falls back rather than aborting the build.
 */
function canonical(p) {
  try {
    return realpathSync(resolve(p));
  } catch {
    return resolve(p);
  }
}

/**
 * The browser-mutant overlay (mutation-browser spec §3.1).
 *
 * Registered FIRST, and only when `MUTATION_OVERLAY_MANIFEST` is set: esbuild
 * runs `onLoad` callbacks in registration order and the first non-undefined
 * result wins, so the overlay must precede every plugin that could load the real
 * file from disk.
 *
 * The manifest is parsed and every mutant file read EAGERLY, here at
 * registration time, before the build begins. That is half of the §3.4
 * verdict-integrity contract: a broken overlay must fail loudly rather than
 * produce a green child whose mutant would then score SURVIVED. Only once every
 * entry has been read does it write the `<manifest>.ok` sentinel the runner
 * checks after each child.
 *
 * Recognition is canonical-absolute-path equality and nothing else, matching the
 * vitest overlay's posture (tests/mutation/source/overlay.ts:21-34): a suffix
 * match would overlay a same-named module elsewhere in the graph.
 *
 * Tracked source files are never written, so a crashed run cannot leave a mutant
 * on disk.
 */
function mutationOverlayPlugin(manifestPath) {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entries = parsed?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`mutation overlay: manifest has no entries: ${manifestPath}`);
  }

  const byTarget = new Map();
  for (const entry of entries) {
    if (typeof entry?.target !== "string" || typeof entry?.mutant !== "string") {
      throw new Error(`mutation overlay: malformed manifest entry in ${manifestPath}`);
    }
    // Throws on an unreadable mutant, by design and before the build.
    byTarget.set(canonical(entry.target), readFileSync(entry.mutant, "utf8"));
  }
  writeFileSync(`${manifestPath}.ok`, `${byTarget.size}\n`);

  const LOADERS = { ".tsx": "tsx", ".ts": "ts", ".jsx": "jsx", ".mjs": "js", ".js": "js" };

  return {
    name: "mutation-overlay",
    setup(build) {
      build.onLoad({ filter: /.*/ }, (args) => {
        const contents = byTarget.get(canonical(args.path));
        if (contents === undefined) return undefined;
        return { contents, loader: LOADERS[extname(args.path)] ?? "tsx" };
      });
    },
  };
}

/**
 * The plugin list, as a function of the environment.
 *
 * Exported so the wiring suite can assert that with the flag UNSET the overlay
 * plugin is ABSENT from the list — not merely inert. A register-but-no-op
 * implementation passes every output assertion and fails that one.
 */
export function buildPlugins(env) {
  const manifest = env.MUTATION_OVERLAY_MANIFEST;
  return [
    ...(manifest ? [mutationOverlayPlugin(manifest)] : []),
    // Not a React hook — an esbuild plugin factory the spec/plan names
    // useServerDirectivePlugin; the "use" prefix trips react-hooks/rules-of-hooks.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useServerDirectivePlugin(),
    nodeBuiltins,
  ];
}

export async function buildBundle({ entry, outfile, tsconfig, env = process.env }) {
  return esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    loader: { ".tsx": "tsx" },
    define: { "process.env.NODE_ENV": '"production"' },
    tsconfig,
    banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
    plugins: buildPlugins(env),
    outfile,
    logLevel: "warning",
  });
}

// CLI entry. Guarded so importing this module for `buildPlugins` does not build
// anything — the wiring suite imports it, and an unguarded main block would
// exit(2) on the missing argv instead.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , entry, outfile, tsconfig] = process.argv;
  if (!entry || !outfile || !tsconfig) {
    console.error("usage: node _tapTargetFloorBundle.mjs <entry> <outfile> <tsconfig>");
    process.exit(2);
  }
  const result = await buildBundle({ entry, outfile, tsconfig });
  if (result.errors.length > 0) process.exit(1);
}
