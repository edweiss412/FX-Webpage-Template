/**
 * tests/sync/syncRevalidate.test.ts (nav-perf tag-caching, plan Task 5 + whole-diff R2)
 *
 * Asserts the SYNC-apply post-commit revalidate sites: every locked sync caller
 * (cron apply tail + cron missingShows, push runner, manual sync incl. its
 * early-error exits) and the LIVE pending-ingestion retry route call
 * `revalidateTag(showCacheTag(showId))` — AFTER the outermost lock/tx resolves
 * (post-commit), once per show.
 *
 * Whole-diff R2 broadened the gate from "applied-only" to "ANY result carrying a
 * non-empty showId". The showId-carrying outcomes are exactly applied +
 * parse_error + source_gone — the trio that commits `shows.last_sync_status`
 * (projected by StaleFooter via getShowForViewer's `lastSyncStatus`). So:
 *   - applied / parse_error / source_gone WITH a showId  → revalidate
 *   - skipped / stale / revision_race / stage / hard_fail / ConcurrentSyncSkipped
 *     (NO showId)                                          → NO revalidate
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
  test("revalidates each applied show AFTER the lock resolves; not on a no-showId skip", async () => {
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
    // Exactly one revalidate (the applied file), for the applied show's tag. The
    // skipped file carries NO showId, so the showId-presence gate no-ops for it.
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(SHOW_ID), { expire: 0 });
    // Post-commit ordering: the applied file's commit precedes its revalidate.
    expect(order).toEqual([
      `committed:${appliedFile.driveFileId}`,
      `revalidate:${showCacheTag(SHOW_ID)}`,
      `committed:${skippedFile.driveFileId}`,
    ]);
  });

  test("revalidates a parse_error/source_gone outcome that carries a showId (whole-diff R2)", async () => {
    // Whole-diff R2: parse_error / source_gone outcomes ALSO commit
    // `shows.last_sync_status` (handleFetchFailure_unlocked → markShow{DriveError,
    // SheetUnavailable}) and now carry the read-back showId. The broadened gate
    // MUST bust the cache tag for them — the bug was these going stale until TTL.
    const { runScheduledCronSync } = await import("@/lib/sync/runScheduledCronSync");
    const parseErrFile = driveFile("file-parse-err");
    const sourceGoneFile = driveFile("file-source-gone");
    const parseErrShowId = "44444444-4444-4444-4444-444444444444";
    const sourceGoneShowId = "55555555-5555-5555-5555-555555555555";

    await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: async () => [parseErrFile, sourceGoneFile],
      listLiveShows: async () => [],
      processOneFile: async (driveFileId) => {
        order.push(`committed:${driveFileId}`);
        if (driveFileId === parseErrFile.driveFileId) {
          return { outcome: "parse_error", code: "SYNC_INFRA_ERROR", showId: parseErrShowId };
        }
        return { outcome: "source_gone", code: "SHEET_UNAVAILABLE", showId: sourceGoneShowId };
      },
      writeSyncCronHeartbeat: async () => ({ kind: "ok" }) as never,
    });

    // Both showId-carrying recovery outcomes bust their tag, each post-commit.
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(parseErrShowId), { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(sourceGoneShowId), { expire: 0 });
    expect(order).toEqual([
      `committed:${parseErrFile.driveFileId}`,
      `revalidate:${showCacheTag(parseErrShowId)}`,
      `committed:${sourceGoneFile.driveFileId}`,
      `revalidate:${showCacheTag(sourceGoneShowId)}`,
    ]);
  });

  test("does NOT revalidate a parse_error/source_gone outcome with NO showId (no projected show)", async () => {
    // First-seen / pending-ingestion path: handleFetchFailure_unlocked matched no
    // public.shows row → result carries no showId → nothing projected to bust.
    const { runScheduledCronSync } = await import("@/lib/sync/runScheduledCronSync");
    const noShowFile = driveFile("file-no-show");

    await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: async () => [noShowFile],
      listLiveShows: async () => [],
      processOneFile: async (driveFileId) => {
        order.push(`committed:${driveFileId}`);
        return { outcome: "parse_error", code: "SYNC_INFRA_ERROR" };
      },
      writeSyncCronHeartbeat: async () => ({ kind: "ok" }) as never,
    });

    expect(revalidateTag).not.toHaveBeenCalled();
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

    // Whole-diff R2: a push that ends in source_gone (sheet left the folder /
    // 404) carries showId + commits last_sync_status → must revalidate post-commit.
    const sourceGone = await runPushSyncForShow(DRIVE_FILE_ID, {
      fileMeta: driveFile(),
      isShowArchived: async () => false,
      readPushDuplicatePreflight: async () => ({ outcome: "proceed" }),
      processOneFile: async (driveFileId) => {
        order.push(`committed:${driveFileId}`);
        return { outcome: "source_gone", code: "SHEET_UNAVAILABLE", showId: SHOW_ID };
      },
      logSync: async () => undefined,
    });
    expect("outcome" in sourceGone && sourceGone.outcome).toBe("source_gone");
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

  test("revalidates a manual EARLY-ERROR exit (markManualSheetUnavailable) AFTER the recovery lock resolves (whole-diff R2)", async () => {
    // Whole-diff R2: the early-error exits (markManualDriveError_unlocked /
    // markManualSheetUnavailable_unlocked) commit `shows.last_sync_status` and
    // return BEFORE the post-pipeline-lock revalidate at the function tail. The bug:
    // these returns skipped revalidate entirely → crew page stale until TTL. We
    // drive the source-gone branch (fetchDriveFileMetadata throws 404) and assert
    // the cache tag is busted post-commit (after the recovery withLock resolves).
    const { runManualSyncForShow } = await import("@/lib/sync/runManualSyncForShow");
    const earlyShowId = "66666666-6666-6666-6666-666666666666";

    // The recovery lock's tx must satisfy: readShowArchived_unlocked (archived:false),
    // assertShowLockHeld (held:true), markShowSheetUnavailable (returns showId),
    // insertSyncLog/upsertAdminAlert (no-op), resolveStaleSyncProblemAlerts (update).
    const recoveryTx = {
      queryOne: async (sql: string) => {
        if (sql.includes("select archived")) return { archived: false };
        if (sql.includes("pg_locks")) return { held: true };
        return undefined; // resolveStaleSyncProblemAlerts_unlocked update
      },
      markShowSheetUnavailable: async () => ({
        showId: earlyShowId,
        lastSeenModifiedTime: null,
        title: "Early Error Show",
      }),
      markShowDriveError: async () => ({
        showId: earlyShowId,
        lastSeenModifiedTime: null,
        title: "Early Error Show",
      }),
      insertSyncLog: async () => undefined,
      upsertAdminAlert: async () => null,
    } as unknown;

    const earlyResult = await runManualSyncForShow(DRIVE_FILE_ID, "manual", {
      // The preflight withLock returns proceed (archived:false, not finalize-owned),
      // then the source-gone recovery routes through THIS same injected lock; its
      // resolution is the commit boundary, so push `committed` AFTER fn resolves.
      withPipelineLock: (async (_id: string, fn: (tx: unknown) => unknown) => {
        const r = await fn(recoveryTx);
        order.push("committed");
        return r;
      }) as never,
      checkFinalizeOwnership: async () => false,
      getActiveWatchedFolderId: async () => ({ folderId: "folder-1" }) as never,
      // 404 → isDriveSourceGone → markManualSheetUnavailable_unlocked → source_gone.
      fetchDriveFileMetadata: async () => {
        throw { code: 404 };
      },
    });

    expect("outcome" in earlyResult && earlyResult.outcome).toBe("source_gone");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(earlyShowId), { expire: 0 });
    // Post-commit ordering: the LAST `committed` (the recovery lock) precedes revalidate.
    expect(order[order.length - 2]).toBe("committed");
    expect(order[order.length - 1]).toBe(`revalidate:${showCacheTag(earlyShowId)}`);
  });
});

describe("live pending-ingestion retry route", () => {
  test("revalidates the applied show AFTER withRowTryLock resolves and BEFORE the Response", async () => {
    const { handleLivePendingIngestionRetry } =
      await import("@/app/api/admin/pending-ingestions/[id]/retry/route");

    const response = await handleLivePendingIngestionRetry(
      new Request("http://test/retry", { method: "POST" }),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-0000000000aa" }) },
      {
        requireAdminIdentity: async () => ({ email: "admin@test" }),
        readDriveFileIdForPendingIngestion: async () => DRIVE_FILE_ID,
        // withRowTryLock = the per-row tx; resolving it is the commit boundary.
        // It records `committed` AFTER the inner callback completes.
        withRowTryLock: (async (_driveFileId: string, fn: (tx: unknown) => unknown) => {
          const r = await fn({
            queryOne: async (sql: string) => {
              if (sql.includes("from public.pending_ingestions")) {
                return {
                  id: "00000000-0000-0000-0000-0000000000aa",
                  drive_file_id: DRIVE_FILE_ID,
                  wizard_session_id: null,
                  last_seen_modified_time: null,
                };
              }
              if (sql.includes("exists")) return { exists: true };
              if (sql.includes("watched_folder_id")) return { watched_folder_id: "folder-1" };
              if (sql.includes("slug")) return { slug: "show-one" };
              return null;
            },
          });
          order.push("committed");
          return r;
        }) as never,
        fetchDriveFileMetadata: async () => driveFile(),
        readFinalizeOwnershipGuardUnlocked: async () => false,
        runManualSyncForShowUnlocked: (async () => ({
          outcome: "applied",
          showId: SHOW_ID,
          parseWarnings: [],
        })) as never,
      },
    );

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(SHOW_ID), { expire: 0 });
    // Post-commit ordering: revalidate fires AFTER the withRowTryLock `committed`.
    expect(order).toEqual(["committed", `revalidate:${showCacheTag(SHOW_ID)}`]);
  });

  test("revalidates a retry whose live re-sync ends in source_gone WITH a showId (whole-diff R2)", async () => {
    // Whole-diff R2: a live re-sync that ends source_gone/parse_error commits
    // last_sync_status + carries showId; the route's capture is now showId-presence,
    // not applied-only, so the tag is busted post-commit.
    const { handleLivePendingIngestionRetry } =
      await import("@/app/api/admin/pending-ingestions/[id]/retry/route");

    const response = await handleLivePendingIngestionRetry(
      new Request("http://test/retry", { method: "POST" }),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-0000000000aa" }) },
      {
        requireAdminIdentity: async () => ({ email: "admin@test" }),
        readDriveFileIdForPendingIngestion: async () => DRIVE_FILE_ID,
        withRowTryLock: (async (_driveFileId: string, fn: (tx: unknown) => unknown) => {
          const r = await fn({
            queryOne: async (sql: string) => {
              if (sql.includes("from public.pending_ingestions")) {
                return {
                  id: "00000000-0000-0000-0000-0000000000aa",
                  drive_file_id: DRIVE_FILE_ID,
                  wizard_session_id: null,
                  last_seen_modified_time: null,
                };
              }
              if (sql.includes("exists")) return { exists: true };
              if (sql.includes("watched_folder_id")) return { watched_folder_id: "folder-1" };
              if (sql.includes("slug")) return { slug: "show-one" };
              return null;
            },
          });
          order.push("committed");
          return r;
        }) as never,
        fetchDriveFileMetadata: async () => driveFile(),
        readFinalizeOwnershipGuardUnlocked: async () => false,
        runManualSyncForShowUnlocked: (async () => ({
          outcome: "source_gone",
          code: "SHEET_UNAVAILABLE",
          showId: SHOW_ID,
        })) as never,
      },
    );

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(SHOW_ID), { expire: 0 });
    expect(order).toEqual(["committed", `revalidate:${showCacheTag(SHOW_ID)}`]);
  });

  test("does NOT revalidate when the retry outcome is not applied", async () => {
    const { handleLivePendingIngestionRetry } =
      await import("@/app/api/admin/pending-ingestions/[id]/retry/route");

    await handleLivePendingIngestionRetry(
      new Request("http://test/retry", { method: "POST" }),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-0000000000aa" }) },
      {
        requireAdminIdentity: async () => ({ email: "admin@test" }),
        readDriveFileIdForPendingIngestion: async () => DRIVE_FILE_ID,
        withRowTryLock: (async (_driveFileId: string, fn: (tx: unknown) => unknown) => {
          return await fn({
            queryOne: async (sql: string) => {
              if (sql.includes("from public.pending_ingestions")) {
                return {
                  id: "00000000-0000-0000-0000-0000000000aa",
                  drive_file_id: DRIVE_FILE_ID,
                  wizard_session_id: null,
                  last_seen_modified_time: null,
                };
              }
              if (sql.includes("exists")) return { exists: true };
              if (sql.includes("watched_folder_id")) return { watched_folder_id: "folder-1" };
              return null;
            },
          });
        }) as never,
        fetchDriveFileMetadata: async () => driveFile(),
        readFinalizeOwnershipGuardUnlocked: async () => false,
        runManualSyncForShowUnlocked: (async () => ({
          outcome: "stage",
          stagedId: "staged-1",
        })) as never,
      },
    );

    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
