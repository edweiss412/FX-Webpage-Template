import postgres from "postgres";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { withPromoteLock } from "@/lib/sync/lockedPromoteTx";

const DIAGRAM_BUCKET = "diagram-snapshots";

type PendingPromotionRow = {
  id: string;
  show_id: string;
  drive_file_id: string;
  temp_prefix: string;
  snapshot_revision_id: string;
};

export type PromoteSnapshotStorage = {
  list(prefix: string): Promise<string[]>;
  move(fromPath: string, toPath: string): Promise<void>;
};

export type PromoteSnapshotResult =
  | { outcome: "promoted"; snapshotRevisionId: string }
  | { outcome: "already_promoted"; snapshotRevisionId: string }
  | { outcome: "not_found" }
  | { outcome: "no_pending_payload"; snapshotRevisionId: string };

export type PromoteSnapshotDeps = {
  storage?: PromoteSnapshotStorage;
};

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
  };
}

async function readRow(snapshotRevisionId: string): Promise<PendingPromotionRow | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = await sql<PendingPromotionRow[]>`
      select id::text, show_id::text, drive_file_id, temp_prefix, snapshot_revision_id::text
        from public.pending_snapshot_uploads
       where snapshot_revision_id = ${snapshotRevisionId}::uuid
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
  const row = await withPromoteLock(initial.show_id, async (tx) => {
    const locked = await tx.queryOne<(PendingPromotionRow & { promoted_at: string | null }) | null>(
      `
        update public.pending_snapshot_uploads
           set promote_started_at = coalesce(promote_started_at, now())
         where snapshot_revision_id = $1::uuid
         returning id::text, show_id::text, drive_file_id, temp_prefix, snapshot_revision_id::text, promoted_at::text
      `,
      [snapshotRevisionId],
    );
    return locked;
  });

  if (!row) return { outcome: "not_found" };
  if (row.promoted_at) return { outcome: "already_promoted", snapshotRevisionId };

  const canonical = canonicalPrefix(row.show_id, row.snapshot_revision_id);
  const paths = await storage.list(row.temp_prefix);
  for (const path of paths) {
    await storage.move(path, `${canonical}${basename(path)}`);
  }

  const cutover = await withPromoteLock(
    row.show_id,
    async (tx) =>
      await tx.queryOne<{ updated: boolean }>(
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
             set diagrams = jsonb_build_object(
               'current', s.diagrams->'pending',
               'pending', null
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
           returning p.id
        )
        select exists(select 1 from update_ledger) as updated
      `,
        [snapshotRevisionId],
      ),
  );

  if (!cutover?.updated) {
    return { outcome: "no_pending_payload", snapshotRevisionId };
  }
  return { outcome: "promoted", snapshotRevisionId };
}
