import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type ProcessOneFileDeps,
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

const parseResult = {
  show: { title: "FXAV Spring Tour" },
  warnings: [],
} as unknown as ParseResult;

describe("PARSE_ERROR_LAST_GOOD producer", () => {
  test("a hard_fail transition upserts a PARSE_ERROR_LAST_GOOD admin_alert with sheet_name", async () => {
    const upsertAdminAlert = vi.fn(async () => "alert-1");
    const tx = {
      async queryOne<T>(sql: string) {
        if (sql.includes("from public.shows where drive_file_id")) {
          return { archived: false } as T;
        }
        return { held: true } as T;
      },
      readShowForPhase1: vi.fn(async () => ({
        showId: "show-1",
        driveFileId: "drive-file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: parseResult,
      })),
      upsertAdminAlert,
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const file = fileMeta("drive-file-1");
    const deps = {
      perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "cron" as const })),
      captureBinding: vi.fn(async () => ({
        bindingToken: "binding-1",
        modifiedTime: "2026-05-08T12:00:00.000Z",
      })),
      fetchMarkdownAtRevision: vi.fn(async () => "# v4\nShow"),
      parseSheet: vi.fn(() => parseResult),
      enrichWithDrivePins: vi.fn(async () => parseResult),
      runPhase1: vi.fn(async () => ({
        outcome: "hard_fail" as const,
        code: "MI-4_NO_CREW",
        failedCodes: ["MI-4_NO_CREW"],
        message: "Crew missing",
      })),
    } as unknown as ProcessOneFileDeps;

    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);

    expect(result).toEqual({ outcome: "hard_fail", code: "MI-4_NO_CREW" });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "PARSE_ERROR_LAST_GOOD",
      context: {
        drive_file_id: "drive-file-1",
        sheet_name: "FXAV Spring Tour",
      },
    });
  });
});
