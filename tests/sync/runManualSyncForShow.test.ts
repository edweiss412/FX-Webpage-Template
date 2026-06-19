import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  FINALIZE_OWNED_SHOW,
  runManualSyncForShow,
  runManualSyncForShow_unlocked,
} from "@/lib/sync/runManualSyncForShow";
import {
  SHEET_UNAVAILABLE,
  STAGED_PARSE_SOURCE_GONE,
  SYNC_INFRA_ERROR,
  type ProcessOneFileDeps,
} from "@/lib/sync/runScheduledCronSync";

type FakeTx = SyncPipelineTx & {
  held: boolean;
  operations: string[];
  queryOneCalls: Array<{ sql: string; params: unknown[] }>;
  shows: Map<
    string,
    {
      showId: string;
      driveFileId: string;
      lastSeenModifiedTime: string | null;
      lastSyncStatus: string | null;
      lastSyncError: string | null;
      title: string;
    }
  >;
  syncLog: Array<{
    driveFileId: string | null;
    outcome: string;
    code?: string;
    payload?: Record<string, unknown>;
    showId?: string | null;
  }>;
  alerts: Array<{ showId: string | null; code: string; context: Record<string, unknown> }>;
  markShowSheetUnavailable(
    driveFileId: string,
    code: string,
  ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null; title: string | null }>;
  markShowDriveError(
    driveFileId: string,
    code: string,
  ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null; title: string | null }>;
  insertSyncLog(
    entry: {
      driveFileId: string | null;
      outcome: string;
      code?: string;
      payload?: Record<string, unknown>;
    },
    showId?: string | null,
  ): Promise<void>;
  upsertAdminAlert(input: {
    showId: string | null;
    code: string;
    context: Record<string, unknown>;
  }): Promise<string | null>;
};

function fileMeta(driveFileId = "drive-file-1"): DriveListedFile {
  return {
    driveFileId,
    name: "Manual Sync Fixture",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

const parseResult = {
  show: { title: "Manual Sync Fixture" },
  warnings: [],
} as unknown as ParseResult;

function fakeTx(held = true): FakeTx {
  return {
    held,
    operations: [],
    queryOneCalls: [],
    shows: new Map([
      [
        "drive-file-1",
        {
          showId: "show-1",
          driveFileId: "drive-file-1",
          lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
          lastSyncStatus: "ok",
          lastSyncError: null,
          title: "Manual Sync Fixture",
        },
      ],
    ]),
    syncLog: [],
    alerts: [],
    async queryOne<T>(sql: string, params: unknown[]) {
      this.queryOneCalls.push({ sql, params });
      if (/pg_(?:try_)?advisory_xact_lock/i.test(sql)) {
        throw new Error("runManualSyncForShow_unlocked must not acquire advisory locks");
      }
      if (/\bbegin\b|\bcommit\b|\brollback\b/i.test(sql)) {
        throw new Error("runManualSyncForShow_unlocked must not own transaction boundaries");
      }
      if (/pg_locks/i.test(sql)) return { held: this.held } as T;
      return { held: this.held } as T;
    },
    async readShowForPhase1(driveFileId: string) {
      const show = this.shows.get(driveFileId);
      if (!show) return null;
      return {
        showId: show.showId,
        driveFileId: show.driveFileId,
        lastSeenModifiedTime: show.lastSeenModifiedTime,
        lastSyncStatus: show.lastSyncStatus,
        lastSyncError: show.lastSyncError,
        priorParseResult: parseResult,
      };
    },
    async readLivePendingSync() {
      return null;
    },
    async upsertLivePendingIngestion() {},
    async deleteLivePendingIngestion() {},
    async upsertLivePendingSync() {
      return { stagedId: "staged-1" };
    },
    async updateShowParseError() {},
    async updateShowPendingReview() {},
    async deleteWizardPendingSyncsExcept() {},
    async applyShowSnapshot() {
      return { outcome: "updated", showId: "show-1", previousCrewNames: [], priorRunOfShow: null };
    },
    async deleteCrewMembersNotIn() {},
    async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal() {},
    async markShowSheetUnavailable(driveFileId: string, code: string) {
      this.operations.push(`markShowSheetUnavailable:${driveFileId}`);
      const show = this.shows.get(driveFileId);
      if (!show) return { showId: null, lastSeenModifiedTime: null, title: null };
      show.lastSyncStatus = "sheet_unavailable";
      show.lastSyncError = code;
      return { showId: show.showId, lastSeenModifiedTime: show.lastSeenModifiedTime, title: show.title };
    },
    async markShowDriveError(driveFileId: string, code: string) {
      this.operations.push(`markShowDriveError:${driveFileId}`);
      const show = this.shows.get(driveFileId);
      if (!show) return { showId: null, lastSeenModifiedTime: null, title: null };
      show.lastSyncStatus = "drive_error";
      show.lastSyncError = code;
      return { showId: show.showId, lastSeenModifiedTime: show.lastSeenModifiedTime, title: show.title };
    },
    async insertSyncLog(
      entry: {
        driveFileId: string | null;
        outcome: string;
        code?: string;
        payload?: Record<string, unknown>;
      },
      showId?: string | null,
    ) {
      this.operations.push(`insertSyncLog:${entry.driveFileId ?? "global"}`);
      this.syncLog.push(showId === undefined ? entry : { ...entry, showId });
    },
    async upsertAdminAlert(input: {
      showId: string | null;
      code: string;
      context: Record<string, unknown>;
    }) {
      this.operations.push(`upsertAdminAlert:${input.code}`);
      this.alerts.push(input);
      return "alert-1";
    },
  };
}

describe("runManualSyncForShow", () => {
  test("_unlocked uses caller-provided fileMeta and never performs Drive metadata fetch inside the lock", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const fetchDriveFileMetadata = vi.fn(async () => fileMeta("drive-file-1"));
    const processOneFile_unlocked = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1", parseWarnings: [] }));

    const result = await runManualSyncForShow_unlocked(
      tx,
      "drive-file-1",
      "manual",
      fileMeta("drive-file-1"),
      {
        fetchDriveFileMetadata,
        processOneFile_unlocked,
      },
    );

    expect(result).toEqual({ outcome: "applied", showId: "show-1", parseWarnings: [] });
    expect(fetchDriveFileMetadata).not.toHaveBeenCalled();
    expect(processOneFile_unlocked).toHaveBeenCalledWith(
      tx,
      "drive-file-1",
      "manual",
      fileMeta("drive-file-1"),
      expect.any(Object),
    );
    expect(tx.queryOneCalls.some(({ sql }) => /pg_(?:try_)?advisory_xact_lock/i.test(sql))).toBe(
      false,
    );
  });

  test("_unlocked rejects a forced cast when the show advisory lock is not held", async () => {
    const tx = fakeTx(false) as unknown as LockedShowTx<FakeTx>;

    await expect(
      runManualSyncForShow_unlocked(tx, "drive-file-1", "manual", fileMeta("drive-file-1"), {
        processOneFile_unlocked: async () => ({ outcome: "applied", showId: "show-1", parseWarnings: [] }),
      }),
    ).rejects.toMatchObject({ code: "LOCK_OWNERSHIP_ASSERTION_FAILED" });
  });

  test("outer wrapper checks FINALIZE_OWNED_SHOW in a blocking preflight lock before fetching Drive metadata", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const events: string[] = [];
    const checkFinalizeOwnership = vi.fn(async () => {
      events.push("guard");
      return true;
    });
    const fetchDriveFileMetadata = vi.fn(async () => {
      events.push("fetchMeta");
      return fileMeta("drive-file-1");
    });
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => {
      events.push("lock:start");
      const result = await fn(tx);
      events.push("lock:commit");
      return result;
    });
    const processOneFile = vi.fn(async (_driveFileId, _mode, _fileMeta, processDeps) => {
      events.push("process:start");
      return await processDeps?.withShowLock?.("drive-file-1", async () => {
        events.push("process:locked");
        return { outcome: "applied" as const, showId: "show-1", parseWarnings: [] };
      });
    });

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership,
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata,
      withPipelineLock,
      processOneFile,
    });

    expect(result).toEqual({ outcome: "blocked", code: FINALIZE_OWNED_SHOW });
    expect(events).toEqual(["lock:start", "guard", "lock:commit"]);
    expect(withPipelineLock).toHaveBeenCalledWith("drive-file-1", expect.any(Function));
    expect(checkFinalizeOwnership).toHaveBeenCalledWith(tx, "drive-file-1");
    expect(fetchDriveFileMetadata).not.toHaveBeenCalled();
    expect(processOneFile).not.toHaveBeenCalled();
  });

  test("valid manual re-sync verifies Drive parents against the watched folder before processing", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => fn(tx));
    const getActiveWatchedFolderId = vi.fn(async () => ({ folderId: "folder-1" }));
    const fetchDriveFileMetadata = vi.fn(async () => fileMeta("drive-file-1"));
    const processOneFile = vi.fn(async (_driveFileId, _mode, _fileMeta, processDeps) =>
      processDeps?.withShowLock?.("drive-file-1", async () => ({
        outcome: "applied" as const,
        showId: "show-1",
        parseWarnings: [],
      })),
    );

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId,
      fetchDriveFileMetadata,
      withPipelineLock,
      processOneFile,
    });

    expect(result).toEqual({ outcome: "applied", showId: "show-1", parseWarnings: [] });
    expect(getActiveWatchedFolderId).toHaveBeenCalledOnce();
    expect(fetchDriveFileMetadata).toHaveBeenCalledWith("drive-file-1");
    expect(withPipelineLock).toHaveBeenCalledTimes(2);
    expect(withPipelineLock.mock.calls.map((call) => call[0])).toEqual(["drive-file-1", "drive-file-1"]);
    expect(processOneFile).toHaveBeenCalledOnce();
  });

  test("default manual hard_fail emits PARSE_ERROR_LAST_GOOD exactly once", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => fn(tx));
    const processDeps = {
      perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "manual" as const })),
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

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata: vi.fn(async () => fileMeta("drive-file-1")),
      withPipelineLock,
      processDeps,
    });

    expect(result).toEqual({ outcome: "hard_fail", code: "MI-4_NO_CREW" });
    expect(tx.alerts.filter((alert) => alert.code === "PARSE_ERROR_LAST_GOOD")).toHaveLength(1);
    expect(tx.alerts).toContainEqual({
      showId: "show-1",
      code: "PARSE_ERROR_LAST_GOOD",
      context: {
        drive_file_id: "drive-file-1",
        sheet_name: "Manual Sync Fixture",
      },
    });
  });

  test("default manual drive_error emits DRIVE_FETCH_FAILED exactly once", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => fn(tx));
    const processDeps = {
      perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "manual" as const })),
      captureBinding: vi.fn(async () => ({
        bindingToken: "binding-1",
        modifiedTime: "2026-05-08T12:00:00.000Z",
      })),
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 500");
      }),
    } as unknown as ProcessOneFileDeps;

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata: vi.fn(async () => fileMeta("drive-file-1")),
      withPipelineLock,
      processDeps,
    });

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });
    expect(tx.alerts.filter((alert) => alert.code === "DRIVE_FETCH_FAILED")).toHaveLength(1);
    expect(tx.alerts).toContainEqual({
      showId: "show-1",
      code: "DRIVE_FETCH_FAILED",
      context: {
        drive_file_id: "drive-file-1",
        failure_code: "SYNC_FILE_FAILED",
        previous_last_seen_modified_time: "2026-05-08T11:00:00.000Z",
        sheet_name: "Manual Sync Fixture",
      },
    });
  });

  test("manual re-sync marks the show sheet_unavailable and skips processing when Drive parents exclude the watched folder", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => fn(tx));
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1", parseWarnings: [] }));

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata: vi.fn(async () => ({
        ...fileMeta("drive-file-1"),
        parents: ["other-folder"],
      })),
      withPipelineLock,
      processOneFile,
    });

    expect(result).toEqual({ outcome: "source_gone", code: SHEET_UNAVAILABLE });
    expect(processOneFile).not.toHaveBeenCalled();
    expect(tx.shows.get("drive-file-1")).toMatchObject({
      lastSyncStatus: "sheet_unavailable",
      lastSyncError: SHEET_UNAVAILABLE,
    });
    expect(tx.operations).toEqual([
      "markShowSheetUnavailable:drive-file-1",
      "insertSyncLog:drive-file-1",
      "upsertAdminAlert:SHEET_UNAVAILABLE",
    ]);
    expect(tx.syncLog).toEqual([
      {
        driveFileId: "drive-file-1",
        outcome: "error",
        code: SHEET_UNAVAILABLE,
        payload: {
          driveFileId: "drive-file-1",
          previousLastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        },
        showId: "show-1",
      },
    ]);
    expect(tx.alerts).toEqual([
      {
        showId: "show-1",
        code: "SHEET_UNAVAILABLE",
        context: {
          drive_file_id: "drive-file-1",
          previous_last_seen_modified_time: "2026-05-08T11:00:00.000Z",
          sheet_name: "Manual Sync Fixture",
        },
      },
    ]);
  });

  test("manual re-sync marks the show sheet_unavailable and skips processing when Drive metadata returns 404", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => fn(tx));
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1", parseWarnings: [] }));
    const gone = Object.assign(new Error("Drive file not found"), { code: 404 });

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata: vi.fn(async () => {
        throw gone;
      }),
      withPipelineLock,
      processOneFile,
    });

    expect(result).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(processOneFile).not.toHaveBeenCalled();
    expect(tx.shows.get("drive-file-1")).toMatchObject({
      lastSyncStatus: "sheet_unavailable",
      lastSyncError: STAGED_PARSE_SOURCE_GONE,
    });
    expect(tx.syncLog).toEqual([
      {
        driveFileId: "drive-file-1",
        outcome: "error",
        code: STAGED_PARSE_SOURCE_GONE,
        payload: {
          driveFileId: "drive-file-1",
          message: "Drive file not found",
          previousLastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        },
        showId: "show-1",
      },
    ]);
  });

  test("manual re-sync records a locked drive_error and skips Drive processing when no watched folder is configured", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => fn(tx));
    const fetchDriveFileMetadata = vi.fn(async () => fileMeta("drive-file-1"));
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1", parseWarnings: [] }));

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: vi.fn(async () => ({ kind: "no_folder_configured" as const })),
      fetchDriveFileMetadata,
      withPipelineLock,
      processOneFile,
    });

    expect(result).toEqual({ outcome: "parse_error", code: SYNC_INFRA_ERROR });
    expect(fetchDriveFileMetadata).not.toHaveBeenCalled();
    expect(processOneFile).not.toHaveBeenCalled();
    expect(tx.shows.get("drive-file-1")).toMatchObject({
      lastSyncStatus: "drive_error",
      lastSyncError: SYNC_INFRA_ERROR,
    });
    expect(tx.operations).toEqual([
      "markShowDriveError:drive-file-1",
      "insertSyncLog:drive-file-1",
      "upsertAdminAlert:DRIVE_FETCH_FAILED",
    ]);
    expect(tx.alerts).toEqual([
      {
        showId: "show-1",
        code: "DRIVE_FETCH_FAILED",
        context: {
          drive_file_id: "drive-file-1",
          failure_code: SYNC_INFRA_ERROR,
          previous_last_seen_modified_time: "2026-05-08T11:00:00.000Z",
          sheet_name: "Manual Sync Fixture",
        },
      },
    ]);
  });

  test("default manual lock acquisition uses the admin blocking lock mode", () => {
    const source = String(runManualSyncForShow);

    expect(source).toContain("tryOnly: false");
  });

  test("raw SyncPipelineTx is not assignable to runManualSyncForShow_unlocked", async () => {
    const rawTx = fakeTx(true);

    function compileOnly() {
      // @ts-expect-error TS2345: callers must obtain LockedShowTx from withShowLock.
      void runManualSyncForShow_unlocked(rawTx, "drive-file-1", "manual", fileMeta("drive-file-1"));
    }

    expect(compileOnly).toBeTypeOf("function");
  });
});
