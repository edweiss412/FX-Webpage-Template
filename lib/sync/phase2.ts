import type { DriveListedFile } from "@/lib/drive/list";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { deriveSlug } from "@/lib/parser/slug";
import type { AgendaEntry, ParseResult, RunOfShow, TriggeredReviewItem } from "@/lib/parser/types";
import { writeAutoApplyChanges } from "@/lib/sync/changeLog/writeAutoApplyChanges";
import { readOpenHolds } from "@/lib/sync/holds/holdPort";
import {
  applyParseResult,
  type ApplyParseResultTx,
  type PreviousCrewMember,
} from "@/lib/sync/applyParseResult";
import { writeMi11Holds, type Mi11Item, type LiveCrewRow } from "@/lib/sync/holds/writeMi11Holds";
import type { HoldPort } from "@/lib/sync/holds/holdPort";
import {
  loadActiveOverrides,
  type ActiveOverridesReadResult,
} from "@/lib/sync/loadActiveOverrides";
import { overrideShowHotel, type OverrideSideEffect } from "@/lib/sync/overrideShowHotel";
import { commitOverrideSideEffects } from "@/lib/sync/commitOverrideSideEffects";
import type { ActiveCrewOverride } from "@/lib/sync/reconcileCrewOverrides";
import type { Phase1Binding } from "@/lib/sync/phase1";
import type { ResolvedSyncMode } from "@/lib/sync/perFileProcessor";
import type { SnapshotAssetsResult } from "@/lib/sync/snapshotAssets";
import {
  verifyReelOnApply as defaultVerifyReelOnApply,
  type ReelWarningCode,
  type VerifyReelOnApplyResult,
} from "@/lib/sync/verifyReelOnApply";

export type Phase2Mode = Exclude<ResolvedSyncMode, "asset_recovery">;
export type StaleWriteCode =
  | "STALE_WRITE_ABORTED"
  | "STALE_PUSH_ABORTED"
  | "STALE_MANUAL_REPLAY_ABORTED";

export type Phase2Tx = ApplyParseResultTx & {
  // Phase 2: service-role hold-port over the same locked txn (writeMi11Holds + hold-aware apply).
  // No nested lock — rides the existing JS-held show lock.
  holdPort?(): HoldPort;
  readCurrentDiagrams?(driveFileId: string): Promise<unknown>;
  // Stage A (admin field overrides, spec 2026-07-07): the single locked-tx read of this show's
  // ACTIVE admin_overrides (SYNC-1). Optional — legacy callers omit it and the transform is skipped.
  // The concrete service-role read lives in the tx-port impl; loadActiveOverrides owns {data,error}.
  loadActiveOverrides?(driveFileId: string): Promise<ActiveOverridesReadResult>;
  // Stage B (admin field overrides): the two write executors commitOverrideSideEffects dispatches to.
  // Optional — present only when the override overlay is wired; both ride the JS-held show lock (no
  // nested lock). refresh does NOT bump version (R30); deactivate does. Applied-path-only writer.
  refreshOverrideSheetValue?(overrideId: string, sheetValue: unknown): Promise<void>;
  deactivateOverride?(overrideId: string, code: "target_missing" | "name_conflict"): Promise<void>;
  applyShowSnapshot(args: {
    driveFileId: string;
    modifiedTime: string;
    staleGuard: "strict_less_than" | "less_than_or_equal";
    parseResult: ParseResult;
    slug: string;
    skipDiagramsWrite?: boolean;
    autoPublishFirstSeen?: {
      unpublishToken: string;
      unpublishTokenExpiresAt: string;
    };
    // F1 (R30-1): wizard Phase B first-seen INSERT writes published=false (DDL default is true).
    firstSeenPublished?: false;
    // F1 (R60-1/R65-1): wizard Phase B first-seen INSERT writes shows.wizard_created_session_id —
    // the show-side provenance discriminator every created_show_id consumer joins on.
    wizardCreatedSessionId?: string;
    /**
     * Task 5: source-region anchors extracted from the XLSX bytes. Optional so callers
     * that don't yet supply bytes (wizard, manual-resync, etc.) remain compatible; Task 6
     * will persist the value via the shows UPDATE.
     */
    sourceAnchors?: Record<string, SourceAnchor>;
  }): Promise<
    | {
        outcome: "updated";
        showId: string;
        previousCrewNames: string[];
        previousCrewMembers?: PreviousCrewMember[];
        // §02 (D-2 / R6 / R20 producer-side required-field defense): the prior stored
        // shows_internal.run_of_show. REQUIRED (not optional) so every applyShowSnapshot impl — the
        // Postgres one AND every fake — must populate it; an impl that extends the type but forgets
        // the live `select run_of_show` cannot silently typecheck-and-pass while production never
        // emits AGENDA_DAY_EMPTIED (the R20 dead-producer class). first-seen / nothing prior = null.
        priorRunOfShow: RunOfShow | null;
      }
    | {
        outcome: "stale";
      }
  >;
  applyDiagramSnapshot?(driveFileId: string, diagrams: ParseResult["diagrams"]): Promise<void>;
};

export type Phase2Args = {
  driveFileId: string;
  mode: Phase2Mode;
  fileMeta: DriveListedFile;
  parseResult: ParseResult;
  binding: Phase1Binding;
  skipDiagramsWrite?: boolean;
  snapshotAssetsForApply?: (args: {
    driveFileId: string;
    diagrams: ParseResult["diagrams"];
  }) => Promise<SnapshotAssetsResult>;
  snapshotAssetsForApplyForShowId?: (
    showId: string,
  ) => (args: {
    driveFileId: string;
    diagrams: ParseResult["diagrams"];
  }) => Promise<SnapshotAssetsResult>;
  verifyReelOnApply?:
    | false
    | ((staged: ParseResult["openingReel"]) => Promise<VerifyReelOnApplyResult>);
  autoPublishFirstSeen?: {
    unpublishToken: string;
    unpublishTokenExpiresAt: string;
  };
  // F1 (R30-1): wizard Phase B first-seen apply only — forwarded into applyShowSnapshot so the
  // first-seen INSERT writes published=false. Absent for cron/push/manual/live callers.
  firstSeenPublished?: false;
  // F1 (R60-1/R65-1): wizard Phase B first-seen apply only — forwarded into applyShowSnapshot so
  // the first-seen INSERT writes shows.wizard_created_session_id (provenance discriminator).
  wizardCreatedSessionId?: string;
  // Phase 2: MI-11 items from the decision rule (Phase1 outcome 'auto_apply_with_holds'). Each is
  // written as a mi11_pending hold AFTER the snapshot (so liveCrewByName is the prior snapshot) and
  // BEFORE the hold-aware applyParseResult sees the open holds.
  mi11Items?: Mi11Item[];
  // Phase 2 Task 2.9: the full set of triggered review items for this sync (renames, section
  // shrink, field changes, asset drift) — drives the auto-apply show_change_log feed rows.
  notableItems?: TriggeredReviewItem[];
  /**
   * Task 5: source-region anchors from the XLSX bytes. Optional — wizard/manual callers
   * do not yet supply bytes; Task 6 persists these via the shows UPDATE.
   */
  sourceAnchors?: Record<string, SourceAnchor>;
};

export type RoleFlagsNotice = {
  showId: string;
  code: "ROLE_FLAGS_NOTICE";
  context: {
    drive_file_id: string;
    changes: Array<{ crew_name: string; prior_flags: string[]; new_flags: string[] }>;
  };
};

export type Phase2Result =
  | {
      outcome: "applied";
      showId: string;
      roleFlagsNotice?: RoleFlagsNotice;
      snapshotRevisionId?: string;
      // §02 (FIX-3 cross-boundary thread): the post-apply parseResult.warnings (including any
      // AGENDA_DAY_EMPTIED the apply appended). runPhase2 works on LOCAL rebound parseResult copies,
      // so the apply-appended warning is LOST at this boundary unless carried explicitly. The cron /
      // manual / staged tail callers source sync_log's parse_warnings from here. Optional: callers
      // default to []; the REQUIRED field is on ProcessOneFileResult (the tail-caller surface).
      parseWarnings?: ParseResult["warnings"];
      // Stage A (admin field overrides): planned show/hotel admin_overrides mutations (sheet_value
      // refresh / fail-closed deactivations). Task 8 commits these in Stage B; carried here so the
      // wiring boundary can observe them. Optional — absent when no override-read port is wired.
      showHotelSideEffects?: OverrideSideEffect[];
    }
  | {
      outcome: "stale";
      code: StaleWriteCode;
    };

export class Phase2InfraError extends Error {
  readonly operation: string;
  override readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Phase 2 transaction-port failure during ${operation}`);
    this.name = "Phase2InfraError";
    this.operation = operation;
    this.cause = cause;
  }
}

/**
 * P2-F6 (fail-closed): a Phase-2 apply carrying MI-11 items REQUIRES a hold port (the MI-11 items
 * are written as `sync_holds` and the apply must run hold-aware to pin the old identity). If the
 * tx has no `holdPort`, the legacy raw apply would upsert the NEW email directly — silently
 * BYPASSING the identity-only gate, the milestone's security boundary. Refuse to apply instead.
 */
export class Phase2GateBypassError extends Error {
  readonly code = "MI11_GATE_NO_HOLD_PORT";
  constructor() {
    super(
      "MI-11 items present but the transaction exposes no holdPort — refusing to apply the " +
        "identity change ungated (fail closed).",
    );
    this.name = "Phase2GateBypassError";
  }
}

async function callTx<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    throw new Phase2InfraError(operation, cause);
  }
}

function staleGuardForMode(mode: Phase2Mode): "strict_less_than" | "less_than_or_equal" {
  return mode === "cron" || mode === "push" ? "strict_less_than" : "less_than_or_equal";
}

function staleCodeForMode(mode: Phase2Mode): StaleWriteCode {
  if (mode === "push") return "STALE_PUSH_ABORTED";
  if (mode === "manual") return "STALE_MANUAL_REPLAY_ABORTED";
  return "STALE_WRITE_ABORTED";
}

function roleFlagsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((flag) => rightSet.has(flag));
}

function hasLead(flags: readonly string[]): boolean {
  return flags.includes("LEAD");
}

function nonLeadRoleFlagChanges(
  previousCrewMembers: ParseResult["crewMembers"] | undefined,
  nextCrewMembers: ParseResult["crewMembers"],
): Array<{ crew_name: string; prior_flags: string[]; new_flags: string[] }> {
  const previousByName = new Map(
    (previousCrewMembers ?? []).map((member) => [member.name, member]),
  );
  const changes: Array<{ crew_name: string; prior_flags: string[]; new_flags: string[] }> = [];

  for (const nextMember of nextCrewMembers) {
    const priorMember = previousByName.get(nextMember.name);
    if (!priorMember) continue;
    if (hasLead(priorMember.role_flags) !== hasLead(nextMember.role_flags)) continue;
    if (roleFlagsEqual(priorMember.role_flags, nextMember.role_flags)) continue;
    changes.push({
      crew_name: nextMember.name,
      prior_flags: [...priorMember.role_flags],
      new_flags: [...nextMember.role_flags],
    });
  }

  return changes;
}

function diagramAssetCount(diagrams: ParseResult["diagrams"]): number {
  return diagrams.embeddedImages.length + diagrams.linkedFolderItems.length;
}

function reelWarning(code: ReelWarningCode): ParseResult["warnings"][number] {
  return { severity: "warn", code, message: code };
}

export async function runPhase2(tx: Phase2Tx, args: Phase2Args): Promise<Phase2Result> {
  // P2-F6 — FAIL CLOSED: an MI-11-bearing parse with no hold port must NEVER apply ungated. Throw
  // BEFORE any mutation (reel verify / snapshot apply / crew upsert) so the new identity never
  // reaches crew_members. The no-MI-11 legacy path is unaffected (no holds to write).
  if (args.mi11Items && args.mi11Items.length > 0 && !tx.holdPort) {
    throw new Phase2GateBypassError();
  }

  let parseResult = args.parseResult;
  let snapshotRevisionId: string | undefined;
  // Stage A (admin field overrides): planned show/hotel admin_overrides side-effects, committed in
  // Stage B (Task 8). Populated by the pre-snapshot override transform below; [] when no port.
  let showHotelSideEffects: OverrideSideEffect[] = [];
  // §3.6: the CREW partition of the single loadActiveOverrides read (SYNC-2), threaded into
  // applyParseResult so the id-keyed reconciliation runs post-hold. [] when no override port / none.
  let activeCrewOverrides: ActiveCrewOverride[] = [];
  const verifyReelOnApply =
    args.verifyReelOnApply === false ? null : (args.verifyReelOnApply ?? defaultVerifyReelOnApply);
  if (verifyReelOnApply && parseResult.openingReel) {
    const reel = await callTx("verifyReelOnApply", () =>
      verifyReelOnApply(parseResult.openingReel),
    );
    parseResult = {
      ...parseResult,
      openingReel: reel.openingReel,
      warnings: reel.warningCode
        ? [...parseResult.warnings, reelWarning(reel.warningCode)]
        : parseResult.warnings,
    };
  }
  if (
    !args.skipDiagramsWrite &&
    args.snapshotAssetsForApply &&
    diagramAssetCount(args.parseResult.diagrams) > 0
  ) {
    // Apply snapshots bytes before commit so approved JSONB never points at
    // missing objects; recovery uses a lock-free pre-pass because it repairs an
    // already-live partial snapshot instead of publishing a new approved one.
    const snapshot = await callTx("snapshotAssetsForApply", () =>
      args.snapshotAssetsForApply!({
        driveFileId: args.driveFileId,
        diagrams: args.parseResult.diagrams,
      }),
    );
    snapshotRevisionId = snapshot.snapshotRevisionId;
    const current = tx.readCurrentDiagrams
      ? await callTx("readCurrentDiagrams", () => tx.readCurrentDiagrams!(args.driveFileId))
      : null;
    parseResult = {
      ...args.parseResult,
      diagrams: {
        current,
        pending: snapshot.pending,
      } as unknown as ParseResult["diagrams"],
      warnings: [...args.parseResult.warnings, ...snapshot.warnings],
    };
  }

  // Stage A (admin field overrides, §3.2 / §5.1 / §5.3) — the PURE show/hotel override transform,
  // applied to the enriched parse BEFORE the snapshot writer so `applyShowSnapshot` persists the
  // overridden dates/venue/hotel rows. REBIND the local `parseResult` so the LATER `applyParseResult`
  // (below) reads the SAME overridden parse. Crew is NOT touched here (post-hold §3.6 / Task 7);
  // `showHotelSideEffects` is committed in Stage B (Task 8). Zero DB writes in this transform.
  const loadOverridesPort = tx.loadActiveOverrides;
  if (loadOverridesPort) {
    const activeOverrides = await callTx("loadActiveOverrides", () =>
      loadActiveOverrides({ loadActiveOverrides: loadOverridesPort.bind(tx) }, args.driveFileId),
    );
    const overridden = overrideShowHotel(parseResult, activeOverrides);
    parseResult = overridden.overriddenParseResult;
    showHotelSideEffects = overridden.showHotelSideEffects;
    // SYNC-2: partition the SAME single read into the crew slice for the post-hold §3.6 reconciliation
    // (never a second query). field is narrowed to name/role by the crew domain filter.
    activeCrewOverrides = activeOverrides
      .filter((o) => o.domain === "crew")
      .map((o) => ({
        id: o.id,
        field: o.field as "name" | "role",
        match_key: o.match_key,
        override_value: o.override_value,
      }));
  }

  const snapshot = await callTx("applyShowSnapshot", () =>
    tx.applyShowSnapshot({
      driveFileId: args.driveFileId,
      modifiedTime: args.binding.modifiedTime,
      staleGuard: staleGuardForMode(args.mode),
      parseResult,
      slug: deriveSlug(parseResult, []),
      skipDiagramsWrite: args.skipDiagramsWrite ?? false,
      ...(args.autoPublishFirstSeen ? { autoPublishFirstSeen: args.autoPublishFirstSeen } : {}),
      ...(args.firstSeenPublished === false ? { firstSeenPublished: args.firstSeenPublished } : {}),
      ...(args.wizardCreatedSessionId
        ? { wizardCreatedSessionId: args.wizardCreatedSessionId }
        : {}),
      ...(args.sourceAnchors !== undefined ? { sourceAnchors: args.sourceAnchors } : {}),
    }),
  );

  if (snapshot.outcome === "stale") {
    return { outcome: "stale", code: staleCodeForMode(args.mode) };
  }

  if (
    !snapshotRevisionId &&
    !args.skipDiagramsWrite &&
    args.snapshotAssetsForApplyForShowId &&
    tx.applyDiagramSnapshot &&
    diagramAssetCount(parseResult.diagrams) > 0
  ) {
    const snapshotAssetsForApply = args.snapshotAssetsForApplyForShowId(snapshot.showId);
    const snapshotAssets = await callTx("snapshotAssetsForApply", () =>
      snapshotAssetsForApply({
        driveFileId: args.driveFileId,
        diagrams: parseResult.diagrams,
      }),
    );
    snapshotRevisionId = snapshotAssets.snapshotRevisionId;
    parseResult = {
      ...parseResult,
      diagrams: {
        current: null,
        pending: snapshotAssets.pending,
      } as unknown as ParseResult["diagrams"],
      warnings: [...parseResult.warnings, ...snapshotAssets.warnings],
    };
    await callTx("applyDiagramSnapshot", () =>
      tx.applyDiagramSnapshot!(args.driveFileId, parseResult.diagrams),
    );
  }

  // Phase 2: write MI-11 holds (if any) BEFORE the hold-aware apply, using the prior snapshot as
  // liveCrewByName, then run applyParseResult hold-aware. Both ride the existing JS show lock via
  // the service-role hold-port — no nested lock-taking RPC (invariant 2).
  const port = tx.holdPort?.();
  if (port && args.mi11Items && args.mi11Items.length > 0) {
    const liveCrewByName = new Map<string, LiveCrewRow>(
      (snapshot.previousCrewMembers ?? []).map((member) => [
        member.name,
        {
          name: member.name,
          email: member.email,
          phone: member.phone,
          role: member.role,
          role_flags: member.role_flags as unknown as string[],
          date_restriction: member.date_restriction,
          stage_restriction: member.stage_restriction,
          flight_info: member.flight_info,
        },
      ]),
    );
    await callTx("writeMi11Holds", () =>
      writeMi11Holds(port, {
        showId: snapshot.showId,
        driveFileId: args.driveFileId,
        mi11Items: args.mi11Items!,
        liveCrewByName,
        baseModifiedTime: args.binding.modifiedTime,
      }),
    );
  }

  const applyOutcome = await callTx("applyParseResult", () =>
    applyParseResult(tx, {
      driveFileId: args.driveFileId,
      parseResult,
      snapshot,
      ...(port ? { holds: { port, baseModifiedTime: args.binding.modifiedTime } } : {}),
      // Carry the prepare-stage region anchors so applyParseResult can re-anchor the
      // apply-only AGENDA_DAY_EMPTIED warning it appends (deep link to the schedule tab).
      ...(args.sourceAnchors !== undefined ? { sourceAnchors: args.sourceAnchors } : {}),
      // §3.6: the crew override partition (SYNC-2) drives the post-hold id-keyed reconciliation.
      ...(activeCrewOverrides.length > 0 ? { activeCrewOverrides } : {}),
    }),
  );

  // Task 2.9: write show_change_log rows for each AUTO-APPLIED notable change, using the
  // PRE-reconcile snapshot for before_image (load-bearing for Phase-4 undo). Held entities are
  // excluded (their feed entry comes from sync_holds, Phase 5). Runs inside the locked txn.
  if (port && snapshot.previousCrewMembers && args.notableItems !== undefined) {
    const heldNames = new Set(
      (await callTx("readOpenHolds", () => readOpenHolds(port, snapshot.showId))).map(
        (hold) => hold.entity_key,
      ),
    );
    await callTx("writeAutoApplyChanges", () =>
      writeAutoApplyChanges({
        port,
        showId: snapshot.showId,
        driveFileId: args.driveFileId,
        previousCrewMembers: snapshot.previousCrewMembers ?? [],
        // P2-F2: derive crew_added/removed/renamed from the ACTUALLY-APPLIED crew list, NOT the
        // raw parse — a reservation-suppressed row never landed in crew_members, so it must not
        // get a phantom auto_apply crew_added feed row.
        nextCrewMembers: applyOutcome.appliedCrewMembers,
        triggeredItems: args.notableItems ?? [],
        heldNames,
      }),
    );

    // Phase 4 / PF19 (resolution #18): before_image retention + supersession flip. After the new
    // change rows are written, null the before_image AND flip status='superseded' on any OLDER
    // 'applied' crew-domain row whose entity_ref now has a newer change — so a stale Undo is both
    // hidden by the feed and rejected by undo_change (never falls into the tombstone branch). Runs
    // inside the existing show lock via the same service-role hold port (NO new lock).
    // INVARIANT (P4-F2): every writer of an APPLIED crew-identity change_kind row MUST call
    // cleanup_superseded_before_images under the show lock before returning. This is the Phase-2
    // auto-apply writer; mi11_approve_hold is the other (it runs cleanup in its own body).
    // not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client).
    await callTx("cleanupSupersededBeforeImages", () =>
      port.unsafe("select public.cleanup_superseded_before_images($1)", [snapshot.showId]),
    );
  }

  const roleFlagChanges = nonLeadRoleFlagChanges(
    snapshot.previousCrewMembers,
    parseResult.crewMembers,
  );
  const roleFlagsNotice =
    roleFlagChanges.length > 0
      ? {
          showId: snapshot.showId,
          code: "ROLE_FLAGS_NOTICE" as const,
          context: {
            drive_file_id: args.driveFileId,
            changes: roleFlagChanges,
          },
        }
      : undefined;

  const applied: Extract<Phase2Result, { outcome: "applied" }> = {
    outcome: "applied",
    showId: snapshot.showId,
    // §02 (FIX-3): carry the post-apply warnings (incl. any AGENDA_DAY_EMPTIED applyParseResult
    // appended to THIS parseResult.warnings reference) out of the runPhase2 boundary so the tail
    // callers can log them to sync_log. applyParseResult mutates parseResult.warnings in place.
    parseWarnings: parseResult.warnings,
  };
  if (snapshotRevisionId) applied.snapshotRevisionId = snapshotRevisionId;
  if (roleFlagsNotice) applied.roleFlagsNotice = roleFlagsNotice;
  // Stage B slot (Task 8): the show/hotel override side-effects planned in Stage A ride out on the
  // applied result so the caller can commit them (sheet_value refresh / deactivations) in the same
  // locked tx. Carried only when the override-read port was wired (else []).
  // Stage B carries ALL override side-effects: show/hotel from Stage A + crew from the post-hold
  // §3.6 reconciliation (Task 8 commits them uniformly in the same locked tx).
  const overrideSideEffects = [...showHotelSideEffects, ...(applyOutcome.crewSideEffects ?? [])];
  if (overrideSideEffects.length > 0) {
    applied.showHotelSideEffects = overrideSideEffects;
    // Stage B (§3.2): commit ALL planned admin_overrides mutations (show/hotel from Stage A + crew from
    // the post-hold §3.6 reconciliation) INSIDE this locked tx, on the applied path only. We are past the
    // stale short-circuit above, so a stale/no-op sync never reaches here — admin_overrides stays intact.
    // Side-effects are non-empty only when the override overlay ran, which requires the write ports.
    const { refreshOverrideSheetValue, deactivateOverride } = tx;
    if (!refreshOverrideSheetValue || !deactivateOverride) {
      throw new Error(
        "runPhase2: committing override side-effects requires the refreshOverrideSheetValue/deactivateOverride tx-port methods",
      );
    }
    await callTx("commitOverrideSideEffects", () =>
      commitOverrideSideEffects(
        {
          refreshOverrideSheetValue: refreshOverrideSheetValue.bind(tx),
          deactivateOverride: deactivateOverride.bind(tx),
        },
        overrideSideEffects,
      ),
    );
  }
  return applied;
}
