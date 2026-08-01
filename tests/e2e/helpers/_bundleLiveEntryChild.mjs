// tests/e2e/helpers/_bundleLiveEntryChild.mjs
//
// The plugin-capable bundler child (PR-C / C2). `bundleLiveEntry` in
// liveEntryToolchain.ts spawns this via `node` instead of `pnpm exec esbuild`,
// because a CLI invocation cannot express an esbuild resolver plugin and the
// harness now needs one: useServerDirectivePlugin stubs every "use server"
// module so a server body never reaches the browser bundle.
//
// It mirrors the exact flag set the CLI used (liveEntryToolchain.ts) so no
// call-site behaviour changes: bundle, iife, automatic JSX, .tsx loader,
// NODE_ENV define, node:fs + caller externals, per-call-site aliases, the repo
// tsconfig, the window.process banner, and the outfile. esbuild applies `alias`
// BEFORE plugins, so per-call-site aliases still win over the plugin.
//
// argv: node _bundleLiveEntryChild.mjs \
//   <entryAbs> <outFileAbs> <tsconfigAbs> <aliasesJson> <externalsJson> [--metafile <path>]
// <externalsJson> already includes "node:fs" (the caller prepends it).
// --metafile writes esbuild's build metafile JSON to <path> (C4's import-graph
// reality check consumes it through the shipped channel).

import { writeFileSync } from "node:fs";
import { build } from "esbuild";
import { useServerDirectivePlugin } from "./useServerDirectivePlugin.mjs";

const [, , entry, outFile, tsconfig, aliasesJson, externalsJson, ...rest] = process.argv;

let metafilePath = null;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--metafile") {
    metafilePath = rest[i + 1];
    i++;
  }
}

if (!entry || !outFile || !tsconfig || !aliasesJson || !externalsJson) {
  process.stderr.write(
    "bundleLiveEntry child: usage: <entry> <outFile> <tsconfig> <aliasesJson> <externalsJson> [--metafile <path>]\n",
  );
  process.exit(2);
}

const aliases = JSON.parse(aliasesJson);
const externals = JSON.parse(externalsJson);

try {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    loader: { ".tsx": "tsx" },
    define: { "process.env.NODE_ENV": '"production"' },
    external: externals,
    alias: aliases,
    tsconfig,
    banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
    outfile: outFile,
    write: true,
    metafile: Boolean(metafilePath),
    logLevel: "silent",
    // Not a React hook — an esbuild plugin factory the spec/plan names
    // useServerDirectivePlugin; the "use" prefix trips react-hooks/rules-of-hooks.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    plugins: [useServerDirectivePlugin()],
  });
  if (metafilePath) writeFileSync(metafilePath, JSON.stringify(result.metafile));
} catch (e) {
  const text = Array.isArray(e?.errors)
    ? e.errors.map((m) => m.text ?? "").join("\n")
    : (e?.message ?? String(e));
  process.stderr.write(`bundleLiveEntry child: esbuild build failed:\n${text}\n`);
  process.exit(1);
}
