import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { REPO_ALIAS, TEST_TIMEOUT_MS } from "../../../vitest.projects";
import { mutantOverlayPlugin } from "./overlay";

/**
 * The per-mutant vitest config (spec §3.3).
 *
 * Driven entirely by env, because it is re-invoked once per mutant as a child
 * process:
 *
 *   MUTATION_ROOT    absolute repo root
 *   MUTATION_TARGET  absolute path of the module under mutation
 *   MUTATION_MUTANT  absolute path of a scratch file holding the mutant text
 *   MUTATION_SUITE   repo-relative suite to run
 *
 * The mutant text is served from memory by a `load` hook, so the TRACKED source
 * file is never written. A crashed or killed run therefore cannot leave a
 * mutant on disk, and two concurrent runs cannot race on the working tree —
 * which matters here, because this repo's invariant 11 exists precisely because
 * two writers in one tree corrupt each other.
 */
const req = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`mutantOverlay.config: ${name} is required`);
  return v;
};

const target = req("MUTATION_TARGET");
const mutantSource = readFileSync(req("MUTATION_MUTANT"), "utf8");

export default defineConfig({
  root: req("MUTATION_ROOT"),
  // Parity with the root config, from ONE definition (vitest.projects.ts).
  // Without the alias, every suite importing through `@/` -- 1461 of this
  // repo's 1788 test files -- fails assertCleanBaseline on UNMUTATED source,
  // so the surface cannot be enrolled at all.
  resolve: { alias: REPO_ALIAS(req("MUTATION_ROOT")) },
  plugins: [mutantOverlayPlugin(target, mutantSource)],
  test: {
    include: [req("MUTATION_SUITE")],
    environment: "node",
    // Same rationale: vitest's 5_000ms default fails any suite holding a
    // slower test, again on unmutated source.
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    // One mutant, one suite: reporters and watchers are pure overhead here, and
    // the exit code is the entire signal we consume.
    reporters: [["dot", {}]],
  },
});
