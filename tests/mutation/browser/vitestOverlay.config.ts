import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { REPO_ALIAS, TEST_TIMEOUT_MS } from "../../../vitest.projects";
import { createMutantLoadHook } from "../source/overlay";
import { parseManifest } from "./mutate";

/**
 * The browser mode's per-mutant VITEST config (spec §3.3 step 3).
 *
 * Thin by contract: its only additions over the suite's normal environment are
 * the manifest-driven overlay and the sentinel. Everything else mirrors the root
 * config's root-level options (`vitest.config.ts:66-88`), because a child that
 * ran in a DIFFERENT environment than the suite normally does would fail the
 * baseline and report the environment rather than the mutant.
 *
 * The mode's ONE env var drives it: `MUTATION_OVERLAY_MANIFEST` names a JSON
 * manifest `{entries: [{target, mutant}]}`, so an N-file mutant is expressed the
 * same way here as in the bundle plugin. The vitest mode's
 * `MUTATION_TARGET`/`MUTATION_MUTANT` pair is untouched and never read.
 *
 * Env UNSET ⇒ no overlay plugin at all and no sentinel: the config still runs
 * the named suite, which is exactly what the runner's BASELINE pass needs.
 */
const ROOT = resolve(__dirname, "..", "..", "..");

/**
 * Read the manifest EAGERLY and write the sentinel only after every mutant file
 * has been read — the same verdict-integrity contract the bundle plugin carries
 * (spec §3.4). A manifest that cannot be honoured must fail the child before any
 * test runs, never leave it green with clean source.
 */
function overlayPlugins(manifestPath: string | undefined) {
  if (!manifestPath) return [];

  const entries = parseManifest(readFileSync(manifestPath, "utf8"));
  if (entries.length === 0) {
    throw new Error(`mutation overlay: manifest has no entries: ${manifestPath}`);
  }
  const loaded = entries.map((entry) => ({
    target: resolve(entry.target),
    source: readFileSync(entry.mutant, "utf8"),
  }));
  writeFileSync(`${manifestPath}.ok`, `${loaded.length}\n`);

  return loaded.map(({ target, source }, i) => ({
    name: `mutant-overlay-${i}`,
    enforce: "pre" as const,
    load: createMutantLoadHook(target, source),
  }));
}

export default defineConfig({
  root: ROOT,
  resolve: {
    alias: REPO_ALIAS(ROOT),
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json", ".mdx"],
  },
  plugins: overlayPlugins(process.env.MUTATION_OVERLAY_MANIFEST),
  test: {
    // Broad enough to hold BOTH an enrolled `.test.tsx` suite and the wiring
    // suite's `.fixture.ts` probe; the runner always passes the one suite it
    // wants as a positional filter, and vitest intersects the two.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/mutation/**/*.fixture.ts"],
    environment: "node",
    globals: false,
    setupFiles: ["tests/setup.ts"],
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    // One mutant, one suite: the exit code is the entire signal we consume.
    reporters: [["dot", {}]],
  },
});
