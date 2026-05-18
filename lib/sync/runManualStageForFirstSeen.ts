import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import {
  assertShowLockHeld,
  type LockedShowTx,
} from "@/lib/sync/lockedShowTx";
import {
  runPhase1,
  type Phase1Result,
} from "@/lib/sync/phase1";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

export type RunManualStageForFirstSeenTx = SyncPipelineTx;

export type RunManualStageForFirstSeenResult =
  | { outcome: "stage"; stagedId: string }
  | { outcome: "hard_fail"; code: string }
  | { outcome: "pass" };

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

function toResult(result: Phase1Result): RunManualStageForFirstSeenResult {
  if (result.outcome === "stage") return { outcome: "stage", stagedId: result.stagedId };
  if (result.outcome === "hard_fail") return { outcome: "hard_fail", code: result.code };
  return { outcome: "pass" };
}

export async function runManualStageForFirstSeen(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  deps: RunManualStageForFirstSeenDeps = {},
): Promise<RunManualStageForFirstSeenResult> {
  await assertShowLockHeld(tx, driveFileId);
  const fileMeta = deps.fileMeta ?? fallbackFileMeta(driveFileId);
  const parseResult = deps.parseResult ?? fallbackParseResult();
  const result = await (deps.runPhase1 ?? runPhase1)(tx, {
    driveFileId,
    mode: "onboarding_scan",
    fileMeta,
    parseResult,
    binding: {
      bindingToken: fileMeta.headRevisionId ?? fileMeta.modifiedTime,
      modifiedTime: fileMeta.modifiedTime,
    },
    wizardSessionId: undefined,
  });
  return toResult(result);
}
