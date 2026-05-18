import { randomUUID } from "node:crypto";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
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
  | { outcome: "parsed"; stagedId?: string };

export type RunManualStageForFirstSeenDeps = {
  fileMeta?: DriveListedFile;
  parseResult?: ParseResult;
  runPhase1?: typeof runPhase1;
};

function fallbackFileMeta(driveFileId: string): DriveListedFile {
  return {
    driveFileId,
    name: driveFileId,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: new Date(0).toISOString(),
    parents: [],
  };
}

function fallbackParseResult(): ParseResult {
  return {
    show: {
      title: "First Seen",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

function warningSummary(parseResult: ParseResult): string {
  return parseResult.warnings
    .filter((warning) => warning.severity === "warn")
    .map((warning) => warning.message)
    .join("; ");
}

async function forceFirstSeenReviewStage(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  fileMeta: DriveListedFile,
  parseResult: ParseResult,
): Promise<RunManualStageForFirstSeenResult> {
  const triggeredReviewItems: TriggeredReviewItem[] = [
    { id: randomUUID(), invariant: "FIRST_SEEN_REVIEW" },
  ];
  await tx.deleteLivePendingIngestion(driveFileId);
  const upserted = await tx.upsertLivePendingSync({
    driveFileId,
    wizardSessionId: null,
    baseModifiedTime: null,
    stagedModifiedTime: fileMeta.modifiedTime,
    parseResult,
    triggeredReviewItems,
    priorLastSyncStatus: null,
    priorLastSyncError: null,
    sourceKind: "manual",
    warningSummary: warningSummary(parseResult),
  });
  return { outcome: "parsed_pending_review", stagedId: upserted.stagedId };
}

function toResult(result: Phase1Result): RunManualStageForFirstSeenResult | null {
  if (result.outcome === "stage") {
    return { outcome: "parsed_pending_review", stagedId: result.stagedId };
  }
  if (result.outcome === "hard_fail") {
    return { outcome: "hard_failed", errorCode: result.code };
  }
  if (result.outcome === "pass") return { outcome: "parsed" };
  if (result.outcome === "defer") {
    return { outcome: "hard_failed", errorCode: result.reason };
  }
  return null;
}

export async function runManualStageForFirstSeen(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  deps: RunManualStageForFirstSeenDeps = {},
): Promise<RunManualStageForFirstSeenResult> {
  await assertShowLockHeld(tx, driveFileId);
  const fileMeta = deps.fileMeta ?? fallbackFileMeta(driveFileId);
  const parseResult = deps.parseResult ?? fallbackParseResult();
  const result = await (deps.runPhase1 ?? runPhase1)(tx as never, {
    driveFileId,
    mode: "manual",
    fileMeta,
    parseResult,
    binding: {
      bindingToken: fileMeta.headRevisionId ?? fileMeta.modifiedTime,
      modifiedTime: fileMeta.modifiedTime,
    },
  });
  return toResult(result) ?? await forceFirstSeenReviewStage(tx, driveFileId, fileMeta, parseResult);
}
