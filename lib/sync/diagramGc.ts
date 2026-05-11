import postgres from "postgres";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const DIAGRAM_BUCKET = "diagram-snapshots";

export type DiagramGcShow = {
  showId: string;
  archived: boolean;
  currentRevisionId: string | null;
  snapshotStatus: "complete" | "partial_failure" | "partial_failure_restage_required";
  retainedRevisionIds: string[];
  inFlightRevisionIds?: string[];
  cutoffDays: number;
};

export type DiagramGcPendingRow = {
  id: string;
  showId: string;
  tempPrefix: string;
  snapshotRevisionId: string;
  pendingRevisionId: string | null;
  claimToken: string;
};

export type DiagramGcTx = {
  listShows(): Promise<DiagramGcShow[]>;
  claimPendingRows(now: Date): Promise<DiagramGcPendingRow[]>;
  markPendingDeleteStarted?(id: string, claimToken: string, now: Date): Promise<void>;
  deletePendingRow(id: string, claimToken: string): Promise<void>;
  deletePromotedRows(now: Date): Promise<number>;
  emitStuckAlerts?(now: Date): Promise<void>;
  upsertAdminAlert?(showId: string, code: string, context?: Record<string, unknown>): Promise<void>;
};

export type DiagramGcStorage = {
  list(prefix: string): Promise<Array<string | { path: string; createdAt?: string | null }>>;
  remove(path: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
};

export type DiagramGcResult = {
  orphanBlobsDeleted: number;
  pendingPrefixesDeleted: number;
  promotedRowsDeleted: number;
};

export type RunDiagramGcArgs = {
  now?: Date;
  tx: DiagramGcTx;
  storage: DiagramGcStorage;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("runDiagramGc requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function showPrefix(showId: string): string {
  return `diagram-snapshots/shows/${showId}/`;
}

function revisionFromPath(showId: string, path: string): string | null {
  const prefix = showPrefix(showId);
  if (!path.startsWith(prefix)) return null;
  const [revision] = path.slice(prefix.length).split("/");
  return revision || null;
}

function suppressOrphanDeletion(show: DiagramGcShow): boolean {
  return (
    show.snapshotStatus === "partial_failure" ||
    show.snapshotStatus === "partial_failure_restage_required"
  );
}

function defaultStorage(): DiagramGcStorage {
  const supabase = createSupabaseServiceRoleClient();
  const bucket = supabase.storage.from(DIAGRAM_BUCKET);
  const listPaths = async (
    prefix: string,
  ): Promise<Array<{ path: string; createdAt?: string | null }>> => {
    const objectPrefix = prefix.startsWith(`${DIAGRAM_BUCKET}/`)
      ? prefix.slice(DIAGRAM_BUCKET.length + 1)
      : prefix;
    const { data, error } = await bucket.list(objectPrefix);
    if (error) throw error;
    return (data ?? []).map((entry) => ({
      path: `${prefix}${entry.name}`,
      createdAt: "created_at" in entry ? (entry.created_at as string | null) : null,
    }));
  };
  return {
    list: listPaths,
    async remove(path) {
      const objectPath = path.startsWith(`${DIAGRAM_BUCKET}/`)
        ? path.slice(DIAGRAM_BUCKET.length + 1)
        : path;
      const { error } = await bucket.remove([objectPath]);
      if (error) throw error;
    },
    async removePrefix(prefix) {
      const paths = await listPaths(prefix);
      if (paths.length === 0) return;
      const objectPaths = paths.map((entry) =>
        entry.path.startsWith(`${DIAGRAM_BUCKET}/`)
          ? entry.path.slice(DIAGRAM_BUCKET.length + 1)
          : entry.path,
      );
      const { error } = await bucket.remove(objectPaths);
      if (error) throw error;
    },
  };
}

function defaultTx(): DiagramGcTx {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  const rows = async <T>(query: string, params: unknown[] = []) =>
    (await sql.unsafe(query, params as never[])) as T[];
  return {
    async listShows() {
      const showRows = await rows<{
        show_id: string;
        archived: boolean;
        current_revision_id: string | null;
        snapshot_status: DiagramGcShow["snapshotStatus"] | null;
        pending_revision_ids: string[] | null;
      }>(
        `
          select s.id::text as show_id,
                 s.archived,
                 coalesce(
                   s.diagrams->'current'->>'snapshot_revision_id',
                   s.diagrams->>'snapshot_revision_id'
                 ) as current_revision_id,
                 coalesce(
                   s.diagrams->'current'->>'snapshot_status',
                   s.diagrams->>'snapshot_status'
                 ) as snapshot_status,
                 coalesce(array_agg(p.snapshot_revision_id::text)
                   filter (where p.promote_started_at is not null and p.promoted_at is null),
                   '{}'::text[]) as pending_revision_ids
            from public.shows s
            left join public.pending_snapshot_uploads p on p.show_id = s.id
           where s.diagrams is not null
           group by s.id
        `,
      );
      return showRows.map((row) => ({
        showId: row.show_id,
        archived: row.archived,
        currentRevisionId: row.current_revision_id,
        snapshotStatus: row.snapshot_status ?? "complete",
        retainedRevisionIds: [],
        inFlightRevisionIds: row.pending_revision_ids ?? [],
        cutoffDays: row.archived ? 30 : 7,
      }));
    },
    async claimPendingRows(now) {
      const claimRows = await rows<{
        id: string;
        show_id: string;
        temp_prefix: string;
        snapshot_revision_id: string;
        pending_revision_id: string | null;
        claim_token: string;
      }>(
        `
          with claimed as (
            update public.pending_snapshot_uploads p
               set claim_token = gen_random_uuid(),
                   claimed_at = $1::timestamptz,
                   claim_expires_at = $1::timestamptz + interval '15 minutes'
             where p.promoted_at is null
               and p.promote_started_at is null
               and p.delete_started_at is null
               and p.uploaded_at < $1::timestamptz - interval '1 hour'
               and (p.claim_token is null or p.claim_expires_at < $1::timestamptz)
               and not exists (
                 select 1
                   from public.shows s
                  where s.id = p.show_id
                    and s.diagrams->'pending'->>'snapshot_revision_id' = p.snapshot_revision_id::text
               )
             returning p.*
          )
          select c.id::text,
                 c.show_id::text,
                 c.temp_prefix,
                 c.snapshot_revision_id::text,
                 s.diagrams->'pending'->>'snapshot_revision_id' as pending_revision_id,
                 c.claim_token::text
            from claimed c
            join public.shows s on s.id = c.show_id
        `,
        [now.toISOString()],
      );
      return claimRows.map((row) => ({
        id: row.id,
        showId: row.show_id,
        tempPrefix: row.temp_prefix,
        snapshotRevisionId: row.snapshot_revision_id,
        pendingRevisionId: row.pending_revision_id,
        claimToken: row.claim_token,
      }));
    },
    async markPendingDeleteStarted(id, claimToken, now) {
      await rows(
        `
          update public.pending_snapshot_uploads
             set delete_started_at = $3::timestamptz
           where id = $1::uuid
             and claim_token = $2::uuid
             and promoted_at is null
             and promote_started_at is null
        `,
        [id, claimToken, now.toISOString()],
      );
    },
    async deletePendingRow(id, claimToken) {
      await rows(
        "delete from public.pending_snapshot_uploads where id = $1::uuid and claim_token = $2::uuid",
        [id, claimToken],
      );
    },
    async deletePromotedRows(now) {
      const deleted = await rows<{ count: string }>(
        `
          with deleted as (
            delete from public.pending_snapshot_uploads
             where promoted_at is not null
               and promoted_at < $1::timestamptz - interval '24 hours'
             returning 1
          )
          select count(*)::text from deleted
        `,
        [now.toISOString()],
      );
      return Number(deleted[0]?.count ?? 0);
    },
    async upsertAdminAlert(showId, code, context) {
      await rows(
        `
          select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)
        `,
        [showId, code, JSON.stringify(context ?? {})],
      );
    },
    async emitStuckAlerts(now) {
      await rows(
        `
          insert into public.admin_alerts (show_id, code, context)
          select show_id,
                 'PENDING_SNAPSHOT_PROMOTE_STUCK',
                 jsonb_build_object(
                   'snapshot_revision_id', snapshot_revision_id,
                   'promote_started_at', promote_started_at
                 )
            from public.pending_snapshot_uploads
           where promote_started_at is not null
             and promoted_at is null
             and promote_started_at < $1::timestamptz - interval '15 minutes'
          on conflict do nothing
        `,
        [now.toISOString()],
      );
      await rows(
        `
          insert into public.admin_alerts (show_id, code, context)
          select show_id,
                 'PENDING_SNAPSHOT_DELETE_STUCK',
                 jsonb_build_object(
                   'snapshot_revision_id', snapshot_revision_id,
                   'delete_started_at', delete_started_at
                 )
            from public.pending_snapshot_uploads
           where delete_started_at is not null
             and promoted_at is null
             and claim_expires_at < $1::timestamptz
          on conflict do nothing
        `,
        [now.toISOString()],
      );
    },
  };
}

export async function runDiagramGc(args?: Partial<RunDiagramGcArgs>): Promise<DiagramGcResult> {
  const tx = args?.tx ?? defaultTx();
  const storage = args?.storage ?? defaultStorage();
  const now = args?.now ?? new Date();
  let orphanBlobsDeleted = 0;
  let pendingPrefixesDeleted = 0;

  for (const show of await tx.listShows()) {
    if (suppressOrphanDeletion(show)) continue;
    const retained = new Set(
      [
        show.currentRevisionId,
        ...show.retainedRevisionIds,
        ...(show.inFlightRevisionIds ?? []),
      ].filter((revision): revision is string => Boolean(revision)),
    );
    const paths = await storage.list(showPrefix(show.showId));
    for (const entry of paths) {
      const path = typeof entry === "string" ? entry : entry.path;
      const createdAt = typeof entry === "string" ? null : entry.createdAt;
      const revision = revisionFromPath(show.showId, path);
      if (!revision || revision === "_pending" || retained.has(revision)) continue;
      if (createdAt) {
        const created = Date.parse(createdAt);
        if (
          Number.isFinite(created) &&
          now.getTime() - created < show.cutoffDays * 24 * 60 * 60 * 1000
        ) {
          continue;
        }
      }
      await storage.remove(path);
      orphanBlobsDeleted += 1;
    }
  }

  for (const row of await tx.claimPendingRows(now)) {
    if (row.pendingRevisionId === row.snapshotRevisionId) continue;
    await tx.markPendingDeleteStarted?.(row.id, row.claimToken, now);
    await storage.removePrefix(row.tempPrefix);
    await tx.deletePendingRow(row.id, row.claimToken);
    pendingPrefixesDeleted += 1;
  }

  const promotedRowsDeleted = await tx.deletePromotedRows(now);
  await tx.emitStuckAlerts?.(now);

  return {
    orphanBlobsDeleted,
    pendingPrefixesDeleted,
    promotedRowsDeleted,
  };
}
