import { randomUUID } from "node:crypto";
import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { getDriveClient } from "@/lib/drive/client";
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import type { TriggeredReviewItem } from "@/lib/parser/types";
import {
  assertShowLockHeld,
  type ConcurrentSyncSkipped,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import {
  runPhase2,
  type Phase2Args,
  type Phase2Result,
} from "@/lib/sync/phase2";
import {
  type SyncPipelineTx,
  withPostgresSyncPipelineLock,
} from "@/lib/sync/runScheduledCronSync";

export const PENDING_SYNC_NOT_FOUND = "PENDING_SYNC_NOT_FOUND" as const;
export const STAGED_PARSE_SUPERSEDED = "STAGED_PARSE_SUPERSEDED" as const;
export const STAGED_PARSE_SOURCE_GONE = "STAGED_PARSE_SOURCE_GONE" as const;
export const STAGED_PARSE_SOURCE_OUT_OF_SCOPE = "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" as const;
export const STAGED_PARSE_OUTDATED = "STAGED_PARSE_OUTDATED" as const;
export const MISSING_REVIEWER_CHOICE = "MISSING_REVIEWER_CHOICE" as const;
export const INVALID_REVIEWER_ACTION = "INVALID_REVIEWER_ACTION" as const;
export const WIZARD_SCOPE_NOT_YET_IMPLEMENTED = "WIZARD_SCOPE_NOT_YET_IMPLEMENTED" as const;
export const EMBEDDED_RECOVERY_REQUIRES_RESTAGE = "EMBEDDED_RECOVERY_REQUIRES_RESTAGE" as const;

export type ReviewerChoice = {
  item_id: string;
  action: "apply" | "reject" | "rename" | "independent";
  rename_value?: string;
};

export type PendingSyncForApply = {
  driveFileId: string;
  stagedId: string;
  sourceKind: "cron" | "push" | "manual" | "onboarding_scan" | string;
  wizardSessionId: string | null;
  baseModifiedTime: string | null;
  stagedModifiedTime: string;
  parseResult: Phase2Args["parseResult"];
  triggeredReviewItems: TriggeredReviewItem[];
  priorLastSyncStatus: string | null;
  priorLastSyncError: string | null;
  warningSummary: string;
};

type ShowForApply = {
  showId: string | null;
  lastSeenModifiedTime: string | null;
  diagrams: unknown;
};

type LivePendingIngestionInput = {
  driveFileId: string;
  driveFileName: string;
  lastErrorCode: string;
  lastErrorMessage: string;
  lastWarnings: unknown[];
  lastSeenModifiedTime: string | null;
};

export type ApplyStagedArgs =
  | {
      driveFileId: string;
      sourceScope: "live";
      stagedId: string;
      reviewerChoices: ReviewerChoice[];
      appliedByEmail: string;
    }
  | {
      driveFileId: string;
      sourceScope: "wizard";
      wizardSessionId: string;
      stagedId: string;
      reviewerChoices: ReviewerChoice[];
      appliedByEmail: string;
    };

export type ApplyStagedResult =
  | {
      outcome: "applied";
      showId: string;
      syncAuditId: string | null;
      derivedSideEffects: { revokeFloorForNames: string[] };
    }
  | { outcome: "not_found"; code: typeof PENDING_SYNC_NOT_FOUND }
  | { outcome: "superseded"; code: typeof STAGED_PARSE_SUPERSEDED }
  | { outcome: "source_gone"; code: typeof STAGED_PARSE_SOURCE_GONE }
  | { outcome: "source_out_of_scope"; code: typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE }
  | { outcome: "outdated"; code: typeof STAGED_PARSE_OUTDATED }
  | {
      outcome: "invalid_request";
      code: typeof MISSING_REVIEWER_CHOICE | typeof INVALID_REVIEWER_ACTION;
    }
  | { outcome: "discarded"; variant: "try_again" }
  | { outcome: "wizard_deferred"; code: typeof WIZARD_SCOPE_NOT_YET_IMPLEMENTED };

export type ApplyStagedDeps = {
  readLivePendingSyncForApply?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<PendingSyncForApply | null>;
  readShowForApply?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<ShowForApply | null>;
  readWatchedFolderId?: (tx: LockedShowTx<SyncPipelineTx>) => Promise<string | null>;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile & { trashed?: boolean }>;
  runPhase2?: (
    tx: LockedShowTx<SyncPipelineTx>,
    args: Phase2Args,
  ) => Promise<Phase2Result>;
  insertSyncAudit?: (
    tx: LockedShowTx<SyncPipelineTx>,
    row: {
      showId: string;
      driveFileId: string;
      appliedBy: string;
      stagedId: string;
      triggeredReviewItems: TriggeredReviewItem[];
      reviewerChoices: ReviewerChoice[];
      derivedSideEffects: { revokeFloorForNames: string[] };
      parseResultSummary: Record<string, unknown>;
      baseModifiedTime: string | null;
      stagedModifiedTime: string;
    },
  ) => Promise<string | null>;
  deleteLivePendingSync?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    stagedId: string,
  ) => Promise<void>;
  restoreShowStatus?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    priorStatus: string | null,
    priorError: string | null,
  ) => Promise<void>;
  upsertLivePendingIngestion?: (
    tx: LockedShowTx<SyncPipelineTx>,
    row: LivePendingIngestionInput,
  ) => Promise<void>;
  bumpReviewerAuthFloors?: (
    tx: LockedShowTx<SyncPipelineTx>,
    showId: string,
    names: string[],
  ) => Promise<void>;
  upsertAdminAlert?: (
    input: { showId: string | null; code: typeof EMBEDDED_RECOVERY_REQUIRES_RESTAGE; context: Record<string, unknown> },
  ) => Promise<unknown>;
  retryEmbeddedRevisionAvailability?: (spreadsheetId: string) => Promise<boolean>;
};

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameTimestamp(left: string | null, right: string | null): boolean {
  if (left === null && right === null) return true;
  return timestampMs(left) === timestampMs(right);
}

function isAfter(left: string, right: string): boolean {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  return leftMs !== null && rightMs !== null && leftMs > rightMs;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const ASSET_REVIEW_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
  "REEL_DRIFT_PENDING",
]);

function allowedActions(item: TriggeredReviewItem): Set<ReviewerChoice["action"]> {
  if (ASSET_REVIEW_INVARIANTS.has(item.invariant)) return new Set(["apply"]);
  if (item.invariant === "MI-12") return new Set(["rename", "reject"]);
  if (item.invariant === "MI-13" || item.invariant === "MI-14") {
    return new Set(["rename", "independent"]);
  }
  return new Set(["apply"]);
}

function validateReviewerChoices(
  items: TriggeredReviewItem[],
  choices: ReviewerChoice[],
): { ok: true; choices: ReviewerChoice[] } | ApplyStagedResult {
  const byId = new Map<string, ReviewerChoice>();
  for (const choice of choices) {
    if (byId.has(choice.item_id)) {
      return { outcome: "invalid_request", code: INVALID_REVIEWER_ACTION };
    }
    byId.set(choice.item_id, choice);
  }

  for (const item of items) {
    const choice = byId.get(item.id);
    if (!choice) {
      return { outcome: "invalid_request", code: MISSING_REVIEWER_CHOICE };
    }
    if (!allowedActions(item).has(choice.action)) {
      return { outcome: "invalid_request", code: INVALID_REVIEWER_ACTION };
    }
  }

  for (const choice of choices) {
    if (!items.some((item) => item.id === choice.item_id)) {
      return { outcome: "invalid_request", code: INVALID_REVIEWER_ACTION };
    }
  }

  return { ok: true, choices };
}

function deriveAuthSideEffects(
  items: TriggeredReviewItem[],
  choices: ReviewerChoice[],
): { revokeFloorForNames: string[] } {
  const choiceById = new Map(choices.map((choice) => [choice.item_id, choice]));
  const names: string[] = [];

  for (const item of items) {
    const action = choiceById.get(item.id)?.action;
    if (item.invariant === "MI-11" && action === "apply") {
      names.push(item.crew_name);
    }
    if (item.invariant === "MI-12" && action === "rename") {
      names.push(item.removed_name, item.added_name);
    }
    if (item.invariant === "MI-13" || item.invariant === "MI-14") {
      if (action === "rename") names.push(item.removed_name, item.added_name);
      if (action === "independent") names.push(item.removed_name);
    }
    if (
      (item.invariant === "MI-13-orphan-remove" ||
        item.invariant === "MI-14-orphan-remove") &&
      action === "apply"
    ) {
      names.push(item.removed_name);
    }
  }

  return { revokeFloorForNames: uniqueSorted(names) };
}

function parseResultSummary(parseResult: Phase2Args["parseResult"]): Record<string, unknown> {
  return {
    title: parseResult.show.title,
    crewCount: parseResult.crewMembers.length,
    roomCount: parseResult.rooms.length,
    warningCount: parseResult.warnings.length,
  };
}

async function defaultReadLivePendingSyncForApply(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<PendingSyncForApply | null> {
  const row = await tx.queryOne<{
    drive_file_id: string;
    staged_id: string;
    source_kind: string;
    wizard_session_id: string | null;
    base_modified_time: string | null;
    staged_modified_time: string;
    parse_result: Phase2Args["parseResult"];
    triggered_review_items: TriggeredReviewItem[];
    prior_last_sync_status: string | null;
    prior_last_sync_error: string | null;
    warning_summary: string;
  } | null>(
    `
      select drive_file_id, staged_id, source_kind, wizard_session_id,
             base_modified_time, staged_modified_time, parse_result,
             triggered_review_items, prior_last_sync_status,
             prior_last_sync_error, warning_summary
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
    stagedId: row.staged_id,
    sourceKind: row.source_kind,
    wizardSessionId: row.wizard_session_id,
    baseModifiedTime: row.base_modified_time,
    stagedModifiedTime: row.staged_modified_time,
    parseResult: row.parse_result,
    triggeredReviewItems: row.triggered_review_items,
    priorLastSyncStatus: row.prior_last_sync_status,
    priorLastSyncError: row.prior_last_sync_error,
    warningSummary: row.warning_summary,
  };
}

async function defaultReadShowForApply(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<ShowForApply | null> {
  const row = await tx.queryOne<{
    id: string;
    last_seen_modified_time: string | null;
    diagrams: unknown;
  } | null>(
    `
      select id, last_seen_modified_time, diagrams
        from public.shows
       where drive_file_id = $1
       limit 1
    `,
    [driveFileId],
  );
  if (!row) return { showId: null, lastSeenModifiedTime: null, diagrams: null };
  return {
    showId: row.id,
    lastSeenModifiedTime: row.last_seen_modified_time,
    diagrams: row.diagrams,
  };
}

async function defaultReadWatchedFolderId(tx: LockedShowTx<SyncPipelineTx>): Promise<string | null> {
  const row = await tx.queryOne<{ watched_folder_id: string | null } | null>(
    "select watched_folder_id from public.app_settings where id = 'default' limit 1",
    [],
  );
  return row?.watched_folder_id ?? null;
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
             last_sync_error = $3
       where drive_file_id = $1
      returning true as restored
    `,
    [driveFileId, priorStatus, priorError],
  );
}

async function defaultUpsertLivePendingIngestion(
  tx: LockedShowTx<SyncPipelineTx>,
  row: LivePendingIngestionInput,
): Promise<void> {
  await tx.queryOne<{ upserted: boolean }>(
    `
      insert into public.pending_ingestions (
        drive_file_id, drive_file_name, last_error_code, last_error_message,
        last_warnings, wizard_session_id, last_seen_modified_time
      )
      values ($1, $2, $3, $4, $5::jsonb, null, $6::timestamptz)
      on conflict (drive_file_id) where wizard_session_id is null
      do update set
        drive_file_name = excluded.drive_file_name,
        last_attempt_at = now(),
        attempt_count = public.pending_ingestions.attempt_count + 1,
        last_error_code = excluded.last_error_code,
        last_error_message = excluded.last_error_message,
        last_warnings = excluded.last_warnings,
        last_seen_modified_time = excluded.last_seen_modified_time
      returning true as upserted
    `,
    [
      row.driveFileId,
      row.driveFileName,
      row.lastErrorCode,
      row.lastErrorMessage,
      JSON.stringify(row.lastWarnings),
      row.lastSeenModifiedTime,
    ],
  );
}

async function defaultInsertSyncAudit(
  tx: LockedShowTx<SyncPipelineTx>,
  row: Parameters<NonNullable<ApplyStagedDeps["insertSyncAudit"]>>[1],
): Promise<string | null> {
  const inserted = await tx.queryOne<{ id: string } | null>(
    `
      insert into public.sync_audit (
        show_id, drive_file_id, applied_by, staged_id, triggered_review_items,
        reviewer_choices, derived_side_effects, parse_result_summary,
        base_modified_time, staged_modified_time
      )
      values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6::jsonb, $7::jsonb,
              $8::jsonb, $9::timestamptz, $10::timestamptz)
      returning id
    `,
    [
      row.showId,
      row.driveFileId,
      row.appliedBy,
      row.stagedId,
      JSON.stringify(row.triggeredReviewItems),
      JSON.stringify(row.reviewerChoices),
      JSON.stringify(row.derivedSideEffects),
      JSON.stringify(row.parseResultSummary),
      row.baseModifiedTime,
      row.stagedModifiedTime,
    ],
  );
  return inserted?.id ?? null;
}

async function defaultBumpReviewerAuthFloors(
  tx: LockedShowTx<SyncPipelineTx>,
  showId: string,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;
  await tx.queryOne<{ bumped: boolean }>(
    `
      update public.crew_member_auth
         set revoked_below_version = greatest(revoked_below_version, current_token_version)
       where show_id = $1::uuid
         and crew_name = any($2::text[])
      returning true as bumped
    `,
    [showId, names],
  );
}

function isGone(metadata: DriveListedFile & { trashed?: boolean }): boolean {
  return metadata.trashed === true;
}

async function restoreDeleteAndIngest(
  tx: LockedShowTx<SyncPipelineTx>,
  pending: PendingSyncForApply,
  code: typeof STAGED_PARSE_SOURCE_GONE | typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
  deps: RequiredPick<
    ApplyStagedDeps,
    "restoreShowStatus" | "upsertLivePendingIngestion" | "deleteLivePendingSync"
  >,
): Promise<void> {
  await deps.restoreShowStatus(
    tx,
    pending.driveFileId,
    pending.priorLastSyncStatus,
    pending.priorLastSyncError,
  );
  await deps.upsertLivePendingIngestion(tx, {
    driveFileId: pending.driveFileId,
    driveFileName: pending.parseResult.show.title,
    lastErrorCode: code,
    lastErrorMessage: code,
    lastWarnings: pending.parseResult.warnings,
    lastSeenModifiedTime: pending.stagedModifiedTime,
  });
  await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
}

type RequiredPick<T, K extends keyof T> = {
  [P in K]-?: NonNullable<T[P]>;
};

function depsWithDefaults(deps: ApplyStagedDeps): RequiredPick<
  ApplyStagedDeps,
  | "readLivePendingSyncForApply"
  | "readShowForApply"
  | "readWatchedFolderId"
  | "fetchDriveFileMetadata"
  | "runPhase2"
  | "insertSyncAudit"
  | "deleteLivePendingSync"
  | "restoreShowStatus"
  | "upsertLivePendingIngestion"
  | "bumpReviewerAuthFloors"
  | "retryEmbeddedRevisionAvailability"
> &
  Pick<ApplyStagedDeps, "upsertAdminAlert"> {
  return {
    readLivePendingSyncForApply:
      deps.readLivePendingSyncForApply ?? defaultReadLivePendingSyncForApply,
    readShowForApply: deps.readShowForApply ?? defaultReadShowForApply,
    readWatchedFolderId: deps.readWatchedFolderId ?? defaultReadWatchedFolderId,
    fetchDriveFileMetadata: deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata,
    runPhase2: deps.runPhase2 ?? runPhase2,
    insertSyncAudit: deps.insertSyncAudit ?? defaultInsertSyncAudit,
    deleteLivePendingSync: deps.deleteLivePendingSync ?? defaultDeleteLivePendingSync,
    restoreShowStatus: deps.restoreShowStatus ?? defaultRestoreShowStatus,
    upsertLivePendingIngestion:
      deps.upsertLivePendingIngestion ?? defaultUpsertLivePendingIngestion,
    bumpReviewerAuthFloors: deps.bumpReviewerAuthFloors ?? defaultBumpReviewerAuthFloors,
    upsertAdminAlert: deps.upsertAdminAlert ?? defaultUpsertAdminAlert,
    retryEmbeddedRevisionAvailability:
      deps.retryEmbeddedRevisionAvailability ?? defaultRetryEmbeddedRevisionAvailability,
  };
}

async function defaultRetryEmbeddedRevisionAvailability(spreadsheetId: string): Promise<boolean> {
  const drive = getDriveClient();
  const response = await drive.revisions.list({
    fileId: spreadsheetId,
    fields: "revisions(id)",
  });
  return (response.data.revisions ?? []).some((revision: { id?: string | null }) =>
    Boolean(revision.id),
  );
}

function warning(code: string): Phase2Args["parseResult"]["warnings"][number] {
  return { severity: "warn", code, message: code };
}

async function applyAssetReviewEffects(
  pending: PendingSyncForApply,
  show: ShowForApply | null,
  retryEmbeddedRevisionAvailability: (spreadsheetId: string) => Promise<boolean>,
): Promise<{ parseResult: Phase2Args["parseResult"]; adminAlertCode: typeof EMBEDDED_RECOVERY_REQUIRES_RESTAGE | null }> {
  const unavailable = pending.triggeredReviewItems.find(
    (item): item is Extract<TriggeredReviewItem, { invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE" }> =>
      item.invariant === "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  );
  const noneFound = pending.triggeredReviewItems.some(
    (item) => item.invariant === "DIAGRAMS_EMBEDDED_NONE_FOUND",
  );
  const linkedDrift = pending.triggeredReviewItems.some(
    (item) => item.invariant === "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
  );
  const reelDrift = pending.triggeredReviewItems.some(
    (item) => item.invariant === "REEL_DRIFT_PENDING",
  );
  const hasUnavailable = Boolean(unavailable);
  if (!hasUnavailable) {
    const shouldMintSnapshot = noneFound || linkedDrift;
    const warnings = [
      ...pending.parseResult.warnings,
      ...(linkedDrift ? [warning("LINKED_ASSET_DRIFTED")] : []),
      ...(reelDrift ? [warning("REEL_DRIFTED")] : []),
    ];
    const openingReel = reelDrift ? null : pending.parseResult.openingReel;
    if (!shouldMintSnapshot) {
      return {
        parseResult: {
          ...pending.parseResult,
          warnings,
          openingReel,
        },
        adminAlertCode: null,
      };
    }
    return {
      parseResult: {
        ...pending.parseResult,
        warnings,
        openingReel,
        diagrams: {
          linkedFolder: noneFound ? null : pending.parseResult.diagrams.linkedFolder,
          embeddedImages: noneFound ? [] : pending.parseResult.diagrams.embeddedImages,
          linkedFolderItems: noneFound
            ? []
            : pending.parseResult.diagrams.linkedFolderItems.map((item) => ({
                ...item,
                snapshotPath: item.snapshotPath ?? null,
              })),
          snapshot_revision_id: randomUUID(),
          snapshot_status: linkedDrift ? "partial_failure" : "complete",
        } as Phase2Args["parseResult"]["diagrams"],
      },
      adminAlertCode: null,
    };
  }

  if (unavailable && (await retryEmbeddedRevisionAvailability(unavailable.spreadsheet_id))) {
    return {
      parseResult: {
        ...pending.parseResult,
        diagrams: {
          ...pending.parseResult.diagrams,
          snapshot_revision_id: randomUUID(),
          snapshot_status: "complete",
        } as Phase2Args["parseResult"]["diagrams"],
      },
      adminAlertCode: null,
    };
  }

  return {
    parseResult: {
      ...pending.parseResult,
      diagrams: show?.diagrams as Phase2Args["parseResult"]["diagrams"],
      warnings: [
        ...pending.parseResult.warnings,
        warning(EMBEDDED_RECOVERY_REQUIRES_RESTAGE),
      ] as Phase2Args["parseResult"]["warnings"],
    },
    adminAlertCode: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
  };
}

export async function applyStaged_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  args: ApplyStagedArgs,
  injectedDeps: ApplyStagedDeps = {},
): Promise<ApplyStagedResult> {
  await assertShowLockHeld(tx, args.driveFileId);

  // wizard-scope deferred to 6.8 coda
  if (args.sourceScope === "wizard") {
    return { outcome: "wizard_deferred", code: WIZARD_SCOPE_NOT_YET_IMPLEMENTED };
  }

  const deps = depsWithDefaults(injectedDeps);
  const pending = await deps.readLivePendingSyncForApply(tx, args.driveFileId);
  if (!pending) return { outcome: "not_found", code: PENDING_SYNC_NOT_FOUND };
  if (pending.stagedId !== args.stagedId) {
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  const show = await deps.readShowForApply(tx, args.driveFileId);
  if (!sameTimestamp(show?.lastSeenModifiedTime ?? null, pending.baseModifiedTime)) {
    await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  let metadata: DriveListedFile & { trashed?: boolean };
  try {
    metadata = await deps.fetchDriveFileMetadata(args.driveFileId);
  } catch {
    await restoreDeleteAndIngest(tx, pending, STAGED_PARSE_SOURCE_GONE, deps);
    return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE };
  }
  if (isGone(metadata)) {
    await restoreDeleteAndIngest(tx, pending, STAGED_PARSE_SOURCE_GONE, deps);
    return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE };
  }

  const watchedFolderId = await deps.readWatchedFolderId(tx);
  if (watchedFolderId && !metadata.parents.includes(watchedFolderId)) {
    await restoreDeleteAndIngest(tx, pending, STAGED_PARSE_SOURCE_OUT_OF_SCOPE, deps);
    return { outcome: "source_out_of_scope", code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE };
  }

  if (isAfter(metadata.modifiedTime, pending.stagedModifiedTime)) {
    await deps.restoreShowStatus(
      tx,
      pending.driveFileId,
      pending.priorLastSyncStatus,
      pending.priorLastSyncError,
    );
    await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
    return { outcome: "outdated", code: STAGED_PARSE_OUTDATED };
  }

  const validation = validateReviewerChoices(pending.triggeredReviewItems, args.reviewerChoices);
  if (!("ok" in validation)) return validation;
  if (validation.choices.some((choice) => choice.action === "reject")) {
    await deps.restoreShowStatus(
      tx,
      pending.driveFileId,
      pending.priorLastSyncStatus,
      pending.priorLastSyncError,
    );
    await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
    return { outcome: "discarded", variant: "try_again" };
  }
  const derivedSideEffects = deriveAuthSideEffects(
    pending.triggeredReviewItems,
    validation.choices,
  );
  const assetAdjusted = await applyAssetReviewEffects(
    pending,
    show,
    deps.retryEmbeddedRevisionAvailability,
  );

  const phase2 = await deps.runPhase2(tx, {
    driveFileId: pending.driveFileId,
    mode: "manual",
    fileMeta: metadata,
    parseResult: assetAdjusted.parseResult,
    binding: {
      bindingToken: pending.stagedModifiedTime,
      modifiedTime: pending.stagedModifiedTime,
    },
  });
  if (phase2.outcome === "stale") {
    await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  await deps.bumpReviewerAuthFloors(
    tx,
    phase2.showId,
    derivedSideEffects.revokeFloorForNames,
  );
  if (assetAdjusted.adminAlertCode) {
    await deps.upsertAdminAlert?.({
      showId: phase2.showId,
      code: assetAdjusted.adminAlertCode,
      context: { drive_file_id: pending.driveFileId },
    });
  }
  const syncAuditId = await deps.insertSyncAudit(tx, {
    showId: phase2.showId,
    driveFileId: pending.driveFileId,
    appliedBy: args.appliedByEmail,
    stagedId: pending.stagedId,
    triggeredReviewItems: pending.triggeredReviewItems,
    reviewerChoices: validation.choices,
    derivedSideEffects,
    parseResultSummary: parseResultSummary(assetAdjusted.parseResult),
    baseModifiedTime: pending.baseModifiedTime,
    stagedModifiedTime: pending.stagedModifiedTime,
  });
  await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);

  return {
    outcome: "applied",
    showId: phase2.showId,
    syncAuditId,
    derivedSideEffects,
  };
}

export async function applyStaged(
  args: ApplyStagedArgs,
  deps: ApplyStagedDeps = {},
): Promise<ApplyStagedResult | ConcurrentSyncSkipped> {
  return await withPostgresSyncPipelineLock(
    args.driveFileId,
    (tx) => applyStaged_unlocked(tx, args, deps),
    { tryOnly: false },
  );
}
