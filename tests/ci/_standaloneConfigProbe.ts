/**
 * tests/ci/_standaloneConfigProbe.ts
 *
 * OBSERVES what `tests/e2e/standalone.config.ts` actually does, by importing
 * it in a child process with a controlled environment and reading the result.
 *
 * WHY THIS REPLACED STATIC ANALYSIS. Two adversarial rounds found fail-open
 * holes in guards that tried to answer runtime questions by reading source.
 * Round 1 broke a regex reader with a comment. Round 2 broke its AST successor
 * with `if (false)`, uncalled functions, duplicate `??=` (a Map collapses
 * last-write-wins while the runtime is first-write-wins), lexical scope in
 * const resolution, `process.env["NAME"]` bracket access, and a `testMatch`
 * that is not the exported one. Each fix was another epicycle: a static
 * approximation of evaluation semantics, patched wherever it had last been
 * caught diverging.
 *
 * The questions are all of the form "what does this module DO", and the
 * cheapest correct oracle for that is to run it. Importing removes the entire
 * class at once — dead code does not execute, duplicates resolve the way the
 * language resolves them, bracket and dotted access are the same operation,
 * and the config object read is by construction the one Playwright gets,
 * because it is the module's default export.
 *
 * The property tested is also the RIGHT one. The old ordering check asserted
 * that defaults appear before `defineConfig` in source order — which is not
 * the real requirement (Playwright awaits evaluation of the whole config
 * module before loading any test module, so a top-level assignment after the
 * call is equally fine) and would have failed a legitimate config. What
 * actually matters is behavioural: an env var the caller already set must
 * survive, and one they did not must get a default. Both are observed
 * directly below.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const CONFIG = join(ROOT, "tests/e2e/standalone.config.ts");

export type ConfigProbe = {
  /** `config.testMatch.source` as Playwright will actually use it. */
  testMatchSource: string;
  /** The observed value of each requested name after the module ran. */
  env: Record<string, string | null>;
};

/**
 * Import the config in a child process and report what it produced.
 *
 * @param names  env vars to observe.
 * @param preset env to install BEFORE the import. A name present here and
 *               unchanged afterwards proves the config did not clobber it;
 *               a name absent here shows the config's own default.
 */
export function probeConfig(names: string[], preset: Record<string, string> = {}): ConfigProbe {
  // Wrapped in an async IIFE: `--eval` is transformed as CommonJS, where a
  // top-level `await` is a syntax error rather than a module-level await.
  const script = `
    (async () => {
      const names = ${JSON.stringify(names)};
      for (const n of names) delete process.env[n];
      Object.assign(process.env, ${JSON.stringify(preset)});
      const mod = await import(${JSON.stringify(CONFIG)});
      // CJS interop: under tsx the namespace's \`default\` can itself be the
      // module.exports wrapper, so the config sits one level further in.
      const config = mod.default?.testMatch ? mod.default : mod.default?.default;
      if (!config) throw new Error("probe: could not reach the config object");
      const testMatch = config.testMatch;
      process.stdout.write("<<PROBE>>" + JSON.stringify({
        testMatchSource: testMatch instanceof RegExp ? testMatch.source : String(testMatch),
        env: Object.fromEntries(names.map((n) => [n, process.env[n] ?? null])),
      }));
    })().catch((e) => { console.error(e); process.exit(1); });
  `;
  const out = execFileSync("pnpm", ["exec", "tsx", "--eval", script], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
    // A clean slate: the parent's own env must not leak in and mask a missing
    // default. PATH is kept so the toolchain resolves.
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      // Required by this repo's ProcessEnv augmentation, and correct for a
      // config the test harness is evaluating.
      NODE_ENV: "test",
    },
  });
  const marker = out.indexOf("<<PROBE>>");
  if (marker === -1) throw new Error(`probeConfig: no probe output. Got: ${out.slice(0, 400)}`);
  return JSON.parse(out.slice(marker + "<<PROBE>>".length)) as ConfigProbe;
}

/**
 * The alternation branches of the LIVE, evaluated `testMatch`.
 *
 * Reads the COMPILED regex's source, so there is no question of which literal
 * in the file is the effective one — this is the object Playwright receives.
 * Throws on an unrecognised shape rather than returning nothing: a reader that
 * silently yields `[]` makes every caller's assertion vacuous.
 */
export function branchesOf(testMatchSource: string): string[] {
  const m = testMatchSource.match(/^\(([^)]*)\)\\?\.spec\\?\.ts$/);
  if (!m) throw new Error(`branchesOf: unrecognised testMatch shape: ${testMatchSource}`);
  return m[1]!.split("|").map((b) => b.replace(/\\/g, ""));
}
