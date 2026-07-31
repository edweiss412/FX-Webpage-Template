/**
 * tests/ci/_metaStandaloneConfigBranches.test.ts
 *
 * Structural guard: every alternation branch in the standalone config's
 * `testMatch` must resolve to a spec file that exists.
 *
 * WHY THIS IS WORTH A GUARD. `testMatch` is an explicit allow-list, so it is
 * the only thing deciding whether a standalone spec runs at all. A branch
 * naming a deleted spec is invisible — Playwright matches nothing and says
 * nothing, and the config keeps reporting green while claiming coverage it
 * does not have. `overrideableField.layout` sat here after its spec was
 * deleted, and the config never once complained.
 *
 * The branch list is read from the EVALUATED config (`_standaloneConfigProbe`),
 * not from source. Which literal in the file is the effective one is a runtime
 * question, and two static readers got it wrong in two adversarial rounds — a
 * regex one matched a commented-out config, and its AST successor matched any
 * `testMatch:` property anywhere in the file rather than the exported one.
 *
 * WHY THE CHECK IS TOTAL, unlike the ones descoped in spec §10.3. The branch
 * list is finite and each entry either resolves to a file or does not. The
 * converse direction — detecting a self-contained spec never REGISTERED here —
 * could not be given a sound definition and is deliberately absent
 * (BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC). An honest gap beats a guard that
 * catches only what it happens to recognize.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.4.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { branchesOf, listedSpecFiles, probeConfig } from "./_standaloneConfigProbe";

const ROOT = process.cwd();

describe("standalone config testMatch has no stale branches", () => {
  it("refuses every matcher shape it cannot read exactly", () => {
    // A reader that silently returns [] makes the real assertion below pass
    // vacuously — the failure mode this guard exists to prevent. Each case
    // below produced a plausible WRONG answer in an earlier version.
    const re = (source: string) => ({
      isRegExp: true,
      testMatchSource: source,
      env: {},
      reporter: null,
    });
    // A string matcher is a GLOB: this one looks like a regex and matches no
    // file at all, but parsed into two believable branch names.
    expect(() =>
      branchesOf({
        isRegExp: false,
        testMatchSource: "(a|b)\\.spec\\.ts",
        env: {},
        reporter: null,
      }),
    ).toThrow(/not a RegExp/i);
    expect(() => branchesOf(re("something-else"))).toThrow(/unrecognised testMatch shape/i);
    for (const bad of ["a[|]b", "a\\|b", "a\\d", "a.*", "^a", "a{2}", "a\\\\b"]) {
      expect(() => branchesOf(re(`(${bad})\\.spec\\.ts`)), bad).toThrow(
        /not a plain filename stem/i,
      );
    }
    // …and the real shape still reads.
    expect(branchesOf(re("(alpha\\.layout|beta-two)\\.spec\\.ts"))).toEqual([
      "alpha.layout",
      "beta-two",
    ]);
  });

  it("the matcher is identical under the runner environment and without it", () => {
    // A config that narrows under `process.env.CI` would otherwise be observed
    // locally as full coverage while Actions ran a subset.
    expect(probeConfig([], {}, true).testMatchSource).toBe(
      probeConfig([], {}, false).testMatchSource,
    );
  }, 180_000);

  it("every branch of the EVALUATED testMatch resolves to an existing spec", () => {
    const branches = branchesOf(probeConfig([]));
    // Floor check: a parse that "succeeds" with one useless branch would make
    // the assertion below trivially true.
    expect(branches.length).toBeGreaterThan(20);

    const stale = branches.filter((b) => !existsSync(join(ROOT, "tests/e2e", `${b}.spec.ts`)));
    expect(stale, "testMatch names specs that do not exist — delete the branch").toEqual([]);
  }, 120_000);
  it("what Playwright RESOLVES equals what testMatch declares", () => {
    // Closes the narrowing class an adversarial round demonstrated: a
    // project-level testMatch, testIgnore, testDir, `projects: []`, or
    // grep/grepInvert can run a subset while the top-level matcher still
    // declares everything. If the two ever disagree, the declared list is a
    // claim the config does not honour, and coverage derived from it is false.
    const declared = branchesOf(probeConfig([])).map((b) => `${b}.spec.ts`);
    expect(new Set(listedSpecFiles())).toEqual(new Set(declared));
  }, 300_000);
});
