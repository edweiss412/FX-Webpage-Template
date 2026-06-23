import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  prepareOnboardingFiles,
  scanOnboardingPreparedFiles,
  type OnboardingScanResult,
} from "@/lib/sync/runOnboardingScan";
import {
  assertShowLockHeld,
  type ConcurrentSyncSkipped,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

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
  prepareOnboardingFiles?: typeof prepareOnboardingFiles;
  scanOnboardingPreparedFiles?: typeof scanOnboardingPreparedFiles;
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

async function readWizardSettings(tx: LockedShowTx<RetrySingleFileTx>): Promise<WizardSettingsRow> {
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

/**
 * Lock#1 read phase: validate the wizard session is still current and the
 * pending-ingestion row's provenance matches, returning the pending-folder id +
 * row to drive the (pre-lock, in the reordered flow) Drive prepare. Asserts the
 * caller holds the show lock. Returns an early RetrySingleFileResult on
 * supersession / provenance mismatch.
 */
export type RetrySingleFilePreflight =
  | { result: RetrySingleFileResult }
  | { pendingFolderId: string; pending: PendingIngestionRow };

export async function retrySingleFilePreflight(
  tx: LockedShowTx<RetrySingleFileTx>,
  driveFileId: string,
  wizardSessionId: string,
): Promise<RetrySingleFilePreflight> {
  await assertShowLockHeld(tx, driveFileId);

  const settings = await readWizardSettings(tx);
  if (
    settings.pending_wizard_session_id !== wizardSessionId ||
    settings.pending_folder_id === null
  ) {
    return { result: { outcome: "wizard_superseded", code: "WIZARD_SESSION_SUPERSEDED" } };
  }
  const pendingFolderId = settings.pending_folder_id;

  const pending = await readPendingIngestion(tx, driveFileId, wizardSessionId);
  if (
    !pending ||
    pending.discovered_during_folder_id !== pendingFolderId ||
    pending.wizard_session_id !== wizardSessionId
  ) {
    return { result: { outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" } };
  }

  return { pendingFolderId, pending };
}

/**
 * Lock#2 finalize phase: interpret the (already-run, own-connection) scan result
 * and perform the supersession-guarded delete. Asserts the caller holds the show
 * lock. THROWS WizardSessionSupersededRollbackError on a statement-time delete
 * miss so the enclosing per-show-locked transaction ABORTS (the retry route maps
 * it to the typed 409 + WIZARD_SESSION_SUPERSEDED_RACE alert); the scan's OWN
 * committed W1-scoped staging rows are accepted, F4-swept residue (spec §7 R5-2).
 */
export async function retrySingleFileFinalize(
  tx: LockedShowTx<RetrySingleFileTx>,
  driveFileId: string,
  wizardSessionId: string,
  scan: OnboardingScanResult,
  pending: PendingIngestionRow,
): Promise<RetrySingleFileResult> {
  await assertShowLockHeld(tx, driveFileId);
  const result = statusFromScan(scan, driveFileId, pending);
  if (result.outcome === "retried" && result.status === "staged") {
    // The scan already (a) detects a supersession committing DURING staging
    // (returns `superseded`) and (b) deletes the wizard-scoped pending_ingestion
    // on a successful stage (phase1.ts:355). So a supersession that commits in
    // the post-scan window is detected by RE-READING the wizard-session currency
    // here — NOT by re-deleting the pending_ingestion, which the scan has already
    // removed (a 0-row delete would now false-fire). A genuine currency mismatch
    // throws the typed rollback (the retry route maps it to a 409 +
    // WIZARD_SESSION_SUPERSEDED_RACE alert); the scan's staged rows are the
    // accepted F4-swept residue (spec §7 R5-2).
    const settings = await readWizardSettings(tx);
    if (settings.pending_wizard_session_id !== wizardSessionId) {
      throw new WizardSessionSupersededRollbackError({
        attemptedAction: "retry",
        supersededSessionId: wizardSessionId,
        driveFileId,
      });
    }
  }
  return result;
}

/**
 * Manual single-file retry. Three phases, with the slow Drive work BETWEEN two
 * short pipeline-lock windows so the per-show advisory lock is never held across
 * the scan:
 *
 *   Lock#1 — retrySingleFilePreflight: validate wizard-session currency +
 *            pending-ingestion provenance (fast DB reads).
 *   PRE-LOCK — fetch metadata + prepareOnboardingFiles + scanOnboardingPreparedFiles:
 *            download + parse + stage. The scan uses its OWN connection + own
 *            show-lock and commits independently (the R32-1 residue).
 *   Lock#2 — retrySingleFileFinalize: supersession-guarded delete + the typed
 *            WizardSessionSupersededRollbackError throw (mapped to 409 by the route).
 *
 * The old shape ran the scan INSIDE the retry's pipeline lock, so the scan's
 * own-connection show-lock blocked on the SAME `show:driveFileId` key the retry
 * held — a two-connection / one-key deadlock (single-holder rule, AGENTS.md
 * invariant 2). Splitting the scan out of the lock removes the nesting entirely.
 */
export async function retrySingleFile(
  driveFileId: string,
  wizardSessionId: string,
  deps: RetrySingleFileDeps = {},
): Promise<RetrySingleFileResult | ConcurrentSyncSkipped> {
  const pre = await withPostgresSyncPipelineLock(
    driveFileId,
    (tx) => retrySingleFilePreflight(tx, driveFileId, wizardSessionId),
    { tryOnly: false },
  );
  if (typeof pre === "object" && pre !== null && "skipped" in pre) return pre;
  if ("result" in pre) return pre.result;
  const { pendingFolderId, pending } = pre;

  const metadata = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
  if (!metadata.parents.includes(pendingFolderId)) {
    return { outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" };
  }
  const prepared = await (deps.prepareOnboardingFiles ?? prepareOnboardingFiles)(pendingFolderId, {
    listFolder: async () => [metadata],
  });
  const scan = await (deps.scanOnboardingPreparedFiles ?? scanOnboardingPreparedFiles)(
    pendingFolderId,
    wizardSessionId,
    prepared,
    {},
  );

  return await withPostgresSyncPipelineLock(
    driveFileId,
    (tx) => retrySingleFileFinalize(tx, driveFileId, wizardSessionId, scan, pending),
    { tryOnly: false },
  );
}
