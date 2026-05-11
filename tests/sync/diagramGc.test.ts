import { describe, expect, test } from "vitest";
import { runDiagramGc, type DiagramGcStorage } from "@/lib/sync/diagramGc";

const showId = "11111111-1111-4111-8111-111111111111";
const currentRev = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const oldRev = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function storage(paths: string[]): { storage: DiagramGcStorage; deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    storage: {
      async list(prefix) {
        return paths.filter((path) => path.startsWith(prefix));
      },
      async removePrefix(prefix) {
        for (const path of paths.filter((item) => item.startsWith(prefix))) {
          deleted.push(path);
        }
      },
      async remove(path) {
        deleted.push(path);
      },
    },
  };
}

describe("runDiagramGc", () => {
  test("deletes old orphan revisions for complete shows", async () => {
    const { storage: storagePort, deleted } = storage([
      `diagram-snapshots/shows/${showId}/${currentRev}/current.png`,
      `diagram-snapshots/shows/${showId}/${oldRev}/old.png`,
    ]);

    const result = await runDiagramGc({
      now: new Date("2026-05-10T00:00:00.000Z"),
      storage: storagePort,
      tx: {
        listShows: async () => [
          {
            showId,
            archived: false,
            currentRevisionId: currentRev,
            snapshotStatus: "complete",
            retainedRevisionIds: [],
            cutoffDays: 7,
          },
        ],
        claimPendingRows: async () => [],
        deletePromotedRows: async () => 0,
        deletePendingRow: async () => undefined,
      },
    });

    expect(deleted).toEqual([`diagram-snapshots/shows/${showId}/${oldRev}/old.png`]);
    expect(result.orphanBlobsDeleted).toBe(1);
  });

  test("suppresses orphan deletion while the current snapshot is incomplete", async () => {
    const { storage: storagePort, deleted } = storage([
      `diagram-snapshots/shows/${showId}/${oldRev}/old.png`,
    ]);

    await runDiagramGc({
      now: new Date("2026-05-10T00:00:00.000Z"),
      storage: storagePort,
      tx: {
        listShows: async () => [
          {
            showId,
            archived: true,
            currentRevisionId: currentRev,
            snapshotStatus: "partial_failure_restage_required",
            retainedRevisionIds: [],
            cutoffDays: 30,
          },
        ],
        claimPendingRows: async () => [],
        deletePromotedRows: async () => 0,
        deletePendingRow: async () => undefined,
      },
    });

    expect(deleted).toEqual([]);
  });

  test("deletes unreferenced stale pending upload prefixes and old promoted rows", async () => {
    const { storage: storagePort, deleted } = storage([
      `diagram-snapshots/shows/${showId}/_pending/run-1/old.png`,
    ]);
    const deletedRows: string[] = [];

    const result = await runDiagramGc({
      now: new Date("2026-05-10T00:00:00.000Z"),
      storage: storagePort,
      tx: {
        listShows: async () => [],
        claimPendingRows: async () => [
          {
            id: "row-1",
            showId,
            tempPrefix: `diagram-snapshots/shows/${showId}/_pending/run-1/`,
            snapshotRevisionId: oldRev,
            pendingRevisionId: null,
            claimToken: "claim-1",
          },
        ],
        deletePromotedRows: async () => 2,
        deletePendingRow: async (id) => void deletedRows.push(id),
      },
    });

    expect(deleted).toEqual([`diagram-snapshots/shows/${showId}/_pending/run-1/old.png`]);
    expect(deletedRows).toEqual(["row-1"]);
    expect(result.pendingPrefixesDeleted).toBe(1);
    expect(result.promotedRowsDeleted).toBe(2);
  });

  test("retries unclaimed pending promotions that are still referenced by the show", async () => {
    const retried: string[] = [];

    const result = await runDiagramGc({
      now: new Date("2026-05-10T00:00:00.000Z"),
      storage: storage([]).storage,
      tx: {
        listShows: async () => [],
        claimPendingRows: async () => [],
        listPendingPromotionRetries: async () => [currentRev],
        deletePendingRow: async () => undefined,
        deletePromotedRows: async () => 0,
      },
      promoteSnapshotUpload: async (snapshotRevisionId) => {
        retried.push(snapshotRevisionId);
      },
    });

    expect(retried).toEqual([currentRev]);
    expect(result.pendingPrefixesDeleted).toBe(0);
  });
});
