import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  syncProblemCodeForStatus,
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

describe("RESYNC_SHRINK_HELD producer", () => {
  test("syncProblemCodeForStatus('shrink_held') === RESYNC_SHRINK_HELD", () => {
    expect(syncProblemCodeForStatus("shrink_held")).toBe("RESYNC_SHRINK_HELD");
  });

  test("a shrink_held hold raises RESYNC_SHRINK_HELD + resolves other stale peers, keeps its own", async () => {
    const upsertAdminAlert = vi.fn(async () => "alert-1");
    const queryOne = vi.fn(async <T>(sql: string, _params?: unknown[]): Promise<T> => {
      if (sql.includes("from public.shows where drive_file_id")) {
        return { archived: false } as T;
      }
      return { held: true } as T;
    });
    const tx = {
      queryOne,
      readShowForPhase1: vi.fn(async () => ({
        showId: "show-1",
        driveFileId: "drive-file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "shrink_held",
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
        outcome: "shrink_held" as const,
        message: "Would remove 3 crew",
        heldModifiedTime: "2026-05-08T12:00:00.000Z",
        shrinkItems: [],
        showId: "show-1",
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

    // Result carries showId (crew-cache-tag bust) + detail/heldModifiedTime, but NO `code` (R7).
    expect(result).toMatchObject({
      outcome: "shrink_held",
      showId: "show-1",
      detail: "Would remove 3 crew",
      heldModifiedTime: "2026-05-08T12:00:00.000Z",
    });
    expect(result).not.toHaveProperty("code");

    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "RESYNC_SHRINK_HELD",
      context: {
        drive_file_id: "drive-file-1",
        sheet_name: "FXAV Spring Tour",
        detail: "Would remove 3 crew",
        held_modified_time: "2026-05-08T12:00:00.000Z",
      },
    });

    // resolveStaleSyncProblemAlerts_unlocked ran with currentCode === "RESYNC_SHRINK_HELD"
    // (keeps its own row, resolves OTHER stale sync-problem peers on the same show).
    const resolveCall = queryOne.mock.calls.find(
      (call) => Array.isArray(call[1]) && call[1][2] === "RESYNC_SHRINK_HELD",
    );
    expect(resolveCall, "resolve call with currentCode RESYNC_SHRINK_HELD").toBeDefined();
    expect((resolveCall?.[1] as unknown[])?.[0]).toBe("show-1");
  });
});
