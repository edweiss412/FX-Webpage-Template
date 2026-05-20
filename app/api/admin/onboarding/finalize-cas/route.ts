import { NextResponse } from "next/server";
import postgres from "postgres";
import { subscribeToWatchedFolder as defaultSubscribeToWatchedFolder } from "@/lib/drive/watch";
import { canonicalize } from "@/lib/email/canonicalize";
import type { ParseResult } from "@/lib/parser/types";

const OK_CODE = "OK" as const;

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
  watched_folder_id: string | null;
};

type CheckpointRow = {
  status: "in_progress" | "all_batches_complete" | "final_cas_done";
  batches_completed: number;
};

type ShadowRow = {
  wizard_session_id: string;
  drive_file_id: string;
  show_id: string;
  applied_by_email: string;
  applied_at_intent: string;
  payload: {
    parse_result?: ParseResult;
    staged_modified_time?: string;
    staged_id?: string;
    reviewer_choices?: unknown[];
  };
};

type ShadowApplyResult =
  | { drive_file_id: string; code: typeof OK_CODE }
  | { drive_file_id: string; code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };

type FinalizeCasResult =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
      idempotent?: true;
      per_row?: ShadowApplyResult[];
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
      select pending_wizard_session_id, pending_folder_id, watched_folder_id
        from public.app_settings
       where id = 'default'
    `,
  );
  return rows[0] ?? {
    pending_wizard_session_id: null,
    pending_folder_id: null,
    watched_folder_id: null,
  };
}

async function readLatestFinalizedCheckpoint(tx: FinalizeCasRouteTx): Promise<{ wizard_session_id: string } | null> {
  const { rows } = await tx.query<{ wizard_session_id: string }>(
    `
      select wizard_session_id
        from public.wizard_finalize_checkpoints
       where status = 'final_cas_done'
       order by last_processed_at desc nulls last
       limit 1
    `,
  );
  return rows[0] ?? null;
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
      select wizard_session_id, drive_file_id, show_id, applied_by_email, applied_at_intent, payload
       from public.shows_pending_changes
       where wizard_session_id = $1::uuid
       order by drive_file_id
    `,
    [wizardSessionId],
  );
  return rows;
}

async function deleteShadowRows(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<void> {
  await tx.query(
    `delete from public.shows_pending_changes where wizard_session_id = $1::uuid`,
    [wizardSessionId],
  );
}

async function deleteAppliedShadowRow(tx: FinalizeCasRouteTx, row: ShadowRow): Promise<void> {
  await tx.query(
    `
      delete from public.shows_pending_changes
       where wizard_session_id = $1::uuid
         and drive_file_id = $2
    `,
    [row.wizard_session_id, row.drive_file_id],
  );
}

async function applyShadow(
  tx: FinalizeCasRouteTx,
  row: ShadowRow,
): Promise<ShadowApplyResult> {
  const parseResult = row.payload.parse_result;
  if (!parseResult) {
    await deleteAppliedShadowRow(tx, row);
    return { drive_file_id: row.drive_file_id, code: OK_CODE };
  }
  const applied = await tx.query<{ applied: boolean }>(
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
         and (last_seen_modified_time is null or last_seen_modified_time <= $15::timestamptz)
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
  if (applied.rowCount === 0) {
    return { drive_file_id: row.drive_file_id, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };
  }
  await insertShadowAudit(tx, row);
  await deleteAppliedShadowRow(tx, row);
  return { drive_file_id: row.drive_file_id, code: OK_CODE };
}

async function insertShadowAudit(tx: FinalizeCasRouteTx, row: ShadowRow): Promise<void> {
  await tx.query<{ id: string }>(
    `
      insert into public.sync_audit (
        show_id, drive_file_id, applied_by, staged_id, triggered_review_items,
        reviewer_choices, derived_side_effects, parse_result_summary,
        base_modified_time, staged_modified_time
      )
      values (
        $1::uuid, $2, $3, ($4)::uuid, '[]'::jsonb,
        $5::jsonb, '{}'::jsonb,
        jsonb_build_object('title', $6, 'source', 'onboarding_finalize_cas'),
        null, $7::timestamptz
      )
      returning id
    `,
    [
      row.show_id,
      row.drive_file_id,
      canonicalize(row.applied_by_email),
      row.payload.staged_id ?? null,
      JSON.stringify(row.payload.reviewer_choices ?? []),
      row.payload.parse_result?.show.title ?? null,
      row.payload.staged_modified_time ?? null,
    ],
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
    const finalized = await readLatestFinalizedCheckpoint(tx);
    if (finalized && session.watched_folder_id) {
      return {
        status: "finalize_complete",
        wizard_session_id: finalized.wizard_session_id,
        watched_folder_id: session.watched_folder_id,
        idempotent: true,
      };
    }
    return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
  }

  if (!(await tryFinalizeLock(tx, wizardSessionId))) {
    return errorResponse(409, "CONCURRENT_FINALIZE_IN_FLIGHT");
  }

  const checkpoint = await readCheckpoint(tx, wizardSessionId);
  if (!checkpoint) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
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

  const shadowResults: ShadowApplyResult[] = [];
  for (const row of await readShadowRows(tx, wizardSessionId)) {
    shadowResults.push(await deps.withRowTx(row.drive_file_id, (rowTx) => applyShadow(rowTx, row)));
  }
  const blocked = shadowResults.filter((row) => row.code !== "OK");
  if (blocked.length > 0) {
    return errorResponse(409, "STAGED_PARSE_OUTDATED_AT_PHASE_D", { per_row: shadowResults });
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
    ...(blocked.length > 0 ? { per_row: shadowResults } : {}),
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
  await deps.subscribeToWatchedFolder(result.watched_folder_id);
  return NextResponse.json(result);
}

export async function POST(request: Request): Promise<Response> {
  return await handleOnboardingFinalizeCas(request);
}
