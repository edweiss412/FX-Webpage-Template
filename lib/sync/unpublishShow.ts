import postgres from "postgres";
import {
  assertShowLockHeld,
  type LockableSyncTx,
  type LockedShowTx,
  withShowLock,
} from "@/lib/sync/lockedShowTx";

export const UNPUBLISH_TOKEN_CONSUMED = "UNPUBLISH_TOKEN_CONSUMED" as const;
export const UNPUBLISH_TOKEN_EXPIRED = "UNPUBLISH_TOKEN_EXPIRED" as const;

export type UnpublishShowRow = {
  id: string;
  driveFileId: string;
  slug: string;
  title: string;
  createdAt: string;
  unpublishToken: string | null;
  unpublishTokenExpiresAt: string | null;
  archived: boolean;
};

export type UnpublishShowTx = LockableSyncTx & {
  readShowForUnpublish(slug: string): Promise<UnpublishShowRow | null>;
  clearUnpublishToken(showId: string): Promise<void>;
  archiveAndConsumeUnpublishToken(showId: string, token: string): Promise<boolean>;
  upsertAdminAlert(input: {
    showId: string | null;
    code: "SHOW_UNPUBLISHED";
    context: Record<string, unknown>;
  }): Promise<string | null>;
  publishShowInvalidation(showId: string): Promise<void>;
};

export type UnpublishShowResult =
  | { outcome: "success"; status: 200; showId: string }
  | { outcome: "expired"; status: 400; code: typeof UNPUBLISH_TOKEN_EXPIRED; showId: string }
  | { outcome: "consumed"; status: 400; code: typeof UNPUBLISH_TOKEN_CONSUMED; showId: string }
  | { outcome: "not_found"; status: 404 };

export type UnpublishShowArgs = {
  slug: string;
  token: string;
  now?: Date;
};

type PostgresTransaction = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("unpublishShow requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

class PostgresUnpublishTx implements UnpublishShowTx {
  constructor(private readonly tx: PostgresTransaction) {}

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.tx.unsafe(sql, params)) as T[];
  }

  private async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.rows<T>(sql, params);
    return rows[0] ?? null;
  }

  async queryOne<T>(sql: string, params: unknown[]): Promise<T> {
    return (await this.one<T>(sql, params)) as T;
  }

  async readShowForUnpublish(slug: string): Promise<UnpublishShowRow | null> {
    const row = await this.one<{
      id: string;
      drive_file_id: string;
      slug: string;
      title: string;
      created_at: string;
      unpublish_token: string | null;
      unpublish_token_expires_at: string | null;
      archived: boolean;
    }>(
      `
        select id, drive_file_id, slug, title, created_at,
               unpublish_token::text as unpublish_token,
               unpublish_token_expires_at,
               archived
          from public.shows
         where slug = $1
         limit 1
      `,
      [slug],
    );
    if (!row) return null;
    return {
      id: row.id,
      driveFileId: row.drive_file_id,
      slug: row.slug,
      title: row.title,
      createdAt: row.created_at,
      unpublishToken: row.unpublish_token,
      unpublishTokenExpiresAt: row.unpublish_token_expires_at,
      archived: row.archived,
    };
  }

  async clearUnpublishToken(showId: string): Promise<void> {
    await this.rows(
      `
        update public.shows
           set unpublish_token = null,
               unpublish_token_expires_at = null
         where id = $1::uuid
      `,
      [showId],
    );
  }

  async archiveAndConsumeUnpublishToken(showId: string, token: string): Promise<boolean> {
    const row = await this.one<{ id: string }>(
      `
        update public.shows
           set archived = true,
               published = false,
               unpublish_token = null,
               unpublish_token_expires_at = null
         where id = $1::uuid
           and unpublish_token = $2::uuid
         returning id
      `,
      [showId, token],
    );
    return Boolean(row);
  }

  async upsertAdminAlert(input: {
    showId: string | null;
    code: "SHOW_UNPUBLISHED";
    context: Record<string, unknown>;
  }): Promise<string | null> {
    const row = await this.one<{ id: string }>(
      "select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id",
      [input.showId, input.code, input.context],
    );
    return row?.id ?? null;
  }

  async publishShowInvalidation(showId: string): Promise<void> {
    await this.rows("select public.publish_show_invalidation($1::uuid)", [showId]);
  }
}

function isExpired(expiresAt: string, now: Date): boolean {
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs < now.getTime();
}

export async function unpublishShow_unlocked(
  tx: LockedShowTx<UnpublishShowTx>,
  args: UnpublishShowArgs,
): Promise<UnpublishShowResult> {
  const show = await tx.readShowForUnpublish(args.slug);
  if (!show) return { outcome: "not_found", status: 404 };

  await assertShowLockHeld(tx, show.driveFileId);

  if (!show.unpublishToken || !show.unpublishTokenExpiresAt) {
    return {
      outcome: "consumed",
      status: 400,
      code: UNPUBLISH_TOKEN_CONSUMED,
      showId: show.id,
    };
  }

  if (show.unpublishToken !== args.token) {
    return { outcome: "not_found", status: 404 };
  }

  if (isExpired(show.unpublishTokenExpiresAt, args.now ?? new Date())) {
    await tx.clearUnpublishToken(show.id);
    return {
      outcome: "expired",
      status: 400,
      code: UNPUBLISH_TOKEN_EXPIRED,
      showId: show.id,
    };
  }

  const archived = await tx.archiveAndConsumeUnpublishToken(show.id, args.token);
  if (!archived) {
    return {
      outcome: "consumed",
      status: 400,
      code: UNPUBLISH_TOKEN_CONSUMED,
      showId: show.id,
    };
  }

  await tx.upsertAdminAlert({
    showId: show.id,
    code: "SHOW_UNPUBLISHED",
    context: {
      drive_file_id: show.driveFileId,
      sheet_name: show.title,
    },
  });
  await tx.publishShowInvalidation(show.id);

  return { outcome: "success", status: 200, showId: show.id };
}

export async function readDriveFileIdForUnpublishSlug(slug: string): Promise<string | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      "select drive_file_id from public.shows where slug = $1 limit 1",
      [slug],
    )) as Array<{ drive_file_id: string }>;
    return rows[0]?.drive_file_id ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function unpublishShow(
  args: UnpublishShowArgs,
): Promise<UnpublishShowResult> {
  const driveFileId = await readDriveFileIdForUnpublishSlug(args.slug);
  if (!driveFileId) return { outcome: "not_found", status: 404 };

  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) => {
      const tx = new PostgresUnpublishTx(rawTx as unknown as PostgresTransaction);
      return await withShowLock<UnpublishShowTx, UnpublishShowResult>(
        driveFileId,
        (lockedTx) => unpublishShow_unlocked(lockedTx, args),
        { tx, tryOnly: false },
      );
    })) as UnpublishShowResult;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
