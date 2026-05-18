import { NextResponse } from "next/server";
import postgres from "postgres";
import type { DriveListedFile } from "@/lib/drive/list";
import { fetchDriveFileMetadata as defaultFetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";
import {
  runManualStageForFirstSeen as defaultRunManualStageForFirstSeen,
  type RunManualStageForFirstSeenResult,
} from "@/lib/sync/runManualStageForFirstSeen";
import {
  runManualSyncForShow_unlocked as defaultRunManualSyncForShowUnlocked,
  type ManualSyncResult,
} from "@/lib/sync/runManualSyncForShow";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";

export type LivePendingIngestionRouteTx = LockedShowTx<{
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
}>;

export type LivePendingIngestionRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  readDriveFileIdForPendingIngestion?: (id: string) => Promise<string | null>;
  withRowTryLock?: <R>(
    driveFileId: string,
    fn: (tx: LivePendingIngestionRouteTx) => Promise<R> | R,
  ) => Promise<R | { skipped: typeof CONCURRENT_SYNC_SKIPPED }>;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  runManualStageForFirstSeen?: (
    tx: LivePendingIngestionRouteTx,
    driveFileId: string,
    deps?: Parameters<typeof defaultRunManualStageForFirstSeen>[2],
  ) => Promise<RunManualStageForFirstSeenResult>;
  runManualSyncForShowUnlocked?: (
    tx: LivePendingIngestionRouteTx,
    driveFileId: string,
    mode: "manual",
    fileMeta: DriveListedFile,
    deps?: Parameters<typeof defaultRunManualSyncForShowUnlocked>[4],
  ) => Promise<ManualSyncResult>;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PendingIngestionRow = {
  id: string;
  drive_file_id: string;
  wizard_session_id: string | null;
  last_seen_modified_time: string | null;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("live pending-ingestion route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

async function defaultReadDriveFileIdForPendingIngestion(id: string): Promise<string | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      `select drive_file_id from public.pending_ingestions where id = $1::uuid limit 1`,
      [id],
    )) as Array<{ drive_file_id: string }>;
    return rows[0]?.drive_file_id ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultWithRowTryLock<R>(
  driveFileId: string,
  fn: (tx: LivePendingIngestionRouteTx) => Promise<R> | R,
): Promise<R | { skipped: typeof CONCURRENT_SYNC_SKIPPED }> {
  return await withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: true });
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: LivePendingIngestionRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    readDriveFileIdForPendingIngestion:
      deps.readDriveFileIdForPendingIngestion ?? defaultReadDriveFileIdForPendingIngestion,
    withRowTryLock: deps.withRowTryLock ?? defaultWithRowTryLock,
    fetchDriveFileMetadata: deps.fetchDriveFileMetadata ?? defaultFetchDriveFileMetadata,
    runManualStageForFirstSeen:
      deps.runManualStageForFirstSeen ??
      (defaultRunManualStageForFirstSeen as unknown as NonNullable<
        LivePendingIngestionRouteDeps["runManualStageForFirstSeen"]
      >),
    runManualSyncForShowUnlocked:
      deps.runManualSyncForShowUnlocked ??
      (defaultRunManualSyncForShowUnlocked as unknown as NonNullable<
        LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]
      >),
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

async function readLockedPendingIngestion(
  tx: LivePendingIngestionRouteTx,
  id: string,
): Promise<PendingIngestionRow | null> {
  return await tx.queryOne<PendingIngestionRow | null>(
    `
      select id, drive_file_id, wizard_session_id, last_seen_modified_time
        from public.pending_ingestions
       where id = $1::uuid
       for update
    `,
    [id],
  );
}

async function liveShowExists(
  tx: LivePendingIngestionRouteTx,
  driveFileId: string,
): Promise<boolean> {
  const row = await tx.queryOne<{ exists: boolean }>(
    `select exists (select 1 from public.shows where drive_file_id = $1)`,
    [driveFileId],
  );
  return row.exists;
}

async function readWatchedFolderId(tx: LivePendingIngestionRouteTx): Promise<string | null> {
  const row = await tx.queryOne<{ watched_folder_id: string | null } | null>(
    `select watched_folder_id from public.app_settings where id = 'default' limit 1`,
    [],
  );
  return row?.watched_folder_id ?? null;
}

async function readShowSlug(tx: LivePendingIngestionRouteTx, driveFileId: string): Promise<string | null> {
  const row = await tx.queryOne<{ slug: string } | null>(
    `select slug from public.shows where drive_file_id = $1 limit 1`,
    [driveFileId],
  );
  return row?.slug ?? null;
}

function transitioned(): Response {
  return errorResponse(409, "PENDING_INGESTION_TRANSITIONED");
}

async function manualSyncResponse(
  tx: LivePendingIngestionRouteTx,
  driveFileId: string,
  result: ManualSyncResult,
): Promise<Response> {
  if ("skipped" in result) {
    return errorResponse(409, "CONCURRENT_SYNC_SKIPPED");
  }
  if (result.outcome === "applied") {
    return NextResponse.json({
      status: "applied",
      slug: await readShowSlug(tx, driveFileId),
    });
  }
  if (result.outcome === "stage") {
    return NextResponse.json({ status: "parsed_pending_review", stagedId: result.stagedId });
  }
  if (result.outcome === "hard_fail") {
    return NextResponse.json({ status: "still_failed", errorCode: result.code });
  }
  if ("code" in result) {
    return NextResponse.json({ status: "still_failed", errorCode: result.code });
  }
  if ("reason" in result) {
    return NextResponse.json({ status: "still_failed", errorCode: result.reason });
  }
  return NextResponse.json({ status: "parsed" });
}

function firstSeenStageResponse(result: RunManualStageForFirstSeenResult): Response {
  if (result.outcome === "parsed_pending_review") {
    return NextResponse.json({ status: "parsed_pending_review", stagedId: result.stagedId });
  }
  if (result.outcome === "hard_failed") {
    return NextResponse.json({ status: "still_failed", errorCode: result.errorCode });
  }
  return NextResponse.json({ status: "parsed", stagedId: result.stagedId });
}

export async function handleLivePendingIngestionRetry(
  _request: Request,
  context: RouteContext,
  routeDeps: LivePendingIngestionRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { id } = await context.params;
  const driveFileId = await deps.readDriveFileIdForPendingIngestion(id);
  if (!driveFileId) return transitioned();

  const result = await deps.withRowTryLock(driveFileId, async (tx) => {
    const row = await readLockedPendingIngestion(tx, id);
    if (!row) return transitioned();
    if (row.wizard_session_id !== null) return errorResponse(409, "LIVE_ROW_REQUIRED");
    if (row.drive_file_id !== driveFileId) {
      return errorResponse(500, "LOCK_OWNERSHIP_ASSERTION_FAILED");
    }
    if (await liveShowExists(tx, row.drive_file_id)) {
      let metadata: DriveListedFile;
      try {
        metadata = await deps.fetchDriveFileMetadata(row.drive_file_id);
      } catch {
        return errorResponse(502, "DRIVE_FETCH_FAILED");
      }
      const watchedFolderId = await readWatchedFolderId(tx);
      if (!watchedFolderId || !metadata.parents.includes(watchedFolderId)) {
        return errorResponse(409, "SHEET_UNAVAILABLE");
      }
      const syncResult = await deps.runManualSyncForShowUnlocked(
        tx,
        row.drive_file_id,
        "manual",
        metadata,
        {},
      );
      return await manualSyncResponse(tx, row.drive_file_id, syncResult);
    }
    const stageResult = await deps.runManualStageForFirstSeen(tx, row.drive_file_id, {});
    return firstSeenStageResponse(stageResult);
  });
  if ("skipped" in result) return errorResponse(409, "CONCURRENT_SYNC_SKIPPED");
  return result;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleLivePendingIngestionRetry(request, context);
}

export {
  depsWithDefaults as livePendingIngestionDepsWithDefaults,
  readLockedPendingIngestion,
};
