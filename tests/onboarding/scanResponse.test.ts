import { describe, expect, test } from "vitest";
import {
  aggregateProcessedTotals,
  toScanResponseBody,
  type OnboardingScanCompletedBody,
  type OnboardingScanResponseBody,
} from "@/lib/onboarding/scanResponse";
import type { OnboardingScanResult } from "@/lib/sync/runOnboardingScan";

describe("aggregateProcessedTotals", () => {
  test("counts every outcome bucket, initializing absent buckets to 0", () => {
    const totals = aggregateProcessedTotals([
      { driveFileId: "a", outcome: "staged" },
      { driveFileId: "b", outcome: "staged" },
      { driveFileId: "c", outcome: "hard_failed" },
      { driveFileId: "d", outcome: "live_row_conflict" },
    ]);
    expect(totals).toEqual({
      staged: 2,
      hard_failed: 1,
      skipped_non_sheet: 0,
      live_row_conflict: 1,
    });
  });

  test("empty processed[] yields all-zero totals (folder with no readable items)", () => {
    expect(aggregateProcessedTotals([])).toEqual({
      staged: 0,
      hard_failed: 0,
      skipped_non_sheet: 0,
      live_row_conflict: 0,
    });
  });
});

describe("toScanResponseBody", () => {
  test("completed → reshapes processed[] into totals + folder context (the crash-fix contract)", () => {
    const result: OnboardingScanResult = {
      outcome: "completed",
      processed: [
        { driveFileId: "a", outcome: "staged" },
        { driveFileId: "b", outcome: "skipped_non_sheet" },
      ],
    };
    expect(
      toScanResponseBody(result, { wizardSessionId: "w", folderId: "f", folderName: "Shows" }),
    ).toEqual({
      outcome: "completed",
      wizardSessionId: "w",
      folderId: "f",
      folderName: "Shows",
      totals: { staged: 1, hard_failed: 0, skipped_non_sheet: 1, live_row_conflict: 0 },
    });
  });

  test("schema_missing passes through verbatim (client reads only outcome + code)", () => {
    const result: OnboardingScanResult = {
      outcome: "schema_missing",
      code: "WIZARD_ISOLATION_INDEXES_MISSING",
      missingIndexes: ["pending_syncs_session_drive_file_idx"],
    };
    expect(toScanResponseBody(result, { wizardSessionId: "w", folderId: "f" })).toBe(result);
  });

  test("superseded passes through verbatim", () => {
    const result: OnboardingScanResult = {
      outcome: "superseded",
      code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
      processed: [],
    };
    expect(toScanResponseBody(result, { wizardSessionId: "w", folderId: "f" })).toBe(result);
  });
});

describe("type contract", () => {
  test("the completed body the route emits is assignable to the shared response union", () => {
    // Compile-time pin: if the route's completed shape and the client's
    // consumed shape ever drift, this stops type-checking. The runtime
    // assertion is incidental — the value is the `satisfies` below.
    const completed: OnboardingScanCompletedBody = {
      outcome: "completed",
      wizardSessionId: "w",
      folderId: "f",
      folderName: "Shows",
      totals: { staged: 1, hard_failed: 0, skipped_non_sheet: 0, live_row_conflict: 0 },
    } satisfies OnboardingScanResponseBody;
    expect(completed.totals.staged).toBe(1);
  });
});
