import { randomUUID } from "node:crypto";
import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { getDriveClient } from "@/lib/drive/client";
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import type { TriggeredReviewItem } from "@/lib/parser/types";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import { isStructurallyValidReviewItem } from "@/lib/staging/reviewPayloadGuards";
import { SHOW_ARCHIVED_IMMUTABLE, readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";
import { asParseResult, JsonbCoercionError } from "@/lib/db/coerceJsonbObject";
import {
  assertShowLockHeld,
  type ConcurrentSyncSkipped,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import {
  Phase2GateBypassError,
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
  emitSuccessfulPhase2Tail,
} from "@/lib/sync/runScheduledCronSync";
import { makeSnapshotAssetsForApply } from "@/lib/sync/defaultSnapshotAssetsForApply";
import { canonicalize } from "@/lib/email/canonicalize";
import {
  runOnboardingScan,
  type OnboardingScanTx,
  type RunOnboardingScanDeps,
} from "@/lib/sync/runOnboardingScan";

// F1: the shared staged-apply core (extracted Task 1.1). The moved symbols are re-exported below
// so existing import sites (routes, tests) are untouched.
import {
  applyStagedCore,
  defaultBumpReviewerAuthFloors,
  defaultDeleteLivePendingSync,
  defaultInsertSyncAudit,
  normalizeTimestamptz,
  sameTimestamp,
  timestampMs,
  validateReviewerChoices,
  DUPLICATE_REVIEWER_CHOICE,
  EXTRA_REVIEWER_CHOICE,
  INVALID_REVIEWER_ACTION,
  MISSING_REVIEWER_CHOICE,
  type ReviewerChoice,
  type ShowForApply,
  type Timestampish,
} from "@/lib/sync/applyStagedCore";

export {
  DUPLICATE_REVIEWER_CHOICE,
  EXTRA_REVIEWER_CHOICE,
  INVALID_REVIEWER_ACTION,
  MISSING_REVIEWER_CHOICE,
  validateReviewerChoices,
  type ReviewerChoice,
  type ShowForApply,
};

export const PENDING_SYNC_NOT_FOUND = "PENDING_SYNC_NOT_FOUND" as const;
export const STAGED_PARSE_SUPERSEDED = "STAGED_PARSE_SUPERSEDED" as const;
export const STAGED_PARSE_SOURCE_GONE = "STAGED_PARSE_SOURCE_GONE" as const;
export const STAGED_PARSE_SOURCE_OUT_OF_SCOPE = "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" as const;
export const STAGED_PARSE_OUTDATED = "STAGED_PARSE_OUTDATED" as const;
export const WIZARD_SESSION_SUPERSEDED = "WIZARD_SESSION_SUPERSEDED" as const;
export const EMBEDDED_RECOVERY_REQUIRES_RESTAGE = "EMBEDDED_RECOVERY_REQUIRES_RESTAGE" as const;
export const SYNC_INFRA_ERROR = "SYNC_INFRA_ERROR" as const;
export const STAGED_PARSE_RESTAGED_INLINE = "STAGED_PARSE_RESTAGED_INLINE" as const;
export const STAGED_REVIEW_ITEMS_CORRUPT = "STAGED_REVIEW_ITEMS_CORRUPT" as const;
export const STAGED_PARSE_RESULT_CORRUPT = "STAGED_PARSE_RESULT_CORRUPT" as const;

export type PendingSyncForApply = {
  driveFileId: string;
  stagedId: string;
  sourceKind: "cron" | "push" | "manual" | "onboarding_scan" | string;
  wizardSessionId: string | null;
  baseModifiedTime: string | null;
  stagedModifiedTime: string;
  parseResult: Phase2Args["parseResult"];
  triggeredReviewItems: TriggeredReviewItem[];
  /**
   * True when the stored triggered_review_items jsonb could not be interpreted
   * as a review-item array (corrupt gate). triggeredReviewItems is [] in that
   * case to keep downstream array ops safe, but Apply must REFUSE rather than
   * treat the row as choice-free — see mapPendingSyncRowForApply + the
   * review_items_corrupt guard in applyStaged_unlocked.
   */
  reviewItemsCorrupt: boolean;
  /**
   * True when the stored parse_result jsonb could not be coerced to a usable
   * ParseResult object (genuinely corrupt — NOT a legacy double-encoded scalar,
   * which asParseResult decodes). parseResult is a safe stub in that case; Apply
   * must REFUSE via the parse_result_corrupt guard rather than dereference
   * `.show` on the stub. Mirrors reviewItemsCorrupt; converts what would
   * otherwise be an uncaught JsonbCoercionError at the Apply read boundary into a
   * typed result (Codex R2).
   */
  parseResultCorrupt: boolean;
  priorLastSyncStatus: string | null;
  priorLastSyncError: string | null;
  warningSummary: string;
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
      metadata: DriveListedFile & { trashed?: boolean };
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
    | "EMBEDDED_ASSET_DRIFTED"
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
      outcome: "restaged_inline";
      code: typeof STAGED_PARSE_RESTAGED_INLINE;
      wizardSessionId: string;
      driveFileId: string;
      stagedId: string;
      stagedModifiedTime: string;
    }
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
  | { outcome: "wizard_superseded"; code: typeof WIZARD_SESSION_SUPERSEDED }
  | { outcome: "review_items_corrupt"; code: typeof STAGED_REVIEW_ITEMS_CORRUPT }
  | { outcome: "parse_result_corrupt"; code: typeof STAGED_PARSE_RESULT_CORRUPT }
  | { outcome: "blocked"; code: typeof SHOW_ARCHIVED_IMMUTABLE };

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
  // Task 4.4: applying a FIRST_SEEN_REVIEW staged row (auto-publish was OFF) must reach first-published
  // parity with the auto-publish-ON path — mint the 24h unpublish token + emit SHOW_FIRST_PUBLISHED via
  // the shared emitSuccessfulPhase2Tail chokepoint. Injectable for testing; broad-typed tail deps so the
  // SHOW_FIRST_PUBLISHED alert code is accepted (applyStaged's own upsertAdminAlert is a narrower union).
  emitSuccessfulPhase2Tail?: typeof emitSuccessfulPhase2Tail;
  firstPublishedTailDeps?: Parameters<typeof emitSuccessfulPhase2Tail>[0]["deps"];
  createUnpublishToken?: () => string;
  now?: () => Date;
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
      // F1 Task 1.1 (additive bridge): the shared core always provides applied_at provenance
      // (null → DB default now()); optional here so injected fakes keep compiling.
      appliedAt?: string | null;
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
      | "EMBEDDED_ASSET_DRIFTED";
    context: Record<string, unknown>;
  }) => Promise<unknown>;
  retryEmbeddedRevisionAvailability?: (spreadsheetId: string) => Promise<boolean>;
  runOnboardingScan?: typeof runOnboardingScan;
};

// `Timestampish`/`timestampMs`/`sameTimestamp`/`normalizeTimestamptz` moved to
// lib/sync/applyStagedCore.ts (F1 Task 1.1) and are imported above; the revision-guard
// predicates below stay here (live-caller-level semantics).

/**
 * Exported revision-guard time equality. The Apply revision guard
 * (verifyWizardApplyDriveScope, the inline-restage reverify) compares the live
 * Drive `modifiedTime` against the staged `modifiedTime` to decide whether the
 * sheet was edited between stage and Apply. This is the single predicate those
 * sites call, so the unit contract that pins "a postgres.js Date equals an ISO
 * string for the same sub-second instant, but a real edit does not" pins the
 * exact comparison the guard performs.
 */
export function revisionTimesMatch(left: Timestampish, right: Timestampish): boolean {
  return sameTimestamp(left, right);
}

function isAfter(left: Timestampish, right: Timestampish): boolean {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  return leftMs !== null && rightMs !== null && leftMs > rightMs;
}

function isValidTimestamp(value: Timestampish): boolean {
  return timestampMs(value) !== null;
}

// `validateReviewerChoices` / `deriveAuthSideEffects` / `parseResultSummary` /
// `ASSET_REVIEW_INVARIANTS` / `allowedActions` / `expectedRenameValue` moved to
// lib/sync/applyStagedCore.ts (F1 Task 1.1).

export type PendingSyncForApplyRow = {
  drive_file_id: string;
  staged_id: string;
  source_kind: string;
  wizard_session_id: string | null;
  // postgres.js parses `timestamptz` into a JS `Date`, not an ISO string. The
  // mapper normalizes both to ISO strings; the row type admits the Date so the
  // boundary is honest. (Drive-sourced values arrive as strings.)
  base_modified_time: string | Date | null;
  staged_modified_time: string | Date;
  parse_result: Phase2Args["parseResult"];
  triggered_review_items: unknown;
  prior_last_sync_status: string | null;
  prior_last_sync_error: string | null;
  warning_summary: string;
};

/**
 * Single row→PendingSyncForApply mapping shared by both the live and wizard
 * Apply readers. `triggered_review_items` is coerced here — the Apply READ
 * boundary — for the same reason the render boundary coerces it: a malformed
 * jsonb value (object / double-encoded string / corrupt historical scan data)
 * must not reach validateReviewerChoices (`.map`) or the asset-review
 * `.find`/`.some` paths and 500 the Apply. Exported so the malformed-input
 * case is regression-covered directly against the production read mapping,
 * not only through StagedReviewCard rendering.
 */
export function mapPendingSyncRowForApply(row: PendingSyncForApplyRow): PendingSyncForApply {
  const parsed = parseTriggeredReviewItems(row.triggered_review_items);
  // WM-R6 class-sweep: parseTriggeredReviewItems is an ARRAY-only check that
  // bare-casts elements. A stored malformed ELEMENT (`[null]`, an object missing
  // `id`/`invariant`/per-invariant name fields) passes it and then throws inside
  // validateReviewerChoices (`items.map((item) => item.id)`) or deriveAuthSideEffects'
  // per-invariant name derefs — 500ing the Apply. Element corruption joins the
  // existing fail-closed reviewItemsCorrupt flag (typed STAGED_REVIEW_ITEMS_CORRUPT
  // refusal), the same posture as the shadow-payload gate; the shared element guard
  // lives in lib/staging/reviewPayloadGuards.ts.
  const reviewItemsValid = parsed.ok && parsed.items.every(isStructurallyValidReviewItem);
  // parse_result is jsonb read via postgres.js; a legacy double-encoded row
  // comes back as a STRING SCALAR — asParseResult decodes it. Genuinely-corrupt
  // data (unparseable / missing `.show`) makes asParseResult throw a typed
  // JsonbCoercionError. The Apply routes call applyStaged directly and map result
  // CODES; they don't catch a thrown reader. So, mirroring reviewItemsCorrupt,
  // we convert that failure into a parseResultCorrupt FLAG (with a safe stub) and
  // let the parse_result_corrupt guard return a typed result instead of letting
  // an uncaught exception become an empty 500 (Codex R2 HIGH).
  let parseResult: PendingSyncForApply["parseResult"];
  let parseResultCorrupt = false;
  try {
    parseResult = asParseResult(row.parse_result);
  } catch (error) {
    if (!(error instanceof JsonbCoercionError)) throw error;
    parseResultCorrupt = true;
    parseResult = { show: {} } as PendingSyncForApply["parseResult"];
  }
  return {
    driveFileId: row.drive_file_id,
    stagedId: row.staged_id,
    sourceKind: row.source_kind,
    wizardSessionId: row.wizard_session_id,
    // Normalize postgres.js timestamptz Dates to full-precision ISO strings so
    // the millisecond-exact revision comparison is correct (see normalizeTimestamptz).
    baseModifiedTime: normalizeTimestamptz(row.base_modified_time),
    stagedModifiedTime: normalizeTimestamptz(row.staged_modified_time) as string,
    parseResult,
    parseResultCorrupt,
    triggeredReviewItems: reviewItemsValid ? parsed.items : [],
    reviewItemsCorrupt: !reviewItemsValid,
    priorLastSyncStatus: row.prior_last_sync_status,
    priorLastSyncError: row.prior_last_sync_error,
    warningSummary: row.warning_summary,
  };
}

async function defaultReadLivePendingSyncForApply(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<PendingSyncForApply | null> {
  const row = await tx.queryOne<PendingSyncForApplyRow | null>(
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
  return mapPendingSyncRowForApply(row);
}

async function defaultReadWizardPendingSyncForApply(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  wizardSessionId: string,
): Promise<PendingSyncForApply | null> {
  const row = await tx.queryOne<PendingSyncForApplyRow | null>(
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
  return mapPendingSyncRowForApply(row);
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
  const appliedByEmail = canonicalize(row.appliedByEmail);
  if (!appliedByEmail) throw new Error("applyStaged: appliedByEmail must be canonicalizable");
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
    [row.driveFileId, row.wizardSessionId, row.stagedId, appliedByEmail, row.reviewerChoices],
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
      row.lastWarnings,
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

// `defaultDeleteLivePendingSync` moved to lib/sync/applyStagedCore.ts (F1 Task 1.1).

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
      row.lastWarnings,
      row.lastSeenModifiedTime,
    ],
  );
}

// `defaultInsertSyncAudit` (now with `applied_at = coalesce($11::timestamptz, now())`) and
// `defaultBumpReviewerAuthFloors` moved to lib/sync/applyStagedCore.ts (F1 Task 1.1).

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
  | "runOnboardingScan"
  | "emitSuccessfulPhase2Tail"
  | "createUnpublishToken"
  | "now"
> & {
  wizardDriveReverify?: WizardDriveReverify;
  liveDriveReverify?: LiveDriveReverify;
  liveAssetReviewEffects?: LiveAssetReviewEffects;
  withPipelineLock?: PipelineLock;
  // Optional (test-injectable). When absent, the FIRST_SEEN_REVIEW tail binds the tx-bound
  // upsertAdminAlert (tx.upsertAdminAlert) so the SHOW_FIRST_PUBLISHED alert is written in the SAME
  // transaction as the new show (the standalone service-role writer would FK-fail on the uncommitted show).
  firstPublishedTailDeps?: Parameters<typeof emitSuccessfulPhase2Tail>[0]["deps"];
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
    runOnboardingScan: deps.runOnboardingScan ?? runOnboardingScan,
    emitSuccessfulPhase2Tail: deps.emitSuccessfulPhase2Tail ?? emitSuccessfulPhase2Tail,
    createUnpublishToken: deps.createUnpublishToken ?? randomUUID,
    now: deps.now ?? (() => new Date()),
    // firstPublishedTailDeps is intentionally NOT defaulted here (no tx in scope) — the call site binds
    // the tx-bound upsertAdminAlert when it is absent (adversarial R3 fix).
    ...(deps.firstPublishedTailDeps ? { firstPublishedTailDeps: deps.firstPublishedTailDeps } : {}),
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
    ...(linkedDrift ? [warning("EMBEDDED_ASSET_DRIFTED")] : []),
    ...(reelVerification.warningCode ? [warning(reelVerification.warningCode)] : []),
  ];
  const adminAlertCodes: LiveAssetReviewEffects["adminAlertCodes"] = [
    ...(linkedDrift ? ["EMBEDDED_ASSET_DRIFTED" as const] : []),
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

  // DEF-2: refuse mutation of an archived show (re-read under the held lock) before any consumption.
  if (await readShowArchived_unlocked(tx, args.driveFileId)) {
    return { outcome: "blocked", code: SHOW_ARCHIVED_IMMUTABLE };
  }

  const deps = depsWithDefaults(injectedDeps);
  if (args.sourceScope === "wizard") {
    const pending = await deps.readWizardPendingSyncForApply(
      tx,
      args.driveFileId,
      args.wizardSessionId,
    );
    if (!pending) return { outcome: "not_found", code: PENDING_SYNC_NOT_FOUND };
    if (pending.parseResultCorrupt) {
      return { outcome: "parse_result_corrupt", code: STAGED_PARSE_RESULT_CORRUPT };
    }
    if (pending.reviewItemsCorrupt) {
      return { outcome: "review_items_corrupt", code: STAGED_REVIEW_ITEMS_CORRUPT };
    }
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
  if (pending.parseResultCorrupt) {
    return { outcome: "parse_result_corrupt", code: STAGED_PARSE_RESULT_CORRUPT };
  }
  if (pending.reviewItemsCorrupt) {
    return { outcome: "review_items_corrupt", code: STAGED_REVIEW_ITEMS_CORRUPT };
  }
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

  // P2-F7 — FAIL CLOSED (peer of P2-F6): a LIVE staged parse carrying an MI-11 item must NEVER be
  // applied via this legacy whole-parse path. It would call runPhase2 with NO mi11Items → no
  // sync_holds row, no hold-aware pin → the changed email applies UNGATED, bypassing the identity
  // gate (the milestone's security boundary). MI-11 cannot fire first-seen/wizard (no prior
  // snapshot), so this only guards the live existing-show path. The live staging path is RETIRED;
  // the cutover resets last_seen_modified_time so a residual row is re-processed by the new decision
  // rule (which writes a hold) on the next sync — so failing closed here strands nothing.
  if (pending.triggeredReviewItems.some((item) => item.invariant === "MI-11")) {
    throw new Phase2GateBypassError();
  }

  const assetAdjusted = deps.liveAssetReviewEffects;
  if (!assetAdjusted) return { outcome: "infra_error", code: SYNC_INFRA_ERROR };

  const snapshotAssetsForApply =
    show?.showId && tx.insertPendingSnapshotUpload
      ? makeSnapshotAssetsForApply(
          show.showId,
          tx as Parameters<typeof makeSnapshotAssetsForApply>[1],
        )
      : undefined;

  // Task 4.4 / adversarial R2 fix: a FIRST_SEEN_REVIEW apply (first-seen, no pre-existing show) IS the
  // approval-to-publish. Build the 24h unpublish token ONCE here and thread the SAME object into BOTH
  // runPhase2 (so applyShowSnapshot PERSISTS shows.unpublish_token / _expires_at — the only persistence
  // path) AND emitSuccessfulPhase2Tail below (so the SHOW_FIRST_PUBLISHED notice carries the matching
  // token). Passing it only to the tail emails a rollback link that unpublishShow can't honor (null token).
  const isFirstSeenReviewApply =
    show === null &&
    pending.triggeredReviewItems.some((item) => item.invariant === "FIRST_SEEN_REVIEW");
  const autoPublishFirstSeen = isFirstSeenReviewApply
    ? {
        unpublishToken: (deps.createUnpublishToken ?? randomUUID)(),
        unpublishTokenExpiresAt: new Date(
          (deps.now ?? (() => new Date()))().getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      }
    : undefined;

  // F1 Task 1.1: the dashboard staged Apply is a THIN CALLER of the shared core — the Phase-2
  // apply, floors, audit (with source provenance), and live staged-row delete all run inside
  // applyStagedCore. Caller-level semantics (preflights, reject branch, P2-F7, asset effects,
  // first-published tail) stay here unchanged.
  const coreResult = await applyStagedCore(
    tx,
    {
      sourceScope: "live",
      driveFileId: pending.driveFileId,
      show,
      parseResult: assetAdjusted.parseResult,
      triggeredReviewItems: pending.triggeredReviewItems,
      reviewerChoices: args.reviewerChoices,
      stagedId: pending.stagedId,
      stagedModifiedTime: pending.stagedModifiedTime,
      baseModifiedTime: pending.baseModifiedTime,
      appliedByEmail: args.appliedByEmail,
      appliedAt: null,
      auditSource: "staged_apply",
      fileMeta: metadata,
      mi11Items: [],
      skipDiagramsWrite: assetAdjusted.skipDiagramsWrite,
      // R36-1: today's dashboard apply passes no notableItems → no feed write; parity preserved
      // (D-2 feed semantics for the dashboard staged path are out of F1 scope).
      feedPolicy: { kind: "none" },
      ...(snapshotAssetsForApply ? { snapshotAssetsForApply } : {}),
      ...(autoPublishFirstSeen ? { autoPublishFirstSeen } : {}),
    },
    {
      runPhase2: deps.runPhase2,
      insertSyncAudit: deps.insertSyncAudit,
      bumpReviewerAuthFloors: deps.bumpReviewerAuthFloors,
      deleteLivePendingSync: deps.deleteLivePendingSync,
    },
  );

  if (coreResult.outcome === "invalid_request") return coreResult;
  if (coreResult.outcome === "discarded_by_choice") {
    // Defensive second mapping — the verbatim reject branch above fires first; byte-equal
    // semantics to that branch.
    await deps.restoreShowStatus(
      tx,
      pending.driveFileId,
      pending.priorLastSyncStatus,
      pending.priorLastSyncError,
    );
    await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
    return { outcome: "discarded", variant: "try_again" };
  }
  if (coreResult.outcome === "stale_baseline") {
    // Unreachable in practice behind the early baseline check above; kept for parity.
    await deps.deleteLivePendingSync(tx, pending.driveFileId, pending.stagedId);
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }
  if (coreResult.outcome === "stale_write") {
    await restoreDeleteAndIngest(tx, pending, show, STAGED_PARSE_SUPERSEDED, deps);
    return { outcome: "superseded", code: STAGED_PARSE_SUPERSEDED };
  }

  const applied: ApplyStagedResult = {
    outcome: "applied",
    showId: coreResult.showId,
    syncAuditId: coreResult.syncAuditId,
    derivedSideEffects: coreResult.derivedSideEffects,
    adminAlertCode: assetAdjusted.adminAlertCode,
    adminAlertCodes: assetAdjusted.adminAlertCodes,
  };
  if (coreResult.roleFlagsNotice) applied.roleFlagsNotice = coreResult.roleFlagsNotice;
  if (coreResult.snapshotRevisionId) applied.snapshotRevisionId = coreResult.snapshotRevisionId;

  // Task 4.4: emit SHOW_FIRST_PUBLISHED + reach first-published parity through the shared tail, using the
  // SAME autoPublishFirstSeen token that runPhase2 just PERSISTED to shows.unpublish_token above — so the
  // emailed rollback link and the stored token match (no token-without-persistence).
  if (autoPublishFirstSeen) {
    const tail = deps.emitSuccessfulPhase2Tail ?? emitSuccessfulPhase2Tail;
    await tail({
      tx,
      result: { outcome: "applied", showId: coreResult.showId },
      // R3 fix: write SHOW_FIRST_PUBLISHED through THIS apply tx (via tx.queryOne → upsert_admin_alert
      // RPC) so the alert lands in the SAME transaction as the just-created show. The standalone
      // service-role writer runs on a separate connection and FK-fails on the uncommitted shows.id
      // (admin_alerts.show_id → shows.id), rolling back the whole approval. Pass the context object RAW
      // ($3::jsonb — postgres.js serializes it once; JSON.stringify would double-encode).
      deps: deps.firstPublishedTailDeps ?? {
        upsertAdminAlert: async (input) => {
          const row = await tx.queryOne<{ id: string } | null>(
            "select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id",
            [input.showId, input.code, input.context],
          );
          return row?.id ?? null;
        },
      },
      driveFileId: pending.driveFileId,
      fileMeta: metadata,
      parseResult: assetAdjusted.parseResult,
      autoPublishFirstSeen,
    });
  }
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
  if (pending.parseResultCorrupt) {
    return { outcome: "parse_result_corrupt", code: STAGED_PARSE_RESULT_CORRUPT };
  }
  if (pending.reviewItemsCorrupt) {
    return { outcome: "review_items_corrupt", code: STAGED_REVIEW_ITEMS_CORRUPT };
  }
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
  if (pending.parseResultCorrupt) {
    return { outcome: "parse_result_corrupt", code: STAGED_PARSE_RESULT_CORRUPT };
  }
  if (pending.reviewItemsCorrupt) {
    return { outcome: "review_items_corrupt", code: STAGED_REVIEW_ITEMS_CORRUPT };
  }

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

  if (!revisionTimesMatch(metadata.modifiedTime, pending.stagedModifiedTime)) {
    return {
      outcome: "revision_race",
      code: STAGED_PARSE_REVISION_RACE,
      pendingFolderId,
      metadata,
    };
  }

  return { outcome: "ok", metadata, pendingFolderId };
}

function makeInlineOnboardingScanTx(
  tx: LockedShowTx<SyncPipelineTx>,
): LockedShowTx<OnboardingScanTx> {
  return Object.assign(Object.create(tx), {
    async ensureWizardIsolationIndexes() {
      return { ok: true as const };
    },
    async upsertManifest(row) {
      const written = await tx.queryOne<{ wizard_session_id: string } | null>(
        `
          insert into public.onboarding_scan_manifest (
            folder_id, wizard_session_id, drive_file_id, mime_type, name, status
          )
          select $1, $2::uuid, $3, $4, $5, $6
          where exists (
            select 1 from public.app_settings
             where id = 'default'
               and pending_wizard_session_id = $2::uuid
          )
          on conflict (wizard_session_id, drive_file_id) do update
            set folder_id = excluded.folder_id,
                mime_type = excluded.mime_type,
                name = excluded.name,
                status = excluded.status,
                transitioned_at = now()
          returning wizard_session_id
        `,
        [row.folderId, row.wizardSessionId, row.driveFileId, row.mimeType, row.name, row.status],
      );
      return Boolean(written);
    },
    async logSync(entry) {
      await tx.queryOne<unknown>(
        `
          insert into public.sync_log (drive_file_id, status, message, parse_warnings)
          values ($1, $2, $3, $4::jsonb)
          returning id
        `,
        [
          entry.driveFileId ?? null,
          entry.code,
          `onboarding_scan:${entry.code}`,
          entry.payload ? [{ ...entry.payload, code: entry.code }] : [],
        ],
      );
    },
    async upsertAdminAlert(input) {
      const row = await tx.queryOne<{ id: string } | null>(
        "select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id",
        [input.showId, input.code, input.context],
      );
      return row?.id ?? null;
    },
  } satisfies Pick<
    OnboardingScanTx,
    "ensureWizardIsolationIndexes" | "upsertManifest" | "logSync" | "upsertAdminAlert"
  >) as LockedShowTx<OnboardingScanTx>;
}

async function restageWizardRevisionRaceInline(
  tx: LockedShowTx<SyncPipelineTx>,
  args: Extract<ApplyStagedArgs, { sourceScope: "wizard" }>,
  reverify: Extract<WizardDriveReverify, { outcome: "revision_race" }>,
  deps: ReturnType<typeof depsWithDefaults>,
): Promise<ApplyStagedResult> {
  if (!reverify.pendingFolderId) {
    return { outcome: "source_out_of_scope", code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE };
  }

  const scanTx = makeInlineOnboardingScanTx(tx);
  const metadata = reverify.metadata;
  const scanDeps: RunOnboardingScanDeps = {
    tx: scanTx,
    listFolder: async () => [metadata],
    captureBinding: async () => ({
      bindingToken: metadata.headRevisionId ?? metadata.modifiedTime,
      modifiedTime: metadata.modifiedTime,
    }),
    withShowLock: async (_driveFileId, fn) => fn(scanTx),
  };
  const scan = await (deps.runOnboardingScan ?? runOnboardingScan)(
    reverify.pendingFolderId,
    args.wizardSessionId,
    scanDeps,
  );

  if (scan.outcome === "superseded") {
    return { outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED };
  }
  if (scan.outcome === "schema_missing") {
    return { outcome: "infra_error", code: SYNC_INFRA_ERROR };
  }

  const processed = scan.processed.find((row) => row.driveFileId === args.driveFileId);
  if (!processed || processed.outcome === "hard_failed") {
    return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE };
  }
  if (processed.outcome === "skipped_non_sheet" || processed.outcome === "live_row_conflict") {
    return { outcome: "source_out_of_scope", code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE };
  }

  const fresh = await deps.readWizardPendingSyncForApply(
    tx,
    args.driveFileId,
    args.wizardSessionId,
  );
  if (!fresh) return { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE };
  if (!revisionTimesMatch(fresh.stagedModifiedTime, metadata.modifiedTime)) {
    return { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE };
  }

  return {
    outcome: "restaged_inline",
    code: STAGED_PARSE_RESTAGED_INLINE,
    wizardSessionId: args.wizardSessionId,
    driveFileId: args.driveFileId,
    stagedId: fresh.stagedId,
    stagedModifiedTime: fresh.stagedModifiedTime,
  };
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
    (tx) => {
      if (reverify.outcome === "revision_race") {
        return restageWizardRevisionRaceInline(tx, args, reverify, deps);
      }
      return applyStaged_unlocked(tx, args, {
        ...injectedDeps,
        wizardDriveReverify: reverify,
      });
    },
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

export async function applyStagedParse(
  args: ApplyStagedArgs,
  deps: ApplyStagedDeps = {},
): Promise<ApplyStagedResult | ConcurrentSyncSkipped> {
  return applyStaged(args, deps);
}
