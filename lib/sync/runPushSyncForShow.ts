import { getActiveWatchedFolderId } from "@/lib/appSettings/getWatchedFolderId";
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  processOneFile,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
  SHEET_UNAVAILABLE,
  STAGED_PARSE_SOURCE_GONE,
  SYNC_INFRA_ERROR,
} from "@/lib/sync/runScheduledCronSync";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";
import { ARCHIVED_SKIP_REASON } from "@/lib/sync/lifecycleGuards";

async function readShowArchivedForPush(driveFileId: string): Promise<boolean> {
  // Supabase call-boundary discipline (AGENTS.md invariant 9): map BOTH the returned `{ error }` AND
  // synchronous throws (client construction, `.from()`, network) to SyncInfraError. Without the catch, a
  // Supabase outage in this preflight would escape as a plain Error and the webhook catch path — which
  // classifies ONLY SyncInfraError as infra — would log it as a per-file sync failure, hiding the outage.
  // Mirrors the sibling readPushDuplicatePreflight (returned_error + thrown_error).
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("shows")
      .select("archived")
      .eq("drive_file_id", driveFileId)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readShowArchivedForPush", "returned_error", error);
    }
    return Boolean((data as { archived: boolean | null } | null)?.archived);
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readShowArchivedForPush", "thrown_error", cause);
  }
}

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
  getActiveWatchedFolderId?: typeof getActiveWatchedFolderId;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  isShowArchived?: (driveFileId: string) => Promise<boolean>;
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

function driveErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const value = candidate.code ?? candidate.status ?? candidate.response?.status;
  return typeof value === "number" ? value : null;
}

function isDriveSourceGone(error: unknown): boolean {
  const status = driveErrorStatus(error);
  return status === 404 || status === 410;
}

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

async function fetchScopedPushFileMeta(
  driveFileId: string,
  deps: RunPushSyncForShowDeps,
  logSync: NonNullable<RunPushSyncForShowDeps["logSync"]>,
): Promise<DriveListedFile | Extract<ProcessOneFileResult, { outcome: "source_gone" | "parse_error" }>> {
  const folderResult = await (deps.getActiveWatchedFolderId ?? getActiveWatchedFolderId)();
  if ("kind" in folderResult) {
    const result = { outcome: "parse_error" as const, code: SYNC_INFRA_ERROR };
    await logSync({
      driveFileId,
      outcome: result.outcome,
      code: result.code,
      payload: {
        kind: "push_no_watched_folder_scope",
        reason: folderResult.kind,
      },
    });
    return result;
  }

  let fileMeta: DriveListedFile;
  try {
    fileMeta = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
  } catch (error) {
    const result = isDriveSourceGone(error)
      ? { outcome: "source_gone" as const, code: STAGED_PARSE_SOURCE_GONE }
      : { outcome: "parse_error" as const, code: SYNC_INFRA_ERROR };
    await logSync({
      driveFileId,
      outcome: result.outcome === "source_gone" ? "error" : result.outcome,
      code: result.code,
    });
    return result;
  }

  const watchedFolderId = folderResult.folderId;
  if (!fileMeta.parents.includes(watchedFolderId)) {
    const result = { outcome: "source_gone" as const, code: SHEET_UNAVAILABLE };
    await logSync({
      driveFileId,
      outcome: "error",
      code: result.code,
      payload: {
        kind: "push_source_out_of_scope",
        watchedFolderId,
        parents: fileMeta.parents,
      },
    });
    return result;
  }

  return fileMeta;
}

export async function runPushSyncForShow(
  driveFileId: string,
  deps: RunPushSyncForShowDeps = {},
): Promise<ProcessOneFileResult> {
  const logSync = deps.logSync ?? writeSyncLog;
  // DEF-4: archived preflight BEFORE any Drive fetch — silent skip (no fetch, no sync_log).
  if (await (deps.isShowArchived ?? readShowArchivedForPush)(driveFileId)) {
    return { outcome: "skipped", reason: ARCHIVED_SKIP_REASON };
  }
  const fileMeta = deps.fileMeta ?? (await fetchScopedPushFileMeta(driveFileId, deps, logSync));
  if ("outcome" in fileMeta) return fileMeta;
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
