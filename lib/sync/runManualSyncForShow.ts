import postgres from "postgres";
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
  checkFinalizeOwnership?: (driveFileId: string) => Promise<boolean>;
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

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("runManualSyncForShow requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

export async function readFinalizeOwnershipGuard(driveFileId: string): Promise<boolean> {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    const rows = (await sql.unsafe(
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
    )) as Array<{ first_seen_owned: boolean; existing_show_owned: boolean }>;
    const row = rows[0];
    return Boolean(row?.first_seen_owned || row?.existing_show_owned);
  } finally {
    await sql.end({ timeout: 5 });
  }
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
  const isFinalizeOwned = await (deps.checkFinalizeOwnership ?? readFinalizeOwnershipGuard)(
    driveFileId,
  );
  if (isFinalizeOwned) {
    return { outcome: "blocked", code: FINALIZE_OWNED_SHOW };
  }

  const withLock = deps.withPipelineLock ?? ((id, fn) => withPostgresSyncPipelineLock(id, fn));
  return await withLock(driveFileId, (tx) =>
    runManualSyncForShow_unlocked(tx, driveFileId, mode, deps),
  );
}
