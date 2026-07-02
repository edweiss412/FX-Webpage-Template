// tests/cron/classifyProcessed.test.ts
import { describe, expect, test } from "vitest";
import { classifyProcessed, MAX_FAILURE_BREADCRUMBS } from "@/lib/cron/classifyProcessed";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";

const p = (driveFileId: string, result: unknown) => ({ driveFileId, result: result as never });

describe("classifyProcessed", () => {
  test("counts applied/stage/skipped and conservative-unknown⇒failed", () => {
    const c = classifyProcessed([
      p("a", { outcome: "applied" }),
      p("b", { outcome: "stage" }),
      p("c", { outcome: "skipped" }),
      p("d", { outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" }),
      p("e", { outcome: "weird_new_outcome" }), // unknown ⇒ failed
    ] as never);
    expect(c.counts).toEqual({ processed: 5, applied: 1, staged: 1, skipped: 1, failed: 2 });
    expect(c.breadcrumbs).toEqual([
      { driveFileId: "d", outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" },
      { driveFileId: "e", outcome: "weird_new_outcome" },
    ]);
    expect(c.failuresTruncated).toBe(false);
    expect(c.fingerprintParts).toEqual(["d|MI-3_NO_VALID_DATES", "e|weird_new_outcome"]);
  });
  test("ConcurrentSyncSkipped shape ⇒ skipped, not failed", () => {
    const c = classifyProcessed([p("x", { skipped: CONCURRENT_SYNC_SKIPPED })] as never);
    expect(c.counts).toMatchObject({ skipped: 1, failed: 0 });
  });
  test("breadcrumbs cap at 25 but fingerprintParts is uncapped", () => {
    const many = Array.from({ length: 30 }, (_, i) => p(`f${i}`, { outcome: "hard_fail" }));
    const c = classifyProcessed(many as never);
    expect(c.counts.failed).toBe(30);
    expect(c.breadcrumbs).toHaveLength(MAX_FAILURE_BREADCRUMBS);
    expect(c.failuresTruncated).toBe(true);
    expect(c.fingerprintParts).toHaveLength(30); // UNCAPPED — this is the R2 fix
  });
});
