import { describe, expect, test } from "vitest";
import {
  PENDING_ORPHAN_MIN_AGE_MS,
  runDiagramGc,
  type DiagramGcStorage,
} from "@/lib/sync/diagramGc";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const showId = "11111111-1111-4111-8111-111111111111";
const currentRev = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const oldRev = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type StoredPath = string | { path: string; createdAt?: string | null };

function pathOf(entry: StoredPath): string {
  return typeof entry === "string" ? entry : entry.path;
}

function storage(paths: StoredPath[]): { storage: DiagramGcStorage; deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    storage: {
      async list(prefix) {
        return paths.filter((entry) => pathOf(entry).startsWith(prefix));
      },
      async removePrefix(prefix) {
        for (const entry of paths.filter((item) => pathOf(item).startsWith(prefix))) {
          deleted.push(pathOf(entry));
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
      {
        path: `diagram-snapshots/shows/${showId}/${oldRev}/old.png`,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
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

  test("retains orphan blobs when storage listing omits created_at", async () => {
    const { storage: storagePort, deleted } = storage([
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

    expect(deleted).toEqual([]);
    expect(result.orphanBlobsDeleted).toBe(0);
  });

  test("closes the default transaction port when GC fails before return", async () => {
    let closed = false;

    await expect(
      runDiagramGc({
        storage: storage([]).storage,
        tx: {
          listShows: async () => {
            throw new Error("list failed");
          },
          claimPendingRows: async () => [],
          deletePromotedRows: async () => 0,
          deletePendingRow: async () => undefined,
          close: async () => {
            closed = true;
          },
        },
      }),
    ).rejects.toThrow("list failed");

    expect(closed).toBe(true);
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

  // S4 (docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md#s4). The gc run must
  // call resolveClearedStuckAlerts immediately after emitStuckAlerts, in the same pass, so a
  // stuck alert whose underlying ledger row no longer matches the raise predicate gets cleared
  // in the same cycle it would otherwise have been re-raised. The fake tx below implements the
  // real anti-join predicate from diagramGc.ts:307-310/323-327 in JS against fixture ledger rows
  // whose timestamps are derived from the fixture `now` (never hardcoded wall-clock), so the
  // test proves runDiagramGc threads a single consistent `now` through both raise and resolve —
  // not just that some function got called.
  test("resolves a cleared PROMOTE_STUCK alert while a still-stuck row's alert stays open", async () => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    const clearedShowId = "22222222-2222-4222-8222-222222222222";
    const stuckShowId = "33333333-3333-4333-8333-333333333333";
    const events: string[] = [];
    const openAlerts = new Set([clearedShowId, stuckShowId]);
    const resolvedAlerts = new Set<string>();

    // Fixture ledger rows: cleared row was promoted after its promote attempt started (so it no
    // longer matches "promoted_at is null"); stuck row's promote_started_at is still >15min
    // before `now` and promoted_at is still null, so it still matches the raise predicate.
    const pendingRows = [
      {
        showId: clearedShowId,
        promoteStartedAt: new Date(now.getTime() - 20 * 60 * 1000),
        promotedAt: new Date(now.getTime() - 1 * 60 * 1000),
      },
      {
        showId: stuckShowId,
        promoteStartedAt: new Date(now.getTime() - 20 * 60 * 1000),
        promotedAt: null as Date | null,
      },
    ];
    const stillStuckPromote = (showId: string) =>
      pendingRows.some(
        (row) =>
          row.showId === showId &&
          row.promoteStartedAt &&
          row.promotedAt === null &&
          row.promoteStartedAt.getTime() < now.getTime() - 15 * 60 * 1000,
      );

    await runDiagramGc({
      now,
      storage: storage([]).storage,
      tx: {
        listShows: async () => [],
        claimPendingRows: async () => [],
        deletePromotedRows: async () => 0,
        deletePendingRow: async () => undefined,
        emitStuckAlerts: async (calledNow) => {
          events.push(`emit:${calledNow.toISOString()}`);
        },
        resolveClearedStuckAlerts: async (calledNow) => {
          events.push(`resolve:${calledNow.toISOString()}`);
          for (const showId of openAlerts) {
            if (!stillStuckPromote(showId)) resolvedAlerts.add(showId);
          }
        },
      },
    });

    expect(events).toEqual([`emit:${now.toISOString()}`, `resolve:${now.toISOString()}`]);
    expect(resolvedAlerts.has(clearedShowId)).toBe(true);
    expect(resolvedAlerts.has(stuckShowId)).toBe(false);
  });

  test("resolves a cleared DELETE_STUCK alert while a still-stuck row's alert stays open", async () => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    const clearedShowId = "44444444-4444-4444-8444-444444444444";
    const stuckShowId = "55555555-5555-4555-8555-555555555555";
    const openAlerts = new Set([clearedShowId, stuckShowId]);
    const resolvedAlerts = new Set<string>();

    // Delete-stuck predicate (diagramGc.ts:323-327) has no interval offset: it's raised whenever
    // claim_expires_at < now(). Cleared row has since been promoted (promoted_at set); stuck row
    // is still mid-delete with an already-expired claim.
    const pendingRows = [
      {
        showId: clearedShowId,
        deleteStartedAt: new Date(now.getTime() - 10 * 60 * 1000),
        promotedAt: new Date(now.getTime() - 1 * 60 * 1000),
        claimExpiresAt: new Date(now.getTime() - 1 * 60 * 1000),
      },
      {
        showId: stuckShowId,
        deleteStartedAt: new Date(now.getTime() - 10 * 60 * 1000),
        promotedAt: null as Date | null,
        claimExpiresAt: new Date(now.getTime() - 1 * 60 * 1000),
      },
    ];
    const stillStuckDelete = (showId: string) =>
      pendingRows.some(
        (row) =>
          row.showId === showId &&
          row.deleteStartedAt &&
          row.promotedAt === null &&
          row.claimExpiresAt.getTime() < now.getTime(),
      );

    await runDiagramGc({
      now,
      storage: storage([]).storage,
      tx: {
        listShows: async () => [],
        claimPendingRows: async () => [],
        deletePromotedRows: async () => 0,
        deletePendingRow: async () => undefined,
        emitStuckAlerts: async () => undefined,
        resolveClearedStuckAlerts: async () => {
          for (const showId of openAlerts) {
            if (!stillStuckDelete(showId)) resolvedAlerts.add(showId);
          }
        },
      },
    });

    expect(resolvedAlerts.has(clearedShowId)).toBe(true);
    expect(resolvedAlerts.has(stuckShowId)).toBe(false);
  });
});

describe("row-less _pending reclamation (spec §4, BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS)", () => {
  const ghostShowId = "99999999-9999-4999-8999-999999999999";
  const runA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const now = new Date("2026-08-15T12:00:00.000Z");
  const aged = "2026-08-13T00:00:00.000Z"; // 2.5 days old -- STRICTLY clears the 24h gate
  const young = "2026-08-15T06:00:00.000Z"; // 6h old -- inside the 24h gate
  // Exactly AT the cutoff: age == PENDING_ORPHAN_MIN_AGE_MS, not strictly older.
  const atCutoff = new Date(now.getTime() - PENDING_ORPHAN_MIN_AGE_MS).toISOString();

  function agedPremise() {
    premise(
      "the aged fixture STRICTLY clears the age gate",
      now.getTime() - Date.parse(aged),
      PENDING_ORPHAN_MIN_AGE_MS,
    );
  }

  // Mutating map-backed harness: `removePrefix` deletes from live state so
  // assertions run against SURVIVORS, not the call log (spec §6 anti-tautology).
  function liveGcStorage(initial: StoredPath[]) {
    const live = new Map<string, StoredPath>(initial.map((entry) => [pathOf(entry), entry]));
    const storage: DiagramGcStorage = {
      async list(prefix) {
        return [...live.values()].filter((entry) => pathOf(entry).startsWith(prefix));
      },
      async remove(path) {
        live.delete(path);
      },
      async removePrefix(prefix) {
        for (const key of [...live.keys()]) {
          if (key.startsWith(prefix)) live.delete(key);
        }
      },
      async listChildren(prefix) {
        const names = new Set<string>();
        const files = new Set<string>();
        for (const key of live.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const slash = rest.indexOf("/");
          if (slash === -1) files.add(rest);
          else names.add(rest.slice(0, slash));
        }
        return [
          ...[...names].map((name) => ({ name, isFolder: true })),
          ...[...files].map((name) => ({ name, isFolder: false })),
        ];
      },
    };
    return { storage, survivors: () => [...live.keys()].sort() };
  }

  function gcTx(tempPrefixes: string[]) {
    return {
      listShows: async () => [],
      claimPendingRows: async () => [],
      deletePromotedRows: async () => 0,
      deletePendingRow: async () => undefined,
      listPendingTempPrefixes: async () => tempPrefixes,
    };
  }

  const ghostObject = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-ok.png`;

  test("a row-less aged ghost-show prefix is reclaimed and counted", async () => {
    agedPremise();
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: aged },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(1);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("a row-BACKED prefix is untouched regardless of age", async () => {
    agedPremise();
    const prefix = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/`;
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: `${prefix}embedded-ok.png`, createdAt: aged },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([prefix]) });
    expect(survivors()).toEqual([`${prefix}embedded-ok.png`]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
  });

  test("a young group is retained and NOT counted in either field", async () => {
    premise(
      "the young fixture is inside the age gate",
      PENDING_ORPHAN_MIN_AGE_MS,
      now.getTime() - Date.parse(young),
    );
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: young },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([ghostObject]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("a MIXED-age group (one aged, one young, both valid) stays whole -- EVERY object must clear the gate", async () => {
    agedPremise();
    premise(
      "the young member is inside the age gate",
      PENDING_ORPHAN_MIN_AGE_MS,
      now.getTime() - Date.parse(young),
    );
    const agedMember = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-a.png`;
    const youngMember = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-b.png`;
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: agedMember, createdAt: aged },
      { path: youngMember, createdAt: young },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    // An "any object is old" or oldest-timestamp implementation deletes this
    // prefix; the newest-object rule keeps it whole (spec §4 "EVERY object").
    expect(survivors()).toEqual([agedMember, youngMember].sort());
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("a group exactly AT the cutoff is retained (strictly-older gate, spec §4)", async () => {
    premiseHolds(
      "the fixture's age equals the gate exactly",
      now.getTime() - Date.parse(atCutoff) === PENDING_ORPHAN_MIN_AGE_MS,
    );
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: atCutoff },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([ghostObject]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("ONE missing createdAt retains the whole group and increments the L6 signal", async () => {
    agedPremise();
    const withCreated = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-a.png`;
    const withoutCreated = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-b.png`;
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: withCreated, createdAt: aged },
      withoutCreated,
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([withCreated, withoutCreated].sort());
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(1);
  });

  test("a file-shaped entry directly under shows/ is ignored while a sibling ghost group is reclaimed", async () => {
    agedPremise();
    const strayFile = "diagram-snapshots/shows/stray.txt";
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: strayFile, createdAt: aged },
      { path: ghostObject, createdAt: aged },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([strayFile]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(1);
  });

  test("ports without the new optional methods leave the stage off (counters stay 0)", async () => {
    agedPremise();
    // Rebuild the harness WITHOUT listChildren: the stage requires both optional
    // methods, so it must stay inert even though the fixture would otherwise qualify.
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: aged },
    ]);
    const { listChildren: _dropped, ...withoutListChildren } = storagePort;
    const result = await runDiagramGc({ now, storage: withoutListChildren, tx: gcTx([]) });
    expect(survivors()).toEqual([ghostObject]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });
});
