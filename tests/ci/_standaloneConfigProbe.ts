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
  /** Whether the evaluated matcher is a RegExp at all. */
  isRegExp: boolean;
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
 * @param runnerEnv whether to set CI / GITHUB_ACTIONS, so the config is
 *               evaluated as the workflow will evaluate it. Default true.
 */
export function probeConfig(
  names: string[],
  preset: Record<string, string> = {},
  runnerEnv = true,
): ConfigProbe {
  // Wrapped in an async IIFE: `--eval` is transformed as CommonJS, where a
  // top-level `await` is a syntax error rather than a module-level await.
  const script = `
    (async () => {
      const names = ${JSON.stringify(names)};
      for (const n of names) delete process.env[n];
      Object.assign(process.env, ${JSON.stringify(preset)});
      const mod = await import(${JSON.stringify(CONFIG)});
      // CJS interop: under tsx the namespace's \`default\` can be the
      // module.exports wrapper, so the real config may sit one level in.
      // Preferring whichever happens to expose \`testMatch\` let a NAMED
      // export called \`testMatch\` win over the actual default config, so
      // ambiguity is now an ERROR rather than a guess.
      const outer = mod.default;
      const inner = outer && outer.default;
      // Deterministic interop resolution, matching how the runtime itself
      // unwraps a CJS module: if there IS a nested \`default\`, that is the
      // ESM default export and therefore the config -- full stop. An earlier
      // version picked whichever object happened to expose \`testMatch\`,
      // which let a NAMED export called \`testMatch\` win over the real
      // config. Named exports are never consulted now.
      const config = inner && typeof inner === "object" ? inner : outer;
      if (!config || typeof config !== "object") {
        throw new Error("probe: could not reach the config object");
      }
      const testMatch = config.testMatch;
      process.stdout.write("<<PROBE>>" + JSON.stringify({
        isRegExp: testMatch instanceof RegExp,
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
      // Required by this repo's ProcessEnv augmentation.
      NODE_ENV: "test",
      // Runner variables, so the config is evaluated under the environment the
      // WORKFLOW actually provides. Stripping them meant a config that
      // exported a full matcher locally and a subset under `process.env.CI`
      // would be observed as full coverage while Actions ran the subset;
      // CI-conditional Playwright config is already used elsewhere here.
      // `runnerEnv: false` observes the local environment instead, and the
      // guard asserts the two agree.
      ...(runnerEnv ? { CI: "true", GITHUB_ACTIONS: "true" } : {}),
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
export function branchesOf(probe: ConfigProbe): string[] {
  // A STRING matcher is a glob, not a regex: one that merely looks like
  // `(a|b)\.spec\.ts` matches no file at all, yet parsed cleanly into two
  // plausible branch names. Require a real RegExp before reading it as one.
  if (!probe.isRegExp) {
    throw new Error(`branchesOf: testMatch is not a RegExp: ${probe.testMatchSource}`);
  }
  const m = probe.testMatchSource.match(/^\(([^)]*)\)\\\.spec\\\.ts$/);
  if (!m) throw new Error(`branchesOf: unrecognised testMatch shape: ${probe.testMatchSource}`);
  return m[1]!.split("|").map((raw) => {
    // Each branch must be a plain filename stem where the ONLY escape is
    // `\.` for a literal dot. Anything else — a character class, quantifier,
    // anchor, wildcard, an escaped pipe, `\d`, or a literal `\\` — would be
    // read as filename characters and silently produce a wrong-but-existing
    // name, so it is refused instead.
    if (!/^(?:[A-Za-z0-9_-]|\\\.)+$/.test(raw)) {
      throw new Error(`branchesOf: branch is not a plain filename stem: ${raw}`);
    }
    return raw.replace(/\\\./g, ".");
  });
}

/**
 * The spec files Playwright will ACTUALLY run, via `--list`.
 *
 * Ground truth, and the answer to a whole class of narrowing that reading
 * `testMatch` cannot see: `projects[].testMatch`, top-level or per-project
 * `testIgnore`, `testDir`, an empty `projects: []`, and `grep`/`grepInvert`
 * all change what runs while leaving the top-level matcher untouched. An
 * adversarial round demonstrated a config whose top-level `testMatch` claimed
 * two branches while a project-level matcher ran one. Rather than model each
 * knob — the losing game of the previous rounds — this asks Playwright to
 * resolve the config and reports what came back.
 *
 * Used for MEMBERSHIP (which specs the whole-config job covers). The declared
 * branch list is still read separately, because a branch matching no file is
 * invisible to `--list` by construction: that is exactly what makes it stale.
 */
export function listedSpecFiles(): string[] {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "tests/e2e/standalone.config.ts",
      "--list",
      "--reporter=json",
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out.slice(out.indexOf("{"))) as { suites?: unknown[] };
  const files = new Set<string>();
  const walk = (suites: unknown[]): void => {
    for (const suite of suites) {
      const s = suite as { file?: string; suites?: unknown[] };
      if (s.file) files.add(s.file);
      if (s.suites) walk(s.suites);
    }
  };
  walk(parsed.suites ?? []);
  if (files.size === 0) throw new Error("listedSpecFiles: Playwright listed no files");
  return [...files].sort();
}
