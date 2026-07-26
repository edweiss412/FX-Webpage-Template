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

import { branchesOf, probeConfig } from "./_standaloneConfigProbe";

const ROOT = process.cwd();

describe("standalone config testMatch has no stale branches", () => {
  it("throws rather than returning nothing on an unrecognised testMatch", () => {
    // A reader that silently returns [] makes the real assertion below pass
    // vacuously — the failure mode this guard exists to prevent.
    expect(() => branchesOf("something-else")).toThrow(/unrecognised testMatch shape/i);
    expect(() => branchesOf("undefined")).toThrow(/unrecognised testMatch shape/i);
  });

  it("every branch of the EVALUATED testMatch resolves to an existing spec", () => {
    const branches = branchesOf(probeConfig([]).testMatchSource);
    // Floor check: a parse that "succeeds" with one useless branch would make
    // the assertion below trivially true.
    expect(branches.length).toBeGreaterThan(20);

    const stale = branches.filter((b) => !existsSync(join(ROOT, "tests/e2e", `${b}.spec.ts`)));
    expect(stale, "testMatch names specs that do not exist — delete the branch").toEqual([]);
  }, 120_000);
});
