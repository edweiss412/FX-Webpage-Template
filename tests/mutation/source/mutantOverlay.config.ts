import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
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
  plugins: [mutantOverlayPlugin(target, mutantSource)],
  test: {
    include: [req("MUTATION_SUITE")],
    environment: "node",
    // One mutant, one suite: reporters and watchers are pure overhead here, and
    // the exit code is the entire signal we consume.
    reporters: [["dot", {}]],
  },
});
