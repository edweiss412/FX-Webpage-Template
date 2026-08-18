import { defineConfig } from "vitest/config";

/**
 * The mini vitest project the spec:lint CLI suite probes against
 * (verdict-capability spec §7 "CLI adapter suite").
 *
 * It lives OUTSIDE `tests/` on purpose: every project glob in
 * `vitest.projects.ts` is rooted at `tests/**`, so a fixture suite placed there
 * would be collected by the repo's own run — the "fixture-project leakage"
 * failure mode. Here the root suite cannot see these files at all, which is why
 * `collected.test.ts` is free to fail and `slow.test.ts` is free to sleep.
 *
 * `excluded.test.ts` is deliberately absent from `include`: it is TRACKED and
 * spelled correctly, and still collects empty — the env-gated-project shape
 * from spec §2.3, which is the sharpest case the collection arm exists to
 * catch.
 */
export default defineConfig({
  test: {
    include: [
      "fixtures/specLint/redVerdict/collected.test.ts",
      "fixtures/specLint/redVerdict/slow.test.ts",
    ],
  },
});
