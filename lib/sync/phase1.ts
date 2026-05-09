import { randomUUID } from "node:crypto";
import type { DriveListedFile } from "@/lib/drive/list";
import { runInvariants } from "@/lib/parser/invariants";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import { MI8_DEBOUNCE_MS } from "@/lib/sync/constants";
import type { ResolvedSyncMode, SyncMode } from "@/lib/sync/perFileProcessor";

export type Phase1Binding = {
  bindingToken: string;
  modifiedTime: string;
};

export type Phase1ShowRow = {
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  priorParseResult: ParseResult;
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
  updateShowParseError(
    driveFileId: string,
    error: { code: string; message: string },
  ): Promise<void>;
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
};

export type Phase1Result =
  | {
      outcome: "hard_fail";
      code: string;
      failedCodes: string[];
      message: string;
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
      outcome: "defer";
      reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable";
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
  return parseResult.warnings.map((warning) => warning.code).join(", ");
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

function sentinelFor(args: Phase1Args, show: Phase1ShowRow | null): TriggeredReviewItem | null {
  if (args.mode === "onboarding_scan") {
    return { id: randomUUID(), invariant: "ONBOARDING_SCAN_REVIEW" };
  }
  if (!show) {
    return { id: randomUUID(), invariant: "FIRST_SEEN_REVIEW" };
  }
  return null;
}

export async function runPhase1(tx: Phase1Tx, args: Phase1Args): Promise<Phase1Result> {
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
    if (show) {
      await callTx("updateShowParseError", () =>
        tx.updateShowParseError(args.driveFileId, { code, message }),
      );
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
    return { outcome: "hard_fail", code, failedCodes: invariant.failedCodes, message };
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
  const debounce = mi8DebounceReason(args, invariantItems);
  if (debounce) return debounce;

  const triggeredReviewItems = sentinel ? [sentinel] : invariantItems;

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
      }),
    );
    if (show) {
      await callTx("updateShowPendingReview", () => tx.updateShowPendingReview(args.driveFileId));
    }
    return { outcome: "stage", triggeredReviewItems, stagedId: upserted.stagedId };
  }

  return { outcome: "pass" };
}
