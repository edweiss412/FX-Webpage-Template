// tests/cross-cutting/cron-run-summary-scanner-safety.test.ts
import { describe, expect, test } from "vitest";
import { extractInternalCodeEnums, renderInternalCodeEnums } from "@/scripts/extract-internal-code-enums";

describe("CRON_RUN_SUMMARY never leaks into the §12.4 internal-code-enum manifest", () => {
  test("not present in the extracted object (keys or values) nor the rendered source", () => {
    const enums = extractInternalCodeEnums();
    expect(JSON.stringify(enums)).not.toContain("CRON_RUN_SUMMARY");
    expect(renderInternalCodeEnums(enums)).not.toContain("CRON_RUN_SUMMARY");
  });
});
