import {
  assertShowLockHeld,
  type ConcurrentSyncSkipped,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import { type SyncPipelineTx, withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import { SHOW_ARCHIVED_IMMUTABLE, readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";
import {
  INVALID_REVIEWER_ACTION,
  PENDING_SYNC_NOT_FOUND,
  WIZARD_SESSION_SUPERSEDED,
} from "@/lib/sync/applyStaged";
import { canonicalize } from "@/lib/email/canonicalize";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

export { INVALID_REVIEWER_ACTION, PENDING_SYNC_NOT_FOUND, WIZARD_SESSION_SUPERSEDED };
export const STALE_DISCARD_REJECTED = "STALE_DISCARD_REJECTED" as const;

export type DiscardVariant = "try_again" | "defer_until_modified" | "permanent_ignore";
type WizardDiscardManifestStatus =
  | "discard_retryable"
  | "defer_until_modified"
  | "permanent_ignore";

export type PendingSyncForDiscard = {
  driveFileId: string;
  driveFileName: string;
  stagedId: string;
  sourceKind: string;
  wizardSessionId: string | null;
  stagedModifiedTime: string;
  priorLastSyncStatus: string | null;
  priorLastSyncError: string | null;
};

type ShowForDiscard = {
  showId: string;
};

type LiveDeferralInput = {
  driveFileId: string;
  deferredKind: "defer_until_modified" | "permanent_ignore";
  deferredAtModifiedTime: string | null;
  deferredByEmail: string;
  reason: string | null;
  wizardSessionId: null;
};

type WizardDeferralInput = Omit<LiveDeferralInput, "wizardSessionId" | "deferredByEmail"> & {
  wizardSessionId: string;
  deferredByEmail: null;
};

export type DiscardStagedArgs =
  | {
      driveFileId: string;
      sourceScope: "live";
      stagedId: string;
      discardedByEmail: string;
      variant?: DiscardVariant;
    }
  | {
      driveFileId: string;
      sourceScope: "wizard";
      wizardSessionId: string;
      stagedId: string;
      variant?: DiscardVariant;
    };

export type DiscardStagedResult =
  | { outcome: "discarded"; variant: DiscardVariant }
  | { outcome: "not_found"; code: typeof PENDING_SYNC_NOT_FOUND }
  | { outcome: "stale"; code: typeof STALE_DISCARD_REJECTED }
  | { outcome: "invalid_request"; code: typeof INVALID_REVIEWER_ACTION }
  | { outcome: "wizard_superseded"; code: typeof WIZARD_SESSION_SUPERSEDED }
  | { outcome: "blocked"; code: typeof SHOW_ARCHIVED_IMMUTABLE };

export type DiscardStagedDeps = {
  readLivePendingSyncForDiscard?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<PendingSyncForDiscard | null>;
  readWizardPendingSyncForDiscard?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    wizardSessionId: string,
  ) => Promise<PendingSyncForDiscard | null>;
  readActiveWizardSession?: (tx: LockedShowTx<SyncPipelineTx>) => Promise<string | null>;
  readShowForDiscard?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<ShowForDiscard | null>;
  restoreShowStatus?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    priorStatus: string | null,
    priorError: string | null,
  ) => Promise<void>;
  deleteLivePendingSync?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    stagedId: string,
  ) => Promise<void>;
  upsertLiveDeferral?: (tx: LockedShowTx<SyncPipelineTx>, row: LiveDeferralInput) => Promise<void>;
  upsertWizardDeferral?: (
    tx: LockedShowTx<SyncPipelineTx>,
    row: WizardDeferralInput,
  ) => Promise<boolean>;
  markWizardManifestDiscarded?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    wizardSessionId: string,
    status: WizardDiscardManifestStatus,
  ) => Promise<boolean>;
  deleteWizardPendingSync?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    wizardSessionId: string,
    stagedId: string,
  ) => Promise<boolean>;
};

async function defaultReadLivePendingSyncForDiscard(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<PendingSyncForDiscard | null> {
  const row = await tx.queryOne<{
    drive_file_id: string;
    staged_id: string;
    source_kind: string;
    wizard_session_id: string | null;
    staged_modified_time: string;
    prior_last_sync_status: string | null;
    prior_last_sync_error: string | null;
    parse_result: { show?: { title?: string } };
  } | null>(
    `
      select drive_file_id, staged_id, source_kind, wizard_session_id,
             staged_modified_time, prior_last_sync_status, prior_last_sync_error,
             parse_result
        from public.pending_syncs
       where drive_file_id = $1
         and wizard_session_id is null
       limit 1
    `,
    [driveFileId],
  );
  if (!row) return null;
  return {
    driveFileId: row.drive_file_id,
    driveFileName: row.parse_result.show?.title ?? row.drive_file_id,
    stagedId: row.staged_id,
    sourceKind: row.source_kind,
    wizardSessionId: row.wizard_session_id,
    stagedModifiedTime: row.staged_modified_time,
    priorLastSyncStatus: row.prior_last_sync_status,
    priorLastSyncError: row.prior_last_sync_error,
  };
}

async function defaultReadShowForDiscard(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<ShowForDiscard | null> {
  const row = await tx.queryOne<{ id: string } | null>(
    `
      select id
        from public.shows
       where drive_file_id = $1
       limit 1
    `,
    [driveFileId],
  );
  return row ? { showId: row.id } : null;
}

async function defaultReadWizardPendingSyncForDiscard(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  wizardSessionId: string,
): Promise<PendingSyncForDiscard | null> {
  const row = await tx.queryOne<{
    drive_file_id: string;
    staged_id: string;
    source_kind: string;
    wizard_session_id: string | null;
    staged_modified_time: string;
    prior_last_sync_status: string | null;
    prior_last_sync_error: string | null;
    parse_result: { show?: { title?: string } };
  } | null>(
    `
      select drive_file_id, staged_id, source_kind, wizard_session_id,
             staged_modified_time, prior_last_sync_status, prior_last_sync_error,
             parse_result
        from public.pending_syncs
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
       limit 1
    `,
    [driveFileId, wizardSessionId],
  );
  if (!row) return null;
  return {
    driveFileId: row.drive_file_id,
    driveFileName: row.parse_result.show?.title ?? row.drive_file_id,
    stagedId: row.staged_id,
    sourceKind: row.source_kind,
    wizardSessionId: row.wizard_session_id,
    stagedModifiedTime: row.staged_modified_time,
    priorLastSyncStatus: row.prior_last_sync_status,
    priorLastSyncError: row.prior_last_sync_error,
  };
}

async function defaultReadActiveWizardSession(
  tx: LockedShowTx<SyncPipelineTx>,
): Promise<string | null> {
  const row = await tx.queryOne<{ pending_wizard_session_id: string | null } | null>(
    "select pending_wizard_session_id from public.app_settings where id = 'default' limit 1",
    [],
  );
  return row?.pending_wizard_session_id ?? null;
}

async function defaultRestoreShowStatus(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  priorStatus: string | null,
  priorError: string | null,
): Promise<void> {
  await tx.queryOne<{ restored: boolean }>(
    `
      update public.shows
         set last_sync_status = $2,
             last_sync_error = $3,
             requires_resync = false
       where drive_file_id = $1
      returning true as restored
    `,
    [driveFileId, priorStatus, priorError],
  );
}

async function defaultDeleteLivePendingSync(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  stagedId: string,
): Promise<void> {
  await tx.queryOne<{ deleted: boolean }>(
    `
      delete from public.pending_syncs
       where drive_file_id = $1
         and staged_id = $2::uuid
         and wizard_session_id is null
      returning true as deleted
    `,
    [driveFileId, stagedId],
  );
}

async function defaultUpsertLiveDeferral(
  tx: LockedShowTx<SyncPipelineTx>,
  row: LiveDeferralInput,
): Promise<void> {
  const deferredByEmail = canonicalize(row.deferredByEmail);
  if (!deferredByEmail) throw new Error("discardStaged: deferredByEmail must be canonicalizable");
  await tx.queryOne<{ upserted: boolean }>(
    `
      insert into public.deferred_ingestions (
        drive_file_id, deferred_kind, deferred_at_modified_time,
        deferred_by_email, reason, wizard_session_id
      )
      values ($1, $2, $3::timestamptz, $4, $5, null)
      on conflict (drive_file_id) where wizard_session_id is null
      do update set
        deferred_kind = excluded.deferred_kind,
        deferred_at_modified_time = excluded.deferred_at_modified_time,
        deferred_by_email = excluded.deferred_by_email,
        reason = excluded.reason,
        deferred_at = now()
      returning true as upserted
    `,
    [row.driveFileId, row.deferredKind, row.deferredAtModifiedTime, deferredByEmail, row.reason],
  );
}

async function defaultUpsertWizardDeferral(
  tx: LockedShowTx<SyncPipelineTx>,
  row: WizardDeferralInput,
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
        deferred_by_email = excluded.deferred_by_email,
        reason = excluded.reason,
        deferred_at = now()
      returning true as upserted
    `,
    [
      row.driveFileId,
      row.deferredKind,
      row.deferredAtModifiedTime,
      row.reason,
      row.wizardSessionId,
    ],
  );
  return Boolean(written?.upserted);
}

async function defaultMarkWizardManifestDiscarded(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  wizardSessionId: string,
  status: WizardDiscardManifestStatus,
): Promise<boolean> {
  const updated = await tx.queryOne<{ updated: boolean } | null>(
    `
      update public.onboarding_scan_manifest
         set status = $3,
             transitioned_at = now()
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as updated
    `,
    [driveFileId, wizardSessionId, status],
  );
  return Boolean(updated?.updated);
}

// F5 Task 5.5 S4: the wizard pending_syncs delete carries the same
// wizard-session currency EXISTS predicate as the deferral upsert and the
// manifest CAS — a supersession visible at its statement time must 0-row the
// delete (the wizard branch throws). Boolean-returning per the R39-1 contract.
async function defaultDeleteWizardPendingSync(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  wizardSessionId: string,
  stagedId: string,
): Promise<boolean> {
  const deleted = await tx.queryOne<{ deleted: boolean } | null>(
    `
      delete from public.pending_syncs
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and staged_id = $3::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as deleted
    `,
    [driveFileId, wizardSessionId, stagedId],
  );
  return Boolean(deleted?.deleted);
}

// F5 Task 5.5: exported for the real-DB race regression
// (tests/onboarding/discardStagedCasRaceDb.test.ts) — the SQL under test must
// be the PRODUCTION default, not a fake.
export {
  defaultUpsertWizardDeferral,
  defaultMarkWizardManifestDiscarded,
  defaultDeleteWizardPendingSync,
};

function depsWithDefaults(deps: DiscardStagedDeps): Required<DiscardStagedDeps> {
  return {
    readLivePendingSyncForDiscard:
      deps.readLivePendingSyncForDiscard ?? defaultReadLivePendingSyncForDiscard,
    readWizardPendingSyncForDiscard:
      deps.readWizardPendingSyncForDiscard ?? defaultReadWizardPendingSyncForDiscard,
    readActiveWizardSession: deps.readActiveWizardSession ?? defaultReadActiveWizardSession,
    readShowForDiscard: deps.readShowForDiscard ?? defaultReadShowForDiscard,
    restoreShowStatus: deps.restoreShowStatus ?? defaultRestoreShowStatus,
    deleteLivePendingSync: deps.deleteLivePendingSync ?? defaultDeleteLivePendingSync,
    upsertLiveDeferral: deps.upsertLiveDeferral ?? defaultUpsertLiveDeferral,
    upsertWizardDeferral: deps.upsertWizardDeferral ?? defaultUpsertWizardDeferral,
    markWizardManifestDiscarded:
      deps.markWizardManifestDiscarded ?? defaultMarkWizardManifestDiscarded,
    deleteWizardPendingSync: deps.deleteWizardPendingSync ?? defaultDeleteWizardPendingSync,
  };
}

export async function discardStaged_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  args: DiscardStagedArgs,
  injectedDeps: DiscardStagedDeps = {},
): Promise<DiscardStagedResult> {
  await assertShowLockHeld(tx, args.driveFileId);

  // DEF-2: refuse mutation of an archived show (re-read under the held lock) before any consumption.
  if (await readShowArchived_unlocked(tx, args.driveFileId)) {
    return { outcome: "blocked", code: SHOW_ARCHIVED_IMMUTABLE };
  }

  const deps = depsWithDefaults(injectedDeps);
  if (args.sourceScope === "wizard") {
    const pending = await deps.readWizardPendingSyncForDiscard(
      tx,
      args.driveFileId,
      args.wizardSessionId,
    );
    if (!pending) return { outcome: "not_found", code: PENDING_SYNC_NOT_FOUND };
    const activeWizardSession = await deps.readActiveWizardSession(tx);
    if (
      activeWizardSession !== args.wizardSessionId ||
      pending.wizardSessionId !== args.wizardSessionId
    ) {
      return { outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED };
    }
    if (pending.stagedId !== args.stagedId) {
      return { outcome: "stale", code: STALE_DISCARD_REJECTED };
    }
    const variant = args.variant ?? "try_again";
    if (variant !== "try_again") {
      const wroteDeferral = await deps.upsertWizardDeferral(tx, {
        driveFileId: pending.driveFileId,
        deferredKind: variant,
        deferredAtModifiedTime:
          variant === "defer_until_modified" ? pending.stagedModifiedTime : null,
        deferredByEmail: null,
        reason: `discard:${variant}`,
        wizardSessionId: args.wizardSessionId,
      });
      if (!wroteDeferral) {
        return { outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED };
      }
    }
    const markedManifest = await deps.markWizardManifestDiscarded(
      tx,
      pending.driveFileId,
      args.wizardSessionId,
      variant === "try_again" ? "discard_retryable" : variant,
    );
    if (!markedManifest) {
      // F5 Task 5.5 S3: for defer/ignore a deferral row was ALREADY written
      // above — a returned outcome would COMMIT it for a retired session (the
      // enclosing withPostgresSyncPipelineLock commits on normal return).
      // THROW so the tx aborts. try_again writes no deferral first, so its
      // manifest miss is pre-mutation → the returned outcome stays (an
      // empty-tx commit is benign — the S1/S2 reasoning).
      if (variant !== "try_again") {
        throw new WizardSessionSupersededRollbackError({
          attemptedAction: "discard",
          supersededSessionId: args.wizardSessionId,
          driveFileId: args.driveFileId,
        });
      }
      return { outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED };
    }
    const deletedPendingSync = await deps.deleteWizardPendingSync(
      tx,
      pending.driveFileId,
      args.wizardSessionId,
      pending.stagedId,
    );
    if (!deletedPendingSync) {
      // F5 Task 5.5 S4: the manifest UPDATE above already executed — a 0-row
      // currency miss here is always post-mutation, for EVERY variant. Throw.
      throw new WizardSessionSupersededRollbackError({
        attemptedAction: "discard",
        supersededSessionId: args.wizardSessionId,
        driveFileId: args.driveFileId,
      });
    }
    return { outcome: "discarded", variant };
  }

  const pending = await deps.readLivePendingSyncForDiscard(tx, args.driveFileId);
  if (!pending) return { outcome: "not_found", code: PENDING_SYNC_NOT_FOUND };
  if (pending.stagedId !== args.stagedId) {
    return { outcome: "stale", code: STALE_DISCARD_REJECTED };
  }

  const variant = args.variant ?? "try_again";
  const show = await deps.readShowForDiscard(tx, args.driveFileId);
  if (show && variant !== "try_again") {
    return { outcome: "invalid_request", code: INVALID_REVIEWER_ACTION };
  }
  if (show) {
    await deps.restoreShowStatus(
      tx,
      pending.driveFileId,
      pending.priorLastSyncStatus,
      pending.priorLastSyncError,
    );
  } else if (variant !== "try_again") {
    await deps.upsertLiveDeferral(tx, {
      driveFileId: pending.driveFileId,
      deferredKind: variant,
      deferredAtModifiedTime:
        variant === "defer_until_modified" ? pending.stagedModifiedTime : null,
      deferredByEmail: args.discardedByEmail,
      reason: `discard:${variant}`,
      wizardSessionId: null,
    });
  }

  await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
  return { outcome: "discarded", variant };
}

export async function discardStaged(
  args: DiscardStagedArgs,
  deps: DiscardStagedDeps = {},
): Promise<DiscardStagedResult | ConcurrentSyncSkipped> {
  return await withPostgresSyncPipelineLock(
    args.driveFileId,
    (tx) => discardStaged_unlocked(tx, args, deps),
    { tryOnly: false },
  );
}

export async function discardStagedParse(
  args: DiscardStagedArgs,
  deps: DiscardStagedDeps = {},
): Promise<DiscardStagedResult | ConcurrentSyncSkipped> {
  return discardStaged(args, deps);
}
