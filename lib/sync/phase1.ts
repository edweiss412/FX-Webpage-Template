import { randomUUID } from "node:crypto";
import type { DriveListedFile } from "@/lib/drive/list";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { runInvariants } from "@/lib/parser/invariants";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import { MI8_DEBOUNCE_MS } from "@/lib/sync/constants";
import type { ResolvedSyncMode, SyncMode } from "@/lib/sync/perFileProcessor";
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";
import {
  getAutoPublishCleanFirstSeen as defaultGetAutoPublishCleanFirstSeen,
  type AutoPublishCleanFirstSeenResult,
} from "@/lib/appSettings/getAutoPublishCleanFirstSeen";

export type Phase1Deps = {
  getAutoPublishCleanFirstSeen?: () => Promise<AutoPublishCleanFirstSeenResult>;
};

export type Phase1Binding = {
  bindingToken: string;
  modifiedTime: string;
};

export type Phase1ShowRow = {
  showId?: string | null;
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  priorParseResult: ParseResult;
  /**
   * RAW nullable prior parse_warnings (spec §6.5): `null` when the column is NULL OR no
   * shows_internal row exists (untrustworthy baseline → Unit C skips), distinct from the
   * coalesced `priorParseResult.warnings` (`?? []`). REQUIRED-nullable (Codex whole-diff R1): a
   * producer or tx double that OMITS it would silently disable RESYNC_QUALITY_REGRESSED for an
   * existing published show; making it required forces every Phase1ShowRow producer to supply
   * `null` or the raw array explicitly (fails typecheck on omission).
   */
  priorParseWarningsRaw: ParseResult["warnings"] | null;
};

export type Phase1PendingSyncRow = {
  driveFileId: string;
  wizardSessionId: string | null;
  baseModifiedTime: string | null;
  stagedModifiedTime: string;
  parseResult: ParseResult;
  triggeredReviewItems: TriggeredReviewItem[];
  priorLastSyncStatus: string | null;
  priorLastSyncError: string | null;
  stagedId: string;
  sourceKind: string;
  warningSummary: string;
  // Onboarding-scan region source anchors persisted to pending_syncs.source_anchors (spec §5).
  // Optional: only the onboarding scan supplies it; other staging callers omit it and the DB
  // column defaults to '{}'.
  sourceAnchors?: Record<string, SourceAnchor>;
  // §5.8: the override snapshot THIS staged parse was produced under. Persisted to
  // pending_syncs.pull_sheet_override_applied atomically with parse_result. Absent ⇒ null.
  pullSheetOverrideApplied?: OverrideSnapshot;
  // §5.2/I5b: when true, the staging write also clears pending_syncs.pull_sheet_override
  // to null (content-change / tab-missing discard-and-rerun). Absent ⇒ no clear.
  pullSheetOverrideCleared?: boolean;
};

export type Phase1PendingIngestionRow = {
  driveFileId: string;
  wizardSessionId: string | null;
  driveFileName: string;
  lastErrorCode: string;
  lastErrorMessage: string;
  lastWarnings: unknown[];
  lastSeenModifiedTime: string;
};

export type Phase1Tx = {
  readShowForPhase1(driveFileId: string): Promise<Phase1ShowRow | null>;
  readLivePendingSync(driveFileId: string): Promise<Phase1PendingSyncRow | null>;
  upsertLivePendingIngestion(row: Phase1PendingIngestionRow): Promise<void>;
  deleteLivePendingIngestion(driveFileId: string): Promise<void>;
  upsertLivePendingSync(
    row: Omit<Phase1PendingSyncRow, "stagedId"> & { stagedId?: string },
  ): Promise<{ stagedId: string }>;
  // Returns the updated show's id (`returning id`), or null when no existing shows row was
  // updated (a first-seen hard-fail writes nothing to `shows`). phase1 threads this id onto the
  // hard_fail result so the sync caller's revalidateShowFromResult busts the crew cache tag —
  // an existing-show hard_fail commits shows.last_sync_status='parse_error' (idx17/#102). The
  // `| void` keeps pre-existing void-returning tx mocks/stubs structurally assignable.
  updateShowParseError(
    driveFileId: string,
    error: { code: string; message: string },
  ): Promise<string | null | void>;
  // Retain-last-good on a material-shrink hold (audit finding #3): sets
  // shows.last_sync_status='shrink_held', last_sync_error=message. Mirrors updateShowParseError:
  // returns the updated show's id (or null when no row matched) so phase1 threads showId onto the
  // shrink_held result and the caller busts the crew cache tag. `| void` keeps void-returning
  // tx stubs structurally assignable.
  updateShowShrinkHeld(
    driveFileId: string,
    payload: { message: string },
  ): Promise<string | null | void>;
  updateShowPendingReview(driveFileId: string): Promise<void>;
  deleteWizardPendingSyncsExcept(wizardSessionId: string): Promise<void>;
};

export type Phase1Args = {
  driveFileId: string;
  mode: Exclude<ResolvedSyncMode, "asset_recovery">;
  fileMeta: DriveListedFile;
  parseResult: ParseResult;
  binding: Phase1Binding;
  wizardSessionId?: string;
  // Region source anchors computed at scan (onboarding path only); forwarded into the staging row.
  sourceAnchors?: Record<string, SourceAnchor>;
  // §5.8 pull-sheet override provenance for the staged parse — forwarded into the staging row.
  pullSheetOverrideApplied?: OverrideSnapshot;
  pullSheetOverrideCleared?: boolean;
  // Re-sync quality gate (audit finding #3): a VERSION-BOUND confirmed accept that already
  // showed the admin the shrink counts. Cron/push never set these. The hold is bypassed ONLY
  // when acceptShrink === true AND expectedModifiedTime === binding.modifiedTime (§4a).
  acceptShrink?: boolean;
  expectedModifiedTime?: string;
};

export type Phase1Result =
  | {
      outcome: "hard_fail";
      code: string;
      failedCodes: string[];
      message: string;
      // Present (id) only for an EXISTING-show hard_fail, which committed
      // shows.last_sync_status='parse_error' and must therefore bust the crew cache tag.
      // null for a first-seen hard_fail (nothing written to `shows`). (idx17/#102)
      showId?: string | null;
    }
  | {
      outcome: "stage";
      triggeredReviewItems: TriggeredReviewItem[];
      stagedId: string;
    }
  | {
      outcome: "pass";
    }
  | {
      outcome: "auto_publish_ready";
    }
  | {
      outcome: "auto_apply_with_holds";
      mi11Items: Extract<TriggeredReviewItem, { invariant: "MI-11" }>[];
    }
  | {
      outcome: "defer";
      reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable";
    }
  | {
      outcome: "shrink_held";
      // No `code` field (Codex plan-R7): the RESYNC_SHRINK_HELD alert code is the caller's,
      // raised at the caller's raise site (a later task), NOT phase1.
      message: string;
      heldModifiedTime: string;
      shrinkItems: TriggeredReviewItem[];
      showId?: string | null;
    };

export class Phase1InfraError extends Error {
  readonly operation: string;
  override readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Phase 1 transaction-port failure during ${operation}`);
    this.name = "Phase1InfraError";
    this.operation = operation;
    this.cause = cause;
  }
}

async function callTx<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    throw new Phase1InfraError(operation, cause);
  }
}

function warningSummary(parseResult: ParseResult): string {
  // §12.4 / AGENTS.md invariant 5: never render raw error codes to Doug. Use
  // the parser's already-filled-in human-readable `message` and drop
  // admin-log-only "info" warnings (e.g., TYPO_NORMALIZED) which are not
  // surfaced to operators per §12.4.
  return parseResult.warnings
    .filter((warning) => warning.severity === "warn")
    .map((warning) => warning.message)
    .join("; ");
}

// Doug-facing section labels for the shrink summary. The raw MI-7 `section` keys
// (lib/parser/types.ts:441) are internal snake_case tokens; humanize them so the alert
// `detail` + ReSyncButton confirm never leak jargon (impeccable HIGH; PRODUCT.md voice).
const SHRINK_SECTION_LABELS: Record<
  Extract<TriggeredReviewItem, { invariant: "MI-7" }>["section"],
  string
> = {
  hotel_reservations: "hotels",
  rooms: "rooms",
  contacts: "contacts",
  transportation: "transportation",
};

// Human summary of a material-shrink hold for the admin alert `detail` + the ReSyncButton confirm.
// MI-6's TriggeredReviewItem carries no counts (lib/parser/types.ts:436), so the crew delta is
// computed from the parse results; MI-7 items embed { section, prior_count, new_count }. Emits e.g.
// "crew 5→2; hotels 4→1". Never a bare code (invariant 5) nor a raw section token.
function describeShrink(
  items: TriggeredReviewItem[],
  priorParseResult: ParseResult,
  nextParseResult: ParseResult,
): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.invariant === "MI-6") {
      parts.push(
        `crew ${priorParseResult.crewMembers.length}→${nextParseResult.crewMembers.length}`,
      );
    } else if (item.invariant === "MI-7") {
      const mi7 = item as Extract<TriggeredReviewItem, { invariant: "MI-7" }>;
      parts.push(`${SHRINK_SECTION_LABELS[mi7.section]} ${mi7.prior_count}→${mi7.new_count}`);
    }
  }
  return parts.join("; ");
}

function sourceKindForMode(mode: Phase1Args["mode"]): SyncMode {
  if (mode === "recovery") return "cron";
  return mode;
}

function hasLead(flags: readonly string[]): boolean {
  return flags.includes("LEAD");
}

function isMi8DebounceMode(mode: Phase1Args["mode"]): boolean {
  return mode === "cron" || mode === "push" || mode === "recovery";
}

function isDriveModifiedTimeUnstable(fileMeta: DriveListedFile): boolean {
  const modifiedMs = Date.parse(fileMeta.modifiedTime);
  if (!Number.isFinite(modifiedMs)) return false;
  return Date.now() - modifiedMs < MI8_DEBOUNCE_MS;
}

function mi8DebounceReason(args: Phase1Args, items: TriggeredReviewItem[]): Phase1Result | null {
  if (!isMi8DebounceMode(args.mode)) return null;
  if (!isDriveModifiedTimeUnstable(args.fileMeta)) return null;
  if (items.length === 0) return null;
  if (items.some((item) => item.invariant !== "MI-8" && item.invariant !== "MI-8b")) {
    return null;
  }
  if (items.some((item) => item.invariant === "MI-8")) {
    return { outcome: "defer", reason: "mi8_modtime_unstable" };
  }
  if (items.some((item) => item.invariant === "MI-8b")) {
    return { outcome: "defer", reason: "mi8b_modtime_unstable" };
  }
  return null;
}

function withLeadToggleSafetyNet(
  prior: ParseResult | null,
  next: ParseResult,
  items: TriggeredReviewItem[],
): TriggeredReviewItem[] {
  if (!prior) return items;
  const priorByName = new Map(prior.crewMembers.map((member) => [member.name, member]));
  const hasMi9 = items.some((item) => item.invariant === "MI-9");
  if (hasMi9) return items;
  const hasMi10 = items.some((item) => item.invariant === "MI-10");
  if (hasMi10) return items;

  for (const nextMember of next.crewMembers) {
    const priorMember = priorByName.get(nextMember.name);
    if (!priorMember) continue;
    if (hasLead(priorMember.role_flags) !== hasLead(nextMember.role_flags)) {
      return [...items, { id: randomUUID(), invariant: "MI-10" }];
    }
  }
  return items;
}

function warningCount(parseResult: ParseResult, code: string): number {
  return parseResult.warnings.filter((warning) => warning.code === code).length;
}

function hasWarning(parseResult: ParseResult, code: string): boolean {
  return warningCount(parseResult, code) > 0;
}

// Exported (P2-F3): the real cron/push apply path reuses this to include the asset-drift
// (DIAGRAMS_*/REEL_DRIFT_PENDING) sync-layer items in the auto-apply change-log notableItems set —
// runInvariants alone omits them, so the asset_drift feed row was never written on the real path.
export function syncLayerReviewItems(
  args: Phase1Args,
  parseResult: ParseResult,
  show: Phase1ShowRow | null,
): TriggeredReviewItem[] {
  const items: TriggeredReviewItem[] = [];

  if (hasWarning(parseResult, "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE")) {
    items.push({
      id: randomUUID(),
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: args.driveFileId,
    });
  }

  if (hasWarning(parseResult, "DIAGRAMS_EMBEDDED_NONE_FOUND")) {
    items.push({
      id: randomUUID(),
      invariant: "DIAGRAMS_EMBEDDED_NONE_FOUND",
      spreadsheet_id: args.driveFileId,
    });
  }

  const linkedFolderDriftCount = warningCount(parseResult, "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING");
  if (linkedFolderDriftCount > 0) {
    items.push({
      id: randomUUID(),
      invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
      drift_count: linkedFolderDriftCount,
    });
  }

  if (hasWarning(parseResult, "REEL_DRIFT_PENDING")) {
    items.push({
      id: randomUUID(),
      invariant: "REEL_DRIFT_PENDING",
      reel_drive_file_id:
        parseResult.openingReel?.driveFileId ??
        show?.priorParseResult.openingReel?.driveFileId ??
        args.driveFileId,
    });
  }

  return items;
}

function sentinelFor(args: Phase1Args, _show: Phase1ShowRow | null): TriggeredReviewItem | null {
  if (args.mode === "onboarding_scan") {
    return { id: randomUUID(), invariant: "ONBOARDING_SCAN_REVIEW" };
  }
  return null;
}

export async function runPhase1(
  tx: Phase1Tx,
  args: Phase1Args,
  deps: Phase1Deps = {},
): Promise<Phase1Result> {
  if (args.mode === "onboarding_scan" && args.wizardSessionId) {
    await callTx("deleteWizardPendingSyncsExcept", () =>
      tx.deleteWizardPendingSyncsExcept(args.wizardSessionId as string),
    );
  }

  const show = await callTx("readShowForPhase1", () => tx.readShowForPhase1(args.driveFileId));
  const invariant = runInvariants(show?.priorParseResult ?? null, args.parseResult);

  if (invariant.outcome === "hard_fail") {
    const code = invariant.failedCodes[0] ?? "PARSE_HARD_FAIL";
    const message = invariant.messages.join("; ");
    // Carry the updated show's id so revalidateShowFromResult busts the crew cache tag on an
    // existing-show hard_fail (which commits shows.last_sync_status='parse_error'). null for a
    // first-seen hard_fail — nothing is written to `shows`, so there is nothing to bust. (idx17/#102)
    let showId: string | null = null;
    if (show) {
      const updatedShowId = await callTx("updateShowParseError", () =>
        tx.updateShowParseError(args.driveFileId, { code, message }),
      );
      showId = typeof updatedShowId === "string" ? updatedShowId : null;
    } else {
      await callTx("upsertLivePendingIngestion", () =>
        tx.upsertLivePendingIngestion({
          driveFileId: args.driveFileId,
          wizardSessionId: args.wizardSessionId ?? null,
          driveFileName: args.fileMeta.name,
          lastErrorCode: code,
          lastErrorMessage: message,
          lastWarnings: args.parseResult.warnings,
          lastSeenModifiedTime: args.binding.modifiedTime,
        }),
      );
    }
    return { outcome: "hard_fail", code, failedCodes: invariant.failedCodes, message, showId };
  }

  const sentinel = sentinelFor(args, show);
  const invariantItems =
    invariant.outcome === "stage"
      ? withLeadToggleSafetyNet(
          show?.priorParseResult ?? null,
          args.parseResult,
          invariant.triggeredItems,
        )
      : [];
  const syncLayerItems = syncLayerReviewItems(args, args.parseResult, show);
  // `reviewItems` is STILL fully computed (lead-toggle safety net + asset-drift sync-layer items):
  // it feeds the MI-8 debounce early-return below AND the Phase-2/Phase-5 feed-row derivation.
  // Phase 2 only changes WHICH items route to `upsertLivePendingSync`, not which items exist.
  const reviewItems = [...invariantItems, ...syncLayerItems];
  const debounce = mi8DebounceReason(args, reviewItems);
  if (debounce) return debounce;

  // Re-sync quality gate (audit finding #3): count-based MATERIAL shrinkage (MI-6 crew, MI-7
  // section) on an EXISTING published show HOLDS last-good instead of auto-clobbering, in the
  // re-sync modes (cron/push/manual). The ONLY bypass is a VERSION-BOUND acceptShrink set by a
  // confirmed re-submit that already showed the admin the shrink counts (D4). MI-6/MI-7 require a
  // prior (invariants.ts) so `show` is non-null here; the guard documents the scope.
  //
  // onboarding_scan is EXCLUDED (Codex plan-R6/R7): its tx blinds readShowForPhase1 to null
  // (first-seen semantics, no MI-6..14 diffs, no shows mutations), so materialShrinkItems is
  // already empty there today. The explicit `mode` gate makes that robust: onboarding must NEVER
  // mutate `shows`, and PostgresOnboardingScanTx.updateShowShrinkHeld is a throw-only guard — the
  // gate guarantees the hold branch never invokes it.
  const materialShrinkItems =
    show && args.mode !== "onboarding_scan"
      ? reviewItems.filter((item) => item.invariant === "MI-6" || item.invariant === "MI-7")
      : [];
  if (materialShrinkItems.length > 0) {
    // Drive's modifiedTime advances on any edit, so a mismatch means Doug edited between the
    // prompt and the confirm — re-hold with fresh counts (the admin must re-confirm).
    const acceptedThisVersion =
      args.acceptShrink === true && args.expectedModifiedTime === args.binding.modifiedTime;
    if (!acceptedThisVersion) {
      const message = describeShrink(materialShrinkItems, show!.priorParseResult, args.parseResult);
      const updatedShowId = await callTx("updateShowShrinkHeld", () =>
        tx.updateShowShrinkHeld(args.driveFileId, { message }),
      );
      // NB: NO alert-code field on the shrink_held result (Codex plan-R7). The RESYNC_SHRINK_HELD
      // alert code is a §12.4/catalog-gated producer owned by the CALLER's raise site (a later
      // task, co-located with the catalog row) — never emitted here. Emitting the SCREAMING_SNAKE
      // literal on such a property in phase1.ts would be caught by the orphan-producer scanner
      // (PRODUCER_RE over lib/app in tests/cross-cutting/codes.test.ts) BEFORE the catalog row
      // exists → red. (This comment deliberately avoids that literal shape, which the scanner
      // would match even inside a comment.) Dropping the field also keeps the route's
      // `"code" in result` error branch from ever matching a hold.
      return {
        outcome: "shrink_held",
        message,
        heldModifiedTime: args.binding.modifiedTime,
        shrinkItems: materialShrinkItems,
        showId: typeof updatedShowId === "string" ? updatedShowId : (show!.showId ?? null),
      };
    }
    // else fall through → the parse applies (pass / auto_apply_with_holds; MI-11 still holds).
  }

  // Phase 2 Task 2.1 decision rule: partition MI-11 (existing-crew email change) from the rest.
  // MI-11 is the ONLY gated invariant — it routes to per-crew `sync_holds` (Phase 2 apply path).
  // Every other invariant (MI-6..MI-14 except MI-11) AND asset drift are NOTIFICATIONS: they
  // auto-apply and become Phase-2/Phase-5 feed rows, never a whole-parse `pending_sync` stage.
  const mi11Items = reviewItems.filter(
    (item): item is Extract<TriggeredReviewItem, { invariant: "MI-11" }> =>
      item.invariant === "MI-11",
  );

  // The staging branch (`upsertLivePendingSync`) is now reserved for SENTINELS + hard-fail ONLY:
  // the onboarding_scan sentinel + the clean-first-seen FIRST_SEEN_REVIEW injection. Asset drift
  // and non-MI-11 invariants are DROPPED from the set routed to `upsertLivePendingSync` (PF34).
  let triggeredReviewItems: TriggeredReviewItem[] = sentinel ? [sentinel] : [];

  // Task 4.2: a CLEAN first-seen sheet (no show row, no review items, not an onboarding scan) is the
  // only place the auto-publish toggle applies. OFF → stage the reused FIRST_SEEN_REVIEW sentinel for
  // admin approval instead of auto-publishing. Fail-closed: a flag-read infra fault does NOT auto-publish
  // (it propagates as a Phase1InfraError so the sync is retried). The flag is NOT consulted in
  // sentinelFor — only here, in the clean post-reviewItems branch. MI-11 cannot fire first-seen
  // (no prior snapshot — lib/parser/invariants.ts:566), so this branch and the MI-11 branch never
  // conflict. `reviewItems.length === 0` keeps the pre-existing "only auto-publish a CLEAN sheet" gate.
  if (
    !show &&
    args.mode !== "onboarding_scan" &&
    triggeredReviewItems.length === 0 &&
    reviewItems.length === 0
  ) {
    const flag = await (deps.getAutoPublishCleanFirstSeen ?? defaultGetAutoPublishCleanFirstSeen)();
    if (flag.kind === "infra_error") {
      throw new Phase1InfraError(
        "getAutoPublishCleanFirstSeen",
        new Error("auto-publish flag read failed; not auto-publishing this pass"),
      );
    }
    if (!flag.autoPublish) {
      triggeredReviewItems = [{ id: randomUUID(), invariant: "FIRST_SEEN_REVIEW" }];
    }
  }

  if (triggeredReviewItems.length > 0) {
    const existingPending = await callTx("readLivePendingSync", () =>
      tx.readLivePendingSync(args.driveFileId),
    );
    await callTx("deleteLivePendingIngestion", () =>
      tx.deleteLivePendingIngestion(args.driveFileId),
    );
    const priorLastSyncStatus =
      existingPending?.priorLastSyncStatus ?? show?.lastSyncStatus ?? null;
    const priorLastSyncError = existingPending?.priorLastSyncError ?? show?.lastSyncError ?? null;
    const upserted = await callTx("upsertLivePendingSync", () =>
      tx.upsertLivePendingSync({
        driveFileId: args.driveFileId,
        wizardSessionId: args.wizardSessionId ?? null,
        baseModifiedTime: show?.lastSeenModifiedTime ?? null,
        stagedModifiedTime: args.binding.modifiedTime,
        parseResult: args.parseResult,
        triggeredReviewItems,
        priorLastSyncStatus,
        priorLastSyncError,
        sourceKind: sourceKindForMode(args.mode),
        warningSummary: warningSummary(args.parseResult),
        ...(args.sourceAnchors !== undefined ? { sourceAnchors: args.sourceAnchors } : {}),
        ...(args.pullSheetOverrideApplied !== undefined
          ? { pullSheetOverrideApplied: args.pullSheetOverrideApplied }
          : {}),
        ...(args.pullSheetOverrideCleared !== undefined
          ? { pullSheetOverrideCleared: args.pullSheetOverrideCleared }
          : {}),
      }),
    );
    if (show) {
      await callTx("updateShowPendingReview", () => tx.updateShowPendingReview(args.driveFileId));
    }
    return { outcome: "stage", triggeredReviewItems, stagedId: upserted.stagedId };
  }

  // MI-11 present → the rest of the parse still auto-applies; only the flagged crew's identity
  // (email) holds. Phase 2 writes one `mi11_pending` `sync_holds` row per item and applies the
  // rest hold-aware. MI-11 requires a prior snapshot, so this is unreachable first-seen.
  if (mi11Items.length > 0) {
    return { outcome: "auto_apply_with_holds", mi11Items };
  }

  if (!show && args.mode !== "onboarding_scan") {
    return { outcome: "auto_publish_ready" };
  }

  return { outcome: "pass" };
}
