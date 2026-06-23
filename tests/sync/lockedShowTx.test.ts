import { describe, expect, test, vi } from "vitest";
import type { LockedShowTx, LockableSyncTx } from "@/lib/sync/lockedShowTx";
import {
  assertShowLockHeld,
  CONCURRENT_SYNC_SKIPPED,
  LOCK_OWNERSHIP_ASSERTION_FAILED,
  withShowLock,
} from "@/lib/sync/lockedShowTx";

type FakeTx = LockableSyncTx & {
  locked: boolean;
  queries: Array<{ sql: string; params: unknown[] }>;
};

function fakeTx(locked = true): FakeTx {
  return {
    locked,
    queries: [],
    async queryOne<T>(sql: string, params: unknown[]) {
      this.queries.push({ sql, params });
      if (/pg_try_advisory_xact_lock/i.test(sql)) return { locked: this.locked } as T;
      if (/pg_locks/i.test(sql)) return { held: this.locked } as T;
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

describe("withShowLock", () => {
  test("acquires exactly one try advisory lock using hashtext('show:' || drive_file_id)", async () => {
    const tx = fakeTx(true);
    const fn = vi.fn(async (lockedTx: LockedShowTx<FakeTx>) => {
      await assertShowLockHeld(lockedTx, "drive-file-1");
      return "ok";
    });

    const result = await withShowLock("drive-file-1", fn, {
      tx,
      tryOnly: true,
      assertInDev: true,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
    const lockQueries = tx.queries.filter(({ sql }) => /pg_try_advisory_xact_lock/i.test(sql));
    expect(lockQueries).toHaveLength(1);
    expect(lockQueries[0]?.sql).toContain("hashtext('show:' ||");
    expect(lockQueries[0]?.params).toEqual(["drive-file-1"]);
  });

  test("DEV assertion checks the exact show lock key, not any advisory lock", async () => {
    const tx = fakeTx(true) as unknown as LockedShowTx<FakeTx>;

    await assertShowLockHeld(tx, "drive-file-1");

    const assertionSql = tx.queries.find(({ sql }) => /pg_locks/i.test(sql))?.sql ?? "";
    expect(assertionSql).toContain("hashtext('show:' || $1)");
    expect(assertionSql).toContain("classid = expected.expected_classid");
    expect(assertionSql).toContain("objid = expected.expected_objid");
    expect(assertionSql).toContain("objsubid = 1");
  });

  test("tryOnly returns CONCURRENT_SYNC_SKIPPED when the lock is busy", async () => {
    const tx = fakeTx(false);
    const fn = vi.fn();

    const result = await withShowLock("drive-file-1", fn, { tx, tryOnly: true });

    expect(result).toEqual({ skipped: CONCURRENT_SYNC_SKIPPED });
    expect(fn).not.toHaveBeenCalled();
    expect(tx.queries.filter(({ sql }) => /pg_try_advisory_xact_lock/i.test(sql))).toHaveLength(1);
  });

  test("DEV assertion rejects a forced cast that did not acquire the show lock", async () => {
    const tx = fakeTx(false) as unknown as LockedShowTx<FakeTx>;

    await expect(assertShowLockHeld(tx, "drive-file-1")).rejects.toMatchObject({
      code: LOCK_OWNERSHIP_ASSERTION_FAILED,
    });
  });
});
