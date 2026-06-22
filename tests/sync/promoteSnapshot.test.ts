import { beforeEach, describe, expect, test, vi } from "vitest";

const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const showId = "11111111-1111-4111-8111-111111111111";
const driveFileId = "drive-file-1";
const tempPrefix = `diagram-snapshots/shows/${showId}/_pending/run-1/`;
const canonicalPrefix = `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;

const promoteMock = vi.hoisted(() => {
  const hoistedSnapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const hoistedShowId = "11111111-1111-4111-8111-111111111111";
  const hoistedLedgerId = "22222222-2222-4222-8222-222222222222";
  const hoistedDriveFileId = "drive-file-1";
  const hoistedTempPrefix = `diagram-snapshots/shows/${hoistedShowId}/_pending/run-1/`;
  const initialRow = {
    id: hoistedLedgerId,
    show_id: hoistedShowId,
    drive_file_id: hoistedDriveFileId,
    temp_prefix: hoistedTempPrefix,
    snapshot_revision_id: hoistedSnapshotRevisionId,
    asset_count: 2,
    expected_asset_count: 2,
  };
  return {
    events: [] as string[],
    initialRow,
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
        return { ok: true };
      }),
    },
    postgres: vi.fn(() => {
      const tag = vi.fn(async () => [initialRow]);
      return Object.assign(tag, {
        end: vi.fn(async () => undefined),
      });
    }),
  };
});

vi.mock("postgres", () => ({
  default: promoteMock.postgres,
}));

vi.mock("@/lib/sync/lockedPromoteTx", () => ({
  withPromoteLock: async (lockedShowId: string, fn: (tx: unknown) => Promise<unknown>) => {
    promoteMock.events.push(`promote:${lockedShowId}`);
    return await fn(promoteMock.promoteTx);
  },
}));

vi.mock("@/lib/sync/lockedShowTx", () => ({
  withShowLock: async (lockedDriveFileId: string, fn: (tx: unknown) => Promise<unknown>) => {
    promoteMock.events.push(`show:${lockedDriveFileId}`);
    return await fn(promoteMock.showTx);
  },
}));

const { promoteSnapshotUpload } = await import("@/lib/sync/promoteSnapshot");

describe("promoteSnapshotUpload", () => {
  beforeEach(() => {
    promoteMock.events.length = 0;
    promoteMock.promoteTx.queryOne.mockClear();
    promoteMock.showTx.queryOne.mockClear();
    promoteMock.postgres.mockClear();
  });

  test("promotes temp assets under promote lock then show lock and cuts over diagrams", async () => {
    const moves: Array<{ from: string; to: string }> = [];
    const storage = {
      list: vi.fn(async (prefix: string) => {
        if (prefix === tempPrefix) return [`${tempPrefix}a.png`, `${tempPrefix}b.png`];
        if (prefix === canonicalPrefix)
          return [`${canonicalPrefix}a.png`, `${canonicalPrefix}b.png`];
        return [];
      }),
      move: vi.fn(async (from: string, to: string) => void moves.push({ from, to })),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "promoted", snapshotRevisionId });
    expect(promoteMock.events).toEqual([`promote:${showId}`, `show:${driveFileId}`]);
    expect(moves).toEqual([
      { from: `${tempPrefix}a.png`, to: `${canonicalPrefix}a.png` },
      { from: `${tempPrefix}b.png`, to: `${canonicalPrefix}b.png` },
    ]);
    expect(promoteMock.showTx.queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/with\s+target[\s\S]*update_show[\s\S]*update_ledger/i),
      [snapshotRevisionId, "claim-1"],
    );
  });
});
