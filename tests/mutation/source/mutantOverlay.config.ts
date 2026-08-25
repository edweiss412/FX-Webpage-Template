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
    // Stop at the first failing case.
    //
    // THE CONTRACT, and why this cannot move a verdict: the exit code is the
    // entire signal the harness consumes (`childRun` returns it and nothing
    // else). `bail` changes WHEN a failing run stops, never WHETHER it failed,
    // so a mutant the suite rejects still exits non-zero and is still KILLED. A
    // SURVIVING mutant fails nothing, so bail never fires and it pays for its
    // whole suite exactly as before. Both halves are pinned behaviorally, not by
    // asserting this literal, in `tests/mutation/_metaOverlayConfigParity.test.ts`
    // ("the per-mutant child bails on the first failure, and only on a failure").
    //
    // What it buys: a killed mutant currently runs every remaining case after the
    // one that killed it. On `controlOutlineResidue` that is 236 of 250 mutants
    // each paying ~39s to re-learn what the first failure already settled, and
    // three mutants on a single line ground for 25, 57 and 125 minutes -- 207 of
    // that run's 335 -- because a late, expensive case kept running under a mutant
    // that had already been rejected. Measured on three killed mutants: 39s->11s,
    // 37s->13s, ~39s->3s.
    //
    // It also shrinks the wall-clock-ceiling class: a killed mutant that stops at
    // its first failure has far less opportunity to reach the ceiling and be
    // recorded as a timeout-kill, which `gate.ts` itself calls "NOT evidence the
    // suite rejected the mutant".
    bail: 1,
  },
});
