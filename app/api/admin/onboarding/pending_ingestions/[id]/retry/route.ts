import { NextResponse } from "next/server";
import postgres from "postgres";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  retrySingleFile_unlocked as defaultRetrySingleFileUnlocked,
  type RetrySingleFileDeps,
  type RetrySingleFileResult,
} from "@/lib/sync/retrySingleFile";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";

export type WizardPendingIngestionRouteTx = LockedShowTx<{
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
}>;

export type WizardPendingIngestionRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  readDriveFileIdForPendingIngestion?: (id: string) => Promise<string | null>;
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: WizardPendingIngestionRouteTx) => Promise<R> | R,
  ) => Promise<R>;
  retrySingleFileUnlocked?: (
    tx: WizardPendingIngestionRouteTx,
    driveFileId: string,
    wizardSessionId: string,
    deps?: RetrySingleFileDeps,
  ) => Promise<RetrySingleFileResult>;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PendingIngestionRow = {
  id: string;
  drive_file_id: string;
  wizard_session_id: string | null;
  discovered_during_folder_id: string | null;
  last_seen_modified_time: string | null;
};

type WizardSettingsRow = {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("wizard pending-ingestion route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

async function defaultReadDriveFileIdForPendingIngestion(id: string): Promise<string | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      `select drive_file_id from public.pending_ingestions where id = $1::uuid limit 1`,
      [id],
    )) as Array<{ drive_file_id: string }>;
    return rows[0]?.drive_file_id ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: WizardPendingIngestionRouteTx) => Promise<R> | R,
): Promise<R> {
  const result = await withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false });
  if (typeof result === "object" && result !== null && "skipped" in result) {
    throw new Error("blocking wizard pending-ingestion route skipped lock");
  }
  return result;
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: WizardPendingIngestionRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    readDriveFileIdForPendingIngestion:
      deps.readDriveFileIdForPendingIngestion ?? defaultReadDriveFileIdForPendingIngestion,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    retrySingleFileUnlocked:
      deps.retrySingleFileUnlocked ??
      (defaultRetrySingleFileUnlocked as unknown as NonNullable<
        WizardPendingIngestionRouteDeps["retrySingleFileUnlocked"]
      >),
  };
}

function errorResponse(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

function retryResponse(result: RetrySingleFileResult): Response {
  if (result.outcome === "retried") {
    if (result.status === "staged") return NextResponse.json({ status: "staged" });
    if (result.status === "hard_failed") {
      return NextResponse.json({ status: "hard_failed_again", code: result.code });
    }
    return NextResponse.json({ status: "live_row_conflict" });
  }
  return NextResponse.json(result);
}

async function readLockedPendingIngestion(
  tx: WizardPendingIngestionRouteTx,
  id: string,
): Promise<PendingIngestionRow | null> {
  return await tx.queryOne<PendingIngestionRow | null>(
    `
      select drive_file_id, wizard_session_id, discovered_during_folder_id,
             last_seen_modified_time, id
        from public.pending_ingestions
       where id = $1::uuid
       for update
    `,
    [id],
  );
}

async function readWizardSettings(
  tx: WizardPendingIngestionRouteTx,
): Promise<WizardSettingsRow> {
  const row = await tx.queryOne<WizardSettingsRow | null>(
    `
      select pending_wizard_session_id, pending_folder_id
        from public.app_settings
       where id = 'default'
       limit 1
    `,
    [],
  );
  return row ?? { pending_wizard_session_id: null, pending_folder_id: null };
}

function isCurrentWizardRow(
  row: PendingIngestionRow,
  settings: WizardSettingsRow,
): row is PendingIngestionRow & { wizard_session_id: string; discovered_during_folder_id: string } {
  return (
    row.wizard_session_id !== null &&
    row.wizard_session_id === settings.pending_wizard_session_id &&
    row.discovered_during_folder_id !== null &&
    row.discovered_during_folder_id === settings.pending_folder_id
  );
}

async function requireCurrentWizardRow(
  tx: WizardPendingIngestionRouteTx,
  id: string,
): Promise<
  | { ok: true; row: PendingIngestionRow & { wizard_session_id: string; discovered_during_folder_id: string } }
  | { ok: false; response: Response }
> {
  const [row, settings] = await Promise.all([
    readLockedPendingIngestion(tx, id),
    readWizardSettings(tx),
  ]);
  if (!row) {
    return { ok: false, response: errorResponse(404, "PENDING_INGESTION_NOT_FOUND") };
  }
  if (!isCurrentWizardRow(row, settings)) {
    return { ok: false, response: errorResponse(409, "WIZARD_SESSION_SUPERSEDED") };
  }
  return { ok: true, row };
}

async function upsertWizardDeferral(
  tx: WizardPendingIngestionRouteTx,
  row: PendingIngestionRow & { wizard_session_id: string },
  kind: "defer_until_modified" | "permanent_ignore",
): Promise<void> {
  await tx.queryOne<{ upserted: boolean } | null>(
    `
      insert into public.deferred_ingestions (
        drive_file_id, deferred_kind, deferred_at_modified_time,
        deferred_by_email, reason, wizard_session_id
      )
      values ($1, $2, $3::timestamptz, null, $4, $5::uuid)
      on conflict (drive_file_id, wizard_session_id) where wizard_session_id is not null
      do update set
        deferred_kind = excluded.deferred_kind,
        deferred_at_modified_time = excluded.deferred_at_modified_time,
        reason = excluded.reason,
        deferred_at = now()
      returning true as upserted
    `,
    [
      row.drive_file_id,
      kind,
      kind === "defer_until_modified" ? row.last_seen_modified_time : null,
      `pending_ingestion:${kind}`,
      row.wizard_session_id,
    ],
  );
}

async function deletePendingIngestion(
  tx: WizardPendingIngestionRouteTx,
  id: string,
): Promise<void> {
  await tx.queryOne<{ deleted: boolean } | null>(
    `delete from public.pending_ingestions where id = $1::uuid returning true as deleted`,
    [id],
  );
}

// I.2 R20 F1 (2026-05-23): defer/ignore must transition the manifest row
// alongside the deferred_ingestions upsert + pending_ingestions delete.
// Finalize's unresolved-count predicate counts manifest rows in
// ('staged','hard_failed','discard_retryable','live_row_conflict'); without
// this transition the row stays 'hard_failed' and finalize blocks with
// ONBOARDING_NOT_RESOLVED. Runs inside the same per-show advisory-locked tx.
//
// M12 R41-R9/R11/R16 (2026-05-23): mirrors discardStaged.ts CAS pattern —
// the UPDATE carries an active-wizard-session EXISTS predicate so a wizard
// supersession that lands between requireCurrentWizardRow and this UPDATE
// no-ops the manifest write. Returns whether a row was affected so the
// caller can refuse to delete the pending_ingestions row on a 0-row result.
async function transitionManifestRow(
  tx: WizardPendingIngestionRouteTx,
  row: PendingIngestionRow & { wizard_session_id: string },
  kind: "defer_until_modified" | "permanent_ignore",
): Promise<boolean> {
  const updated = await tx.queryOne<{ updated: boolean } | null>(
    `
      update public.onboarding_scan_manifest
         set status = $1, transitioned_at = now()
       where wizard_session_id = $2::uuid
         and drive_file_id = $3
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as updated
    `,
    [kind, row.wizard_session_id, row.drive_file_id],
  );
  return Boolean(updated?.updated);
}

async function handleAction(
  context: RouteContext,
  routeDeps: WizardPendingIngestionRouteDeps,
  action: "retry" | "defer_until_modified" | "permanent_ignore",
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { id } = await context.params;
  const driveFileId = await deps.readDriveFileIdForPendingIngestion(id);
  if (!driveFileId) return errorResponse(404, "PENDING_INGESTION_NOT_FOUND");

  return await deps.withRowTx(driveFileId, async (tx) => {
    const current = await requireCurrentWizardRow(tx, id);
    if (!current.ok) return current.response;
    if (current.row.drive_file_id !== driveFileId) {
      return errorResponse(500, "LOCK_OWNERSHIP_ASSERTION_FAILED");
    }
    if (action === "retry") {
      const result = await deps.retrySingleFileUnlocked(
        tx,
        current.row.drive_file_id,
        current.row.wizard_session_id,
        {},
      );
      if (result.outcome === "wizard_superseded") {
        return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
      }
      if (result.outcome === "not_found") {
        return errorResponse(404, result.code);
      }
      return retryResponse(result);
    }

    // M12 R41-R9/R11/R16: run the manifest CAS UPDATE first so a wizard
    // supersession (or any 0-row outcome) aborts before we write a deferral
    // for a stale session or delete the pending_ingestions row. If the CAS
    // misses, surface WIZARD_SESSION_SUPERSEDED (409) per the same contract
    // used by requireCurrentWizardRow and lib/sync/discardStaged.ts.
    const manifestTransitioned = await transitionManifestRow(tx, current.row, action);
    if (!manifestTransitioned) {
      return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
    }
    await upsertWizardDeferral(tx, current.row, action);
    await deletePendingIngestion(tx, id);
    return NextResponse.json({
      status: action === "defer_until_modified" ? "deferred" : "ignored",
    });
  });
}

export async function handleWizardPendingIngestionRetry(
  _request: Request,
  context: RouteContext,
  routeDeps: WizardPendingIngestionRouteDeps = {},
): Promise<Response> {
  return await handleAction(context, routeDeps, "retry");
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardPendingIngestionRetry(request, context);
}

export { handleAction as handleWizardPendingIngestionAction };
