import postgres from "postgres";
import {
  assertShowLockHeld,
  type LockableSyncTx,
  type LockedShowTx,
  withShowLock,
} from "@/lib/sync/lockedShowTx";
import { bindingMatchesActiveAdmin, mintIdFor } from "@/lib/sync/unpublishBinding";

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
  /**
   * M12.13 spec §3: unrevoked admin_emails read `FOR SHARE` inside the locked
   * transaction — a concurrent revocation UPDATE blocks against this read (or
   * vice versa), so revoked-before-consume recipients NEVER consume.
   */
  readActiveAdminEmailsForShare(): Promise<Array<{ email: string }>>;
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

export type UnpublishShowViaEmailedLinkArgs = UnpublishShowArgs & {
  /** Recipient binding from the emailed link (lib/sync/unpublishBinding.ts). */
  r: string;
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

  async readActiveAdminEmailsForShare(): Promise<Array<{ email: string }>> {
    return await this.rows<{ email: string }>(
      `
        select email
          from public.admin_emails
         where revoked_at is null
           for share
      `,
    );
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
    // Mirror the FULL archive_show mutation set inline (B2 §2.5) so the token-Unpublish end-state is
    // identical to the admin archive RPC: archived_at stamp, picker_epoch bump, share_token rotation,
    // and live non-wizard scratch/suppressor clearing. The `and unpublish_token = $2` consume guard is
    // preserved; the follow-on statements run only when this call performs the consume.
    const row = await this.one<{ id: string; drive_file_id: string }>(
      `
        update public.shows
           set archived = true,
               published = false,
               unpublish_token = null,
               unpublish_token_expires_at = null,
               archived_at = now(),
               picker_epoch = picker_epoch + 1,
               picker_epoch_bumped_at = clock_timestamp()
         where id = $1::uuid
           and unpublish_token = $2::uuid
         returning id, drive_file_id
      `,
      [showId, token],
    );
    if (!row) return false;
    await this.rows(
      `
        update public.show_share_tokens
           set share_token = encode(extensions.gen_random_bytes(32), 'hex'),
               rotated_at = clock_timestamp()
         where show_id = $1::uuid
      `,
      [showId],
    );
    await this.rows(
      "delete from public.pending_syncs      where drive_file_id = $1 and wizard_session_id is null",
      [row.drive_file_id],
    );
    await this.rows(
      "delete from public.pending_ingestions where drive_file_id = $1 and wizard_session_id is null",
      [row.drive_file_id],
    );
    await this.rows(
      "delete from public.deferred_ingestions where drive_file_id = $1 and wizard_session_id is null",
      [row.drive_file_id],
    );
    return true;
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

/**
 * Shared compare/expiry/consume semantics (M12.13 Task 3 refactor — single
 * source for both the in-app path and the emailed-link wrapper; the wrapper
 * reaches this ONLY after the recipient binding validated). Requires the
 * caller to have read the show under the held lock and to have handled the
 * null-token state already (the two paths diverge there: in-app → CONSUMED,
 * public emailed link → neutral, spec §3 R19).
 */
async function compareExpireConsume_lockHeld(
  tx: LockedShowTx<UnpublishShowTx>,
  show: UnpublishShowRow & { unpublishToken: string; unpublishTokenExpiresAt: string },
  args: UnpublishShowArgs,
): Promise<UnpublishShowResult> {
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

function hasLiveTokenColumns(
  show: UnpublishShowRow,
): show is UnpublishShowRow & { unpublishToken: string; unpublishTokenExpiresAt: string } {
  return show.unpublishToken !== null && show.unpublishTokenExpiresAt !== null;
}

export async function unpublishShow_unlocked(
  tx: LockedShowTx<UnpublishShowTx>,
  args: UnpublishShowArgs,
): Promise<UnpublishShowResult> {
  const show = await tx.readShowForUnpublish(args.slug);
  if (!show) return { outcome: "not_found", status: 404 };

  await assertShowLockHeld(tx, show.driveFileId);

  if (!hasLiveTokenColumns(show)) {
    return {
      outcome: "consumed",
      status: 400,
      code: UNPUBLISH_TOKEN_CONSUMED,
      showId: show.id,
    };
  }

  return await compareExpireConsume_lockHeld(tx, show, args);
}

/**
 * M12.13 spec §3 ("Atomic recipient re-validation" + "Consumed-token
 * contract", R12/R18/R19) — the PUBLIC emailed-link consume path. Inside the
 * SAME locked transaction as `unpublishShow`, in this exact order:
 *
 * 1. Read the show row.
 * 2. Token columns NULL → NEUTRAL (`not_found`): the current mint does not
 *    exist, so `r` is underivable — the consumed branch is unreachable
 *    publicly (R19; CONSUMED renders only on the session-authed in-app legs).
 * 3. Compute mintId from the STORED token; read unrevoked admin_emails
 *    `FOR SHARE` (serializes against concurrent revocation); binding no-match
 *    → NEUTRAL with ZERO further token-state branches — no compare, no expiry
 *    handling, no expired-clear side effect; token state untouched and
 *    unlearned (R18).
 * 4. Only after the binding validates: the shared compare/expiry/consume
 *    semantics (identical to plain `unpublishShow`).
 */
export async function unpublishShowViaEmailedLink_unlocked(
  tx: LockedShowTx<UnpublishShowTx>,
  args: UnpublishShowViaEmailedLinkArgs,
): Promise<UnpublishShowResult> {
  const show = await tx.readShowForUnpublish(args.slug);
  if (!show) return { outcome: "not_found", status: 404 };

  await assertShowLockHeld(tx, show.driveFileId);

  if (!hasLiveTokenColumns(show)) {
    return { outcome: "not_found", status: 404 };
  }

  const mintId = mintIdFor(show.unpublishToken);
  const activeAdmins = await tx.readActiveAdminEmailsForShare();
  if (!bindingMatchesActiveAdmin(activeAdmins, args.r, show.id, mintId)) {
    return { outcome: "not_found", status: 404 };
  }

  return await compareExpireConsume_lockHeld(tx, show, args);
}

/**
 * M12.13 §6.2 — the in-app undo server action reads the show's STORED
 * `unpublish_token` by slug so it can pass it to the plain `unpublishShow`
 * (which compares the submitted token against the stored one). Raw-postgres
 * seam, mirroring `readDriveFileIdForUnpublishSlug` — NOT a Supabase client
 * call, so the Supabase call-boundary registry rows don't apply (the action's
 * inline `not-subject-to-meta` waiver covers it). A null result means the mint
 * is gone (token vanished between render and click); the action surfaces the
 * CONSUMED catalog outcome rather than calling `unpublishShow` with a bad token.
 */
export async function readUnpublishTokenForSlug(slug: string): Promise<string | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      "select unpublish_token::text as unpublish_token from public.shows where slug = $1 limit 1",
      [slug],
    )) as Array<{ unpublish_token: string | null }>;
    return rows[0]?.unpublish_token ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
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

export async function unpublishShow(args: UnpublishShowArgs): Promise<UnpublishShowResult> {
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

/**
 * Public emailed-link consume entry point. Mirrors `unpublishShow`'s topology
 * exactly — slug→drive_file_id bootstrap read, then ONE `withShowLock` holder
 * (the wrapper adds statements inside the EXISTING lock layer; no new lock —
 * single-holder rule, AGENTS.md invariant 2). The recipient-binding
 * re-validation runs inside the locked transaction via
 * `unpublishShowViaEmailedLink_unlocked`.
 */
export async function unpublishShowViaEmailedLink(
  args: UnpublishShowViaEmailedLinkArgs,
): Promise<UnpublishShowResult> {
  const driveFileId = await readDriveFileIdForUnpublishSlug(args.slug);
  if (!driveFileId) return { outcome: "not_found", status: 404 };

  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) => {
      const tx = new PostgresUnpublishTx(rawTx as unknown as PostgresTransaction);
      return await withShowLock<UnpublishShowTx, UnpublishShowResult>(
        driveFileId,
        (lockedTx) => unpublishShowViaEmailedLink_unlocked(lockedTx, args),
        { tx, tryOnly: false },
      );
    })) as UnpublishShowResult;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
