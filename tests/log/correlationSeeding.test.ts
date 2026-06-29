// tests/log/correlationSeeding.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const ALS_HANDLERS = [
  "app/api/cron/sync/route.ts",
  "app/api/report/route.ts",
  "app/api/admin/sync/[slug]/route.ts",
  "app/api/admin/staged/[fileId]/apply/route.ts",
  "app/api/auth/picker-bootstrap/route.ts",
];

describe("correlation seeding", () => {
  test.each(ALS_HANDLERS)("%s wraps handler in runWithRequestContext + deriveRequestId", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src, `${file} must wrap its handler`).toMatch(/runWithRequestContext\(/);
    expect(src, `${file} must derive a request id`).toMatch(/deriveRequestId\(/);
  });

  test("onboarding scan uses an explicit captured requestId", () => {
    const src = readFileSync("app/api/admin/onboarding/scan/route.ts", "utf8");
    expect(src).toMatch(/const scanRequestId = deriveRequestId\(/);
    expect(src).toMatch(/requestId:\s*scanRequestId/);
  });
});
