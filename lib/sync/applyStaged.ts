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
  type RoleFlagsNotice,
} from "@/lib/sync/phase2";
import {
  verifyReelOnApply as defaultVerifyReelOnApply,
  type VerifyReelOnApplyResult,
} from "@/lib/sync/verifyReelOnApply";
import {
  STAGED_PARSE_REVISION_RACE,
  type SyncPipelineTx,
  withPostgresSyncPipelineLock,
} from "@/lib/sync/runScheduledCronSync";
import { makeSnapshotAssetsForApply } from "@/lib/sync/defaultSnapshotAssetsForApply";

export const PENDING_SYNC_NOT_FOUND = "PENDING_SYNC_NOT_FOUND" as const;
export const STAGED_PARSE_SUPERSEDED = "STAGED_PARSE_SUPERSEDED" as const;
export const STAGED_PARSE_SOURCE_GONE = "STAGED_PARSE_SOURCE_GONE" as const;
export const STAGED_PARSE_SOURCE_OUT_OF_SCOPE = "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" as const;
export const STAGED_PARSE_OUTDATED = "STAGED_PARSE_OUTDATED" as const;
export const MISSING_REVIEWER_CHOICE = "MISSING_REVIEWER_CHOICE" as const;
export const EXTRA_REVIEWER_CHOICE = "EXTRA_REVIEWER_CHOICE" as const;
export const DUPLICATE_REVIEWER_CHOICE = "DUPLICATE_REVIEWER_CHOICE" as const;
export const INVALID_REVIEWER_ACTION = "INVALID_REVIEWER_ACTION" as const;
export const WIZARD_SESSION_SUPERSEDED = "WIZARD_SESSION_SUPERSEDED" as const;
export const EMBEDDED_RECOVERY_REQUIRES_RESTAGE = "EMBEDDED_RECOVERY_REQUIRES_RESTAGE" as const;
export const SYNC_INFRA_ERROR = "SYNC_INFRA_ERROR" as const;

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

type WizardPendingIngestionInput = LivePendingIngestionInput & {
  wizardSessionId: string;
  pendingFolderId: string | null;
};

type WizardDriveReverify =
  | {
      outcome: "ok";
      metadata: DriveListedFile & { trashed?: boolean };
      pendingFolderId: string | null;
    }
  | {
      outcome: "source_gone";
      code: typeof STAGED_PARSE_SOURCE_GONE;
      pendingFolderId: string | null;
    }
  | {
      outcome: "source_out_of_scope";
      code: typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE;
      pendingFolderId: string | null;
    }
  | {
      outcome: "revision_race";
      code: typeof STAGED_PARSE_REVISION_RACE;
      pendingFolderId: string | null;
    };

type LiveDriveReverify =
  | {
      outcome: "ok";
      metadata: DriveListedFile & { trashed?: boolean };
    }
  | {
      outcome: "source_gone";
      code: typeof STAGED_PARSE_SOURCE_GONE;
    }
  | {
      outcome: "source_out_of_scope";
      code: typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE;
    }
  | {
      outcome: "outdated";
      code: typeof STAGED_PARSE_OUTDATED;
    };

type LiveAssetReviewEffects = {
  parseResult: Phase2Args["parseResult"];
  adminAlertCode: typeof EMBEDDED_RECOVERY_REQUIRES_RESTAGE | null;
  adminAlertCodes?: Array<
    | typeof EMBEDDED_RECOVERY_REQUIRES_RESTAGE
    | "OPENING_REEL_PERMISSION_DENIED"
    | "OPENING_REEL_NOT_VIDEO"
    | "REEL_DRIFTED"
    | "LINKED_ASSET_DRIFTED"
  >;
  skipDiagramsWrite: boolean;
};

type PipelineLock = <R>(
  driveFileId: string,
  fn: (tx: LockedShowTx<SyncPipelineTx>) => Promise<R> | R,
  options?: { tryOnly?: boolean },
) => Promise<R | ConcurrentSyncSkipped>;

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
      adminAlertCode?: typeof EMBEDDED_RECOVERY_REQUIRES_RESTAGE | null;
      adminAlertCodes?: LiveAssetReviewEffects["adminAlertCodes"];
      roleFlagsNotice?: RoleFlagsNotice;
      snapshotRevisionId?: string;
    }
  | { outcome: "not_found"; code: typeof PENDING_SYNC_NOT_FOUND }
  | { outcome: "superseded"; code: typeof STAGED_PARSE_SUPERSEDED }
  | { outcome: "source_gone"; code: typeof STAGED_PARSE_SOURCE_GONE }
  | { outcome: "source_out_of_scope"; code: typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE }
  | { outcome: "outdated"; code: typeof STAGED_PARSE_OUTDATED }
  | { outcome: "revision_race"; code: typeof STAGED_PARSE_REVISION_RACE }
  | {
      outcome: "invalid_request";
      code:
        | typeof MISSING_REVIEWER_CHOICE
        | typeof EXTRA_REVIEWER_CHOICE
        | typeof DUPLICATE_REVIEWER_CHOICE
        | typeof INVALID_REVIEWER_ACTION;
    }
  | { outcome: "infra_error"; code: typeof SYNC_INFRA_ERROR }
  | { outcome: "discarded"; variant: "try_again" }
  | { outcome: "wizard_applied"; wizardSessionId: string; stagedId: string }
  | { outcome: "wizard_superseded"; code: typeof WIZARD_SESSION_SUPERSEDED };

export type ApplyStagedDeps = {
  readLivePendingSyncForApply?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<PendingSyncForApply | null>;
  readWizardPendingSyncForApply?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    wizardSessionId: string,
  ) => Promise<PendingSyncForApply | null>;
  readActiveWizardSession?: (tx: LockedShowTx<SyncPipelineTx>) => Promise<string | null>;
  approveWizardPendingSync?: (
    tx: LockedShowTx<SyncPipelineTx>,
    row: {
      driveFileId: string;
      wizardSessionId: string;
      stagedId: string;
      appliedByEmail: string;
      reviewerChoices: ReviewerChoice[];
    },
  ) => Promise<boolean>;
  markWizardManifestApplied?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    wizardSessionId: string,
  ) => Promise<boolean>;
  upsertWizardPendingIngestion?: (
    tx: LockedShowTx<SyncPipelineTx>,
    row: WizardPendingIngestionInput,
  ) => Promise<boolean>;
  markWizardManifestHardFailed?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    wizardSessionId: string,
  ) => Promise<boolean>;
  readShowForApply?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
  ) => Promise<ShowForApply | null>;
  readWatchedFolderId?: (tx: LockedShowTx<SyncPipelineTx>) => Promise<string | null>;
  readPendingFolderId?: (tx: LockedShowTx<SyncPipelineTx>) => Promise<string | null>;
  fetchDriveFileMetadata?: (
    driveFileId: string,
  ) => Promise<DriveListedFile & { trashed?: boolean }>;
  wizardDriveReverify?: WizardDriveReverify | undefined;
  liveDriveReverify?: LiveDriveReverify | undefined;
  liveAssetReviewEffects?: LiveAssetReviewEffects | undefined;
  verifyReelOnApply?: (
    openingReel: Phase2Args["parseResult"]["openingReel"],
  ) => Promise<VerifyReelOnApplyResult>;
  withPipelineLock?: PipelineLock;
  runPhase2?: (tx: LockedShowTx<SyncPipelineTx>, args: Phase2Args) => Promise<Phase2Result>;
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
  upsertAdminAlert?: (input: {
    showId: string | null;
    code:
      | typeof EMBEDDED_RECOVERY_REQUIRES_RESTAGE
      | "ROLE_FLAGS_NOTICE"
      | "OPENING_REEL_PERMISSION_DENIED"
      | "OPENING_REEL_NOT_VIDEO"
      | "REEL_DRIFTED"
      | "LINKED_ASSET_DRIFTED";
    context: Record<string, unknown>;
  }) => Promise<unknown>;
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

function isValidTimestamp(value: string | null | undefined): boolean {
  return timestampMs(value) !== null;
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

function expectedRenameValue(item: TriggeredReviewItem): string | null {
  if (item.invariant === "MI-12" || item.invariant === "MI-13" || item.invariant === "MI-14") {
    return item.added_name;
  }
  return null;
}

function validateReviewerChoices(
  items: TriggeredReviewItem[],
  choices: ReviewerChoice[],
): { ok: true; choices: ReviewerChoice[] } | ApplyStagedResult {
  const itemIds = new Set(items.map((item) => item.id));
  const byId = new Map<string, ReviewerChoice>();
  for (const choice of choices) {
    if (byId.has(choice.item_id)) {
      return { outcome: "invalid_request", code: DUPLICATE_REVIEWER_CHOICE };
    }
    if (!itemIds.has(choice.item_id)) {
      return { outcome: "invalid_request", code: EXTRA_REVIEWER_CHOICE };
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
    if (choice.action !== "rename" && choice.rename_value !== undefined) {
      return { outcome: "invalid_request", code: INVALID_REVIEWER_ACTION };
    }
    if (choice.action === "rename" && choice.rename_value !== expectedRenameValue(item)) {
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
      (item.invariant === "MI-13-orphan-remove" || item.invariant === "MI-14-orphan-remove") &&
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

async function defaultReadWizardPendingSyncForApply(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  wizardSessionId: string,
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
         and wizard_session_id = $2::uuid
       limit 1
    `,
    [driveFileId, wizardSessionId],
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

async function defaultReadActiveWizardSession(
  tx: LockedShowTx<SyncPipelineTx>,
): Promise<string | null> {
  const row = await tx.queryOne<{ pending_wizard_session_id: string | null } | null>(
    "select pending_wizard_session_id from public.app_settings where id = 'default' limit 1",
    [],
  );
  return row?.pending_wizard_session_id ?? null;
}

async function defaultApproveWizardPendingSync(
  tx: LockedShowTx<SyncPipelineTx>,
  row: Parameters<NonNullable<ApplyStagedDeps["approveWizardPendingSync"]>>[1],
): Promise<boolean> {
  const approved = await tx.queryOne<{ approved: boolean } | null>(
    `
      update public.pending_syncs
         set wizard_approved = true,
             wizard_approved_by_email = $4,
             wizard_approved_at = now(),
             wizard_reviewer_choices = $5::jsonb,
             wizard_reviewer_choices_version = 1
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and staged_id = $3::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as approved
    `,
    [
      row.driveFileId,
      row.wizardSessionId,
      row.stagedId,
      row.appliedByEmail,
      JSON.stringify(row.reviewerChoices),
    ],
  );
  return Boolean(approved?.approved);
}

async function defaultMarkWizardManifestApplied(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  const applied = await tx.queryOne<{ applied: boolean } | null>(
    `
      update public.onboarding_scan_manifest
         set status = 'applied',
             transitioned_at = now()
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as applied
    `,
    [driveFileId, wizardSessionId],
  );
  return Boolean(applied?.applied);
}

async function defaultUpsertWizardPendingIngestion(
  tx: LockedShowTx<SyncPipelineTx>,
  row: WizardPendingIngestionInput,
): Promise<boolean> {
  const upserted = await tx.queryOne<{ upserted: boolean } | null>(
    `
      insert into public.pending_ingestions (
        drive_file_id, drive_file_name, last_error_code, last_error_message,
        last_warnings, wizard_session_id, discovered_during_folder_id,
        last_seen_modified_time
      )
      select $1, $2, $3, $4, $5::jsonb, $6::uuid, $7, $8::timestamptz
      where exists (
        select 1 from public.app_settings
         where id = 'default'
           and pending_wizard_session_id = $6::uuid
      )
      on conflict (drive_file_id, wizard_session_id) where wizard_session_id is not null
      do update set
        drive_file_name = excluded.drive_file_name,
        last_attempt_at = now(),
        attempt_count = public.pending_ingestions.attempt_count + 1,
        last_error_code = excluded.last_error_code,
        last_error_message = excluded.last_error_message,
        last_warnings = excluded.last_warnings,
        discovered_during_folder_id = excluded.discovered_during_folder_id,
        last_seen_modified_time = excluded.last_seen_modified_time
       where public.pending_ingestions.wizard_session_id = $6::uuid
      returning true as upserted
    `,
    [
      row.driveFileId,
      row.driveFileName,
      row.lastErrorCode,
      row.lastErrorMessage,
      JSON.stringify(row.lastWarnings),
      row.wizardSessionId,
      row.pendingFolderId,
      row.lastSeenModifiedTime,
    ],
  );
  return Boolean(upserted?.upserted);
}

async function defaultMarkWizardManifestHardFailed(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  const updated = await tx.queryOne<{ updated: boolean } | null>(
    `
      update public.onboarding_scan_manifest
         set status = 'hard_failed',
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
    [driveFileId, wizardSessionId],
  );
  return Boolean(updated?.updated);
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

async function defaultReadWatchedFolderId(
  tx: LockedShowTx<SyncPipelineTx>,
): Promise<string | null> {
  const row = await tx.queryOne<{ watched_folder_id: string | null } | null>(
    "select watched_folder_id from public.app_settings where id = 'default' limit 1",
    [],
  );
  return row?.watched_folder_id ?? null;
}

async function defaultReadPendingFolderId(
  tx: LockedShowTx<SyncPipelineTx>,
): Promise<string | null> {
  const row = await tx.queryOne<{ pending_folder_id: string | null } | null>(
    "select pending_folder_id from public.app_settings where id = 'default' limit 1",
    [],
  );
  return row?.pending_folder_id ?? null;
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

function driveErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.code === "number") return candidate.code;
  if (typeof candidate.response?.status === "number") return candidate.response.status;
  return null;
}

function isApplySourceGone(error: unknown): boolean {
  const status = driveErrorStatus(error);
  return status === 404 || status === 410;
}

async function restoreDeleteAndIngest(
  tx: LockedShowTx<SyncPipelineTx>,
  pending: PendingSyncForApply,
  show: ShowForApply | null,
  code:
    | typeof STAGED_PARSE_SOURCE_GONE
    | typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE
    | typeof STAGED_PARSE_OUTDATED
    | typeof STAGED_PARSE_SUPERSEDED,
  deps: RequiredPick<
    ApplyStagedDeps,
    "restoreShowStatus" | "upsertLivePendingIngestion" | "deleteLivePendingSync"
  >,
): Promise<void> {
  if (show?.showId) {
    await deps.restoreShowStatus(
      tx,
      pending.driveFileId,
      pending.priorLastSyncStatus,
      pending.priorLastSyncError,
    );
  } else {
    await deps.upsertLivePendingIngestion(tx, {
      driveFileId: pending.driveFileId,
      driveFileName: pending.parseResult.show.title,
      lastErrorCode: code,
      lastErrorMessage: code,
      lastWarnings: pending.parseResult.warnings,
      lastSeenModifiedTime: pending.stagedModifiedTime,
    });
  }
  await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
}

async function recordWizardApplyHardFail(
  tx: LockedShowTx<SyncPipelineTx>,
  pending: PendingSyncForApply,
  reverify: Extract<WizardDriveReverify, { outcome: "source_gone" | "source_out_of_scope" }>,
  deps: RequiredPick<
    ApplyStagedDeps,
    "upsertWizardPendingIngestion" | "markWizardManifestHardFailed"
  >,
): Promise<boolean> {
  if (!pending.wizardSessionId) return false;
  const ingested = await deps.upsertWizardPendingIngestion(tx, {
    driveFileId: pending.driveFileId,
    driveFileName: pending.parseResult.show.title,
    lastErrorCode: reverify.code,
    lastErrorMessage: reverify.code,
    lastWarnings: pending.parseResult.warnings,
    lastSeenModifiedTime: pending.stagedModifiedTime,
    wizardSessionId: pending.wizardSessionId,
    pendingFolderId: reverify.pendingFolderId,
  });
  if (!ingested) return false;
  return await deps.markWizardManifestHardFailed(tx, pending.driveFileId, pending.wizardSessionId);
}

type RequiredPick<T, K extends keyof T> = {
  [P in K]-?: NonNullable<T[P]>;
};

type ApplyStagedDepsWithDefaults = RequiredPick<
  ApplyStagedDeps,
  | "readLivePendingSyncForApply"
  | "readWizardPendingSyncForApply"
  | "readActiveWizardSession"
  | "approveWizardPendingSync"
  | "markWizardManifestApplied"
  | "upsertWizardPendingIngestion"
  | "markWizardManifestHardFailed"
  | "readShowForApply"
  | "readWatchedFolderId"
  | "readPendingFolderId"
  | "fetchDriveFileMetadata"
  | "runPhase2"
  | "insertSyncAudit"
  | "deleteLivePendingSync"
  | "restoreShowStatus"
  | "upsertLivePendingIngestion"
  | "bumpReviewerAuthFloors"
  | "upsertAdminAlert"
  | "retryEmbeddedRevisionAvailability"
  | "verifyReelOnApply"
> & {
  wizardDriveReverify?: WizardDriveReverify;
  liveDriveReverify?: LiveDriveReverify;
  liveAssetReviewEffects?: LiveAssetReviewEffects;
  withPipelineLock?: PipelineLock;
};

function depsWithDefaults(deps: ApplyStagedDeps): ApplyStagedDepsWithDefaults {
  return {
    readLivePendingSyncForApply:
      deps.readLivePendingSyncForApply ?? defaultReadLivePendingSyncForApply,
    readWizardPendingSyncForApply:
      deps.readWizardPendingSyncForApply ?? defaultReadWizardPendingSyncForApply,
    readActiveWizardSession: deps.readActiveWizardSession ?? defaultReadActiveWizardSession,
    approveWizardPendingSync: deps.approveWizardPendingSync ?? defaultApproveWizardPendingSync,
    markWizardManifestApplied: deps.markWizardManifestApplied ?? defaultMarkWizardManifestApplied,
    upsertWizardPendingIngestion:
      deps.upsertWizardPendingIngestion ?? defaultUpsertWizardPendingIngestion,
    markWizardManifestHardFailed:
      deps.markWizardManifestHardFailed ?? defaultMarkWizardManifestHardFailed,
    readShowForApply: deps.readShowForApply ?? defaultReadShowForApply,
    readWatchedFolderId: deps.readWatchedFolderId ?? defaultReadWatchedFolderId,
    readPendingFolderId: deps.readPendingFolderId ?? defaultReadPendingFolderId,
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
    verifyReelOnApply: deps.verifyReelOnApply ?? defaultVerifyReelOnApply,
    ...(deps.wizardDriveReverify ? { wizardDriveReverify: deps.wizardDriveReverify } : {}),
    ...(deps.liveDriveReverify ? { liveDriveReverify: deps.liveDriveReverify } : {}),
    ...(deps.liveAssetReviewEffects ? { liveAssetReviewEffects: deps.liveAssetReviewEffects } : {}),
    ...(deps.withPipelineLock ? { withPipelineLock: deps.withPipelineLock } : {}),
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
  verifyReelOnApply: NonNullable<ApplyStagedDeps["verifyReelOnApply"]>,
): Promise<
  | {
      parseResult: Phase2Args["parseResult"];
      adminAlertCode: typeof EMBEDDED_RECOVERY_REQUIRES_RESTAGE | null;
      adminAlertCodes?: NonNullable<LiveAssetReviewEffects["adminAlertCodes"]>;
      skipDiagramsWrite: boolean;
    }
  | ApplyStagedResult
> {
  const unavailable = pending.triggeredReviewItems.find(
    (
      item,
    ): item is Extract<
      TriggeredReviewItem,
      { invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE" }
    > => item.invariant === "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
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
  const reelVerification = reelDrift
    ? {
        openingReel: null,
        warningCode: "REEL_DRIFTED" as const,
        driftReason: "REVISION_MISMATCH" as const,
      }
    : await verifyReelOnApply(pending.parseResult.openingReel);
  const warnings = [
    ...pending.parseResult.warnings,
    ...(linkedDrift ? [warning("LINKED_ASSET_DRIFTED")] : []),
    ...(reelVerification.warningCode ? [warning(reelVerification.warningCode)] : []),
  ];
  const adminAlertCodes: LiveAssetReviewEffects["adminAlertCodes"] = [
    ...(linkedDrift ? ["LINKED_ASSET_DRIFTED" as const] : []),
    ...(reelVerification.warningCode ? [reelVerification.warningCode] : []),
  ];
  const openingReel = reelVerification.openingReel;
  if (!hasUnavailable) {
    const shouldMintSnapshot = noneFound || linkedDrift;
    if (!shouldMintSnapshot) {
      return {
        parseResult: {
          ...pending.parseResult,
          warnings,
          openingReel,
        },
        adminAlertCode: null,
        adminAlertCodes,
        skipDiagramsWrite: false,
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
      adminAlertCodes,
      skipDiagramsWrite: false,
    };
  }

  if (!show?.showId) {
    return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
  }

  if (unavailable) {
    try {
      await retryEmbeddedRevisionAvailability(unavailable.spreadsheet_id);
    } catch {
      return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
    }
  }

  return {
    parseResult: {
      ...pending.parseResult,
      openingReel,
      diagrams: show?.diagrams as Phase2Args["parseResult"]["diagrams"],
      warnings: [
        ...warnings,
        warning(EMBEDDED_RECOVERY_REQUIRES_RESTAGE),
      ] as Phase2Args["parseResult"]["warnings"],
    },
    adminAlertCode: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
    adminAlertCodes: [EMBEDDED_RECOVERY_REQUIRES_RESTAGE, ...adminAlertCodes],
    skipDiagramsWrite: true,
  };
}

export async function applyStaged_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  args: ApplyStagedArgs,
  injectedDeps: ApplyStagedDeps = {},
): Promise<ApplyStagedResult> {
  await assertShowLockHeld(tx, args.driveFileId);

  const deps = depsWithDefaults(injectedDeps);
  if (args.sourceScope === "wizard") {
    const pending = await deps.readWizardPendingSyncForApply(
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
      return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
    }
    const validation = validateReviewerChoices(pending.triggeredReviewItems, args.reviewerChoices);
    if (!("ok" in validation)) return validation;
    if (deps.wizardDriveReverify && deps.wizardDriveReverify.outcome !== "ok") {
      if (
        deps.wizardDriveReverify.outcome === "source_gone" ||
        deps.wizardDriveReverify.outcome === "source_out_of_scope"
      ) {
        const recovered = await recordWizardApplyHardFail(
          tx,
          pending,
          deps.wizardDriveReverify,
          deps,
        );
        if (!recovered) return { outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED };
        if (deps.wizardDriveReverify.outcome === "source_gone") {
          return { outcome: "source_gone", code: deps.wizardDriveReverify.code };
        }
        return { outcome: "source_out_of_scope", code: deps.wizardDriveReverify.code };
      }
      return { outcome: "revision_race", code: deps.wizardDriveReverify.code };
    }
    const approved = await deps.approveWizardPendingSync(tx, {
      driveFileId: pending.driveFileId,
      wizardSessionId: args.wizardSessionId,
      stagedId: pending.stagedId,
      appliedByEmail: args.appliedByEmail,
      reviewerChoices: validation.choices,
    });
    if (!approved) return { outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED };
    const manifestApplied = await deps.markWizardManifestApplied(
      tx,
      pending.driveFileId,
      args.wizardSessionId,
    );
    if (!manifestApplied) return { outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED };
    return {
      outcome: "wizard_applied",
      wizardSessionId: args.wizardSessionId,
      stagedId: pending.stagedId,
    };
  }

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

  if (!deps.liveDriveReverify) {
    return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
  }
  if (deps.liveDriveReverify.outcome === "source_gone") {
    await restoreDeleteAndIngest(tx, pending, show, deps.liveDriveReverify.code, deps);
    return { outcome: "source_gone", code: deps.liveDriveReverify.code };
  }
  if (deps.liveDriveReverify.outcome === "outdated") {
    await restoreDeleteAndIngest(tx, pending, show, deps.liveDriveReverify.code, deps);
    return { outcome: "outdated", code: deps.liveDriveReverify.code };
  }
  if (deps.liveDriveReverify.outcome === "source_out_of_scope") {
    await restoreDeleteAndIngest(tx, pending, show, deps.liveDriveReverify.code, deps);
    return { outcome: "source_out_of_scope", code: deps.liveDriveReverify.code };
  }

  const metadata = deps.liveDriveReverify.metadata;
  const watchedFolderId = await deps.readWatchedFolderId(tx);
  if (watchedFolderId && !metadata.parents.includes(watchedFolderId)) {
    await restoreDeleteAndIngest(tx, pending, show, STAGED_PARSE_SOURCE_OUT_OF_SCOPE, deps);
    return { outcome: "source_out_of_scope", code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE };
  }

  const validation = validateReviewerChoices(pending.triggeredReviewItems, args.reviewerChoices);
  if (!("ok" in validation)) return validation;
  if (validation.choices.some((choice) => choice.action === "reject")) {
    if (!show?.showId) {
      return { outcome: "invalid_request", code: INVALID_REVIEWER_ACTION };
    }
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
  const assetAdjusted = deps.liveAssetReviewEffects;
  if (!assetAdjusted) return { outcome: "infra_error", code: SYNC_INFRA_ERROR };

  const snapshotAssetsForApply =
    show?.showId && tx.insertPendingSnapshotUpload
      ? makeSnapshotAssetsForApply(
          show.showId,
          tx as Parameters<typeof makeSnapshotAssetsForApply>[1],
        )
      : undefined;
  const phase2 = await deps.runPhase2(tx, {
    driveFileId: pending.driveFileId,
    mode: "manual",
    fileMeta: metadata,
    parseResult: assetAdjusted.parseResult,
    skipDiagramsWrite: assetAdjusted.skipDiagramsWrite,
    ...(snapshotAssetsForApply ? { snapshotAssetsForApply } : {}),
    verifyReelOnApply: false,
    binding: {
      bindingToken: pending.stagedModifiedTime,
      modifiedTime: pending.stagedModifiedTime,
    },
  });
  if (phase2.outcome === "stale") {
    await restoreDeleteAndIngest(tx, pending, show, STAGED_PARSE_SUPERSEDED, deps);
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  await deps.bumpReviewerAuthFloors(tx, phase2.showId, derivedSideEffects.revokeFloorForNames);
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

  const applied: ApplyStagedResult = {
    outcome: "applied",
    showId: phase2.showId,
    syncAuditId,
    derivedSideEffects,
    adminAlertCode: assetAdjusted.adminAlertCode,
    adminAlertCodes: assetAdjusted.adminAlertCodes,
  };
  if (phase2.roleFlagsNotice) applied.roleFlagsNotice = phase2.roleFlagsNotice;
  if (phase2.snapshotRevisionId) applied.snapshotRevisionId = phase2.snapshotRevisionId;
  return applied;
}

type WizardApplyPreflight =
  | {
      outcome: "ok";
      pending: PendingSyncForApply;
      pendingFolderId: string | null;
    }
  | ApplyStagedResult;

type LiveApplyPreflight =
  | {
      outcome: "ok";
      pending: PendingSyncForApply;
      show: ShowForApply | null;
      watchedFolderId: string | null;
    }
  | ApplyStagedResult;

async function readLiveApplyPreflight(
  tx: LockedShowTx<SyncPipelineTx>,
  args: Extract<ApplyStagedArgs, { sourceScope: "live" }>,
  deps: ReturnType<typeof depsWithDefaults>,
): Promise<LiveApplyPreflight> {
  await assertShowLockHeld(tx, args.driveFileId);

  const pending = await deps.readLivePendingSyncForApply(tx, args.driveFileId);
  if (!pending) return { outcome: "not_found", code: PENDING_SYNC_NOT_FOUND };
  if (pending.stagedId !== args.stagedId) {
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  const show = await deps.readShowForApply(tx, args.driveFileId);
  if (!sameTimestamp(show?.lastSeenModifiedTime ?? null, pending.baseModifiedTime)) {
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  const validation = validateReviewerChoices(pending.triggeredReviewItems, args.reviewerChoices);
  if (!("ok" in validation)) return validation;

  const watchedFolderId = await deps.readWatchedFolderId(tx);
  return { outcome: "ok", pending, show, watchedFolderId };
}

async function verifyLiveApplyDriveScope(
  driveFileId: string,
  pending: PendingSyncForApply,
  watchedFolderId: string | null,
  fetchMetadata: NonNullable<ApplyStagedDeps["fetchDriveFileMetadata"]>,
): Promise<LiveDriveReverify | { outcome: "infra_error"; code: typeof SYNC_INFRA_ERROR }> {
  let metadata: DriveListedFile & { trashed?: boolean };
  try {
    metadata = await fetchMetadata(driveFileId);
  } catch (error) {
    if (!isApplySourceGone(error)) {
      return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
    }
    return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE };
  }

  if (isGone(metadata)) {
    return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE };
  }

  if (watchedFolderId && !metadata.parents.includes(watchedFolderId)) {
    return { outcome: "source_out_of_scope", code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE };
  }

  if (!isValidTimestamp(metadata.modifiedTime)) {
    return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
  }

  if (isAfter(metadata.modifiedTime, pending.stagedModifiedTime)) {
    return { outcome: "outdated", code: STAGED_PARSE_OUTDATED };
  }

  return { outcome: "ok", metadata };
}

async function readWizardApplyPreflight(
  tx: LockedShowTx<SyncPipelineTx>,
  args: Extract<ApplyStagedArgs, { sourceScope: "wizard" }>,
  deps: ReturnType<typeof depsWithDefaults>,
): Promise<WizardApplyPreflight> {
  await assertShowLockHeld(tx, args.driveFileId);

  const pending = await deps.readWizardPendingSyncForApply(
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
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  const validation = validateReviewerChoices(pending.triggeredReviewItems, args.reviewerChoices);
  if (!("ok" in validation)) return validation;

  const pendingFolderId = await deps.readPendingFolderId(tx);
  return { outcome: "ok", pending, pendingFolderId };
}

async function verifyWizardApplyDriveScope(
  driveFileId: string,
  pending: PendingSyncForApply,
  pendingFolderId: string | null,
  fetchMetadata: NonNullable<ApplyStagedDeps["fetchDriveFileMetadata"]>,
): Promise<WizardDriveReverify | { outcome: "infra_error"; code: typeof SYNC_INFRA_ERROR }> {
  let metadata: DriveListedFile & { trashed?: boolean };
  try {
    metadata = await fetchMetadata(driveFileId);
  } catch (error) {
    if (!isApplySourceGone(error)) {
      return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
    }
    return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE, pendingFolderId };
  }

  if (isGone(metadata)) {
    return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE, pendingFolderId };
  }

  if (!pendingFolderId || !metadata.parents.includes(pendingFolderId)) {
    return {
      outcome: "source_out_of_scope",
      code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
      pendingFolderId,
    };
  }

  if (!isValidTimestamp(metadata.modifiedTime)) {
    return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
  }

  if (!sameTimestamp(metadata.modifiedTime, pending.stagedModifiedTime)) {
    return { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE, pendingFolderId };
  }

  return { outcome: "ok", metadata, pendingFolderId };
}

async function applyLiveWithDriveReverify(
  args: Extract<ApplyStagedArgs, { sourceScope: "live" }>,
  injectedDeps: ApplyStagedDeps,
): Promise<ApplyStagedResult | ConcurrentSyncSkipped> {
  const deps = depsWithDefaults(injectedDeps);
  const withPipelineLock = deps.withPipelineLock ?? withPostgresSyncPipelineLock;

  const preflight = await withPipelineLock(
    args.driveFileId,
    (tx) => readLiveApplyPreflight(tx, args, deps),
    { tryOnly: false },
  );
  if ("skipped" in preflight || preflight.outcome !== "ok") return preflight;

  const reverify = await verifyLiveApplyDriveScope(
    args.driveFileId,
    preflight.pending,
    preflight.watchedFolderId,
    deps.fetchDriveFileMetadata,
  );
  if (reverify.outcome === "infra_error") return reverify;

  let liveAssetReviewEffects: LiveAssetReviewEffects | undefined;
  if (reverify.outcome === "ok") {
    const assetAdjusted = await applyAssetReviewEffects(
      preflight.pending,
      preflight.show,
      deps.retryEmbeddedRevisionAvailability,
      deps.verifyReelOnApply,
    );
    if (!("parseResult" in assetAdjusted)) return assetAdjusted;
    liveAssetReviewEffects = assetAdjusted;
  }

  return await withPipelineLock(
    args.driveFileId,
    (tx) =>
      applyStaged_unlocked(tx, args, {
        ...injectedDeps,
        liveDriveReverify: reverify,
        ...(liveAssetReviewEffects ? { liveAssetReviewEffects } : {}),
      }),
    { tryOnly: false },
  );
}

async function applyWizardWithDriveReverify(
  args: Extract<ApplyStagedArgs, { sourceScope: "wizard" }>,
  injectedDeps: ApplyStagedDeps,
): Promise<ApplyStagedResult | ConcurrentSyncSkipped> {
  const deps = depsWithDefaults(injectedDeps);
  const withPipelineLock = deps.withPipelineLock ?? withPostgresSyncPipelineLock;

  const preflight = await withPipelineLock(
    args.driveFileId,
    (tx) => readWizardApplyPreflight(tx, args, deps),
    { tryOnly: false },
  );
  if ("skipped" in preflight || preflight.outcome !== "ok") return preflight;

  const reverify = await verifyWizardApplyDriveScope(
    args.driveFileId,
    preflight.pending,
    preflight.pendingFolderId,
    deps.fetchDriveFileMetadata,
  );
  if (reverify.outcome === "infra_error") return reverify;

  return await withPipelineLock(
    args.driveFileId,
    (tx) =>
      applyStaged_unlocked(tx, args, {
        ...injectedDeps,
        wizardDriveReverify: reverify,
      }),
    { tryOnly: false },
  );
}

export async function applyStaged(
  args: ApplyStagedArgs,
  deps: ApplyStagedDeps = {},
): Promise<ApplyStagedResult | ConcurrentSyncSkipped> {
  if (args.sourceScope === "live") {
    const result = await applyLiveWithDriveReverify(args, deps);
    if (!("skipped" in result) && result.outcome === "applied" && result.adminAlertCode) {
      const upsertAdminAlert = deps.upsertAdminAlert ?? defaultUpsertAdminAlert;
      await upsertAdminAlert({
        showId: result.showId,
        code: result.adminAlertCode,
        context: { drive_file_id: args.driveFileId },
      });
    }
    if (!("skipped" in result) && result.outcome === "applied") {
      const upsertAdminAlert = deps.upsertAdminAlert ?? defaultUpsertAdminAlert;
      for (const code of result.adminAlertCodes ?? []) {
        if (code === result.adminAlertCode) continue;
        await upsertAdminAlert({
          showId: result.showId,
          code,
          context: { drive_file_id: args.driveFileId },
        });
      }
    }
    if (!("skipped" in result) && result.outcome === "applied" && result.roleFlagsNotice) {
      const upsertAdminAlert = deps.upsertAdminAlert ?? defaultUpsertAdminAlert;
      await upsertAdminAlert(result.roleFlagsNotice);
    }
    return result;
  }

  if (args.sourceScope === "wizard") {
    return await applyWizardWithDriveReverify(args, deps);
  }
  throw new Error(
    `unsupported Apply source scope: ${(args as { sourceScope: string }).sourceScope}`,
  );
}
