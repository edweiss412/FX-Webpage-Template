import { NextResponse } from "next/server";
import postgres from "postgres";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  retrySingleFile_unlocked as defaultRetrySingleFileUnlocked,
  type RetrySingleFileDeps,
  type RetrySingleFileResult,
} from "@/lib/sync/retrySingleFile";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import {
  readCurrentWizardSessionIdBestEffort,
  WizardSessionSupersededRollbackError,
} from "@/lib/sync/wizardSessionRollback";
import {
  upsertAdminAlert as defaultUpsertAdminAlert,
  type UpsertAdminAlertInput,
} from "@/lib/adminAlerts/upsertAdminAlert";

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
  // F5 Task 5.3: post-rollback WIZARD_SESSION_SUPERSEDED_RACE alert producer
  // (its own transaction — the Supabase service-role RPC — never the aborted
  // one) + best-effort current-session read for the alert payload.
  upsertAdminAlert?: (input: UpsertAdminAlertInput) => Promise<string | null>;
  readCurrentWizardSessionId?: () => Promise<string | null>;
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

// F5 Task 5.5 S1 (report-only): this helper returns errorResponse from inside
// the tx callback — safe to return (commits an EMPTY tx) ONLY because no
// mutation precedes it; mutating-statement misses must throw
// WizardSessionSupersededRollbackError instead (the R9-1 abort mechanism).
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

// F5 Task 5.1: per-statement currency predicate (the exact precedent is
// defaultUpsertWizardDeferral in lib/sync/discardStaged.ts — `select ... where
// exists (...)` instead of `values (...)`). Boolean-returning; the caller
// (handleAction) converts a 0-row outcome into the typed rollback throw.
async function upsertWizardDeferral(
  tx: WizardPendingIngestionRouteTx,
  row: PendingIngestionRow & { wizard_session_id: string },
  kind: "defer_until_modified" | "permanent_ignore",
): Promise<boolean> {
  const written = await tx.queryOne<{ upserted: boolean } | null>(
    `
      insert into public.deferred_ingestions (
        drive_file_id, deferred_kind, deferred_at_modified_time,
        deferred_by_email, reason, wizard_session_id
      )
      select $1, $2, $3::timestamptz, null, $4, $5::uuid
      where exists (
        select 1 from public.app_settings
         where id = 'default'
           and pending_wizard_session_id = $5::uuid
      )
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
  return Boolean(written?.upserted);
}

// F5 Task 5.1: same currency predicate on the delete. A 0-row outcome is
// unambiguous: requireCurrentWizardRow holds the row FOR UPDATE, so within
// this tx the row cannot vanish — a 0-row delete can only be a predicate miss.
async function deletePendingIngestion(
  tx: WizardPendingIngestionRouteTx,
  id: string,
  wizardSessionId: string,
): Promise<boolean> {
  const deleted = await tx.queryOne<{ deleted: boolean } | null>(
    `
      delete from public.pending_ingestions
       where id = $1::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as deleted
    `,
    [id, wizardSessionId],
  );
  return Boolean(deleted?.deleted);
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

  try {
    return await deps.withRowTx(driveFileId, async (tx) => {
      const current = await requireCurrentWizardRow(tx, id);
      if (!current.ok) return current.response;
      if (current.row.drive_file_id !== driveFileId) {
        return errorResponse(500, "LOCK_OWNERSHIP_ASSERTION_FAILED");
      }
      if (action === "retry") {
        // F5 Task 5.5 S5: retrySingleFile_unlocked THROWS
        // WizardSessionSupersededRollbackError on a statement-time delete
        // miss — the catch below maps it to the typed 409 + race alert.
        // The returned wizard_superseded outcome here is the PRE-mutation
        // refusal (empty-tx commit, the S1/S2-benign shape).
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
      // for a stale session or delete the pending_ingestions row.
      //
      // F5 Task 5.1 (spec §7 R9-1): every 0-row outcome on a mutating
      // statement THROWS the typed rollback error so the per-show-locked
      // transaction ABORTS — withPostgresSyncPipelineLock COMMITS on normal
      // return (runScheduledCronSync.ts sql.begin), so returning a 409
      // Response from in here would commit the statements that already ran.
      const rollbackContext = {
        supersededSessionId: current.row.wizard_session_id,
        pendingIngestionId: id,
        driveFileId: current.row.drive_file_id,
      };
      const manifestTransitioned = await transitionManifestRow(tx, current.row, action);
      if (!manifestTransitioned) {
        throw new WizardSessionSupersededRollbackError({
          attemptedAction: action,
          ...rollbackContext,
        });
      }
      const wroteDeferral = await upsertWizardDeferral(tx, current.row, action);
      if (!wroteDeferral) {
        throw new WizardSessionSupersededRollbackError({
          attemptedAction: action,
          ...rollbackContext,
        });
      }
      const deletedPendingIngestion = await deletePendingIngestion(
        tx,
        id,
        current.row.wizard_session_id,
      );
      if (!deletedPendingIngestion) {
        throw new WizardSessionSupersededRollbackError({
          attemptedAction: action,
          ...rollbackContext,
        });
      }
      return NextResponse.json({
        status: action === "defer_until_modified" ? "deferred" : "ignored",
      });
    });
  } catch (error) {
    if (error instanceof WizardSessionSupersededRollbackError) {
      // Transaction is already aborted here. The alert write runs on the
      // Supabase service-role RPC — its own transaction, the established
      // post-rollback follow-up pattern; it is NEVER inside the aborted tx.
      // Best-effort: a failed alert write is logged, never masks the 409.
      try {
        await (routeDeps.upsertAdminAlert ?? defaultUpsertAdminAlert)({
          showId: null,
          code: "WIZARD_SESSION_SUPERSEDED_RACE",
          context: {
            attempted_action: error.context.attemptedAction,
            superseded_session_id: error.context.supersededSessionId,
            current_session_id: await (
              routeDeps.readCurrentWizardSessionId ?? readCurrentWizardSessionIdBestEffort
            )(),
            pending_ingestion_id: error.context.pendingIngestionId ?? null,
            drive_file_id: error.context.driveFileId,
          },
        });
      } catch (alertError) {
        console.error("WIZARD_SESSION_SUPERSEDED_RACE alert write failed", alertError);
      }
      return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
    }
    throw error;
  }
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

// F5 Task 5.2: the three statement helpers are exported (no behavior change)
// so the real-Postgres race regression (tests/onboarding/
// wizardSessionCasRaceDb.test.ts) can exercise the PRODUCTION SQL — a fake
// could pass while a transposed parameter or non-re-reading EXISTS shipped.
export { transitionManifestRow, upsertWizardDeferral, deletePendingIngestion };
