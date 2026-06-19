import type { DriveListedFile } from "@/lib/drive/list";
import { deriveSlug } from "@/lib/parser/slug";
import type { AgendaEntry, ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import { writeAutoApplyChanges } from "@/lib/sync/changeLog/writeAutoApplyChanges";
import { readOpenHolds } from "@/lib/sync/holds/holdPort";
import {
  applyParseResult,
  type ApplyParseResultTx,
  type PreviousCrewMember,
} from "@/lib/sync/applyParseResult";
import { writeMi11Holds, type Mi11Item, type LiveCrewRow } from "@/lib/sync/holds/writeMi11Holds";
import type { HoldPort } from "@/lib/sync/holds/holdPort";
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
        priorRunOfShow: Record<string, AgendaEntry[]> | null;
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
  return applied;
}
