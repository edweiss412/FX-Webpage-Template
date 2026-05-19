import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import {
  assertShowLockHeld,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import {
  runPhase1,
  type Phase1PendingSyncRow,
  type Phase1Result,
} from "@/lib/sync/phase1";

export type RunManualStageForFirstSeenTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
  deleteLivePendingIngestion(driveFileId: string): Promise<void>;
  upsertLivePendingSync(
    row: Omit<Phase1PendingSyncRow, "stagedId"> & { stagedId?: string },
  ): Promise<{ stagedId: string }>;
};

export type RunManualStageForFirstSeenResult =
  | { outcome: "parsed_pending_review"; stagedId: string }
  | { outcome: "hard_failed"; errorCode: string }
  | { outcome: "deferred"; reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable" }
  | { outcome: "parsed"; stagedId?: string };

export type RunManualStageForFirstSeenDeps = {
  fileMeta?: DriveListedFile;
  parseResult?: ParseResult;
  binding?: { bindingToken: string; modifiedTime: string };
  runPhase1?: typeof runPhase1;
};

function toResult(result: Phase1Result): RunManualStageForFirstSeenResult | null {
  if (result.outcome === "stage") {
    return { outcome: "parsed_pending_review", stagedId: result.stagedId };
  }
  if (result.outcome === "hard_fail") {
    return { outcome: "hard_failed", errorCode: result.code };
  }
  if (result.outcome === "pass") return { outcome: "parsed" };
  if (result.outcome === "auto_publish_ready") return { outcome: "parsed" };
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
    throw new Error("runManualStageForFirstSeen requires pre-fetched fileMeta, parseResult, and binding");
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
  return toResult(result) ?? { outcome: "parsed" };
}
