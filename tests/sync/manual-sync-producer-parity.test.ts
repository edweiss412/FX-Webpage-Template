import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "drive-file-1",
    name: "Manual Sync Fixture",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

const parseResult = {
  show: { title: "FXAV Spring Tour" },
} as unknown as ParseResult;

function fakeTx() {
  const alerts: Array<{ showId: string | null; code: string; context: Record<string, unknown> }> = [];
  const tx = {
    alerts,
    async queryOne<T>(sql: string) {
      if (sql.includes("from public.shows where drive_file_id")) return { archived: false } as T;
      if (sql.includes("first_seen_owned")) {
        return { first_seen_owned: false, existing_show_owned: false } as T;
      }
      return { held: true } as T;
    },
    async deleteLiveDeferral() {},
    async readShowForPhase1() {
      return {
        showId: "show-1",
        driveFileId: "drive-file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: parseResult,
      };
    },
    async markShowDriveError() {
      return {
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        title: "FXAV Spring Tour",
      };
    },
    async insertSyncLog() {},
    async upsertAdminAlert(input: {
      showId: string | null;
      code: string;
      context: Record<string, unknown>;
    }) {
      alerts.push(input);
      return "alert-1";
    },
  } as unknown as LockedShowTx<SyncPipelineTx> & {
    alerts: typeof alerts;
  };
  return tx;
}

describe("manual-sync producer parity", () => {
  test("manual drive_error emits DRIVE_FETCH_FAILED with sheet_name", async () => {
    const tx = fakeTx();

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      withPipelineLock: vi.fn(async (_driveFileId, fn) => fn(tx)),
      getActiveWatchedFolderId: vi.fn(async () => ({ kind: "no_folder_configured" as const })),
      fetchDriveFileMetadata: vi.fn(async () => fileMeta()),
    });

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_INFRA_ERROR" });
    expect(tx.alerts).toContainEqual({
      showId: "show-1",
      code: "DRIVE_FETCH_FAILED",
      context: {
        drive_file_id: "drive-file-1",
        failure_code: "SYNC_INFRA_ERROR",
        previous_last_seen_modified_time: "2026-05-08T11:00:00.000Z",
        sheet_name: "FXAV Spring Tour",
      },
    });
  });

  test("manual hard_fail emits PARSE_ERROR_LAST_GOOD with sheet_name", async () => {
    const tx = fakeTx();

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      withPipelineLock: vi.fn(async (_driveFileId, fn) => fn(tx)),
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata: vi.fn(async () => fileMeta()),
      processOneFile: vi.fn(async (_driveFileId, _mode, _fileMeta, processDeps) =>
        processDeps?.withShowLock?.("drive-file-1", async () => ({
          outcome: "hard_fail" as const,
          code: "MI-4_NO_CREW",
        })),
      ),
    });

    expect(result).toEqual({ outcome: "hard_fail", code: "MI-4_NO_CREW" });
    expect(tx.alerts).toContainEqual({
      showId: "show-1",
      code: "PARSE_ERROR_LAST_GOOD",
      context: {
        drive_file_id: "drive-file-1",
        sheet_name: "FXAV Spring Tour",
      },
    });
  });
});
