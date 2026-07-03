// tests/sync/cronSyncEscapedFailureAlert.test.ts
//
// S1: when an infra fault ESCAPES processOneFile to the cron file-loop catch,
// the run must raise a durable per-show alert (via emitEscapedSyncFailureAlert)
// so persistent failures reach the notify tier — not just the aggregate summary.
// (2026-07-03 outage: a show failed every cron run for ~2.5h with ZERO
// admin_alerts because this dark path never alerted.)
import { describe, expect, test, vi } from "vitest";

import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";

function fileFixture(driveFileId: string) {
  return {
    driveFileId,
    name: "Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    headRevisionId: "head-1",
    md5Checksum: "md5-1",
  };
}

describe("cron.sync escaped-failure alerting", () => {
  test("an escaped throw in the file loop raises a durable per-show alert", async () => {
    const emitEscapedSyncFailureAlert = vi.fn(async () => undefined);
    const logSync = vi.fn(async () => undefined);

    await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: async () => [fileFixture("file-1")],
      listLiveShows: async () => [],
      processOneFile: async () => {
        throw new Error("boom: escaped infra fault");
      },
      logSync,
      emitEscapedSyncFailureAlert,
    } as never);

    // The generic sync-log row is still written…
    expect(logSync).toHaveBeenCalledWith(
      expect.objectContaining({ driveFileId: "file-1", outcome: "parse_error" }),
    );
    // …AND a durable alert is raised for the show (the gap this closes).
    expect(emitEscapedSyncFailureAlert).toHaveBeenCalledWith("file-1", expect.any(String));
  });

  test("an alert-emit failure never fails the run (best-effort)", async () => {
    const emitEscapedSyncFailureAlert = vi.fn(async () => {
      throw new Error("alert sink down");
    });

    await expect(
      runScheduledCronSync({
        folderId: "folder-1",
        listFolder: async () => [fileFixture("file-2")],
        listLiveShows: async () => [],
        processOneFile: async () => {
          throw new Error("boom");
        },
        logSync: async () => undefined,
        emitEscapedSyncFailureAlert,
      } as never),
    ).resolves.toBeDefined();

    expect(emitEscapedSyncFailureAlert).toHaveBeenCalledTimes(1);
  });
});
