import postgres from "postgres";

declare const lockedPromoteTxBrand: unique symbol;

export type LockablePromoteTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
};

export type LockedPromoteTx<T extends LockablePromoteTx> = T & {
  readonly [lockedPromoteTxBrand]: true;
};

type PostgresTransaction = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("withPromoteLock requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(tx: PostgresTransaction): LockablePromoteTx {
  return {
    async queryOne<T>(sql: string, params: unknown[]) {
      const rows = await tx.unsafe(sql, params);
      return rows[0] as T;
    },
  };
}

function brand<T extends LockablePromoteTx>(tx: T): LockedPromoteTx<T> {
  return tx as LockedPromoteTx<T>;
}

export async function withPromoteLock<T extends LockablePromoteTx, R>(
  showId: string,
  fn: (tx: LockedPromoteTx<T>) => Promise<R> | R,
  options: { tx?: T } = {},
): Promise<R> {
  if (options.tx) {
    await options.tx.queryOne<{ locked: boolean }>(
      "select pg_advisory_xact_lock(hashtext('promote:' || $1)), true as locked",
      [showId],
    );
    return await fn(brand(options.tx));
  }

  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    return (await sql.begin(async (rawTx) => {
      const tx = postgresTxAdapter(rawTx as unknown as PostgresTransaction) as T;
      return await withPromoteLock(showId, fn, { tx });
    })) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
