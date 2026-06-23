import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  PostgresOnboardingScanTx,
  prepareOnboardingFiles,
  scanOnboardingPreparedFiles,
  type OnboardingScanResult,
  type OnboardingScanTx,
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
 * Lock#2 finalize phase: interpret the scan result and detect a POST-scan
 * supersession. The scan runs on the SAME locked connection/transaction as this
 * finalize (PostgresOnboardingScanTx on the locked connection — it has NOT
 * committed independently).
 * Asserts the caller holds the show lock. THROWS WizardSessionSupersededRollbackError
 * when the wizard-session currency changed after a staged scan, which ABORTS the
 * enclosing per-show-locked transaction and rolls the scan's staging back with it
 * (no orphan residue, unlike the old separate-connection design); the retry route
 * maps the throw to the typed 409 + WIZARD_SESSION_SUPERSEDED_RACE alert.
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

  // The scan runs on THIS locked transaction (PostgresOnboardingScanTx on holdPort).
  // Any supersession it observes must ABORT the transaction so the scan's already-
  // executed wizard-scoped writes (the pending_ingestion delete + the pending_sync
  // stage) roll back, instead of returning normally and committing them as residue.
  // Two windows:
  //   (a) In-scan supersession — the session flips AFTER the wizard upsert but
  //       BEFORE the manifest write, whose EXISTS guard then 0-rows; runPhase1
  //       reports `superseded` (statusFromScan → wizard_superseded). Returning here
  //       would commit the pre-flip pending_sync stage + pending_ingestion delete.
  //   (b) Post-scan supersession — a clean `staged` result, but the wizard-session
  //       currency changed before finalize; detected by re-reading app_settings.
  // Both throw the typed rollback (the retry route maps it to a 409 +
  // WIZARD_SESSION_SUPERSEDED_RACE alert); the shared locked tx makes it atomic.
  const supersededDuringScan = result.outcome === "wizard_superseded";
  const supersededAfterStage =
    result.outcome === "retried" &&
    result.status === "staged" &&
    (await readWizardSettings(tx)).pending_wizard_session_id !== wizardSessionId;
  if (supersededDuringScan || supersededAfterStage) {
    throw new WizardSessionSupersededRollbackError({
      attemptedAction: "retry",
      supersededSessionId: wizardSessionId,
      driveFileId,
    });
  }
  return result;
}

/**
 * Manual single-file retry. The slow Drive work runs PRE-LOCK; the DB staging and
 * finalize run together UNDER a single pipeline lock so they are atomic with the
 * selected pending-row state:
 *
 *   Lock#1 — retrySingleFilePreflight: validate wizard-session currency +
 *            pending-ingestion provenance and read the pending folder id.
 *   PRE-LOCK — fetch metadata + prepareOnboardingFiles: download + parse. NO lock
 *            is held, so the slow Drive xlsx export never blocks the per-show lock.
 *   Lock#2 — re-preflight (a defer/ignore or supersession that landed during the
 *            Drive window aborts the retry here) → scanOnboardingPreparedFiles on
 *            the SAME locked connection via a wizard-scoped PostgresOnboardingScanTx
 *            bound to the locked tx (holdPort) + a passthrough withShowLock (no
 *            second connection, no second lock) → retrySingleFileFinalize.
 *
 * Two properties fall out of running the scan on the locked connection:
 *   1. No deadlock. The original shape ran the scan on its OWN connection while
 *      the retry held the pipeline lock, so that connection blocked on the SAME
 *      `show:driveFileId` key — a two-connection / one-key deadlock (single-holder
 *      rule, AGENTS.md invariant 2). The inline scan tx reuses the held lock.
 *   2. Serialized against defer/ignore. Those actions take the same show lock, so
 *      a concurrent resolution either commits BEFORE Lock#2 (the re-preflight sees
 *      the pending row gone / superseded and returns early — nothing staged) or
 *      AFTER (it observes the row already removed). The scan no longer commits on
 *      its own connection, so a supersession throw rolls its staging back
 *      atomically (no orphan residue).
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
  const { pendingFolderId } = pre;

  const metadata = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
  if (!metadata.parents.includes(pendingFolderId)) {
    return { outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" };
  }
  const prepared = await (deps.prepareOnboardingFiles ?? prepareOnboardingFiles)(pendingFolderId, {
    listFolder: async () => [metadata],
  });

  return await withPostgresSyncPipelineLock(
    driveFileId,
    async (tx) => {
      // Re-validate UNDER the lock: a defer/ignore or supersession may have
      // resolved this pending row during the (unlocked) Drive window. A
      // resolved/superseded row returns early — nothing is staged.
      const recheck = await retrySingleFilePreflight(tx, driveFileId, wizardSessionId);
      if ("result" in recheck) return recheck.result;
      // Wizard-scoped staging on the LOCKED connection. holdPort() exposes the raw
      // locked tx (it rides the held show lock — no new lock, AGENTS.md invariant 2),
      // and PostgresOnboardingScanTx runs the WIZARD-scoped staging SQL
      // (wizard_session_id-bound pending_syncs / pending_ingestions). An inheriting
      // inline adapter would instead pick up the pipeline tx's LIVE-only staging
      // methods (wizard_session_id null) and silently stage into the wrong partition.
      const port = tx.holdPort?.();
      if (!port) {
        throw new Error(
          "retrySingleFile: locked pipeline tx exposes no holdPort for wizard-scoped staging",
        );
      }
      // Branded as LockedShowTx because it runs on the already-locked connection
      // (the held show lock is reused via the passthrough withShowLock below).
      const scanTx = new PostgresOnboardingScanTx(
        port,
        pendingFolderId,
        wizardSessionId,
      ) as unknown as LockedShowTx<OnboardingScanTx>;
      const scan = await (deps.scanOnboardingPreparedFiles ?? scanOnboardingPreparedFiles)(
        pendingFolderId,
        wizardSessionId,
        prepared,
        { tx: scanTx, withShowLock: async (_driveFileId, fn) => fn(scanTx) },
      );
      return retrySingleFileFinalize(tx, driveFileId, wizardSessionId, scan, recheck.pending);
    },
    { tryOnly: false },
  );
}
