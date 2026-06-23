import { getActiveWatchedFolderId } from "@/lib/appSettings/getWatchedFolderId";
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import type { UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import {
  assertShowLockHeld,
  type ConcurrentSyncSkipped,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import {
  processOneFile as defaultProcessOneFile,
  processOneFile_unlocked as defaultProcessOneFile_unlocked,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
  type SyncPipelineTx,
  SHEET_UNAVAILABLE,
  STAGED_PARSE_SOURCE_GONE,
  SYNC_INFRA_ERROR,
  resolveStaleSyncProblemAlerts_unlocked,
  syncProblemCodeForStatus,
  withPostgresSyncPipelineLock,
} from "@/lib/sync/runScheduledCronSync";
import type { SyncMode } from "@/lib/sync/perFileProcessor";
import { SHOW_ARCHIVED_IMMUTABLE, readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";
import { revalidateOnApplied } from "@/lib/data/showCacheTag";

export const FINALIZE_OWNED_SHOW = "FINALIZE_OWNED_SHOW" as const;

export type FinalizeOwnedShowResult = {
  outcome: "blocked";
  code: typeof FINALIZE_OWNED_SHOW;
};

export type ShowArchivedImmutableResult = {
  outcome: "blocked";
  code: typeof SHOW_ARCHIVED_IMMUTABLE;
};

export type ManualSyncResult =
  | ProcessOneFileResult
  | FinalizeOwnedShowResult
  | ShowArchivedImmutableResult;
type ManualLockResult = ManualSyncResult | { outcome: "proceed" };

export type RunManualSyncForShowDeps = {
  checkFinalizeOwnership?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<boolean>;
  getActiveWatchedFolderId?: typeof getActiveWatchedFolderId;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  processOneFile_unlocked?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    mode: SyncMode,
    fileMeta: DriveListedFile,
    deps?: ProcessOneFileDeps,
  ) => Promise<ProcessOneFileResult>;
  processOneFile?: (
    driveFileId: string,
    mode: Extract<SyncMode, "manual">,
    fileMeta: DriveListedFile,
    deps?: ProcessOneFileDeps,
  ) => Promise<ManualSyncResult | ConcurrentSyncSkipped>;
  withPipelineLock?: <R extends ManualLockResult>(
    driveFileId: string,
    fn: (tx: LockedShowTx<SyncPipelineTx>) => Promise<R> | R,
  ) => Promise<R | ConcurrentSyncSkipped>;
  processDeps?: ProcessOneFileDeps;
};

type ManualRecoveryTx = SyncPipelineTx & {
  markShowSheetUnavailable(
    driveFileId: string,
    code: typeof SHEET_UNAVAILABLE | typeof STAGED_PARSE_SOURCE_GONE,
  ): Promise<{
    showId: string | null;
    lastSeenModifiedTime: string | null;
    title: string | null;
  }>;
  markShowDriveError(
    driveFileId: string,
    code: string,
  ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null; title: string | null }>;
  insertSyncLog(
    entry: {
      driveFileId: string | null;
      outcome: string;
      code?: string;
      payload?: Record<string, unknown>;
    },
    showId?: string | null,
  ): Promise<void>;
  upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null>;
};

function driveErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const value = candidate.code ?? candidate.status ?? candidate.response?.status;
  return typeof value === "number" ? value : null;
}

function isDriveSourceGone(error: unknown): boolean {
  const status = driveErrorStatus(error);
  return status === 404 || status === 410;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readFinalizeOwnershipGuard_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<boolean> {
  const row = await tx.queryOne<{
    first_seen_owned: boolean;
    existing_show_owned: boolean;
  }>(
    `
      select
        exists (
          select 1
            from public.shows s
            join public.onboarding_scan_manifest m
              on m.drive_file_id = s.drive_file_id
             and m.status = 'applied'
            join public.wizard_finalize_checkpoints c
              on c.wizard_session_id = m.wizard_session_id
           where s.drive_file_id = $1
             and s.published = false
             and c.status in ('in_progress', 'all_batches_complete')
        ) as first_seen_owned,
        exists (
          select 1
            from public.shows_pending_changes spc
            join public.wizard_finalize_checkpoints c
              on c.wizard_session_id = spc.wizard_session_id
           where spc.drive_file_id = $1
             and c.status in ('in_progress', 'all_batches_complete')
        ) as existing_show_owned
    `,
    [driveFileId],
  );
  return Boolean(row.first_seen_owned || row.existing_show_owned);
}

async function markManualSheetUnavailable_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  code: typeof SHEET_UNAVAILABLE | typeof STAGED_PARSE_SOURCE_GONE,
  error?: unknown,
): Promise<Extract<ProcessOneFileResult, { outcome: "source_gone" }>> {
  await assertShowLockHeld(tx, driveFileId);
  const recoveryTx = tx as LockedShowTx<ManualRecoveryTx>;
  const updated = await recoveryTx.markShowSheetUnavailable(driveFileId, code);
  const showId = updated.showId;
  const previousLastSeenModifiedTime = updated.lastSeenModifiedTime ?? null;
  const payload: Record<string, unknown> = {
    driveFileId,
    previousLastSeenModifiedTime,
  };
  if (error) payload.message = errorMessage(error);

  await recoveryTx.insertSyncLog(
    {
      driveFileId,
      outcome: "error",
      code,
      payload,
    },
    showId,
  );

  await recoveryTx.upsertAdminAlert({
    showId,
    code: "SHEET_UNAVAILABLE",
    context: {
      drive_file_id: driveFileId,
      ...(code === STAGED_PARSE_SOURCE_GONE ? { failure_code: code } : {}),
      previous_last_seen_modified_time: previousLastSeenModifiedTime,
      // Supplies the §12.4 `<sheet-name>` placeholder for AlertBanner
      // interpolation (M9 C0 round-7). `updated.title` is the freshly
      // read show title returned by markShowSheetUnavailable's RETURNING.
      sheet_name: updated.title,
    },
  });
  await resolveStaleSyncProblemAlerts_unlocked(
    tx,
    showId,
    syncProblemCodeForStatus("sheet_unavailable"),
  );

  return { outcome: "source_gone", code };
}

async function markManualDriveError_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  reason: string,
  error?: unknown,
): Promise<Extract<ProcessOneFileResult, { outcome: "parse_error" }>> {
  await assertShowLockHeld(tx, driveFileId);
  const recoveryTx = tx as LockedShowTx<ManualRecoveryTx>;
  const updated = await recoveryTx.markShowDriveError(driveFileId, SYNC_INFRA_ERROR);
  const payload: Record<string, unknown> = {
    driveFileId,
    reason,
    previousLastSeenModifiedTime: updated.lastSeenModifiedTime ?? null,
  };
  if (error) payload.message = errorMessage(error);
  await recoveryTx.insertSyncLog(
    {
      driveFileId,
      outcome: "parse_error",
      code: SYNC_INFRA_ERROR,
      payload,
    },
    updated.showId,
  );
  await recoveryTx.upsertAdminAlert({
    showId: updated.showId,
    code: "DRIVE_FETCH_FAILED",
    context: {
      drive_file_id: driveFileId,
      failure_code: SYNC_INFRA_ERROR,
      previous_last_seen_modified_time: updated.lastSeenModifiedTime ?? null,
      sheet_name: updated.title,
    },
  });
  await resolveStaleSyncProblemAlerts_unlocked(
    tx,
    updated.showId,
    syncProblemCodeForStatus("drive_error"),
  );
  return { outcome: "parse_error", code: SYNC_INFRA_ERROR };
}

async function emitManualParseErrorAlert_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<void> {
  const show = await tx.readShowForPhase1(driveFileId);
  if (!show?.showId) return;
  const recoveryTx = tx as LockedShowTx<ManualRecoveryTx>;
  await recoveryTx.upsertAdminAlert({
    showId: show.showId,
    code: "PARSE_ERROR_LAST_GOOD",
    context: {
      drive_file_id: driveFileId,
      sheet_name: show.priorParseResult.show.title,
    },
  });
  await resolveStaleSyncProblemAlerts_unlocked(
    tx,
    show.showId,
    syncProblemCodeForStatus("parse_error"),
  );
}

export async function runManualSyncForShow_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode: Extract<SyncMode, "manual">,
  fileMeta: DriveListedFile,
  deps: RunManualSyncForShowDeps = {},
): Promise<ProcessOneFileResult> {
  await assertShowLockHeld(tx, driveFileId);
  const runUnlocked = deps.processOneFile_unlocked ?? defaultProcessOneFile_unlocked;
  return await runUnlocked(tx, driveFileId, mode, fileMeta, deps.processDeps ?? {});
}

export async function runManualSyncForShow(
  driveFileId: string,
  mode: Extract<SyncMode, "manual"> = "manual",
  deps: RunManualSyncForShowDeps = {},
): Promise<ManualSyncResult | ConcurrentSyncSkipped> {
  const withLock =
    deps.withPipelineLock ?? ((id, fn) => withPostgresSyncPipelineLock(id, fn, { tryOnly: false }));
  const runOne = deps.processOneFile ?? defaultProcessOneFile;
  const usesInjectedProcessOneFile = Boolean(deps.processOneFile);

  const preflight = await withLock(driveFileId, async (tx) => {
    // DEF-3: refuse an archived show BEFORE any Drive fetch (no mutation, no fetch, no log).
    if (await readShowArchived_unlocked(tx, driveFileId)) {
      return { outcome: "blocked" as const, code: SHOW_ARCHIVED_IMMUTABLE };
    }
    const isFinalizeOwned = await (
      deps.checkFinalizeOwnership ?? readFinalizeOwnershipGuard_unlocked
    )(tx, driveFileId);
    if (isFinalizeOwned) {
      return { outcome: "blocked" as const, code: FINALIZE_OWNED_SHOW };
    }
    return { outcome: "proceed" as const };
  });
  if ("skipped" in preflight) return preflight;
  if (preflight.outcome === "blocked") return preflight;

  const folderResult = await (deps.getActiveWatchedFolderId ?? getActiveWatchedFolderId)();
  if ("kind" in folderResult) {
    return await withLock(driveFileId, async (tx) => {
      // DEF-3 (R-impl-1 TOCTOU): re-read archived under THIS recovery lock. The preflight archived guard
      // ran under a separate lock that was released before the Drive/folder work; an Archive may have
      // committed since. An archived show must not get a marked error / sync_log / admin_alert row.
      if (await readShowArchived_unlocked(tx, driveFileId)) {
        return { outcome: "blocked" as const, code: SHOW_ARCHIVED_IMMUTABLE };
      }
      const isFinalizeOwned = await (
        deps.checkFinalizeOwnership ?? readFinalizeOwnershipGuard_unlocked
      )(tx, driveFileId);
      if (isFinalizeOwned) {
        return { outcome: "blocked" as const, code: FINALIZE_OWNED_SHOW };
      }
      return await markManualDriveError_unlocked(tx, driveFileId, folderResult.kind);
    });
  }

  const watchedFolderId = folderResult.folderId;
  let fileMeta: DriveListedFile;
  try {
    fileMeta = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
  } catch (error) {
    if (!isDriveSourceGone(error)) {
      return await withLock(driveFileId, async (tx) => {
        // DEF-3 (R-impl-1 TOCTOU): re-read archived under THIS recovery lock (preflight lock released).
        if (await readShowArchived_unlocked(tx, driveFileId)) {
          return { outcome: "blocked" as const, code: SHOW_ARCHIVED_IMMUTABLE };
        }
        const isFinalizeOwned = await (
          deps.checkFinalizeOwnership ?? readFinalizeOwnershipGuard_unlocked
        )(tx, driveFileId);
        if (isFinalizeOwned) {
          return { outcome: "blocked" as const, code: FINALIZE_OWNED_SHOW };
        }
        return await markManualDriveError_unlocked(
          tx,
          driveFileId,
          "drive_metadata_fetch_failed",
          error,
        );
      });
    }
    return await withLock(driveFileId, async (tx) => {
      // DEF-3 (R-impl-1 TOCTOU): re-read archived under THIS recovery lock. The preflight archived guard
      // ran under a separate lock that was released before the Drive/folder work; an Archive may have
      // committed since. An archived show must not get a marked error / sync_log / admin_alert row.
      if (await readShowArchived_unlocked(tx, driveFileId)) {
        return { outcome: "blocked" as const, code: SHOW_ARCHIVED_IMMUTABLE };
      }
      const isFinalizeOwned = await (
        deps.checkFinalizeOwnership ?? readFinalizeOwnershipGuard_unlocked
      )(tx, driveFileId);
      if (isFinalizeOwned) {
        return { outcome: "blocked" as const, code: FINALIZE_OWNED_SHOW };
      }
      return await markManualSheetUnavailable_unlocked(
        tx,
        driveFileId,
        STAGED_PARSE_SOURCE_GONE,
        error,
      );
    });
  }

  if (!fileMeta.parents.includes(watchedFolderId)) {
    return await withLock(driveFileId, async (tx) => {
      // DEF-3 (R-impl-1 TOCTOU): re-read archived under THIS recovery lock. The preflight archived guard
      // ran under a separate lock that was released before the Drive/folder work; an Archive may have
      // committed since. An archived show must not get a marked error / sync_log / admin_alert row.
      if (await readShowArchived_unlocked(tx, driveFileId)) {
        return { outcome: "blocked" as const, code: SHOW_ARCHIVED_IMMUTABLE };
      }
      const isFinalizeOwned = await (
        deps.checkFinalizeOwnership ?? readFinalizeOwnershipGuard_unlocked
      )(tx, driveFileId);
      if (isFinalizeOwned) {
        return { outcome: "blocked" as const, code: FINALIZE_OWNED_SHOW };
      }
      return await markManualSheetUnavailable_unlocked(tx, driveFileId, SHEET_UNAVAILABLE);
    });
  }

  const applyResult = await runOne(driveFileId, mode, fileMeta, {
    ...(deps.processDeps ?? {}),
    withShowLock: async (id, fn) =>
      (await withLock(id, async (tx) => {
        // DEF-3: authoritative in-lock archived re-read (an Archive may have landed since preflight).
        if (await readShowArchived_unlocked(tx, driveFileId)) {
          return { outcome: "blocked", code: SHOW_ARCHIVED_IMMUTABLE };
        }
        const isFinalizeOwned = await (
          deps.checkFinalizeOwnership ?? readFinalizeOwnershipGuard_unlocked
        )(tx, driveFileId);
        if (isFinalizeOwned) {
          return { outcome: "blocked", code: FINALIZE_OWNED_SHOW };
        }
        // DEF-3 (R30): manual re-sync overrides auto-suppression — delete any live non-wizard deferral
        // under the lock so processing is not short-circuited by recheckLiveDeferralAfterLock.
        await tx.deleteLiveDeferral?.(driveFileId);
        const result = await fn(tx);
        // Clear the durable publish gate on a clean reconciliation (manual mode re-applies even an
        // unchanged sheet, so "applied" is the clean signal for both changed and unchanged sheets).
        if ("outcome" in result && result.outcome === "applied") {
          await tx.queryOne(
            "update public.shows set requires_resync = false where drive_file_id = $1 returning true as cleared",
            [driveFileId],
          );
          await resolveStaleSyncProblemAlerts_unlocked(tx, result.showId, null);
        }
        if (usesInjectedProcessOneFile && "outcome" in result && result.outcome === "hard_fail") {
          await emitManualParseErrorAlert_unlocked(tx, driveFileId);
        }
        return result;
      })) as ProcessOneFileResult | ConcurrentSyncSkipped,
  });
  // nav-perf tag-caching (Task 5): the apply ran through processOneFile, whose
  // injected withShowLock wraps withPostgresSyncPipelineLock (sql.begin); when
  // `runOne` resolves the apply tx has COMMITTED. Revalidate the show's cache tag
  // HERE — post-commit — never inside the lock callback above (pre-commit). No-op
  // on every non-applied outcome (incl. ConcurrentSyncSkipped, which lacks
  // outcome/showId).
  revalidateOnApplied(applyResult);
  return applyResult;
}
