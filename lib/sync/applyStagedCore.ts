import { canonicalize } from "@/lib/email/canonicalize";
import type { DriveListedFile } from "@/lib/drive/list";
import type { TriggeredReviewItem } from "@/lib/parser/types";
import { assertShowLockHeld, type LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { Mi11Item } from "@/lib/sync/holds/writeMi11Holds";
import {
  runPhase2 as defaultRunPhase2,
  type Phase2Args,
  type Phase2Result,
  type RoleFlagsNotice,
} from "@/lib/sync/phase2";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

/**
 * F1 — the shared "apply a staged parse_result with reviewer choices under an ALREADY-HELD
 * per-show advisory lock" core, extracted from `lib/sync/applyStaged.ts` so the wizard finalize
 * writers (Phase B first-seen, Phase D existing-show) and the dashboard staged Apply all run the
 * SAME Phase-2 apply (children + shows_internal + auth-contract calls + audit). The core NEVER
 * acquires a lock — it adopts the caller's via the pg_locks ownership probe (spec §3.3,
 * single-holder rule; holder topology pinned by tests/auth/advisoryLockRpcDeadlock.test.ts).
 */

// Result-code provenance (AC-X.2 internal-code-enum manifest): these reviewer-choice refusal
// codes moved here from applyStaged.ts, which sits on the staged_parse apply surface alongside
// the pending_ingestions / admin_alerts writers — the extraction classification
// (scripts/extract-internal-code-enums.ts content gates) is unchanged by the F1 move.
export const MISSING_REVIEWER_CHOICE = "MISSING_REVIEWER_CHOICE" as const;
export const EXTRA_REVIEWER_CHOICE = "EXTRA_REVIEWER_CHOICE" as const;
export const DUPLICATE_REVIEWER_CHOICE = "DUPLICATE_REVIEWER_CHOICE" as const;
export const INVALID_REVIEWER_ACTION = "INVALID_REVIEWER_ACTION" as const;

export type ReviewerChoice = {
  item_id: string;
  action: "apply" | "reject" | "rename" | "independent";
  rename_value?: string;
};

export type ShowForApply = {
  showId: string | null;
  lastSeenModifiedTime: string | null;
  diagrams: unknown;
};

/**
 * A `Timestampish` is whatever a timestamp value can be at the read boundary.
 * The DB layer is postgres.js, which parses `timestamptz` columns into JS
 * `Date` objects, NOT ISO strings — even though the row types here say
 * `string`. Drive metadata, by contrast, arrives as ISO strings. Comparison
 * helpers must accept both without losing precision.
 *
 * The original `timestampMs` only accepted strings and ran `Date.parse(value)`.
 * When fed a `Date` (a postgres.js timestamptz), `Date.parse` coerces it via
 * `toString()` — which DROPS the milliseconds — so a Date staged time
 * ".040" became ".000" and never equalled the millisecond-exact Drive ISO
 * string. That mis-compare produced a deterministic false revision race on
 * unedited sheets (M12 Phase 0.F smoke 3, 4th onboarding defect). Handling
 * `Date` via `getTime()` preserves the milliseconds.
 */
export type Timestampish = string | Date | null | undefined;

export function timestampMs(value: Timestampish): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sameTimestamp(left: Timestampish, right: Timestampish): boolean {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  if (leftMs === null && rightMs === null) return true;
  return leftMs === rightMs;
}

/**
 * Normalize a timestamptz value read from the DB (postgres.js `Date`) to a
 * full-precision ISO string at the read boundary, so the `string` row/field
 * types are honest and every downstream consumer (millisecond-exact revision
 * comparison, the `bindingToken`/`modifiedTime` string passed to the live
 * reverify, the value echoed back to the client) gets a real string. A value
 * that is already a string is returned unchanged; `null` stays `null`.
 */
export function normalizeTimestamptz(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export const ASSET_REVIEW_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
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

export type ReviewerChoiceValidationError = {
  outcome: "invalid_request";
  code:
    | typeof MISSING_REVIEWER_CHOICE
    | typeof EXTRA_REVIEWER_CHOICE
    | typeof DUPLICATE_REVIEWER_CHOICE
    | typeof INVALID_REVIEWER_ACTION;
};

export function validateReviewerChoices(
  items: TriggeredReviewItem[],
  choices: ReviewerChoice[],
): { ok: true; choices: ReviewerChoice[] } | ReviewerChoiceValidationError {
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

export function deriveAuthSideEffects(
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

export function parseResultSummary(
  parseResult: Phase2Args["parseResult"],
): Record<string, unknown> {
  return {
    title: parseResult.show.title,
    crewCount: parseResult.crewMembers.length,
    roomCount: parseResult.rooms.length,
    warningCount: parseResult.warnings.length,
  };
}

/**
 * R24-2 / R33-2: choice-aware feed-input constructor — the ONLY way feed `notableItems` are
 * derived inside the core (callers cannot inject raw items; R36-1). The live feed writer
 * (`lib/sync/changeLog/writeAutoApplyChanges.ts:42-50`) derives a `crew_renamed` row from EVERY
 * MI-12/13/14 item, which would mislabel an `independent` choice (independent = remove+add, not
 * a rename). So: items resolved `reject` are excluded entirely (defensive — the core discards
 * before any apply when a reject is present); items resolved `independent` are DROPPED from the
 * feed inputs so the writer derives crew_removed + crew_added from the actual crew diff (its
 * remove+add form). Everything else passes through unchanged.
 */
export function choiceAwareFeedItems(
  items: TriggeredReviewItem[],
  choices: ReviewerChoice[],
): TriggeredReviewItem[] {
  const actionById = new Map(choices.map((choice) => [choice.item_id, choice.action]));
  return items.filter((item) => {
    const action = actionById.get(item.id);
    if (action === "reject") return false;
    if (action === "independent") return false;
    return true;
  });
}

export type SyncAuditRow = {
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
  /** null/absent → DB default now() (sync_audit.applied_at, internal_and_admin.sql:208). */
  appliedAt?: string | null;
};

export async function defaultInsertSyncAudit(
  tx: LockedShowTx<SyncPipelineTx>,
  row: SyncAuditRow,
): Promise<string | null> {
  const appliedBy = canonicalize(row.appliedBy);
  if (!appliedBy) throw new Error("applyStaged: sync audit appliedBy must be canonicalizable");
  const inserted = await tx.queryOne<{ id: string } | null>(
    `
      insert into public.sync_audit (
        show_id, drive_file_id, applied_by, staged_id, triggered_review_items,
        reviewer_choices, derived_side_effects, parse_result_summary,
        base_modified_time, staged_modified_time, applied_at
      )
      values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6::jsonb, $7::jsonb,
              $8::jsonb, $9::timestamptz, $10::timestamptz,
              coalesce($11::timestamptz, now()))
      returning id
    `,
    [
      row.showId,
      row.driveFileId,
      appliedBy,
      row.stagedId,
      row.triggeredReviewItems,
      row.reviewerChoices,
      row.derivedSideEffects,
      row.parseResultSummary,
      row.baseModifiedTime,
      row.stagedModifiedTime,
      row.appliedAt ?? null,
    ],
  );
  return inserted?.id ?? null;
}

export async function defaultBumpReviewerAuthFloors(
  tx: LockedShowTx<SyncPipelineTx>,
  showId: string,
  names: string[],
): Promise<void> {
  void tx;
  void showId;
  void names;
}

export async function defaultDeleteLivePendingSync(
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

/**
 * Wizard-scoped tx wrapper: a wizard apply must NEVER touch the LIVE partition. The
 * `ApplyParseResultTx` contract calls `deleteLivePendingIngestion` unconditionally
 * (applyParseResult.ts:131) — for a wizard finalize that would erase an operator-visible live
 * failure record for the same drive_file_id (spec §3.2). Override it to a no-op via the
 * `makeInlineOnboardingScanTx` precedent (applyStaged.ts Object.create prototype override).
 */
export function withWizardScopedLivePartitionOps(
  tx: LockedShowTx<SyncPipelineTx>,
): LockedShowTx<SyncPipelineTx> {
  return Object.assign(Object.create(tx) as LockedShowTx<SyncPipelineTx>, {
    async deleteLivePendingIngestion() {
      // wizard no-op — live partition untouched (spec §3.2)
    },
  });
}

/**
 * Task 1.2 classification registry: every live-partition lifecycle op on the apply surface,
 * classified live-vs-wizard per spec §3.2. The rg class enumeration (re-run 2026-06-11 against
 * this worktree):
 *
 *   rg -n "pending_syncs|pending_ingestions|deferred_ingestions|admin_alerts" \
 *     lib/sync/applyStagedCore.ts lib/sync/applyParseResult.ts lib/sync/applyStaged.ts \
 *     lib/sync/phase2.ts lib/sync/runScheduledCronSync.ts
 *
 * `deferred_ingestions`: zero statements on the apply surface (the only wizard-side writer is the
 * retry route; the live reader is `readLiveDeferral`, perFileProcessor.ts) — classified N/A for
 * the core; the Task 1.7 registry walker asserts the absence.
 *
 * Caller-level rows (reachableFromCore: false) record WHY the core does not own the op — the
 * Task 1.7 meta-test (tests/sync/_livePartitionClassificationContract.test.ts) walks this table
 * and pins that the core's source never references those symbols.
 */
export type LivePartitionClassificationRow = {
  op: string;
  site: string;
  reachableFromCore: boolean;
  class: "live-only" | "wizard-only";
  wizardBehavior: string;
};

export const LIVE_PARTITION_CLASSIFICATION: ReadonlyArray<LivePartitionClassificationRow> = [
  {
    op: "deleteLivePendingIngestion",
    site: "ApplyParseResultTx contract applyParseResult.ts:41, called unconditionally :131; impl runScheduledCronSync.ts:649-658 (wizard_session_id is null)",
    reachableFromCore: true, // via runPhase2 → applyParseResult
    class: "live-only",
    wizardBehavior: "no-op via withWizardScopedLivePartitionOps (core step 6)",
  },
  {
    op: "deleteLivePendingSync",
    site: "defaultDeleteLivePendingSync, lib/sync/applyStagedCore.ts (moved here in T1.1; live pending_syncs DELETE, wizard_session_id is null — spec step 6L)",
    reachableFromCore: true, // core step 11
    class: "live-only",
    wizardBehavior: 'skipped (sourceScope === "wizard" gate on core step 11)',
  },
  {
    op: "resolveStaleSyncProblemAlerts",
    site: "runScheduledCronSync.ts:139-157; cron-path call sites only — NOT invoked by applyStaged or the core",
    reachableFromCore: false,
    class: "live-only", // cron caller level
    wizardBehavior: "pinned: core must NOT call it (Task 1.7 meta-test)",
  },
  {
    op: "restoreDeleteAndIngest",
    site: "applyStaged.ts restoreDeleteAndIngest (defaultRestoreShowStatus + defaultUpsertLivePendingIngestion — live failure restoration; stays in the legacy live caller)",
    reachableFromCore: false,
    class: "live-only", // caller level
    wizardBehavior:
      "wizard failure paths use recordWizardApplyHardFail / Phase B demotePending — never the live restore",
  },
  {
    op: "deleteApprovedPending",
    site: "app/api/admin/onboarding/finalize/route.ts:452-468 (wizard-scoped predicate; Phase B route level)",
    reachableFromCore: false,
    class: "wizard-only",
    wizardBehavior: "unchanged; this is WHY core step 11 is a wizard no-op",
  },
  {
    op: "upsertWizardPendingIngestion",
    site: "defaultUpsertWizardPendingIngestion applyStaged.ts (wizard approve branch; wizard_session_id-scoped upsert)",
    reachableFromCore: false,
    class: "wizard-only",
    wizardBehavior: "unchanged (retry/defer routes own wizard rows; never the apply core)",
  },
  {
    op: "adminAlertWriters",
    site: "applyStaged() outer live branch + first-published tail (caller level admin_alerts writers)",
    reachableFromCore: false,
    class: "live-only", // caller level
    wizardBehavior: "wizard callers never invoke them",
  },
];

export type ApplyStagedCoreArgs = {
  sourceScope: "live" | "wizard"; // drives live-partition op classification (Task 1.2)
  driveFileId: string;
  show: ShowForApply | null; // caller-read UNDER the held lock
  parseResult: Phase2Args["parseResult"];
  triggeredReviewItems: TriggeredReviewItem[];
  reviewerChoices: ReviewerChoice[];
  stagedId: string;
  stagedModifiedTime: string; // binding.modifiedTime for runPhase2 (= holds baseModifiedTime)
  baseModifiedTime: string | null; // equality preflight target + sync_audit.base_modified_time
  appliedByEmail: string;
  appliedAt: string | null; // null → DB default now(); wizard passes wizard_approved_at
  auditSource: "staged_apply" | "onboarding_finalize" | "onboarding_finalize_cas";
  fileMeta: DriveListedFile;
  mi11Items: Mi11Item[]; // wizard Phase D extracts from payload items; live legacy passes []
  // R35-1: REQUIRED, no default (R37-1: the core throws when absent — no silent default may be
  // introduced). "none" = no show_change_log rows (Phase B first-seen — the feed documents changes
  // to LIVE shows). "choice_aware" = the core derives notableItems INTERNALLY post-validation via
  // choiceAwareFeedItems(items, validatedChoices) and forwards them to runPhase2 (Phase D
  // existing-show + dashboard-equivalent semantics). The old optional notableItems argument does
  // not exist on the public core API — callers cannot inject raw items (R36-1).
  feedPolicy: { kind: "none" } | { kind: "choice_aware" };
  skipDiagramsWrite: boolean;
  snapshotAssetsForApply?: Phase2Args["snapshotAssetsForApply"];
  autoPublishFirstSeen?: Phase2Args["autoPublishFirstSeen"];
  // R60-1: wizard Phase B first-seen ONLY — threaded Phase2Args → Phase2Tx.applyShowSnapshot →
  // PostgresPipelineTx INSERT, which writes shows.wizard_created_session_id (the show-side
  // provenance discriminator every created_show_id consumer joins on). Absent for live/Phase-D.
  wizardCreatedSessionId?: string;
  // R30-1: wizard Phase B only — first-seen INSERT writes published=false.
  firstSeenPublished?: false;
};

export type ApplyStagedCoreResult =
  | {
      outcome: "applied";
      showId: string;
      syncAuditId: string | null;
      derivedSideEffects: { revokeFloorForNames: string[] };
      roleFlagsNotice?: RoleFlagsNotice;
      snapshotRevisionId?: string;
    }
  | ReviewerChoiceValidationError
  | { outcome: "discarded_by_choice" } // ANY reject choice: NO Phase 2, NO audit, NO floors — the
  // core consumes nothing; each caller maps to its partition's discard semantics (live contract
  // applyStaged.ts reject branch; pinned by tests/sync/applyStaged.test.ts:1118-1147)
  | { outcome: "stale_baseline" } // live last_seen_modified_time ≠ args.baseModifiedTime
  | { outcome: "stale_write" }; // runPhase2's internal CAS guard fired post-preflight

export type ApplyStagedCoreDeps = {
  runPhase2?: (tx: LockedShowTx<SyncPipelineTx>, args: Phase2Args) => Promise<Phase2Result>;
  insertSyncAudit?: (tx: LockedShowTx<SyncPipelineTx>, row: SyncAuditRow) => Promise<string | null>;
  bumpReviewerAuthFloors?: (
    tx: LockedShowTx<SyncPipelineTx>,
    showId: string,
    names: string[],
  ) => Promise<void>;
  deleteLivePendingSync?: (
    tx: LockedShowTx<SyncPipelineTx>,
    driveFileId: string,
    stagedId: string,
  ) => Promise<void>;
};

export async function applyStagedCore(
  tx: LockedShowTx<SyncPipelineTx>,
  args: ApplyStagedCoreArgs,
  deps: ApplyStagedCoreDeps = {},
): Promise<ApplyStagedCoreResult> {
  // R37-1: feedPolicy is a REQUIRED contract decision per caller — refuse loudly if a caller
  // slips past the type system without one (no silent default).
  if (!args.feedPolicy) {
    throw new Error("applyStagedCore: feedPolicy is required — no silent default");
  }

  // 1. Adoption assertion ONLY — the core NEVER acquires (§3.3 single-holder rule).
  await assertShowLockHeld(tx, args.driveFileId);

  // 2. Reviewer-choice validation (moved function, identical logic).
  const validation = validateReviewerChoices(args.triggeredReviewItems, args.reviewerChoices);
  if (!("ok" in validation)) return validation;

  // 3. Choice-semantics dispatch (mirrors the live validation→reject sequence): ANY reject choice
  // discards BEFORE any mutation. Reject is only valid against an EXISTING show — the live
  // first-seen reject is INVALID_REVIEWER_ACTION (applyStaged.ts first-seen reject contract).
  // rename/independent/apply take NO dispatch branch: the staged parse applies WHOLESALE for all
  // three — the per-action difference is ONLY in deriveAuthSideEffects floors + the audit record.
  if (validation.choices.some((choice) => choice.action === "reject")) {
    if (!args.show?.showId) {
      return { outcome: "invalid_request", code: INVALID_REVIEWER_ACTION };
    }
    return { outcome: "discarded_by_choice" };
  }

  // 4. Equality stale-baseline preflight (for the legacy live caller this is a redundant second
  // defense behind applyStaged's own baseline check; for Phase D it IS the gate that replaces the
  // `<=` CAS predicate — spec §3.2 R21).
  if (!sameTimestamp(args.show?.lastSeenModifiedTime ?? null, args.baseModifiedTime)) {
    return { outcome: "stale_baseline" };
  }

  // 5. Floors derivation (moved function, identical logic).
  const derivedSideEffects = deriveAuthSideEffects(args.triggeredReviewItems, validation.choices);

  // 6. Wizard applies never touch the live partition (classification registry, Task 1.2).
  const applyTx = args.sourceScope === "wizard" ? withWizardScopedLivePartitionOps(tx) : tx;

  // 7. Full Phase-2 apply. feedItems are computed INSIDE the core post-validation (R36-1);
  // P2-F6 (phase2.ts) remains the structural guard against an MI-11 apply with no hold port.
  const feedItems =
    args.feedPolicy.kind === "choice_aware"
      ? choiceAwareFeedItems(args.triggeredReviewItems, validation.choices)
      : [];
  const phase2 = await (deps.runPhase2 ?? defaultRunPhase2)(applyTx, {
    driveFileId: args.driveFileId,
    mode: "manual",
    fileMeta: args.fileMeta,
    parseResult: args.parseResult,
    skipDiagramsWrite: args.skipDiagramsWrite,
    ...(args.snapshotAssetsForApply ? { snapshotAssetsForApply: args.snapshotAssetsForApply } : {}),
    ...(args.autoPublishFirstSeen ? { autoPublishFirstSeen: args.autoPublishFirstSeen } : {}),
    ...(args.firstSeenPublished === false ? { firstSeenPublished: args.firstSeenPublished } : {}),
    ...(args.wizardCreatedSessionId ? { wizardCreatedSessionId: args.wizardCreatedSessionId } : {}),
    verifyReelOnApply: false,
    ...(args.mi11Items.length > 0 ? { mi11Items: args.mi11Items } : {}),
    // NOTE (deviation from the plan's literal `feedItems.length > 0` spread): the live feed
    // writer's gate is `args.notableItems !== undefined` (phase2.ts writeAutoApplyChanges block)
    // — choice_aware must pass notableItems even when the filtered list is EMPTY, otherwise an
    // all-independent resolution would skip the feed write entirely and the g2 regression's
    // remove+add rows (R33-2 assertion ii) would never be written.
    ...(args.feedPolicy.kind === "choice_aware" ? { notableItems: feedItems } : {}),
    binding: {
      bindingToken: args.stagedModifiedTime,
      modifiedTime: args.stagedModifiedTime,
    },
  });

  // 8. runPhase2's internal CAS guard fired post-preflight.
  if (phase2.outcome === "stale") return { outcome: "stale_write" };

  // 9. Reviewer auth floors (moved default no-op, injectable).
  await (deps.bumpReviewerAuthFloors ?? defaultBumpReviewerAuthFloors)(
    tx,
    phase2.showId,
    derivedSideEffects.revokeFloorForNames,
  );

  // 10. Audit with caller provenance: source discriminator + applied_at override.
  const syncAuditId = await (deps.insertSyncAudit ?? defaultInsertSyncAudit)(tx, {
    showId: phase2.showId,
    driveFileId: args.driveFileId,
    appliedBy: args.appliedByEmail,
    stagedId: args.stagedId,
    triggeredReviewItems: args.triggeredReviewItems,
    reviewerChoices: validation.choices,
    derivedSideEffects,
    parseResultSummary: { ...parseResultSummary(args.parseResult), source: args.auditSource },
    baseModifiedTime: args.baseModifiedTime,
    stagedModifiedTime: args.stagedModifiedTime,
    appliedAt: args.appliedAt,
  });

  // 11. Live-partition staged-row delete is live-scope ONLY — the wizard row was already consumed
  // by Phase B's deleteApprovedPending (finalize route).
  if (args.sourceScope === "live") {
    await (deps.deleteLivePendingSync ?? defaultDeleteLivePendingSync)(
      tx,
      args.driveFileId,
      args.stagedId,
    );
  }

  // 12. Applied (+ passthrough).
  const applied: Extract<ApplyStagedCoreResult, { outcome: "applied" }> = {
    outcome: "applied",
    showId: phase2.showId,
    syncAuditId,
    derivedSideEffects,
  };
  if (phase2.roleFlagsNotice) applied.roleFlagsNotice = phase2.roleFlagsNotice;
  if (phase2.snapshotRevisionId) applied.snapshotRevisionId = phase2.snapshotRevisionId;
  return applied;
}
