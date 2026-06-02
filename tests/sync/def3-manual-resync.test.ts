import { describe, it, expect, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import { runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";

type Calls = Array<{ sql: string; params: unknown[] }>;

function fakeTx(opts: { archived: boolean }) {
  const calls: Calls = [];
  const deletedDeferrals: string[] = [];
  const tx = {
    calls,
    deletedDeferrals,
    async queryOne<T>(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      if (/select archived from public\.shows/i.test(sql)) return { archived: opts.archived } as T;
      if (/update public\.shows set requires_resync/i.test(sql)) return { cleared: true } as T;
      throw new Error(`unexpected SQL in fakeTx: ${sql}`);
    },
    async deleteLiveDeferral(driveFileId: string) {
      deletedDeferrals.push(driveFileId);
    },
  };
  return tx as unknown as LockedShowTx<SyncPipelineTx> & { calls: Calls; deletedDeferrals: string[] };
}

function fileMeta(driveFileId = "drive-1"): DriveListedFile {
  return {
    driveFileId,
    name: "Manual Sync Fixture",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

describe("DEF-3 — runManualSyncForShow archived guard + manual deferral delete + requires_resync clear", () => {
  it("refuses an archived show at preflight → blocked/SHOW_ARCHIVED_IMMUTABLE, BEFORE any Drive fetch", async () => {
    const tx = fakeTx({ archived: true });
    const fetchDriveFileMetadata = vi.fn(async () => fileMeta());
    const result = await runManualSyncForShow("drive-1", "manual", {
      withPipelineLock: async (_id, fn) => fn(tx),
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata,
    });
    expect(result).toEqual({ outcome: "blocked", code: "SHOW_ARCHIVED_IMMUTABLE" });
    expect(fetchDriveFileMetadata).not.toHaveBeenCalled(); // no fetch on archived
  });

  it("on a Held show: deletes the live deferral (R30) and clears requires_resync on a clean (applied) outcome", async () => {
    const tx = fakeTx({ archived: false });
    const processOneFile = vi.fn(async (_id: string, _mode: unknown, _meta: unknown, deps: any) =>
      deps.withShowLock("drive-1", async () => ({ outcome: "applied", showId: "show-1" })),
    );
    const result = await runManualSyncForShow("drive-1", "manual", {
      withPipelineLock: async (_id, fn) => fn(tx),
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: async () => ({ folderId: "folder-1" }),
      fetchDriveFileMetadata: async () => fileMeta(),
      processOneFile: processOneFile as never,
    });
    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(tx.deletedDeferrals).toContain("drive-1"); // manual overrides auto-suppression
    expect(tx.calls.some((c) => /update public\.shows set requires_resync = false/i.test(c.sql))).toBe(true);
  });

  it("R-impl-1 TOCTOU: a recovery branch re-reads archived under ITS lock — Archive landing after preflight blocks the marked error (no shows mutation / no sync_log)", async () => {
    // Preflight lock sees archived=false (proceeds); the folder-config-error recovery lock (a SEPARATE
    // lock acquired after the preflight lock released) sees archived=true because an Archive committed in
    // between. The recovery branch must abort with SHOW_ARCHIVED_IMMUTABLE BEFORE markManualDriveError_unlocked
    // touches `shows` / writes sync_log. (Before the fix, only finalize-ownership was re-checked here.)
    let archivedReads = 0;
    const markShowDriveError = vi.fn(async () => ({ showId: "show-1", lastSeenModifiedTime: null }));
    const insertSyncLog = vi.fn(async () => undefined);
    const tx = {
      async queryOne<T>(sql: string) {
        if (/pg_locks/i.test(sql)) return { held: true } as T;
        if (/select archived from public\.shows/i.test(sql)) {
          archivedReads += 1;
          return { archived: archivedReads > 1 } as T; // 1st (preflight)=false, 2nd (recovery)=true
        }
        throw new Error(`unexpected SQL in fakeTx: ${sql}`);
      },
      async deleteLiveDeferral() {},
      markShowDriveError,
      insertSyncLog,
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const fetchDriveFileMetadata = vi.fn(async () => fileMeta());

    const result = await runManualSyncForShow("drive-1", "manual", {
      withPipelineLock: async (_id, fn) => fn(tx),
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: async () => ({ kind: "no_folder_configured" as const }),
      fetchDriveFileMetadata,
    });

    expect(result).toEqual({ outcome: "blocked", code: "SHOW_ARCHIVED_IMMUTABLE" });
    expect(markShowDriveError).not.toHaveBeenCalled(); // no shows mutation on the archived show
    expect(insertSyncLog).not.toHaveBeenCalled(); // no sync_log row
    expect(fetchDriveFileMetadata).not.toHaveBeenCalled(); // folder error short-circuits before fetch
  });
});
