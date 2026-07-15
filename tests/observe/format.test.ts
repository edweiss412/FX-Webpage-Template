import { describe, expect, test } from "vitest";
import {
  formatEvents,
  formatEventLineNdjson,
  formatStaged,
  formatFailures,
  formatPublishedWarnings,
  formatSyncLog,
  formatDeferred,
  formatWatch,
} from "@/scripts/observe/format";
const row = {
  id: "a",
  occurredAt: "2026-07-03T00:00:00.000Z",
  level: "error" as const,
  source: "cron.sync",
  message: "boom",
  code: "C",
  requestId: null,
  showId: null,
  driveFileId: null,
  actorHash: null,
  context: {},
  showTitle: null,
  showSlug: null,
};

describe("format", () => {
  test("empty table → (no rows)", () => {
    expect(formatEvents([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatEvents([row], true);
    expect(JSON.parse(out)).toEqual([row]);
  });
  test("table contains level+code+message from the input", () => {
    const out = formatEvents([row], false);
    expect(out).toContain(row.level);
    expect(out).toContain(row.code);
    expect(out).toContain(row.message);
  });
  test("ndjson line is one parseable object", () => {
    const line = formatEventLineNdjson(row);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual(row);
  });
});

describe("formatStaged", () => {
  const warning = { severity: "warn", code: "SOME_WARNING_CODE", message: "warn msg" };
  const stagedRow = {
    id: "s1",
    driveFileId: "drive-file-abc",
    parsedAt: "2026-07-03T00:00:00.000Z",
    stagedModifiedTime: "2026-07-02T00:00:00.000Z",
    sourceKind: "sheet",
    wizardSessionId: null,
    wizardApproved: true,
    warningSummary: "1 warning",
    lastFinalizeFailureCode: "SOME_FAILURE_CODE",
    lastFinalizeFailureCodeUnrecognized: false,
    warnings: [warning],
  };

  test("empty → (no rows)", () => {
    expect(formatStaged([], false, false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatStaged([stagedRow], true, false);
    expect(JSON.parse(out)).toEqual([stagedRow]);
  });
  test("table line contains row fields; full=false hides per-warning lines", () => {
    const out = formatStaged([stagedRow], false, false);
    expect(out).toContain(stagedRow.parsedAt);
    expect(out).toContain(stagedRow.driveFileId);
    expect(out).toContain(stagedRow.sourceKind);
    expect(out).toContain("approved");
    expect(out).toContain("w:1");
    expect(out).toContain(stagedRow.lastFinalizeFailureCode);
    expect(out).toContain(stagedRow.warningSummary);
    expect(out).not.toContain(warning.message);
  });
  test("full=true adds one indented line per serialized warning", () => {
    const out = formatStaged([stagedRow], false, true);
    expect(out).toContain(warning.severity);
    expect(out).toContain(warning.code);
    expect(out).toContain(warning.message);
  });
  test("pending row renders 'pending' not 'approved'", () => {
    const out = formatStaged([{ ...stagedRow, wizardApproved: false }], false, false);
    expect(out).toContain("pending");
  });
  test("codeCell: unrecognized finalize code renders UNKNOWN_CODE", () => {
    const out = formatStaged(
      [{ ...stagedRow, lastFinalizeFailureCode: "", lastFinalizeFailureCodeUnrecognized: true }],
      false,
      false,
    );
    expect(out).toContain("UNKNOWN_CODE");
  });
  test("codeCell: empty recognized code renders '-'", () => {
    const out = formatStaged(
      [{ ...stagedRow, lastFinalizeFailureCode: "", lastFinalizeFailureCodeUnrecognized: false }],
      false,
      false,
    );
    expect(out).toContain(" - ");
  });
});

describe("formatFailures", () => {
  const failureRow = {
    id: "f1",
    driveFileId: "drive-file-xyz",
    driveFileName: "East Coast Show.xlsx",
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    lastAttemptAt: "2026-07-03T00:00:00.000Z",
    attemptCount: 3,
    lastErrorCode: "SOME_ERROR_CODE",
    lastErrorCodeUnrecognized: false,
    lastErrorMessage: "boom",
    lastWarnings: [],
    wizardSessionId: null,
  };

  test("empty → (no rows)", () => {
    expect(formatFailures([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatFailures([failureRow], true);
    expect(JSON.parse(out)).toEqual([failureRow]);
  });
  test("table line contains row fields", () => {
    const out = formatFailures([failureRow], false);
    expect(out).toContain(failureRow.lastAttemptAt);
    expect(out).toContain(failureRow.driveFileId);
    expect(out).toContain("x3");
    expect(out).toContain(failureRow.lastErrorCode);
    expect(out).toContain(failureRow.driveFileName);
  });
  test("codeCell: unrecognized → UNKNOWN_CODE", () => {
    const out = formatFailures(
      [{ ...failureRow, lastErrorCode: "", lastErrorCodeUnrecognized: true }],
      false,
    );
    expect(out).toContain("UNKNOWN_CODE");
  });
  test("codeCell: empty recognized code → '-'", () => {
    const out = formatFailures(
      [{ ...failureRow, lastErrorCode: "", lastErrorCodeUnrecognized: false }],
      false,
    );
    expect(out).toContain(" - ");
  });
});

describe("formatPublishedWarnings", () => {
  const warning = { severity: "warn", code: "SOME_WARNING_CODE", message: "warn msg" };
  const warningsRow = {
    showId: "22222222-2222-4222-8222-222222222222",
    showTitle: "East Coast",
    showSlug: "east-coast",
    warnings: [warning],
  };

  test("empty → (no rows)", () => {
    expect(formatPublishedWarnings([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatPublishedWarnings([warningsRow], true);
    expect(JSON.parse(out)).toEqual([warningsRow]);
  });
  test("header shows showTitle, warning count, then per-warning lines", () => {
    const out = formatPublishedWarnings([warningsRow], false);
    expect(out).toContain(warningsRow.showTitle!);
    expect(out).toContain("1");
    expect(out).toContain(warning.severity);
    expect(out).toContain(warning.code);
    expect(out).toContain(warning.message);
  });
  test("falls back to showId when title/slug are null", () => {
    const out = formatPublishedWarnings(
      [{ ...warningsRow, showTitle: null, showSlug: null }],
      false,
    );
    expect(out).toContain(warningsRow.showId);
  });
});

describe("formatSyncLog", () => {
  const syncRow = {
    id: "sl1",
    showId: "22222222-2222-4222-8222-222222222222",
    driveFileId: "drive-file-abc",
    status: "ok",
    message: "synced",
    warningCount: 2,
    warnings: [],
    durationMs: 1234,
    occurredAt: "2026-07-03T00:00:00.000Z",
  };

  test("empty → (no rows)", () => {
    expect(formatSyncLog([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatSyncLog([syncRow], true);
    expect(JSON.parse(out)).toEqual([syncRow]);
  });
  test("table line contains row fields", () => {
    const out = formatSyncLog([syncRow], false);
    expect(out).toContain(syncRow.occurredAt);
    expect(out).toContain(syncRow.driveFileId);
    expect(out).toContain(syncRow.status);
    expect(out).toContain("w:2");
    expect(out).toContain("1234");
    expect(out).toContain(syncRow.message);
  });
  test("nullable driveFileId and durationMs render '-' in table", () => {
    const out = formatSyncLog([{ ...syncRow, driveFileId: null, durationMs: null }], false);
    expect(out).toContain(" - ");
  });
  test("nullables render null (not '-') in json", () => {
    const out = formatSyncLog([{ ...syncRow, driveFileId: null, durationMs: null }], true);
    const parsed = JSON.parse(out);
    expect(parsed[0].driveFileId).toBeNull();
    expect(parsed[0].durationMs).toBeNull();
  });
});

describe("formatDeferred", () => {
  const deferredRow = {
    id: "d1",
    driveFileId: "drive-file-abc",
    wizardSessionId: null,
    deferredKind: "ambiguous_room",
    deferredAt: "2026-07-03T00:00:00.000Z",
    deferredAtModifiedTime: null,
    reason: "operator deferred this row",
  };

  test("empty → (no rows)", () => {
    expect(formatDeferred([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatDeferred([deferredRow], true);
    expect(JSON.parse(out)).toEqual([deferredRow]);
  });
  test("table line contains row fields", () => {
    const out = formatDeferred([deferredRow], false);
    expect(out).toContain(deferredRow.deferredAt);
    expect(out).toContain(deferredRow.driveFileId);
    expect(out).toContain(deferredRow.deferredKind);
    expect(out).toContain(deferredRow.reason);
  });
});

describe("formatWatch", () => {
  const watchRow = {
    id: "w1",
    status: "active",
    watchedFolderId: "folder-abc",
    resourceId: "res-1",
    expiresAt: "2026-07-10T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    activatedAt: "2026-07-01T00:00:00.000Z",
    supersededAt: null,
    stoppedAt: null,
  };

  test("empty → (no rows)", () => {
    expect(formatWatch([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatWatch([watchRow], true);
    expect(JSON.parse(out)).toEqual([watchRow]);
  });
  test("table line contains row fields", () => {
    const out = formatWatch([watchRow], false);
    expect(out).toContain(watchRow.status);
    expect(out).toContain(watchRow.id);
    expect(out).toContain(watchRow.watchedFolderId);
    expect(out).toContain(watchRow.expiresAt!);
    expect(out).toContain(watchRow.createdAt);
  });
  test("nullable expiresAt renders '-' in table, null in json", () => {
    const out = formatWatch([{ ...watchRow, expiresAt: null }], false);
    expect(out).toContain(" - ");
    const jsonOut = JSON.parse(formatWatch([{ ...watchRow, expiresAt: null }], true));
    expect(jsonOut[0].expiresAt).toBeNull();
  });
});
