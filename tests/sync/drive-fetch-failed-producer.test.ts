import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";

function fileMeta(id: string): DriveListedFile {
  return {
    driveFileId: id,
    name: `${id} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

describe("DRIVE_FETCH_FAILED producer", () => {
  test("a drive_error transition upserts a DRIVE_FETCH_FAILED admin_alert with sheet_name", async () => {
    const upsertAdminAlert = vi.fn(async () => "alert-1");
    const tx = {
      async queryOne<T>(sql: string) {
        if (sql.includes("from public.shows where drive_file_id")) {
          return { archived: false } as T;
        }
        return { held: true } as T;
      },
      async readLivePendingSync() {
        return null;
      },
      async readShowForPhase1() {
        return {
          driveFileId: "drive-file-1",
          lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
          lastSyncStatus: "ok",
          lastSyncError: null,
          priorParseResult: null,
          title: "FXAV Spring Tour",
        };
      },
      markShowDriveError: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        title: "FXAV Spring Tour",
      })),
      insertSyncLog: vi.fn(async () => undefined),
      upsertAdminAlert,
      upsertLivePendingIngestion: vi.fn(async () => undefined),
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const file = fileMeta("drive-file-1");
    const deps = {
      perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "cron" as const })),
      captureBinding: vi.fn(async () => ({
        bindingToken: "binding-1",
        modifiedTime: "2026-05-08T12:00:00.000Z",
      })),
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 500");
      }),
    };

    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);

    // whole-diff R2: parse_error result now carries the read-back showId (last_sync_status writer).
    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED", showId: "show-1" });
    expect(upsertAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        showId: "show-1",
        code: "DRIVE_FETCH_FAILED",
        context: expect.objectContaining({
          drive_file_id: "drive-file-1",
          failure_code: "SYNC_FILE_FAILED",
          previous_last_seen_modified_time: "2026-05-08T11:00:00.000Z",
          sheet_name: "FXAV Spring Tour",
        }),
      }),
    );
  });
});
