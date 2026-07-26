/**
 * tests/ci/_standaloneConfigScan.ts
 *
 * Pure reader for `tests/e2e/standalone.config.ts`'s `testMatch` allow-list.
 *
 * Lives in its own module, not in a `.test.ts`, because two suites need it:
 * the stale-branch guard and the workflow-coverage meta-test (which resolves
 * whole-config membership from the LIVE config rather than a hand-copied
 * list — a copy drifts the moment a spec is registered, and drift in a
 * coverage guard reads as coverage). Importing it from a test file instead
 * re-registered that file's `describe` blocks in the importer, and the branch
 * assertions ran twice.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.4.
 */

/**
 * The alternation branches of `testMatch`, read from the config SOURCE.
 *
 * Deliberately source-parsed rather than imported: importing yields a compiled
 * `RegExp` whose branch structure is gone, so a stale branch would be
 * indistinguishable from a live one. The source is the artifact a human edits
 * and therefore the artifact that carries the defect.
 */
export function testMatchBranches(source: string): string[] {
  const m = source.match(/testMatch:\s*\n?\s*\/\(([^)]*)\)\\?\.spec\\?\.ts\//);
  if (!m) throw new Error("testMatchBranches: could not locate the testMatch alternation");
  return m[1]!.split("|").map((b) => b.replace(/\\/g, ""));
}
