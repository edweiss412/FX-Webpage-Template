import { join } from "node:path";
import { MutantRunInfraError } from "./runner";
import { MUTANT_TIMEOUT_MS, spawnBounded } from "./spawnBounded";

/**
 * Run one fixture through the REAL per-mutant overlay config, serving clean
 * source, and return the child's exit code.
 *
 * Lives in its own module rather than in a test file because three consumers
 * import it and importing a `*.test.ts` would execute that file's suite inside
 * the importer.
 *
 * The exit code is the whole signal, and it has to be: the fixtures that prove
 * a premise cannot run MUST FAIL when executed, so they can never be ordinary
 * discovered tests and nothing but a child's status can carry their verdict.
 *
 * Which is exactly why an ABNORMAL outcome throws instead of returning a
 * number. A hung or reaper-killed fixture produced no verdict at all, and the
 * version this replaces returned `status ?? 1` for it — a fabricated non-zero
 * that reads as "premise proven" at
 * `tests/mutation/_metaPremiseContract.test.ts:336`, the one consumer where a
 * forged code is silent rather than loud. A timeout is not the same event as a
 * fixture that ran and failed, and only one of the two is evidence.
 *
 * The mapping differs from `runSuite`'s on purpose: there a timeout is the
 * MUTANT's own doing and scores as detection; here it is an authoring or
 * infrastructure defect. One bounded-spawn mechanism, two caller-owned
 * interpretations.
 */
export function childRun(root: string, fixture: string, target: string): number {
  const { outcome } = spawnBounded(["pnpm", "exec", "vitest", "run", "--config", CONFIG], {
    cwd: root,
    env: {
      ...process.env,
      VITEST_INCLUDE_MUTATION_HARNESS: "1",
      MUTATION_ROOT: root,
      MUTATION_TARGET: join(root, target),
      MUTATION_MUTANT: join(root, target),
      MUTATION_SUITE: fixture,
    },
    timeoutMs: MUTANT_TIMEOUT_MS,
  });
  if (outcome.kind === "exit") return outcome.code;
  if (outcome.kind === "timeout") {
    throw new MutantRunInfraError(`childRun ${fixture}`, null, "ETIMEDOUT");
  }
  throw new MutantRunInfraError(`childRun ${fixture}`, outcome.signal, outcome.code);
}

const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";

/** The module every fixture is overlaid against; its content is never mutated. */
export const INERT_TARGET = "tests/mutation/source/operators.ts";
