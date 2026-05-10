import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  processOneFile,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
} from "@/lib/sync/runScheduledCronSync";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";

type PushDuplicatePreflightResult =
  | { outcome: "skip"; reason: "WEBHOOK_NOOP_ALREADY_SYNCED" }
  | { outcome: "proceed" };

type PushDuplicateShowRow = {
  last_seen_modified_time: string | null;
};

type PushDuplicatePendingSyncRow = {
  staged_modified_time: string | null;
};

export type RunPushSyncForShowDeps = {
  fileMeta?: DriveListedFile;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  readPushDuplicatePreflight?: (
    driveFileId: string,
    fileMeta: DriveListedFile,
  ) => Promise<PushDuplicatePreflightResult>;
  processOneFile?: (
    driveFileId: string,
    mode: "push",
    fileMeta: DriveListedFile,
    deps?: Pick<ProcessOneFileDeps, "logSync">,
  ) => Promise<ProcessOneFileResult>;
  logSync?: ProcessOneFileDeps["logSync"];
};

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maxTimestampMs(...values: Array<string | null | undefined>): number | null {
  const parsed = values
    .map((value) => timestampMs(value))
    .filter((value): value is number => value !== null);
  if (parsed.length === 0) return null;
  return Math.max(...parsed);
}

function isAtOrBefore(left: string, rightMs: number | null): boolean {
  const leftMs = timestampMs(left);
  if (leftMs === null || rightMs === null) return false;
  return leftMs <= rightMs;
}

async function readPushDuplicatePreflight(
  driveFileId: string,
  fileMeta: DriveListedFile,
): Promise<PushDuplicatePreflightResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [showResult, pendingSyncResult] = await Promise.all([
      supabase
        .from("shows")
        .select("last_seen_modified_time")
        .eq("drive_file_id", driveFileId)
        .maybeSingle(),
      supabase
        .from("pending_syncs")
        .select("staged_modified_time")
        .eq("drive_file_id", driveFileId)
        .is("wizard_session_id", null)
        .maybeSingle(),
    ]);
    const { data: show, error: showError } = showResult;
    if (showError) {
      throw new SyncInfraError("readPushDuplicateShowWatermark", "returned_error", showError);
    }
    const { data: pendingSync, error: pendingSyncError } = pendingSyncResult;
    if (pendingSyncError) {
      throw new SyncInfraError(
        "readPushDuplicatePendingWatermark",
        "returned_error",
        pendingSyncError,
      );
    }
    const effectiveWatermark = maxTimestampMs(
      (show as PushDuplicateShowRow | null)?.last_seen_modified_time,
      (pendingSync as PushDuplicatePendingSyncRow | null)?.staged_modified_time,
    );
    if (isAtOrBefore(fileMeta.modifiedTime, effectiveWatermark)) {
      return { outcome: "skip", reason: "WEBHOOK_NOOP_ALREADY_SYNCED" };
    }
    return { outcome: "proceed" };
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readPushDuplicatePreflight", "thrown_error", cause);
  }
}

export async function runPushSyncForShow(
  driveFileId: string,
  deps: RunPushSyncForShowDeps = {},
): Promise<ProcessOneFileResult> {
  const fileMeta =
    deps.fileMeta ?? (await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId));
  const logSync = deps.logSync ?? writeSyncLog;
  const preflight = await (deps.readPushDuplicatePreflight ?? readPushDuplicatePreflight)(
    driveFileId,
    fileMeta,
  );
  if (preflight.outcome === "skip") {
    await logSync({
      driveFileId,
      outcome: "skipped",
      code: preflight.reason,
    });
    return { outcome: "skipped", reason: preflight.reason };
  }
  const runOne = deps.processOneFile ?? processOneFile;
  return await runOne(driveFileId, "push", fileMeta, {
    logSync,
  });
}
