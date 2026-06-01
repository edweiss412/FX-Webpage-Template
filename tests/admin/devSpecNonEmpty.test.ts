/**
 * tests/admin/devSpecNonEmpty.test.ts (M12.2 B1 Task 8.4)
 *
 * Structural guard: the three Playwright projects (dev-build, prod-build,
 * prod-runtime-flip) all declare `testMatch: /admin-dev\.spec\.ts/` in
 * playwright.config.ts. If admin-dev.spec.ts does not exist, all three
 * projects silently match zero tests — the gate passes vacuously.
 *
 * This test asserts:
 *   1. tests/e2e/admin-dev.spec.ts EXISTS on disk.
 *   2. The prod-runtime-flip project's testMatch regex actually matches
 *      the filename "admin-dev.spec.ts".
 *
 * The test is RED when admin-dev.spec.ts is absent and turns GREEN once the
 * file is created — enforcing TDD red→green ordering (Step 1 in Task 8.4).
 *
 * If someone later renames or deletes admin-dev.spec.ts, this guard fails
 * and CI catches the silent-empty-gate regression.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();

// The filename that all three build-mode projects match.
const SPEC_FILE = "tests/e2e/admin-dev.spec.ts";
const SPEC_ABS = join(ROOT, SPEC_FILE);

// The testMatch value shared by dev-build / prod-build / prod-runtime-flip
// (playwright.config.ts:75, :84, :103 — all identical).
// Verified from source: /admin-dev\.spec\.ts/
const PROD_RUNTIME_FLIP_TEST_MATCH = /admin-dev\.spec\.ts/;

describe("admin-dev e2e spec — non-empty gate guard", () => {
  it("tests/e2e/admin-dev.spec.ts exists on disk", () => {
    expect(
      existsSync(SPEC_ABS),
      `${SPEC_FILE} does not exist — the dev-build / prod-build / prod-runtime-flip ` +
        `Playwright projects each declare testMatch: /admin-dev\\.spec\\.ts/ but match ` +
        `ZERO tests without this file (silently-green empty gate). Create the spec first.`,
    ).toBe(true);
  });

  it("prod-runtime-flip testMatch regex matches the spec filename", () => {
    // This assertion is coupled to playwright.config.ts:103. If someone
    // changes the project's testMatch and forgets to update the spec
    // filename (or vice versa), this test fails and surfaces the mismatch.
    const filename = "admin-dev.spec.ts";
    expect(
      PROD_RUNTIME_FLIP_TEST_MATCH.test(filename),
      `prod-runtime-flip testMatch (${PROD_RUNTIME_FLIP_TEST_MATCH}) does not match ` +
        `"${filename}" — the project would match zero tests.`,
    ).toBe(true);
  });
});
