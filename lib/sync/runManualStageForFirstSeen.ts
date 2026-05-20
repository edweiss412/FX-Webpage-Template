import { randomUUID } from "node:crypto";
import type { UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import {
  makeSnapshotAssetsForApply,
  type SnapshotAssetsApplyTx,
} from "@/lib/sync/defaultSnapshotAssetsForApply";
import { assertShowLockHeld, type LockedShowTx } from "@/lib/sync/lockedShowTx";
import { runPhase1, type Phase1PendingSyncRow, type Phase1Result } from "@/lib/sync/phase1";
import { runPhase2, type Phase2Tx } from "@/lib/sync/phase2";
import {
  emitSuccessfulPhase2Tail,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
} from "@/lib/sync/runScheduledCronSync";

export type RunManualStageForFirstSeenTx = Phase2Tx & {
  readShowId?(driveFileId: string): Promise<string | null>;
  insertPendingSnapshotUpload?: SnapshotAssetsApplyTx["insertPendingSnapshotUpload"];
  markPendingSnapshotDeleteStarted?: SnapshotAssetsApplyTx["markPendingSnapshotDeleteStarted"];
  deleteRevisionRaceCooldowns?(driveFileId: string): Promise<void>;
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
  upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null>;
  deleteLivePendingIngestion(driveFileId: string): Promise<void>;
  upsertLivePendingSync(
    row: Omit<Phase1PendingSyncRow, "stagedId"> & { stagedId?: string },
  ): Promise<{ stagedId: string }>;
};

export type RunManualStageForFirstSeenResult =
  | { outcome: "parsed_pending_review"; stagedId: string }
  | { outcome: "hard_failed"; errorCode: string }
  | { outcome: "deferred"; reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable" }
  | { outcome: "applied"; showId: string }
  | { outcome: "parsed"; stagedId?: string };

export type RunManualStageForFirstSeenDeps = {
  fileMeta?: DriveListedFile;
  parseResult?: ParseResult;
  binding?: { bindingToken: string; modifiedTime: string };
  runPhase1?: typeof runPhase1;
  runPhase2?: typeof runPhase2;
  createUnpublishToken?: () => string;
  now?: () => Date;
  upsertAdminAlert?: ProcessOneFileDeps["upsertAdminAlert"];
  publishShowInvalidation?: ProcessOneFileDeps["publishShowInvalidation"];
  logSync?: ProcessOneFileDeps["logSync"];
};

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function toResult(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  args: {
    fileMeta: DriveListedFile;
    parseResult: ParseResult;
    binding: { bindingToken: string; modifiedTime: string };
  },
  deps: RunManualStageForFirstSeenDeps,
  result: Phase1Result,
): Promise<RunManualStageForFirstSeenResult | null> {
  if (result.outcome === "stage") {
    return { outcome: "parsed_pending_review", stagedId: result.stagedId };
  }
  if (result.outcome === "hard_fail") {
    return { outcome: "hard_failed", errorCode: result.code };
  }
  if (result.outcome === "pass") return { outcome: "parsed" };
  if (result.outcome === "auto_publish_ready") {
    const autoPublishFirstSeen = {
      unpublishToken: (deps.createUnpublishToken ?? randomUUID)(),
      unpublishTokenExpiresAt: addHours((deps.now ?? (() => new Date()))(), 24).toISOString(),
    };
    const snapshotAssetsForApply = await (async () => {
      if (!tx.insertPendingSnapshotUpload) return undefined;
      const showId = await tx.readShowId?.(driveFileId);
      return showId
        ? makeSnapshotAssetsForApply(showId, tx as Parameters<typeof makeSnapshotAssetsForApply>[1])
        : undefined;
    })();
    const snapshotAssetsForApplyForShowId = tx.insertPendingSnapshotUpload
      ? (showId: string) =>
          makeSnapshotAssetsForApply(showId, tx as Parameters<typeof makeSnapshotAssetsForApply>[1])
      : undefined;
    const phase2 = await (deps.runPhase2 ?? runPhase2)(tx, {
      driveFileId,
      mode: "manual",
      fileMeta: args.fileMeta,
      parseResult: args.parseResult,
      binding: args.binding,
      ...(snapshotAssetsForApply ? { snapshotAssetsForApply } : {}),
      ...(snapshotAssetsForApplyForShowId ? { snapshotAssetsForApplyForShowId } : {}),
      verifyReelOnApply: false,
      autoPublishFirstSeen,
    });
    if (phase2.outcome === "stale") {
      return { outcome: "hard_failed", errorCode: phase2.code };
    }
    const applied: Extract<ProcessOneFileResult, { outcome: "applied" }> = {
      outcome: "applied",
      showId: phase2.showId,
    };
    if (phase2.roleFlagsNotice) applied.roleFlagsNotice = phase2.roleFlagsNotice;
    if (phase2.snapshotRevisionId) applied.snapshotRevisionId = phase2.snapshotRevisionId;
    await emitSuccessfulPhase2Tail({
      tx,
      result: applied,
      deps: {
        ...deps,
        upsertAdminAlert: deps.upsertAdminAlert ?? tx.upsertAdminAlert.bind(tx),
      },
      driveFileId,
      fileMeta: args.fileMeta,
      parseResult: args.parseResult,
      autoPublishFirstSeen,
    });
    return { outcome: "applied", showId: phase2.showId };
  }
  if (result.outcome === "defer") {
    return { outcome: "deferred", reason: result.reason };
  }
  return null;
}

export async function runManualStageForFirstSeen(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  deps: RunManualStageForFirstSeenDeps = {},
): Promise<RunManualStageForFirstSeenResult> {
  await assertShowLockHeld(tx, driveFileId);
  if (!deps.fileMeta || !deps.parseResult || !deps.binding) {
    throw new Error(
      "runManualStageForFirstSeen requires pre-fetched fileMeta, parseResult, and binding",
    );
  }
  const fileMeta = deps.fileMeta;
  const binding = deps.binding;
  const parseResult = deps.parseResult;
  const result = await (deps.runPhase1 ?? runPhase1)(tx as never, {
    driveFileId,
    mode: "manual",
    fileMeta,
    parseResult,
    binding,
  });
  return (
    (await toResult(tx, driveFileId, { fileMeta, parseResult, binding }, deps, result)) ?? {
      outcome: "parsed",
    }
  );
}
