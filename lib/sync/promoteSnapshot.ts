import postgres from "postgres";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { withPromoteLock } from "@/lib/sync/lockedPromoteTx";
import { withShowLock } from "@/lib/sync/lockedShowTx";

const DIAGRAM_BUCKET = "diagram-snapshots";

type PendingPromotionRow = {
  id: string;
  show_id: string;
  drive_file_id: string;
  temp_prefix: string;
  snapshot_revision_id: string;
  asset_count: number;
  expected_asset_count?: number;
  claim_token?: string | null;
};

export type PromoteSnapshotStorage = {
  list(prefix: string): Promise<string[]>;
  move(fromPath: string, toPath: string): Promise<void>;
  removePrefix?(prefix: string): Promise<void>;
};

export type PromoteSnapshotResult =
  | { outcome: "promoted"; snapshotRevisionId: string }
  | { outcome: "already_promoted"; snapshotRevisionId: string }
  | { outcome: "not_found" }
  | { outcome: "manifest_mismatch"; snapshotRevisionId: string }
  | { outcome: "no_pending_payload"; snapshotRevisionId: string };

export type PromoteSnapshotDeps = {
  storage?: PromoteSnapshotStorage;
};

export type RepairSnapshotRollbackResult =
  | { outcome: "repaired"; snapshotRevisionId: string }
  | { outcome: "not_found" }
  | { outcome: "not_stuck"; snapshotRevisionId: string }
  | { outcome: "promote_in_flight"; snapshotRevisionId: string };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("promoteSnapshotUpload requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function canonicalPrefix(showId: string, snapshotRevisionId: string): string {
  return `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function storageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultStorage(): PromoteSnapshotStorage {
  const supabase = createSupabaseServiceRoleClient();
  const bucket = supabase.storage.from(DIAGRAM_BUCKET);
  return {
    async list(prefix) {
      const { data, error } = await bucket.list(prefix);
      if (error) throw error;
      return (data ?? []).filter((entry) => entry.name).map((entry) => `${prefix}${entry.name}`);
    },
    async move(fromPath, toPath) {
      const fromObject = fromPath.startsWith(`${DIAGRAM_BUCKET}/`)
        ? fromPath.slice(DIAGRAM_BUCKET.length + 1)
        : fromPath;
      const toObject = toPath.startsWith(`${DIAGRAM_BUCKET}/`)
        ? toPath.slice(DIAGRAM_BUCKET.length + 1)
        : toPath;
      const { error } = await bucket.move(fromObject, toObject);
      if (error) throw error;
    },
    async removePrefix(prefix) {
      const objectPrefix = prefix.startsWith(`${DIAGRAM_BUCKET}/`)
        ? prefix.slice(DIAGRAM_BUCKET.length + 1)
        : prefix;
      const { data, error } = await bucket.list(objectPrefix);
      if (error) throw error;
      const objectPaths = (data ?? [])
        .filter((entry) => entry.name)
        .map((entry) => `${objectPrefix}${entry.name}`);
      if (objectPaths.length === 0) return;
      const { error: removeError } = await bucket.remove(objectPaths);
      if (removeError) throw removeError;
    },
  };
}

async function readRow(snapshotRevisionId: string): Promise<PendingPromotionRow | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = await sql<PendingPromotionRow[]>`
      select p.id::text, p.show_id::text, p.drive_file_id, p.temp_prefix,
             p.snapshot_revision_id::text, p.asset_count,
             (
               select count(*)::int
                 from jsonb_array_elements(coalesce(s.diagrams->'pending'->'embeddedImages', '[]'::jsonb)) e
                where e->>'snapshotPath' is not null
             ) + (
               select count(*)::int
                 from jsonb_array_elements(coalesce(s.diagrams->'pending'->'linkedFolderItems', '[]'::jsonb)) l
                where l->>'snapshotPath' is not null
             ) as expected_asset_count
        from public.pending_snapshot_uploads p
        left join public.shows s on s.id = p.show_id
       where p.snapshot_revision_id = ${snapshotRevisionId}::uuid
       limit 1
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function promoteSnapshotUpload(
  snapshotRevisionId: string,
  deps: PromoteSnapshotDeps = {},
): Promise<PromoteSnapshotResult> {
  const initial = await readRow(snapshotRevisionId);
  if (!initial) return { outcome: "not_found" };

  const storage = deps.storage ?? defaultStorage();
  return await withPromoteLock(initial.show_id, async (promoteTx) => {
    const clearRolledBack = async (row: PendingPromotionRow): Promise<void> => {
      await promoteTx.queryOne<{ ok: boolean }>(
        `
          with cleared_show as (
            update public.shows s
               set diagrams = jsonb_set(s.diagrams, '{pending}', 'null'::jsonb)
             where s.id = $1::uuid
               and s.diagrams->'pending'->>'snapshot_revision_id' = $2
             returning s.id
          ),
          cleared_ledger as (
            update public.pending_snapshot_uploads p
               set promote_started_at = null,
                   claim_token = null,
                   claimed_at = null,
                   claim_expires_at = now()
             where p.id = $3::uuid
               and p.delete_started_at is null
               and p.promoted_at is null
               and p.claim_token = $4::uuid
             returning p.id
          )
          select true as ok
        `,
        [row.show_id, row.snapshot_revision_id, row.id, row.claim_token],
      );
    };
    const row = await promoteTx.queryOne<
      (PendingPromotionRow & { promoted_at: string | null }) | null
    >(
      `
        update public.pending_snapshot_uploads
           set claim_token = gen_random_uuid(),
               claimed_at = now(),
               claim_expires_at = now() + interval '5 minutes',
               promote_started_at = now()
         where snapshot_revision_id = $1::uuid
           and claim_token is null
           and delete_started_at is null
           and promote_started_at is null
         returning id::text, show_id::text, drive_file_id, temp_prefix, snapshot_revision_id::text,
                   promoted_at::text, asset_count, claim_token::text
      `,
      [snapshotRevisionId],
    );

    if (!row) return { outcome: "not_found" };
    if (row.promoted_at) return { outcome: "already_promoted", snapshotRevisionId };
    const promoted = await withShowLock(
      row.drive_file_id,
      async (tx) => {
        const expected = await tx.queryOne<{ count: number }>(
          `
        select (
          select count(*)::int
            from public.shows s,
                 jsonb_array_elements(coalesce(s.diagrams->'pending'->'embeddedImages', '[]'::jsonb)) e
           where s.id = $1::uuid
             and e->>'snapshotPath' is not null
        ) + (
          select count(*)::int
            from public.shows s,
                 jsonb_array_elements(coalesce(s.diagrams->'pending'->'linkedFolderItems', '[]'::jsonb)) l
           where s.id = $1::uuid
             and l->>'snapshotPath' is not null
        ) as count
      `,
          [row.show_id],
        );

        const canonical = canonicalPrefix(row.show_id, row.snapshot_revision_id);
        const paths = await storage.list(row.temp_prefix);
        const expectedAssetCount = expected.count;
        if (paths.length !== expectedAssetCount) {
          await clearRolledBack(row);
          return { outcome: "manifest_mismatch", snapshotRevisionId };
        }

        const renamed: Array<{ from: string; to: string }> = [];
        const rollback = async (): Promise<void> => {
          for (const entry of renamed.toReversed()) {
            await storage.move(entry.to, entry.from);
          }
        };

        try {
          for (const path of paths) {
            const to = `${canonical}${basename(path)}`;
            await storage.move(path, to);
            renamed.push({ from: path, to });
          }

          const canonicalPaths = await storage.list(canonical);
          if (canonicalPaths.length !== expectedAssetCount) {
            await rollback();
            await clearRolledBack(row);
            return { outcome: "manifest_mismatch", snapshotRevisionId };
          }

          const cutover = await tx.queryOne<{ updated: boolean }>(
            `
        with target as (
          select s.id
            from public.shows s
            join public.pending_snapshot_uploads p on p.show_id = s.id
           where p.snapshot_revision_id = $1::uuid
             and s.diagrams->'pending'->>'snapshot_revision_id' = p.snapshot_revision_id::text
           for update of s, p
        ),
        update_show as (
          update public.shows s
             set diagrams = jsonb_set(
               jsonb_set(s.diagrams, '{current}', s.diagrams->'pending'),
               '{pending}',
               'null'::jsonb
             )
            from target
           where s.id = target.id
           returning s.id
        ),
        update_ledger as (
          update public.pending_snapshot_uploads p
             set promoted_at = now(),
                 claim_token = null,
                 claimed_at = null,
                 claim_expires_at = null
           from update_show
           where p.snapshot_revision_id = $1::uuid
             and p.claim_token = $2::uuid
           returning p.id
        )
        select exists(select 1 from update_ledger) as updated
      `,
            [snapshotRevisionId, row.claim_token],
          );

          if (!cutover?.updated) {
            await rollback();
            await clearRolledBack(row);
            return { outcome: "no_pending_payload", snapshotRevisionId };
          }
          return { outcome: "promoted", snapshotRevisionId };
        } catch (error) {
          try {
            await rollback();
            await clearRolledBack(row);
          } catch (rollbackError) {
            await tx.queryOne<{ ok: boolean }>(
              `
              select public.upsert_admin_alert(
                $1::uuid,
                'PENDING_SNAPSHOT_ROLLBACK_STUCK',
                $2::jsonb
              ) is not null as ok
            `,
              [
                row.show_id,
                JSON.stringify({
                  snapshot_revision_id: row.snapshot_revision_id,
                  error: storageErrorMessage(rollbackError),
                }),
              ],
            );
          }
          throw error;
        }
      },
      { tx: promoteTx, assertInDev: false },
    );
    if ("skipped" in promoted) {
      return { outcome: "manifest_mismatch" as const, snapshotRevisionId };
    }
    return promoted as PromoteSnapshotResult;
  });
}

export async function repairSnapshotRollback(
  ledgerId: string,
  deps: PromoteSnapshotDeps = {},
): Promise<RepairSnapshotRollbackResult> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  let row:
    | (PendingPromotionRow & {
        promote_started_at: string | null;
        delete_started_at: string | null;
      })
    | null;
  try {
    const rows = await sql<
      (PendingPromotionRow & {
        promote_started_at: string | null;
        delete_started_at: string | null;
      })[]
    >`
      select id::text, show_id::text, drive_file_id, temp_prefix, snapshot_revision_id::text,
             asset_count, promote_started_at::text, delete_started_at::text
        from public.pending_snapshot_uploads
       where id = ${ledgerId}::uuid
       limit 1
    `;
    row = rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
  if (!row) return { outcome: "not_found" };
  if (!row.promote_started_at && !row.delete_started_at) {
    return { outcome: "not_stuck", snapshotRevisionId: row.snapshot_revision_id };
  }
  const started = Date.parse(row.promote_started_at ?? row.delete_started_at ?? "");
  if (row.promote_started_at && Number.isFinite(started) && Date.now() - started < 15 * 60 * 1000) {
    return { outcome: "promote_in_flight", snapshotRevisionId: row.snapshot_revision_id };
  }

  const storage = deps.storage ?? defaultStorage();
  return await withPromoteLock(row.show_id, async (promoteTx) => {
    const repaired = await withShowLock(
      row.drive_file_id,
      async (tx) => {
        const locked = await tx.queryOne<{ promoted_at: string | null } | null>(
          "select promoted_at::text from public.pending_snapshot_uploads where id = $1::uuid",
          [ledgerId],
        );
        if (!locked) return { outcome: "not_found" } satisfies RepairSnapshotRollbackResult;
        if (locked.promoted_at) {
          return {
            outcome: "not_stuck",
            snapshotRevisionId: row.snapshot_revision_id,
          } satisfies RepairSnapshotRollbackResult;
        }
        if (row.delete_started_at && !row.promote_started_at) {
          await storage.removePrefix?.(row.temp_prefix);
          await tx.queryOne<{ ok: boolean }>(
            `
              delete from public.pending_snapshot_uploads
               where id = $1::uuid
                 and promoted_at is null
                 and delete_started_at is not null
              returning true as ok
            `,
            [ledgerId],
          );
          return {
            outcome: "repaired",
            snapshotRevisionId: row.snapshot_revision_id,
          } satisfies RepairSnapshotRollbackResult;
        }
        const canonical = canonicalPrefix(row.show_id, row.snapshot_revision_id);
        for (const path of await storage.list(canonical)) {
          await storage.move(path, `${row.temp_prefix}${basename(path)}`);
        }
        await tx.queryOne<{ ok: boolean }>(
          `
            with cleared_show as (
              update public.shows s
                 set diagrams = jsonb_set(s.diagrams, '{pending}', 'null'::jsonb)
               where s.id = $1::uuid
                 and s.diagrams->'pending'->>'snapshot_revision_id' = $3
               returning s.id
            ),
            cleared_ledger as (
              update public.pending_snapshot_uploads p
                 set promote_started_at = null,
                     claim_token = null,
                     claimed_at = null,
                     claim_expires_at = null
               where p.id = $2::uuid
                 and promoted_at is null
               returning p.id
            )
            select true as ok
          `,
          [row.show_id, ledgerId, row.snapshot_revision_id],
        );
        return {
          outcome: "repaired",
          snapshotRevisionId: row.snapshot_revision_id,
        } satisfies RepairSnapshotRollbackResult;
      },
      { tx: promoteTx, assertInDev: false },
    );
    if ("skipped" in repaired) {
      return { outcome: "promote_in_flight", snapshotRevisionId: row.snapshot_revision_id };
    }
    return repaired;
  });
}
