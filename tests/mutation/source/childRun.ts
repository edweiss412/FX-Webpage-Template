import { execFileSync } from "node:child_process";
import { join } from "node:path";

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
 */
export function childRun(root: string, fixture: string, target: string): number {
  try {
    execFileSync("pnpm", ["exec", "vitest", "run", "--config", CONFIG], {
      cwd: root,
      // Same shape as `runSuite` in ./runner.ts, repaired together: the exit
      // code is the whole signal, the output is never read, and piping it only
      // buys Node's 1 MB `maxBuffer` cap — under which a loud enough child dies
      // as an infra fault instead of reporting its status.
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        VITEST_INCLUDE_MUTATION_HARNESS: "1",
        MUTATION_ROOT: root,
        MUTATION_TARGET: join(root, target),
        MUTATION_MUTANT: join(root, target),
        MUTATION_SUITE: fixture,
      },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";

/** The module every fixture is overlaid against; its content is never mutated. */
export const INERT_TARGET = "tests/mutation/source/operators.ts";
