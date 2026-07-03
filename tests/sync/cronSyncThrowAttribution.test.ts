// tests/sync/cronSyncThrowAttribution.test.ts
import { describe, expect, test } from "vitest";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";
import { runWithRequestContext, getRequestContext } from "@/lib/log/requestContext";

// deps injection: force a throw inside the missing-shows loop and assert the thrown
// error carries syncRunContext with the in-flight driveFileId.
describe("cron.sync throw attribution", () => {
  test("throw in missing-shows loop attaches syncRunContext.inFlightDriveFileId", async () => {
    const boom = new Error("lock boom");
    await expect(
      runScheduledCronSync({
        folderId: "folder-1",
        listFolder: async () => [], // no files
        listLiveShows: async () => [
          { driveFileId: "missing-1", wizardSessionId: null, showId: "s1" },
        ],
        withShowLock: async () => {
          throw boom;
        },
      } as never),
    ).rejects.toThrow("lock boom");
    const ctx = (boom as { syncRunContext?: Record<string, unknown> }).syncRunContext;
    expect(ctx).toMatchObject({ phase: "missing-shows", inFlightDriveFileId: "missing-1" });
  });
  test("throw before the loops (folder resolve) → phase set, no inFlight id, processedBeforeThrow 0", async () => {
    const boom = new Error("folder boom");
    await expect(
      runScheduledCronSync({
        getActiveWatchedFolderId: async () => {
          throw boom;
        },
      } as never),
    ).rejects.toThrow("folder boom");
    const ctx = (boom as { syncRunContext?: Record<string, unknown> }).syncRunContext;
    expect(ctx).toMatchObject({
      phase: "resolve-folder",
      inFlightDriveFileId: null,
      processedBeforeThrow: 0,
    });
    expect(ctx?.failures).toEqual([]);
  });
  test("throw during the finish phase (heartbeat write) attaches syncRunContext.phase 'finish'", async () => {
    const boom = new Error("hb boom");
    await expect(
      runScheduledCronSync({
        folderId: "folder-1",
        listFolder: async () => [], // no files → loops complete → reaches finishCompletedRun
        listLiveShows: async () => [], // no missing shows
        writeSyncCronHeartbeat: async () => {
          throw boom;
        },
      } as never),
    ).rejects.toThrow("hb boom");
    const ctx = (boom as { syncRunContext?: Record<string, unknown> }).syncRunContext;
    // Without `return await finishCompletedRun(...)` the heartbeat rejection escapes the
    // outer catch and ctx is undefined — this asserts the await is present.
    expect(ctx).toMatchObject({ phase: "finish", processedBeforeThrow: 0 });
  });
  test("mirrors in-flight phase + driveFileId to the request-context ALS", async () => {
    const boom = new Error("lock boom");
    let alsAtThrow: { cronPhase?: string; cronInFlightDriveFileId?: string | null } | undefined;
    await runWithRequestContext({ requestId: "r1" }, async () => {
      await expect(
        runScheduledCronSync({
          folderId: "folder-1",
          listFolder: async () => [],
          listLiveShows: async () => [
            { driveFileId: "missing-1", wizardSessionId: null, showId: "s1" },
          ],
          withShowLock: async () => {
            alsAtThrow = { ...getRequestContext() }; // snapshot at the moment of the throw
            throw boom;
          },
        } as never),
      ).rejects.toThrow("lock boom");
    });
    expect(alsAtThrow).toMatchObject({
      cronPhase: "missing-shows",
      cronInFlightDriveFileId: "missing-1",
    });
  });
});
