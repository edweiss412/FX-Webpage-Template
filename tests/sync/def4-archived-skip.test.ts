import { describe, it, expect, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  processOneFile,
  processOneFile_unlocked,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";
import { runPushSyncForShow } from "@/lib/sync/runPushSyncForShow";

function fileMeta(driveFileId = "drive-1"): DriveListedFile {
  return {
    driveFileId,
    name: "Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

describe("DEF-4 — archived cron/push silent-skip (no fetch, no sync_log)", () => {
  it("cron processOneFile: an archived gate-skip returns silently — logSync is NOT called", async () => {
    const logSync = vi.fn(async () => undefined);
    const result = await processOneFile("drive-1", "cron", fileMeta(), {
      perFileProcessor: async () => ({ outcome: "skip", reason: "archived" }),
      logSync,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "archived" });
    expect(logSync).not.toHaveBeenCalled(); // silent — no sync_log row
  });

  it("cron processOneFile: a NORMAL (watermark) gate-skip still writes a sync_log row", async () => {
    // Negative-regression: proves the archived short-circuit is specific, not a blanket skip suppression.
    const logSync = vi.fn(async () => undefined);
    const result = await processOneFile("drive-1", "cron", fileMeta(), {
      perFileProcessor: async () => ({ outcome: "skip", reason: "watermark" }),
      logSync,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "watermark" });
    expect(logSync).toHaveBeenCalledTimes(1);
  });

  it("push runPushSyncForShow: an archived show skips BEFORE any Drive fetch — no fetch, no sync_log", async () => {
    const fetchDriveFileMetadata = vi.fn(async () => fileMeta());
    const logSync = vi.fn(async () => undefined);
    const result = await runPushSyncForShow("drive-1", {
      isShowArchived: async () => true,
      fetchDriveFileMetadata,
      logSync,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "archived" });
    expect(fetchDriveFileMetadata).not.toHaveBeenCalled();
    expect(logSync).not.toHaveBeenCalled();
  });

  it("in-lock re-read: processOneFile_unlocked aborts silently when the show is archived under the lock", async () => {
    // An Archive committed between prepare and lock acquisition. The in-lock re-read aborts before any
    // recheck/process/log. fakeTx: lock held + archived=true.
    const calls: Array<{ sql: string }> = [];
    const tx = {
      async queryOne<T>(sql: string) {
        calls.push({ sql });
        if (/pg_locks/i.test(sql)) return { held: true } as T;
        if (/select archived from public\.shows/i.test(sql)) return { archived: true } as T;
        throw new Error(`unexpected SQL in fakeTx: ${sql}`);
      },
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const logSync = vi.fn(async () => undefined);
    const result = await processOneFile_unlocked(tx, "drive-1", "cron", fileMeta(), { logSync }, undefined);
    expect(result).toEqual({ outcome: "skipped", reason: "archived" });
    expect(logSync).not.toHaveBeenCalled();
    // Only the lock-held probe + the archived re-read ran — no deferral recheck / processing SQL.
    expect(calls.every((c) => /pg_locks/i.test(c.sql) || /select archived from public\.shows/i.test(c.sql))).toBe(true);
  });
});
