// tests/log/correlationSeeding.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const ALS_HANDLERS = [
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

  // Cron routes seed correlation via the runCronRoute wrapper (the single ALS holder for cron
  // jobs — observability Phase 2). The sync route delegates to runCronRoute; the wrapper is where
  // runWithRequestContext + deriveRequestId live (idempotent: reuses an existing context else
  // establishes one) — one ALS holder per cron request, not two.
  test("cron routes seed correlation via the runCronRoute wrapper", () => {
    const sync = readFileSync("app/api/cron/sync/route.ts", "utf8");
    expect(sync, "sync route delegates ALS to runCronRoute").toMatch(/runCronRoute\(/);
    const wrapper = readFileSync("lib/cron/withCronRunSummary.ts", "utf8");
    expect(wrapper, "wrapper establishes the request context").toMatch(/runWithRequestContext\(/);
    expect(wrapper, "wrapper derives a request id").toMatch(/deriveRequestId\(/);
  });

  test("onboarding scan uses an explicit captured requestId", () => {
    const src = readFileSync("app/api/admin/onboarding/scan/route.ts", "utf8");
    expect(src).toMatch(/const scanRequestId = deriveRequestId\(/);
    expect(src).toMatch(/requestId:\s*scanRequestId/);
  });
});
