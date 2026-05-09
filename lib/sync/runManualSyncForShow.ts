import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  assertShowLockHeld,
  type ConcurrentSyncSkipped,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import {
  processOneFile_unlocked as defaultProcessOneFile_unlocked,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
  type SyncPipelineTx,
  withPostgresSyncPipelineLock,
} from "@/lib/sync/runScheduledCronSync";
import type { SyncMode } from "@/lib/sync/perFileProcessor";

export const FINALIZE_OWNED_SHOW = "FINALIZE_OWNED_SHOW" as const;

export type FinalizeOwnedShowResult = {
  outcome: "blocked";
  code: typeof FINALIZE_OWNED_SHOW;
};

export type ManualSyncResult = ProcessOneFileResult | FinalizeOwnedShowResult;

export type RunManualSyncForShowDeps = {
  checkFinalizeOwnership?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<boolean>;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  processOneFile_unlocked?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    mode: SyncMode,
    fileMeta: DriveListedFile,
    deps?: ProcessOneFileDeps,
  ) => Promise<ProcessOneFileResult>;
  withPipelineLock?: (
    driveFileId: string,
    fn: (tx: LockedShowTx<SyncPipelineTx>) => Promise<ManualSyncResult> | ManualSyncResult,
  ) => Promise<ManualSyncResult | ConcurrentSyncSkipped>;
  processDeps?: ProcessOneFileDeps;
};

async function readFinalizeOwnershipGuard_unlocked(
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

export async function runManualSyncForShow_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode: Extract<SyncMode, "manual"> = "manual",
  deps: RunManualSyncForShowDeps = {},
): Promise<ProcessOneFileResult> {
  await assertShowLockHeld(tx, driveFileId);
  const fileMeta = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
  const runUnlocked = deps.processOneFile_unlocked ?? defaultProcessOneFile_unlocked;
  return await runUnlocked(tx, driveFileId, mode, fileMeta, deps.processDeps ?? {});
}

export async function runManualSyncForShow(
  driveFileId: string,
  mode: Extract<SyncMode, "manual"> = "manual",
  deps: RunManualSyncForShowDeps = {},
): Promise<ManualSyncResult | ConcurrentSyncSkipped> {
  const withLock =
    deps.withPipelineLock ??
    ((id, fn) => withPostgresSyncPipelineLock(id, fn, { tryOnly: false }));
  return await withLock(driveFileId, async (tx) => {
    const isFinalizeOwned = await (deps.checkFinalizeOwnership ??
      readFinalizeOwnershipGuard_unlocked)(tx, driveFileId);
    if (isFinalizeOwned) {
      return { outcome: "blocked", code: FINALIZE_OWNED_SHOW };
    }
    return await runManualSyncForShow_unlocked(tx, driveFileId, mode, deps);
  });
}
