import { getActiveWatchedFolderId } from "@/lib/appSettings/getWatchedFolderId";
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  processOneFile,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
  type SyncPipelineTx,
  SHEET_UNAVAILABLE,
  STAGED_PARSE_SOURCE_GONE,
  SYNC_INFRA_ERROR,
  withPostgresSyncPipelineLock,
} from "@/lib/sync/runScheduledCronSync";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";
import { ARCHIVED_SKIP_REASON, readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";

/** A sync_log entry shape (the parameter the logSync sink accepts). */
type PushLogEntry = Parameters<NonNullable<ProcessOneFileDeps["logSync"]>>[0];

/** Per-show pipeline lock binding (provides a LockedShowTx for the archived re-read). */
type PushPipelineLock = (
  driveFileId: string,
  fn: (tx: LockedShowTx<SyncPipelineTx>) => Promise<ProcessOneFileResult>,
) => Promise<ProcessOneFileResult>;

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
  | { outcome: "skip"; reason: "WEBHOOK_NOOP_ALREADY_SYNCED"; logEntry: PushLogEntry }
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
  // R9 DEF-4 TOCTOU: per-show lock binding for the authoritative archived re-read before each
  // logSync-producing branch. Defaults to withPostgresSyncPipelineLock (blocking).
  withPipelineLock?: PushPipelineLock;
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
      return {
        outcome: "skip",
        reason: "WEBHOOK_NOOP_ALREADY_SYNCED",
        // Deferred: the runner writes this UNDER the per-show lock after re-reading archived (R9).
        logEntry: { driveFileId, outcome: "skipped", code: "WEBHOOK_NOOP_ALREADY_SYNCED" },
      };
    }
    return { outcome: "proceed" };
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readPushDuplicatePreflight", "thrown_error", cause);
  }
}

/** A deferred error outcome: its sync_log write is held back so the runner can gate it on an in-lock
 *  archived re-read (R9 DEF-4 TOCTOU) — an archived show must get NO fetch-failure / out-of-scope log. */
type PushFetchDeferred = { result: ProcessOneFileResult; logEntry: PushLogEntry };

async function fetchScopedPushFileMeta(
  driveFileId: string,
  deps: RunPushSyncForShowDeps,
): Promise<DriveListedFile | PushFetchDeferred> {
  const folderResult = await (deps.getActiveWatchedFolderId ?? getActiveWatchedFolderId)();
  if ("kind" in folderResult) {
    return {
      result: { outcome: "parse_error", code: SYNC_INFRA_ERROR },
      logEntry: {
        driveFileId,
        outcome: "parse_error",
        code: SYNC_INFRA_ERROR,
        payload: { kind: "push_no_watched_folder_scope", reason: folderResult.kind },
      },
    };
  }

  let fileMeta: DriveListedFile;
  try {
    fileMeta = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
  } catch (error) {
    const result = isDriveSourceGone(error)
      ? { outcome: "source_gone" as const, code: STAGED_PARSE_SOURCE_GONE }
      : { outcome: "parse_error" as const, code: SYNC_INFRA_ERROR };
    return {
      result,
      logEntry: {
        driveFileId,
        outcome: result.outcome === "source_gone" ? "error" : result.outcome,
        code: result.code,
      },
    };
  }

  const watchedFolderId = folderResult.folderId;
  if (!fileMeta.parents.includes(watchedFolderId)) {
    return {
      result: { outcome: "source_gone", code: SHEET_UNAVAILABLE },
      logEntry: {
        driveFileId,
        outcome: "error",
        code: SHEET_UNAVAILABLE,
        payload: { kind: "push_source_out_of_scope", watchedFolderId, parents: fileMeta.parents },
      },
    };
  }

  return fileMeta;
}

/**
 * Write a deferred push log UNDER the per-show advisory lock, but ONLY after re-reading `archived`. R9
 * DEF-4 TOCTOU: `runPushSyncForShow`'s initial archived preflight runs unlocked, before the Drive fetch;
 * an Archive may commit in the gap. archive_show takes the SAME advisory lock, so re-reading + logging
 * while we hold it is authoritative — archive cannot interleave. If the show became archived, skip
 * SILENTLY (return ARCHIVED_SKIP_REASON, write NO sync_log), honoring the "archived ⇒ silent/no-log"
 * contract. Otherwise write the deferred log and return the original error/skip result.
 */
async function logUnlessArchived(
  withLock: PushPipelineLock,
  driveFileId: string,
  logSync: NonNullable<RunPushSyncForShowDeps["logSync"]>,
  logEntry: PushLogEntry,
  result: ProcessOneFileResult,
): Promise<ProcessOneFileResult> {
  return withLock(driveFileId, async (tx) => {
    if (await readShowArchived_unlocked(tx, driveFileId)) {
      return { outcome: "skipped", reason: ARCHIVED_SKIP_REASON };
    }
    await logSync(logEntry);
    return result;
  });
}

export async function runPushSyncForShow(
  driveFileId: string,
  deps: RunPushSyncForShowDeps = {},
): Promise<ProcessOneFileResult> {
  const logSync = deps.logSync ?? writeSyncLog;
  const withLock: PushPipelineLock =
    deps.withPipelineLock ??
    (async (id, fn) => {
      const r = await withPostgresSyncPipelineLock<ProcessOneFileResult>(id, fn, { tryOnly: false });
      // tryOnly:false blocks until the lock is acquired, so ConcurrentSyncSkipped is unreachable here;
      // narrow defensively to the silent archived-style skip so we never write a misleading log.
      if ("skipped" in r) return { outcome: "skipped", reason: ARCHIVED_SKIP_REASON };
      return r;
    });
  // DEF-4: archived preflight BEFORE any Drive fetch — silent skip (no fetch, no sync_log).
  if (await (deps.isShowArchived ?? readShowArchivedForPush)(driveFileId)) {
    return { outcome: "skipped", reason: ARCHIVED_SKIP_REASON };
  }
  const fetched = deps.fileMeta ?? (await fetchScopedPushFileMeta(driveFileId, deps));
  if ("result" in fetched) {
    // R9 DEF-4 TOCTOU: gate the fetch-failure / out-of-scope log on a locked archived re-read.
    return await logUnlessArchived(withLock, driveFileId, logSync, fetched.logEntry, fetched.result);
  }
  const fileMeta = fetched;
  const preflight = await (deps.readPushDuplicatePreflight ?? readPushDuplicatePreflight)(
    driveFileId,
    fileMeta,
  );
  if (preflight.outcome === "skip") {
    // R9 DEF-4 TOCTOU: gate the duplicate-skip log on a locked archived re-read.
    return await logUnlessArchived(withLock, driveFileId, logSync, preflight.logEntry, {
      outcome: "skipped",
      reason: preflight.reason,
    });
  }
  const runOne = deps.processOneFile ?? processOneFile;
  return await runOne(driveFileId, "push", fileMeta, {
    logSync,
  });
}
