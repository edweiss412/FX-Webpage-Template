/**
 * tests/ci/_metaStandaloneConfigBranches.test.ts
 *
 * Structural guard: every alternation branch in `tests/e2e/standalone.config.ts`'s
 * `testMatch` must resolve to a spec file that exists.
 *
 * WHY THIS IS WORTH A GUARD. `testMatch` is an explicit allow-list, so it is
 * the only place that decides whether a standalone spec runs at all. A branch
 * naming a deleted spec is invisible — Playwright matches nothing and says
 * nothing, and the config keeps reporting green while claiming coverage it
 * does not have. `overrideableField.layout` sat here after its spec was
 * deleted, and the config never once complained.
 *
 * WHY THIS CHECK IS TOTAL, unlike the ones descoped in spec §10.3. The branch
 * list is finite and each entry either resolves to a file or does not; there
 * is no judgement and no recognition problem. The converse direction —
 * detecting a self-contained spec that was never REGISTERED here — could not
 * be given a sound definition and is deliberately absent
 * (BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC). An honest gap beats a guard that
 * catches only what it happens to recognize.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.4.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { testMatchBranches } from "./_standaloneConfigScan";

const ROOT = process.cwd();
const CONFIG = "tests/e2e/standalone.config.ts";

describe("standalone config testMatch has no stale branches", () => {
  it("parses the alternation, and fails loudly if the config's shape changes", () => {
    // A silently-empty parse is the failure mode this guard exists to prevent,
    // so the parser's own contract is pinned before it is trusted below.
    const branches = testMatchBranches(
      "testMatch:\n    /(alpha\\.layout|beta|gamma-thing)\\.spec\\.ts/,\n  timeout: 1,\n",
    );
    expect(branches).toEqual(["alpha.layout", "beta", "gamma-thing"]);
    expect(() => testMatchBranches("testDir: '.',")).toThrow(/could not locate/i);
  });

  it("every branch resolves to an existing spec file", () => {
    const branches = testMatchBranches(readFileSync(join(ROOT, CONFIG), "utf8"));
    // Guards against a parse that "succeeds" against a mangled config and
    // returns one useless branch — the assertion below would then be vacuous.
    expect(branches.length).toBeGreaterThan(20);

    const stale = branches.filter((b) => !existsSync(join(ROOT, "tests/e2e", `${b}.spec.ts`)));
    expect(stale, `${CONFIG} names specs that do not exist — delete the branch`).toEqual([]);
  });
});
