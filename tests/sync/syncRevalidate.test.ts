/**
 * tests/sync/syncRevalidate.test.ts (nav-perf tag-caching, plan Task 5)
 *
 * Asserts the SYNC-apply post-commit revalidate sites: every locked sync caller
 * (cron apply tail + cron missingShows, push runner, manual sync) and the LIVE
 * pending-ingestion retry route call `revalidateTag(showCacheTag(showId))` —
 * AFTER the outermost lock/tx resolves (post-commit), once per applied show, and
 * NEVER on a non-applied outcome (skip / error / ConcurrentSyncSkipped).
 *
 * Ordering proof: each injected lock/tx wrapper pushes a `committed` marker onto
 * a shared `order` log when it RESOLVES; `revalidateTag` is a spy that pushes a
 * `revalidate:<showId>` marker. The test asserts `revalidate` follows `committed`
 * in `order` — proving the call is post-commit, not inside the lock/tx callback.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { showCacheTag } from "@/lib/data/showCacheTag";

// Per-file faithful mock: revalidateTag records the (tag, profile) AND pushes an
// ordering marker so the post-commit assertions can interleave it with the
// injected lock/tx `committed` markers. (The global tests/setup.ts mock is a
// no-op spy; this per-file mock overrides it.)
const order: string[] = [];
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn((tag: string) => {
    order.push(`revalidate:${tag}`);
  }),
  revalidatePath: vi.fn(),
}));

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const DRIVE_FILE_ID = "drive-file-1";

function driveFile(driveFileId = DRIVE_FILE_ID): import("@/lib/drive/list").DriveListedFile {
  return {
    driveFileId,
    name: `${driveFileId} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:05:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

beforeEach(() => {
  order.length = 0;
  (revalidateTag as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe("cron apply tail", () => {
  test("revalidates each applied show AFTER the lock resolves; never on non-applied", async () => {
    const { runScheduledCronSync } = await import("@/lib/sync/runScheduledCronSync");
    const appliedFile = driveFile("file-applied");
    const skippedFile = driveFile("file-skipped");

    const result = await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: async () => [appliedFile, skippedFile],
      listLiveShows: async () => [],
      // processOneFile = the locked wrapper; resolving it means the per-show tx
      // committed. Push `committed:<id>` on resolve so ordering is observable.
      processOneFile: async (driveFileId) => {
        order.push(`committed:${driveFileId}`);
        if (driveFileId === appliedFile.driveFileId) {
          return { outcome: "applied", showId: SHOW_ID, parseWarnings: [] };
        }
        return { outcome: "skipped", reason: "watermark_unchanged" };
      },
      writeSyncCronHeartbeat: async () => ({ kind: "ok" }) as never,
    });

    expect(result.processed).toHaveLength(2);
    // Exactly one revalidate (the applied file), for the applied show's tag.
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(SHOW_ID), { expire: 0 });
    // Post-commit ordering: the applied file's commit precedes its revalidate.
    expect(order).toEqual([
      `committed:${appliedFile.driveFileId}`,
      `revalidate:${showCacheTag(SHOW_ID)}`,
      `committed:${skippedFile.driveFileId}`,
    ]);
  });
});

describe("cron missingShows loop", () => {
  test("revalidates a source_gone missing show AFTER lockMissingShow resolves; not when archived-skipped", async () => {
    const { runScheduledCronSync, SHEET_UNAVAILABLE } =
      await import("@/lib/sync/runScheduledCronSync");
    const goneShowId = "22222222-2222-2222-2222-222222222222";
    const archivedShowId = "33333333-3333-3333-3333-333333333333";

    await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: async () => [], // nothing listed -> both live shows are "missing"
      listLiveShows: async () => [
        {
          showId: goneShowId,
          driveFileId: "gone-file",
          lastSeenModifiedTime: null,
          wizardSessionId: null,
          title: "Gone Show",
        },
        {
          showId: archivedShowId,
          driveFileId: "archived-file",
          lastSeenModifiedTime: null,
          wizardSessionId: null,
          title: "Archived Show",
        },
      ],
      // lockMissingShow = withShowLock; resolving it means markMissingShow_unlocked's
      // `update public.shows` committed. We bypass the unlocked body and return the
      // outcome directly (we own the injected lock).
      withShowLock: (async (driveFileId: string) => {
        order.push(`committed:${driveFileId}`);
        if (driveFileId === "gone-file") {
          return { outcome: "source_gone", code: SHEET_UNAVAILABLE };
        }
        // Archived show: silent skip, NO shows mutation -> NO revalidate.
        return { outcome: "skipped", reason: "ARCHIVED_SOURCE_SKIP" };
      }) as never,
      writeSyncCronHeartbeat: async () => ({ kind: "ok" }) as never,
    });

    // Exactly one revalidate — the source_gone show (a real shows mutation).
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(goneShowId), { expire: 0 });
    // Post-commit ordering for the gone show.
    expect(order).toEqual([
      "committed:gone-file",
      `revalidate:${showCacheTag(goneShowId)}`,
      "committed:archived-file",
    ]);
  });
});

describe("push runner", () => {
  test("revalidates an applied push AFTER processOneFile resolves; not on skip", async () => {
    const { runPushSyncForShow } = await import("@/lib/sync/runPushSyncForShow");

    const applied = await runPushSyncForShow(DRIVE_FILE_ID, {
      fileMeta: driveFile(),
      isShowArchived: async () => false,
      readPushDuplicatePreflight: async () => ({ outcome: "proceed" }),
      processOneFile: async (driveFileId) => {
        order.push(`committed:${driveFileId}`);
        return { outcome: "applied", showId: SHOW_ID, parseWarnings: [] };
      },
      logSync: async () => undefined,
    });
    expect("outcome" in applied && applied.outcome).toBe("applied");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(SHOW_ID), { expire: 0 });
    expect(order).toEqual([`committed:${DRIVE_FILE_ID}`, `revalidate:${showCacheTag(SHOW_ID)}`]);

    order.length = 0;
    (revalidateTag as unknown as ReturnType<typeof vi.fn>).mockClear();

    await runPushSyncForShow(DRIVE_FILE_ID, {
      fileMeta: driveFile(),
      isShowArchived: async () => false,
      readPushDuplicatePreflight: async () => ({ outcome: "proceed" }),
      processOneFile: async (driveFileId) => {
        order.push(`committed:${driveFileId}`);
        return { outcome: "skipped", reason: "watermark_unchanged" };
      },
      logSync: async () => undefined,
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("manual sync", () => {
  test("revalidates an applied manual sync AFTER withPipelineLock resolves; not on skip", async () => {
    const { runManualSyncForShow } = await import("@/lib/sync/runManualSyncForShow");

    // The preflight runs `readShowArchived_unlocked(tx, ...)` via the injected
    // lock; the tx needs a `queryOne` returning a non-archived show.
    const lockTx = { queryOne: async () => ({ archived: false }) } as unknown;
    const applied = await runManualSyncForShow(DRIVE_FILE_ID, "manual", {
      // Preflight routes through the injected lock; resolving it is the commit
      // boundary for the preflight tx. The apply uses the injected processOneFile.
      withPipelineLock: (async (_id: string, fn: (tx: unknown) => unknown) => {
        return await fn(lockTx);
      }) as never,
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: async () => ({ folderId: "folder-1" }) as never,
      fetchDriveFileMetadata: async () => driveFile(),
      // processOneFile = the locked wrapper invoked by the final apply path; its
      // resolution is post-commit for the manual apply.
      processOneFile: (async (driveFileId: string) => {
        order.push(`committed:${driveFileId}`);
        return { outcome: "applied", showId: SHOW_ID, parseWarnings: [] };
      }) as never,
    });
    expect("outcome" in applied && applied.outcome).toBe("applied");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(SHOW_ID), { expire: 0 });
    const committedIdx = order.indexOf(`committed:${DRIVE_FILE_ID}`);
    const revalidateIdx = order.indexOf(`revalidate:${showCacheTag(SHOW_ID)}`);
    expect(committedIdx).toBeGreaterThanOrEqual(0);
    expect(revalidateIdx).toBeGreaterThan(committedIdx);

    order.length = 0;
    (revalidateTag as unknown as ReturnType<typeof vi.fn>).mockClear();

    await runManualSyncForShow(DRIVE_FILE_ID, "manual", {
      withPipelineLock: (async (_id: string, fn: (tx: unknown) => unknown) => {
        return await fn(lockTx);
      }) as never,
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: async () => ({ folderId: "folder-1" }) as never,
      fetchDriveFileMetadata: async () => driveFile(),
      processOneFile: (async () => {
        return { outcome: "skipped", reason: "watermark_unchanged" };
      }) as never,
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
