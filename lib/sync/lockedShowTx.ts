import postgres from "postgres";

declare const lockedShowTxBrand: unique symbol;

export type LockableSyncTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
};

export type LockedShowTx<T extends LockableSyncTx> = T & {
  readonly [lockedShowTxBrand]: true;
};

export const CONCURRENT_SYNC_SKIPPED = "CONCURRENT_SYNC_SKIPPED";
export const LOCK_OWNERSHIP_ASSERTION_FAILED = "LOCK_OWNERSHIP_ASSERTION_FAILED";

export type ConcurrentSyncSkipped = {
  skipped: typeof CONCURRENT_SYNC_SKIPPED;
};

export type WithShowLockOptions<T extends LockableSyncTx> = {
  tx?: T;
  tryOnly?: boolean;
  assertInDev?: boolean;
};

type PostgresTransaction = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

class LockOwnershipAssertionError extends Error {
  readonly code = LOCK_OWNERSHIP_ASSERTION_FAILED;

  constructor(driveFileId: string) {
    super(`No current transaction holds the show advisory lock for ${driveFileId}`);
    this.name = "LockOwnershipAssertionError";
  }
}

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("withShowLock requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(tx: PostgresTransaction): LockableSyncTx {
  return {
    async queryOne<T>(sql: string, params: unknown[]) {
      const rows = await tx.unsafe(sql, params);
      return rows[0] as T;
    },
  };
}

function lockSql(tryOnly: boolean): string {
  if (tryOnly) {
    return "select pg_try_advisory_xact_lock(hashtext('show:' || $1)) as locked";
  }
  return "select pg_advisory_xact_lock(hashtext('show:' || $1)), true as locked";
}

function brand<T extends LockableSyncTx>(tx: T): LockedShowTx<T> {
  return tx as LockedShowTx<T>;
}

async function withExistingTx<T extends LockableSyncTx, R>(
  tx: T,
  driveFileId: string,
  fn: (tx: LockedShowTx<T>) => Promise<R> | R,
  options: Pick<WithShowLockOptions<T>, "tryOnly" | "assertInDev">,
): Promise<R | ConcurrentSyncSkipped> {
  const lock = await tx.queryOne<{ locked: boolean }>(lockSql(Boolean(options.tryOnly)), [
    driveFileId,
  ]);
  if (!lock?.locked) {
    return { skipped: CONCURRENT_SYNC_SKIPPED };
  }

  const lockedTx = brand(tx);
  if (options.assertInDev ?? process.env.NODE_ENV !== "production") {
    await assertShowLockHeld(lockedTx, driveFileId);
  }
  return await fn(lockedTx);
}

export async function withShowLock<T extends LockableSyncTx, R>(
  driveFileId: string,
  fn: (tx: LockedShowTx<T>) => Promise<R> | R,
  options: WithShowLockOptions<T> = {},
): Promise<R | ConcurrentSyncSkipped> {
  if (options.tx) {
    return await withExistingTx(options.tx, driveFileId, fn, options);
  }

  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    const result = await sql.begin(async (rawTx) => {
      const tx = postgresTxAdapter(rawTx as unknown as PostgresTransaction) as T;
      return await withExistingTx(tx, driveFileId, fn, options);
    });
    return result as R | ConcurrentSyncSkipped;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function assertShowLockHeld<T extends LockableSyncTx>(
  tx: LockedShowTx<T>,
  driveFileId: string,
): Promise<void> {
  const result = await tx.queryOne<{ held: boolean }>(
    `
      with k as (
        select hashtext('show:' || $1)::bigint as kb
      ),
      expected as (
        select ((kb >> 32) & x'FFFFFFFF'::bigint)::oid as expected_classid,
               (kb & x'FFFFFFFF'::bigint)::oid         as expected_objid
          from k
      )
      select exists (
        select 1
          from pg_locks, expected
         where pid = pg_backend_pid()
           and locktype = 'advisory'
           and mode = 'ExclusiveLock'
           and granted
           and classid = expected.expected_classid
           and objid = expected.expected_objid
           and objsubid = 1
      ) as held
    `,
    [driveFileId],
  );

  if (!result?.held) {
    throw new LockOwnershipAssertionError(driveFileId);
  }
}
