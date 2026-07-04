import { beforeEach, describe, expect, test, vi } from "vitest";

const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const showId = "11111111-1111-4111-8111-111111111111";
const ledgerId = "22222222-2222-4222-8222-222222222222";
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
  // Mutable repair-row fixture: individual tests override promote_started_at/delete_started_at
  // via a one-off `postgres` mock implementation (see repairSnapshotRollback describe block).
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
        if (/promoted_at::text/i.test(sql)) return { promoted_at: null };
        return { ok: true };
      }),
    },
    postgres: vi.fn(() => {
      const tag = vi.fn(async () => [initialRow]);
      return Object.assign(tag, {
        end: vi.fn(async () => undefined),
        // emitRollbackStuckAlert (the "rollback itself failed" path) opens its own connection
        // and calls sql.json(...) inside a tagged template.
        json: vi.fn((value: unknown) => value),
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

const { promoteSnapshotUpload, repairSnapshotRollback } =
  await import("@/lib/sync/promoteSnapshot");

// The exact resolve UPDATE from the S4 spec (docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md#s4):
// `update public.admin_alerts set resolved_at = now() where show_id = $1::uuid and code =
// 'PENDING_SNAPSHOT_ROLLBACK_STUCK' and resolved_at is null`, issued via the same `promoteTx`
// clearRolledBack/repairSnapshotRollback already hold — never a fresh connection.
function rollbackStuckResolveCalls(): unknown[][] {
  return promoteMock.promoteTx.queryOne.mock.calls.filter(([sql]: [string]) =>
    /update\s+public\.admin_alerts[\s\S]*resolved_at\s*=\s*now\(\)[\s\S]*PENDING_SNAPSHOT_ROLLBACK_STUCK[\s\S]*resolved_at\s+is\s+null/i.test(
      sql,
    ),
  );
}

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

  // S4 (docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md#s4): clearRolledBack is
  // the automatic-retry rollback-completion code point. A manifest-count mismatch on the
  // temp-prefix listing (asset_count=2 but storage only has 1 file) is the simplest trigger for
  // clearRolledBack — it fires BEFORE any move is attempted, so this proves the resolve fires on
  // successful ledger-reset completion, not tangled up with the move/rollback machinery.
  test("successful clearRolledBack resolves the ROLLBACK_STUCK alert via promoteTx", async () => {
    const storage = {
      list: vi.fn(async (prefix: string) => (prefix === tempPrefix ? [`${tempPrefix}a.png`] : [])),
      move: vi.fn(async () => undefined),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "manifest_mismatch", snapshotRevisionId });
    const calls = rollbackStuckResolveCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([showId]);
  });

  // S4: when the rollback itself fails (the reverse move throws too), the code takes the
  // emitRollbackStuckAlert branch, NOT clearRolledBack — so the resolve UPDATE must never fire.
  // A failing-rollback path with zero resolves is the only "not resolved" case that's directly
  // reachable through promoteSnapshotUpload's public surface.
  test("failed rollback (reverse move throws) does not resolve the ROLLBACK_STUCK alert", async () => {
    let moveCall = 0;
    const storage = {
      list: vi.fn(async (prefix: string) => {
        if (prefix === tempPrefix) return [`${tempPrefix}a.png`, `${tempPrefix}b.png`];
        return [];
      }),
      move: vi.fn(async () => {
        moveCall += 1;
        // call 1: forward move of a.png -> canonical/a.png succeeds (renamed becomes non-empty).
        if (moveCall === 1) return undefined;
        // call 2: forward move of b.png throws -> enters the outer catch.
        if (moveCall === 2) throw new Error("forward move failed");
        // call 3: rollback's reverse move of canonical/a.png -> temp/a.png also throws, so the
        // rollback itself fails and clearRolledBack is never reached.
        throw new Error("rollback move failed");
      }),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "manifest_mismatch", snapshotRevisionId });
    expect(moveCall).toBe(3);
    expect(rollbackStuckResolveCalls()).toHaveLength(0);
  });
});

describe("repairSnapshotRollback", () => {
  beforeEach(() => {
    promoteMock.events.length = 0;
    promoteMock.promoteTx.queryOne.mockClear();
    promoteMock.showTx.queryOne.mockClear();
    promoteMock.postgres.mockClear();
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

  // S4: repairSnapshotRollback's `repaired` branch is the catalog-prescribed manual-repair
  // rollback-completion code point (the second of exactly two hooks per the spec). A stuck
  // promote (promote_started_at >15min old, delete_started_at null) reaches the full
  // canonical-rewind repair, which performs the same ledger reset as clearRolledBack and must
  // resolve ROLLBACK_STUCK the same way, via the closure's promoteTx (not the inner show-lock tx).
  test("repaired branch (stuck promote rewind) resolves the ROLLBACK_STUCK alert via promoteTx", async () => {
    const stuck = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    promoteMock.postgres.mockImplementationOnce(() => {
      const tag = vi.fn(async () => [
        { ...promoteMock.initialRow, promote_started_at: stuck, delete_started_at: null },
      ]);
      return Object.assign(tag, {
        end: vi.fn(async () => undefined),
        json: vi.fn((value: unknown) => value),
      });
    });

    const result = await repairSnapshotRollback(ledgerId, { storage: storage() });

    expect(result).toEqual({ outcome: "repaired", snapshotRevisionId });
    const calls = rollbackStuckResolveCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([showId]);
  });

  test("not_stuck ledger row does not resolve the ROLLBACK_STUCK alert", async () => {
    promoteMock.postgres.mockImplementationOnce(() => {
      const tag = vi.fn(async () => [
        { ...promoteMock.initialRow, promote_started_at: null, delete_started_at: null },
      ]);
      return Object.assign(tag, {
        end: vi.fn(async () => undefined),
        json: vi.fn((value: unknown) => value),
      });
    });

    const result = await repairSnapshotRollback(ledgerId, { storage: storage() });

    expect(result).toEqual({ outcome: "not_stuck", snapshotRevisionId });
    expect(rollbackStuckResolveCalls()).toHaveLength(0);
  });
});
