/**
 * tests/sync/promoteSnapshotRevalidate.test.ts (nav-perf tag-caching, plan Task 7)
 *
 * promoteSnapshotUpload cuts over shows.diagrams (current←pending) under the
 * promote+show locks; repairSnapshotRollback clears shows.diagrams->pending on
 * the repair branch. Both must `revalidateTag(showCacheTag(showId),{expire:0})`
 * POST-COMMIT (after withPromoteLock resolves), only on the mutating outcome.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { showCacheTag } from "@/lib/data/showCacheTag";

const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const showId = "11111111-1111-4111-8111-111111111111";
const ledgerId = "22222222-2222-4222-8222-222222222222";
const driveFileId = "drive-file-1";
const tempPrefix = `diagram-snapshots/shows/${showId}/_pending/run-1/`;
const canonicalPrefix = `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;

const order: string[] = [];
const revalidateTag = vi.fn((tag: string, _profile?: unknown) => {
  order.push(`revalidate:${tag}`);
});
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: (tag: string, profile: unknown) => revalidateTag(tag, profile),
  revalidatePath: vi.fn(),
}));

const harness = vi.hoisted(() => {
  const hoistedShowId = "11111111-1111-4111-8111-111111111111";
  const hoistedLedgerId = "22222222-2222-4222-8222-222222222222";
  const hoistedDriveFileId = "drive-file-1";
  const hoistedRev = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const hoistedTempPrefix = `diagram-snapshots/shows/${hoistedShowId}/_pending/run-1/`;
  const initialRow = {
    id: hoistedLedgerId,
    show_id: hoistedShowId,
    drive_file_id: hoistedDriveFileId,
    temp_prefix: hoistedTempPrefix,
    snapshot_revision_id: hoistedRev,
    asset_count: 2,
    expected_asset_count: 2,
  };
  return {
    initialRow,
    // mutable repair row: tests set promote_started_at / delete_started_at.
    repairRow: {
      ...initialRow,
      promote_started_at: null as string | null,
      delete_started_at: null as string | null,
    },
    committed: [] as string[],
    promoteTx: {
      queryOne: vi.fn(async (sql: string) => {
        if (/set\s+claim_token\s*=\s*gen_random_uuid\(\)/i.test(sql)) {
          return { ...initialRow, promoted_at: null, claim_token: "claim-1" };
        }
        return { ok: true };
      }),
    },
    showTx: {
      queryOne: vi.fn(async (sql: string) => {
        if (/jsonb_array_elements/i.test(sql)) return { count: 2 };
        if (/with\s+target/i.test(sql)) return { updated: true };
        if (/promoted_at::text/i.test(sql)) return { promoted_at: null };
        return { ok: true };
      }),
    },
    postgres: vi.fn(() => {
      const tag = vi.fn(async () => [initialRow]);
      return Object.assign(tag, { end: vi.fn(async () => undefined) });
    }),
  };
});

vi.mock("postgres", () => ({ default: harness.postgres }));
vi.mock("@/lib/sync/lockedPromoteTx", () => ({
  withPromoteLock: async (lockedShowId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const r = await fn(harness.promoteTx);
    order.push(`committed:${lockedShowId}`);
    return r;
  },
}));
vi.mock("@/lib/sync/lockedShowTx", () => ({
  withShowLock: async (lockedDriveFileId: string, fn: (tx: unknown) => Promise<unknown>) => {
    void lockedDriveFileId;
    return await fn(harness.showTx);
  },
}));

const { promoteSnapshotUpload, repairSnapshotRollback } =
  await import("@/lib/sync/promoteSnapshot");

beforeEach(() => {
  order.length = 0;
  revalidateTag.mockClear();
  harness.promoteTx.queryOne.mockClear();
  harness.showTx.queryOne.mockClear();
});

function storage() {
  return {
    list: vi.fn(async (prefix: string) =>
      prefix === tempPrefix || prefix === canonicalPrefix
        ? [`${prefix}a.png`, `${prefix}b.png`]
        : [],
    ),
    move: vi.fn(async () => undefined),
    removePrefix: vi.fn(async () => undefined),
  };
}

describe("promoteSnapshotUpload post-commit revalidate", () => {
  test("revalidates the show AFTER withPromoteLock resolves on a promoted cutover", async () => {
    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage: storage() });
    expect(result).toEqual({ outcome: "promoted", snapshotRevisionId });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(showId), { expire: 0 });
    // Post-commit: revalidate AFTER the promote lock commit.
    expect(order).toEqual([`committed:${showId}`, `revalidate:${showCacheTag(showId)}`]);
  });

  test("does NOT revalidate when the ledger row is gone (not_found)", async () => {
    harness.postgres.mockImplementationOnce(() => {
      const tag = vi.fn(async () => []); // readRow → no row
      return Object.assign(tag, { end: vi.fn(async () => undefined) });
    });
    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage: storage() });
    expect(result).toEqual({ outcome: "not_found" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("repairSnapshotRollback post-commit revalidate", () => {
  test("revalidates the show AFTER withPromoteLock resolves on a repaired rollback", async () => {
    // A stuck promote (promote_started_at older than 15min) → the repair clears diagrams->pending.
    const stuck = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    harness.postgres.mockImplementationOnce(() => {
      const tag = vi.fn(async () => [
        { ...harness.initialRow, promote_started_at: stuck, delete_started_at: null },
      ]);
      return Object.assign(tag, { end: vi.fn(async () => undefined) });
    });
    const result = await repairSnapshotRollback(ledgerId, { storage: storage() });
    expect(result).toEqual({ outcome: "repaired", snapshotRevisionId });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag(showId), { expire: 0 });
    expect(order).toEqual([`committed:${showId}`, `revalidate:${showCacheTag(showId)}`]);
  });

  test("does NOT revalidate a not_stuck ledger row", async () => {
    harness.postgres.mockImplementationOnce(() => {
      const tag = vi.fn(async () => [
        { ...harness.initialRow, promote_started_at: null, delete_started_at: null },
      ]);
      return Object.assign(tag, { end: vi.fn(async () => undefined) });
    });
    const result = await repairSnapshotRollback(ledgerId, { storage: storage() });
    expect(result).toEqual({ outcome: "not_stuck", snapshotRevisionId });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
