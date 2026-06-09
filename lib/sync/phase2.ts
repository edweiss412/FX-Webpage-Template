import type { DriveListedFile } from "@/lib/drive/list";
import { deriveSlug } from "@/lib/parser/slug";
import type { ParseResult } from "@/lib/parser/types";
import {
  applyParseResult,
  type ApplyParseResultTx,
  type PreviousCrewMember,
} from "@/lib/sync/applyParseResult";
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
  }): Promise<
    | {
        outcome: "updated";
        showId: string;
        previousCrewNames: string[];
        previousCrewMembers?: PreviousCrewMember[];
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

  await callTx("applyParseResult", () =>
    applyParseResult(tx, {
      driveFileId: args.driveFileId,
      parseResult,
      snapshot,
    }),
  );

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
  };
  if (snapshotRevisionId) applied.snapshotRevisionId = snapshotRevisionId;
  if (roleFlagsNotice) applied.roleFlagsNotice = roleFlagsNotice;
  return applied;
}
