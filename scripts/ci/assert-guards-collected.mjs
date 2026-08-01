#!/usr/bin/env node
// scripts/ci/assert-guards-collected.mjs
//
// Positive, faithful closure of the guard SELF-EXCLUSION class (R18-B).
//
// The class: one of the exclusion-contract verifiers — the coverage guard
// (tests/ci/_metaEnvBoundExclusionCoverage.test.ts), the run-excluded oracle
// (tests/scripts/runExcludedTest.test.ts), or the two topology/partition guards
// under tests/cross-cutting/ — is silently darkened from the unit-suite via
// SOME exclusion, so it collects zero tests while the suite stays green and its
// enforcement quietly disappears.
//
// Text-scanning the exclusion arrays for dangerous shapes is a losing arms race
// across (array x pattern-shape):
//   R16-B closed literal basenames listed in ENV_BOUND_EXCLUDES,
//   R17-B closed identifier indirection (a name resolving to a guard),
//   R18-B closed a brace/glob fan-out that resolved to all four guards,
// and NIGHTLY_ONLY_EXCLUDES is a SECOND exclusion array (removes a file from
// BOTH default projects) with no text-scan resistance at all. Each new spelling
// or array is another round.
//
// This checker closes the WHOLE class at once by asking vitest's OWN resolver
// (tinyglobby — the exact globber vitest.config.ts feeds) which files the
// unit-suite would collect, then asserting the four protected guards are among
// them. It does not inspect exclusion patterns; it observes the resolved
// outcome, so it is agnostic to which array or which pattern shape removed a
// guard. If a guard is not collected, this fails — full stop.
//
// WHY IT CANNOT BE POISONED / EXCLUDED:
//   - It runs as a standalone node step, NOT a vitest test, so ENV_BOUND_EXCLUDES
//     cannot exclude the checker itself (the circularity that forced R16-B off
//     the vitest-hosted meta-test and onto the bash layer).
//   - It runs AFTER the non-excludable pre-node bash guard
//     (scripts/ci/assert-pnpm-sources-clean.sh, a composite action immune to a
//     defaults.run.shell no-op), which guarantees node starts unpoisoned — no
//     nodeOptions preload can make this checker exit 0 before it asserts, and no
//     defaults override can no-op its step.
//
// ENV PARITY: the unit-suite vitest jobs run with VITEST_EXCLUDE_ENV_BOUND=1
// (a project-level exclude, because vitest ignores the CLI --exclude flag once a
// project defines its own). This checker sets the same var, so it resolves the
// SAME exclude set as the jobs it protects — not a more permissive one.
//
// Pinned as a merge-blocking CI step (x5-email-canonicalization, the home of the
// env-bound-exclusion machinery) by tests/ci/_metaEnvBoundExclusionCoverage.test.ts.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The exclusion-contract verifiers. Each is a vitest test whose EXCLUSION is the
// attack — it silently stops enforcing. (The checker script and its own test are
// deliberately NOT listed: this .mjs runs outside vitest and cannot be excluded,
// so it needs no self-protection.)
export const PROTECTED_GUARDS = [
  "tests/ci/_metaEnvBoundExclusionCoverage.test.ts",
  "tests/scripts/runExcludedTest.test.ts",
  "tests/cross-cutting/unit-suite-shard-topology.test.ts",
  "tests/cross-cutting/vitest-projects-partition.test.ts",
];

/**
 * Pure: which protected guards are absent from the collected set. Both sides are
 * compared as ABSOLUTE paths (resolve() against cwd) so a relative/absolute
 * mismatch never masks a real exclusion as "present", and a nested twin whose
 * suffix matches a guard (tests/shadow/tests/ci/…​) is NOT accepted for it.
 */
export function findMissingGuards(collectedPaths, cwd, guards = PROTECTED_GUARDS) {
  const have = new Set(collectedPaths.map((p) => resolve(cwd, p)));
  return guards.filter((g) => !have.has(resolve(cwd, g)));
}

/**
 * Ask vitest's own resolver which test files the unit-suite would collect, under
 * the same env the CI vitest jobs use. `vitest list --filesOnly --json` emits
 * `[{ file: "<abs>", projectName }, ...]` and performs NO test execution (no DB,
 * no setup side effects), so it is cheap and safe to run as a gate.
 */
export function collectUnitSuiteFiles(cwd = process.cwd()) {
  const res = spawnSync("pnpm", ["vitest", "list", "--filesOnly", "--json"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, VITEST_EXCLUDE_ENV_BOUND: "1" },
    maxBuffer: 128 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`\`pnpm vitest list\` exited ${res.status}\n${res.stderr || res.stdout || ""}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`could not parse \`vitest list --json\` output: ${e.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("`vitest list --json` did not return an array");
  }
  return parsed.map((e) => e && e.file).filter((f) => typeof f === "string");
}

function main() {
  const cwd = process.cwd();
  let collected;
  try {
    collected = collectUnitSuiteFiles(cwd);
  } catch (e) {
    console.error(`assert-guards-collected: ${e.message}`);
    process.exit(1);
  }
  const missing = findMissingGuards(collected, cwd);
  if (missing.length > 0) {
    console.error(
      "assert-guards-collected: exclusion-contract guard test(s) NOT collected by the\n" +
        "unit-suite. Some exclusion (any array, any pattern shape) darkened the\n" +
        "verifier(s) below, silently disabling them:",
    );
    for (const g of missing) console.error(`  - ${g}`);
    process.exit(1);
  }
  console.log(`assert-guards-collected: ok (${PROTECTED_GUARDS.length} guards collected)`);
}

// Run only when invoked directly, not when imported by the behavioral test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
