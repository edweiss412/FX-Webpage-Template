/**
 * tests/ci/adminUpstreamRetryWiring.test.ts — Task 7's presence red.
 *
 * A new app-e2e member has a FOUR-registry fan-out, and the existing guards cannot catch a
 * JOINT omission from them: `app-e2e-ci-wiring` compares `REQUIRED` against the specs the
 * workflow names, and `governanceViolations` derives its expected set from that same workflow.
 * Leave the spec out of the workflow, `REQUIRED` and every `governs` row together and both stay
 * in parity and green, while only `testMatch` and the spec file exist — CI never runs AC-5 and
 * nothing says so.
 *
 * So this asserts PRESENCE in all four, which is the arm those guards structurally cannot
 * provide.
 *
 * PLANTED, not assumed: removing the registration from all four registries at once fails all
 * four cases and nothing else, so each case owns its own registry rather than riding on a
 * neighbour. Run before shipping; the tree was restored and verified clean afterwards.
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const SPEC_BASENAME = "admin-upstream-retry";
const SPEC_PATH = `tests/e2e/${SPEC_BASENAME}.spec.ts`;

const read = (p: string): string => readFileSync(p, "utf8");

describe(`${SPEC_BASENAME} is present in all four registries`, () => {
  test("playwright.config.ts testMatch selects it", () => {
    expect(read("playwright.config.ts")).toContain(SPEC_BASENAME);
  });

  test("the app-e2e workflow runs it", () => {
    expect(read(".github/workflows/app-e2e.yml")).toContain(SPEC_PATH);
  });

  test("the executed-count oracle carries a REQUIRED floor for it", () => {
    const oracle = read("scripts/check-app-e2e-executed.mjs");
    expect(oracle).toContain(`${SPEC_BASENAME}.spec.ts`);
    // A floor must DEMAND something: the oracle itself refuses `>= 0`.
    const row = new RegExp(`"${SPEC_BASENAME}\\.spec\\.ts":\\s*(\\d+)`).exec(oracle);
    expect(row).not.toBeNull();
    expect(Number(row![1])).toBeGreaterThan(0);
  });

  test("every governing env row in the coverage scan lists it", () => {
    const scan = read("tests/ci/_workflowCoverageScan.ts");
    // The governs lists that already govern app-e2e specs must gain this member too; a
    // spot-check of one row would pass while seventeen others stayed stale.
    const appE2eGovernsBlocks = scan
      .split("governs: [")
      .slice(1)
      .filter((block) => block.includes("tests/e2e/admin-route-boundaries.spec.ts"));
    expect(appE2eGovernsBlocks.length).toBeGreaterThan(0);
    for (const block of appE2eGovernsBlocks) {
      expect(block).toContain(SPEC_PATH);
    }
  });
});
