import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  FINALIZE_OWNED_SHOW,
  runManualSyncForShow,
  runManualSyncForShow_unlocked,
} from "@/lib/sync/runManualSyncForShow";

type FakeTx = SyncPipelineTx & {
  held: boolean;
  operations: string[];
  queryOneCalls: Array<{ sql: string; params: unknown[] }>;
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

function fakeTx(held = true): FakeTx {
  return {
    held,
    operations: [],
    queryOneCalls: [],
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
    async readShowForPhase1() {
      throw new Error("not reached by these tests");
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
      return { outcome: "updated", showId: "show-1", previousCrewNames: [] };
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
  };
}

describe("runManualSyncForShow", () => {
  test("_unlocked uses the caller-owned locked tx and dispatches to processOneFile_unlocked", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const fetchDriveFileMetadata = vi.fn(async () => fileMeta("drive-file-1"));
    const processOneFile_unlocked = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" }));

    const result = await runManualSyncForShow_unlocked(tx, "drive-file-1", "manual", {
      fetchDriveFileMetadata,
      processOneFile_unlocked,
    });

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(fetchDriveFileMetadata).toHaveBeenCalledWith("drive-file-1");
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
      runManualSyncForShow_unlocked(tx, "drive-file-1", "manual", {
        fetchDriveFileMetadata: async () => fileMeta("drive-file-1"),
        processOneFile_unlocked: async () => ({ outcome: "applied", showId: "show-1" }),
      }),
    ).rejects.toMatchObject({ code: "LOCK_OWNERSHIP_ASSERTION_FAILED" });
  });

  test("outer wrapper fetches Drive metadata before the blocking lock, then checks FINALIZE_OWNED_SHOW inside it", async () => {
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
        return { outcome: "applied" as const, showId: "show-1" };
      });
    });

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership,
      fetchDriveFileMetadata,
      withPipelineLock,
      processOneFile,
    });

    expect(result).toEqual({ outcome: "blocked", code: FINALIZE_OWNED_SHOW });
    expect(events).toEqual(["fetchMeta", "process:start", "lock:start", "guard", "lock:commit"]);
    expect(withPipelineLock).toHaveBeenCalledWith("drive-file-1", expect.any(Function));
    expect(checkFinalizeOwnership).toHaveBeenCalledWith(tx, "drive-file-1");
    expect(fetchDriveFileMetadata).toHaveBeenCalledWith("drive-file-1");
  });

  test("outer wrapper is the only lock holder for a legitimate manual sync", async () => {
    const tx = fakeTx(true) as LockedShowTx<FakeTx>;
    const withPipelineLock = vi.fn(async (_driveFileId, fn) => fn(tx));
    const processOneFile = vi.fn(async (_driveFileId, _mode, _fileMeta, processDeps) =>
      processDeps?.withShowLock?.("drive-file-1", async () => ({
        outcome: "applied" as const,
        showId: "show-1",
      })),
    );

    const result = await runManualSyncForShow("drive-file-1", "manual", {
      checkFinalizeOwnership: async () => false,
      fetchDriveFileMetadata: async () => fileMeta("drive-file-1"),
      withPipelineLock,
      processOneFile,
    });

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(withPipelineLock).toHaveBeenCalledOnce();
    expect(withPipelineLock.mock.calls[0]?.[0]).toBe("drive-file-1");
    expect(processOneFile).toHaveBeenCalledOnce();
  });

  test("default manual lock acquisition uses the admin blocking lock mode", () => {
    const source = String(runManualSyncForShow);

    expect(source).toContain("tryOnly: false");
  });

  test("raw SyncPipelineTx is not assignable to runManualSyncForShow_unlocked", async () => {
    const rawTx = fakeTx(true);

    function compileOnly() {
      // @ts-expect-error TS2345: callers must obtain LockedShowTx from withShowLock.
      void runManualSyncForShow_unlocked(rawTx, "drive-file-1");
    }

    expect(compileOnly).toBeTypeOf("function");
  });
});
