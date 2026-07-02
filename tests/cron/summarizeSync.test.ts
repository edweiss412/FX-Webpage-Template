// tests/cron/summarizeSync.test.ts
import { describe, expect, test } from "vitest";
import { summarizeSync } from "@/lib/cron/summarizeSync";

const p = (outcome: string) => ({ driveFileId: "df", result: { outcome } as never });

describe("summarizeSync", () => {
  test("clean run with applied files → ok", () => {
    const s = summarizeSync({ processed: [p("applied"), p("applied"), p("skipped")] } as never);
    expect(s.outcome).toBe("ok");
    expect(s.counts).toMatchObject({ processed: 3, applied: 2, skipped: 1, failed: 0, staged: 0 });
  });
  test("any hard_fail/parse_error/source_gone/stale/revision_race → partial", () => {
    for (const bad of [
      "hard_fail",
      "parse_error",
      "source_gone",
      "stale",
      "revision_race",
      "revision_race_cooldown",
    ]) {
      expect(summarizeSync({ processed: [p("applied"), p(bad)] } as never).outcome).toBe("partial");
    }
  });
  test("summary.outcome=parse_error (SYNC_INFRA_ERROR arm) → infra", () => {
    const s = summarizeSync({
      processed: [],
      summary: { outcome: "parse_error", code: "SYNC_INFRA_ERROR" },
    } as never);
    expect(s.outcome).toBe("infra");
  });
  test("maintenance heartbeat fault → partial with detail", () => {
    const s = summarizeSync({
      processed: [p("applied")],
      maintenanceFaults: { syncCronHeartbeat: "infra_error" },
    } as never);
    expect(s.outcome).toBe("partial");
    expect(s.detail).toMatchObject({ maintenanceFaults: { syncCronHeartbeat: "infra_error" } });
  });
  test("empty processed, no folder configured → ok with skipReason", () => {
    const s = summarizeSync({
      processed: [],
      summary: { outcome: "skipped", skipReason: "no_folder_configured" },
    } as never);
    expect(s.outcome).toBe("ok");
    expect(s.counts).toMatchObject({ processed: 0 });
    expect(s.detail).toMatchObject({ skipReason: "no_folder_configured" });
  });
  test("stage outcome counts as staged, not failed → ok", () => {
    const s = summarizeSync({ processed: [p("stage"), p("asset_recovery")] } as never);
    expect(s.outcome).toBe("ok");
    expect(s.counts).toMatchObject({ staged: 1, skipped: 1, failed: 0 });
  });
  test("an UNKNOWN/unforeseen outcome is counted as failed (→partial), never silently benign", () => {
    const s = summarizeSync({ processed: [p("applied"), p("some_future_outcome")] } as never);
    expect(s.outcome).toBe("partial");
    expect(s.counts).toMatchObject({ failed: 1, applied: 1 });
  });
  test("ConcurrentSyncSkipped ({skipped:CONCURRENT_SYNC_SKIPPED}, no outcome field) → skipped, run ok", () => {
    // the real shape from lib/sync/lockedShowTx.ts — a benign lock-contention skip, NOT a failure
    const s = summarizeSync({
      processed: [{ driveFileId: "d", result: { skipped: "CONCURRENT_SYNC_SKIPPED" } }],
    } as never);
    expect(s.outcome).toBe("ok");
    expect(s.counts).toMatchObject({ skipped: 1, failed: 0 });
  });
});

const proc = (driveFileId: string, result: unknown) => ({ driveFileId, result });

describe("summarizeSync — failure breadcrumb", () => {
  test("hard_fail item appears in detail.failures with driveFileId+outcome+code", () => {
    const s = summarizeSync({
      processed: [
        proc("f-ok", { outcome: "applied", showId: "s1" }),
        proc("f-bad", { outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" }),
      ],
    } as never);
    expect(s.outcome).toBe("partial");
    expect(s.counts?.failed).toBe(1);
    expect(s.detail?.failures).toEqual([
      { driveFileId: "f-bad", outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" },
    ]);
  });

  test("ok run omits detail.failures entirely (exactOptionalPropertyTypes)", () => {
    const s = summarizeSync({ processed: [proc("f", { outcome: "applied", showId: "s" })] } as never);
    expect(s.outcome).toBe("ok");
    expect(s.detail).toBeUndefined();
  });

  test("ConcurrentSyncSkipped + skipped are excluded from failures", () => {
    const s = summarizeSync({
      processed: [
        proc("f-lock", { skipped: "CONCURRENT_SYNC_SKIPPED" }),
        proc("f-skip", { outcome: "skipped" }),
        proc("f-bad", { outcome: "parse_error", code: "SYNC_INFRA_ERROR" }),
      ],
    } as never);
    expect(s.detail?.failures).toEqual([
      { driveFileId: "f-bad", outcome: "parse_error", code: "SYNC_INFRA_ERROR" },
    ]);
  });

  test("truncates at 25 with failuresTruncated:true; counts.failed keeps true total", () => {
    const processed = Array.from({ length: 30 }, (_, i) =>
      proc(`f${i}`, { outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" }),
    );
    const s = summarizeSync({ processed } as never);
    expect(s.counts?.failed).toBe(30);
    expect((s.detail?.failures as unknown[]).length).toBe(25);
    expect(s.detail?.failuresTruncated).toBe(true);
  });
});
