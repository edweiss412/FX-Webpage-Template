import { NextResponse } from "next/server";
import postgres from "postgres";
import { subscribeToWatchedFolder as defaultSubscribeToWatchedFolder } from "@/lib/drive/watch";
import type { ParseResult } from "@/lib/parser/types";

export type FinalizeCasRouteTx = {
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

export type FinalizeCasRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: FinalizeCasRouteTx) => Promise<R>) => Promise<R>;
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: FinalizeCasRouteTx) => Promise<R>,
  ) => Promise<R>;
  subscribeToWatchedFolder?: (folderId: string) => Promise<unknown>;
};

type SessionRow = {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
};

type CheckpointRow = {
  status: "in_progress" | "all_batches_complete" | "final_cas_done";
  batches_completed: number;
};

type ShadowRow = {
  drive_file_id: string;
  payload: {
    parse_result?: ParseResult;
    staged_modified_time?: string;
  };
};

type FinalizeCasResult =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
      idempotent?: true;
    }
  | Response;

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("onboarding finalize-cas route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const rows = (await rawTx.unsafe(sql, [...params])) as T[];
      return { rows, rowCount: rows.length };
    },
  } satisfies FinalizeCasRouteTx;
}

async function defaultWithTx<R>(fn: (tx: FinalizeCasRouteTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> })),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: FinalizeCasRouteTx) => Promise<R>,
): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) => {
      const tx = postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> });
      await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
      return await fn(tx);
    })) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: FinalizeCasRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withTx: deps.withTx ?? defaultWithTx,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    subscribeToWatchedFolder: deps.subscribeToWatchedFolder ?? defaultSubscribeToWatchedFolder,
  };
}

function errorResponse(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

async function readSession(tx: FinalizeCasRouteTx): Promise<SessionRow> {
  const { rows } = await tx.query<SessionRow>(
    `
      select pending_wizard_session_id, pending_folder_id
        from public.app_settings
       where id = 'default'
       for update
    `,
  );
  return rows[0] ?? { pending_wizard_session_id: null, pending_folder_id: null };
}

async function tryFinalizeLock(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<boolean> {
  const { rows } = await tx.query<{ locked: boolean }>(
    `select pg_try_advisory_xact_lock(hashtext('finalize:' || $1)) as locked`,
    [wizardSessionId],
  );
  return rows[0]?.locked === true;
}

async function readCheckpoint(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<CheckpointRow | null> {
  const { rows } = await tx.query<CheckpointRow>(
    `
      select status, batches_completed
        from public.wizard_finalize_checkpoints
       where wizard_session_id = $1::uuid
       for update
    `,
    [wizardSessionId],
  );
  return rows[0] ?? null;
}

async function approvedCount(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<number> {
  const { rows } = await tx.query<{ approved_count: number }>(
    `
      select count(*)::int as approved_count
        from public.pending_syncs
       where wizard_session_id = $1::uuid
         and wizard_approved = true
    `,
    [wizardSessionId],
  );
  return rows[0]?.approved_count ?? 0;
}

async function unresolvedManifestCount(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<number> {
  const { rows } = await tx.query<{ unresolved_count: number }>(
    `
      select count(*)::int as unresolved_count
        from public.onboarding_scan_manifest
       where wizard_session_id = $1::uuid
         and status in ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict')
    `,
    [wizardSessionId],
  );
  return rows[0]?.unresolved_count ?? 0;
}

async function readShadowRows(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<ShadowRow[]> {
  const { rows } = await tx.query<ShadowRow>(
    `
      select drive_file_id, payload
        from public.shows_pending_changes
       where wizard_session_id = $1::uuid
       order by drive_file_id
       for update
    `,
    [wizardSessionId],
  );
  return rows;
}

async function applyShadow(tx: FinalizeCasRouteTx, row: ShadowRow): Promise<void> {
  const parseResult = row.payload.parse_result;
  if (!parseResult) return;
  await tx.query<{ applied: boolean }>(
    `
      update public.shows
         set title = $2,
             client_label = $3,
             client_contact = $4::jsonb,
             template_version = $5,
             venue = $6::jsonb,
             dates = $7::jsonb,
             event_details = $8::jsonb,
             agenda_links = $9::jsonb,
             diagrams = $10::jsonb,
             opening_reel_drive_file_id = $11,
             opening_reel_drive_modified_time = $12::timestamptz,
             opening_reel_head_revision_id = $13,
             opening_reel_mime_type = $14,
             last_seen_modified_time = $15::timestamptz,
             coi_status = $16,
             pull_sheet = $17::jsonb,
             last_synced_at = now(),
             last_sync_status = 'ok',
             last_sync_error = null
       where drive_file_id = $1
       returning true as applied
    `,
    [
      row.drive_file_id,
      parseResult.show.title,
      parseResult.show.client_label,
      JSON.stringify(parseResult.show.client_contact),
      parseResult.show.template_version,
      JSON.stringify(parseResult.show.venue),
      JSON.stringify(parseResult.show.dates),
      JSON.stringify(parseResult.show.event_details),
      JSON.stringify(parseResult.show.agenda_links),
      JSON.stringify(parseResult.diagrams),
      parseResult.openingReel?.driveFileId ?? null,
      parseResult.openingReel?.drive_modified_time ?? null,
      parseResult.openingReel?.headRevisionId ?? null,
      parseResult.openingReel?.mimeType ?? null,
      row.payload.staged_modified_time ?? null,
      parseResult.show.coi_status,
      JSON.stringify(parseResult.pullSheet),
    ],
  );
}

async function deleteShadowRows(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<void> {
  await tx.query(
    `delete from public.shows_pending_changes where wizard_session_id = $1::uuid`,
    [wizardSessionId],
  );
}

async function publishAppliedWizardShows(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<void> {
  await tx.query<{ published: boolean }>(
    `
      update public.shows
         set published = true
       where drive_file_id in (
         select drive_file_id
           from public.onboarding_scan_manifest
          where wizard_session_id = $1::uuid
            and status = 'applied'
       )
      returning true as published
    `,
    [wizardSessionId],
  );
}

async function deleteWizardDeferrals(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<void> {
  await tx.query(`delete from public.deferred_ingestions where wizard_session_id = $1::uuid`, [
    wizardSessionId,
  ]);
}

async function promoteSettings(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ watched_folder_id: string | null }>(
    `
      update public.app_settings
         set watched_folder_id = pending_folder_id,
             watched_folder_name = pending_folder_name,
             watched_folder_set_by_email = pending_folder_set_by_email,
             watched_folder_set_at = pending_folder_set_at,
             pending_folder_id = null,
             pending_folder_name = null,
             pending_folder_set_by_email = null,
             pending_folder_set_at = null,
             pending_wizard_session_id = null,
             pending_wizard_session_at = null,
             updated_at = now()
       where id = 'default'
         and pending_wizard_session_id = $1::uuid
         and pending_folder_id is not null
       returning watched_folder_id
    `,
    [wizardSessionId],
  );
  return rows[0]?.watched_folder_id ?? null;
}

async function markFinalCasDone(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<void> {
  await tx.query<CheckpointRow>(
    `
      update public.wizard_finalize_checkpoints
         set status = 'final_cas_done',
             last_processed_at = now()
       where wizard_session_id = $1::uuid
      returning status, batches_completed
    `,
    [wizardSessionId],
  );
}

async function runFinalizeCas(
  tx: FinalizeCasRouteTx,
  deps: ReturnType<typeof depsWithDefaults>,
): Promise<FinalizeCasResult> {
  const session = await readSession(tx);
  const wizardSessionId = session.pending_wizard_session_id;
  if (!wizardSessionId || !session.pending_folder_id) {
    return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
  }

  if (!(await tryFinalizeLock(tx, wizardSessionId))) {
    return errorResponse(409, "CONCURRENT_FINALIZE_IN_FLIGHT");
  }

  const checkpoint = await readCheckpoint(tx, wizardSessionId);
  if (!checkpoint) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
  if (checkpoint.status === "final_cas_done") {
    return {
      status: "finalize_complete",
      wizard_session_id: wizardSessionId,
      watched_folder_id: session.pending_folder_id,
      idempotent: true,
    };
  }
  if (checkpoint.status !== "all_batches_complete") {
    return errorResponse(409, "WIZARD_FINALIZE_BATCHES_PENDING");
  }

  const approved = await approvedCount(tx, wizardSessionId);
  if (approved > 0) {
    return errorResponse(409, "WIZARD_FINALIZE_BATCHES_PENDING", { approved_count: approved });
  }

  const unresolved = await unresolvedManifestCount(tx, wizardSessionId);
  if (unresolved > 0) {
    return errorResponse(409, "ONBOARDING_NOT_RESOLVED", {
      unresolved_manifest_count: unresolved,
    });
  }

  for (const row of await readShadowRows(tx, wizardSessionId)) {
    await deps.withRowTx(row.drive_file_id, (rowTx) => applyShadow(rowTx, row));
  }
  await deleteShadowRows(tx, wizardSessionId);
  await publishAppliedWizardShows(tx, wizardSessionId);
  await deleteWizardDeferrals(tx, wizardSessionId);
  const watchedFolderId = await promoteSettings(tx, wizardSessionId);
  if (!watchedFolderId) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
  await markFinalCasDone(tx, wizardSessionId);

  return {
    status: "finalize_complete",
    wizard_session_id: wizardSessionId,
    watched_folder_id: watchedFolderId,
  };
}

export async function handleOnboardingFinalizeCas(
  _request: Request,
  routeDeps: FinalizeCasRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const result = await deps.withTx((tx) => runFinalizeCas(tx, deps));
  if (result instanceof Response) return result;
  if (!result.idempotent) {
    await deps.subscribeToWatchedFolder(result.watched_folder_id);
  }
  return NextResponse.json(result);
}

export async function POST(request: Request): Promise<Response> {
  return await handleOnboardingFinalizeCas(request);
}
