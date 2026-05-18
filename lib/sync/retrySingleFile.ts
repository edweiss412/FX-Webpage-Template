import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  runOnboardingScan,
  type OnboardingScanResult,
} from "@/lib/sync/runOnboardingScan";
import {
  assertShowLockHeld,
  type ConcurrentSyncSkipped,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";

export type RetrySingleFileTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
};

export type RetrySingleFileResult =
  | { outcome: "retried"; status: "staged" | "live_row_conflict" }
  | { outcome: "retried"; status: "hard_failed"; code: string }
  | { outcome: "not_found"; code: "PENDING_INGESTION_NOT_FOUND" }
  | { outcome: "wizard_superseded"; code: "WIZARD_SESSION_SUPERSEDED" }
  | { outcome: "schema_missing"; code: "WIZARD_ISOLATION_INDEXES_MISSING" };

export type RetrySingleFileDeps = {
  runOnboardingScan?: typeof runOnboardingScan;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
};

type WizardSettingsRow = {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
};

type PendingIngestionRow = {
  drive_file_id: string;
  wizard_session_id: string;
  discovered_during_folder_id: string | null;
  last_error_code: string | null;
};

async function readWizardSettings(
  tx: LockedShowTx<RetrySingleFileTx>,
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

async function readPendingIngestion(
  tx: LockedShowTx<RetrySingleFileTx>,
  driveFileId: string,
  wizardSessionId: string,
): Promise<PendingIngestionRow | null> {
  return await tx.queryOne<PendingIngestionRow | null>(
    `
      select drive_file_id, wizard_session_id, discovered_during_folder_id, last_error_code
        from public.pending_ingestions
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
       for update
    `,
    [driveFileId, wizardSessionId],
  );
}

async function deletePendingIngestion(
  tx: LockedShowTx<RetrySingleFileTx>,
  driveFileId: string,
  wizardSessionId: string,
): Promise<void> {
  await tx.queryOne<{ deleted: boolean } | null>(
    `
      delete from public.pending_ingestions
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
      returning true as deleted
    `,
    [driveFileId, wizardSessionId],
  );
}

function statusFromScan(
  result: OnboardingScanResult,
  driveFileId: string,
  pending: PendingIngestionRow,
): RetrySingleFileResult {
  if (result.outcome === "schema_missing") {
    return { outcome: "schema_missing", code: "WIZARD_ISOLATION_INDEXES_MISSING" };
  }
  if (result.outcome === "superseded") {
    return { outcome: "wizard_superseded", code: "WIZARD_SESSION_SUPERSEDED" };
  }
  const processed = result.processed.find((row) => row.driveFileId === driveFileId);
  if (processed?.outcome === "staged") return { outcome: "retried", status: "staged" };
  if (processed?.outcome === "hard_failed") {
    return {
      outcome: "retried",
      status: "hard_failed",
      code: pending.last_error_code ?? "SYNC_INFRA_ERROR",
    };
  }
  if (processed?.outcome === "live_row_conflict") {
    return { outcome: "retried", status: "live_row_conflict" };
  }
  return { outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" };
}

export async function retrySingleFile_unlocked(
  tx: LockedShowTx<RetrySingleFileTx>,
  driveFileId: string,
  wizardSessionId: string,
  deps: RetrySingleFileDeps = {},
): Promise<RetrySingleFileResult> {
  await assertShowLockHeld(tx, driveFileId);

  const settings = await readWizardSettings(tx);
  if (
    settings.pending_wizard_session_id !== wizardSessionId ||
    settings.pending_folder_id === null
  ) {
    return { outcome: "wizard_superseded", code: "WIZARD_SESSION_SUPERSEDED" };
  }
  const pendingFolderId = settings.pending_folder_id;

  const pending = await readPendingIngestion(tx, driveFileId, wizardSessionId);
  if (
    !pending ||
    pending.discovered_during_folder_id !== pendingFolderId ||
    pending.wizard_session_id !== wizardSessionId
  ) {
    return { outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" };
  }

  const metadata = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
  if (!metadata.parents.includes(pendingFolderId)) {
    return { outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" };
  }
  const scan = await (deps.runOnboardingScan ?? runOnboardingScan)(
    pendingFolderId,
    wizardSessionId,
    {
      listFolder: async () => [metadata],
    },
  );
  const result = statusFromScan(scan, driveFileId, pending);
  if (result.outcome === "retried" && result.status === "staged") {
    await deletePendingIngestion(tx, driveFileId, wizardSessionId);
  }
  return result;
}

export async function retrySingleFile(
  driveFileId: string,
  wizardSessionId: string,
  deps: RetrySingleFileDeps = {},
): Promise<RetrySingleFileResult | ConcurrentSyncSkipped> {
  return await withPostgresSyncPipelineLock(
    driveFileId,
    (tx) => retrySingleFile_unlocked(tx, driveFileId, wizardSessionId, deps),
    { tryOnly: false },
  );
}
