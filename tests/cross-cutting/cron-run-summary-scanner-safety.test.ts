// tests/cross-cutting/cron-run-summary-scanner-safety.test.ts
import { describe, expect, test } from "vitest";

import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";

// Reads the COMMITTED manifest rather than re-extracting. That is exactly as
// strong and far cheaper: tests/messages/_metaParseWarningSiteCoverage.test.ts
// asserts the manifest equals a fresh extraction, so a stale artifact fails there.
// Re-extracting here would load a second ts-morph project (~39s) for no added
// signal — the suite is deliberately kept to ONE extractor (spec §3.5).
describe("CRON_RUN_SUMMARY never leaks into the §12.4 internal-code-enum manifest", () => {
  test("not present in the committed manifest, as key or value", () => {
    expect(JSON.stringify(INTERNAL_CODE_ENUMS)).not.toContain("CRON_RUN_SUMMARY");
  });
});
