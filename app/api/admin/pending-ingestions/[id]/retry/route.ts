import { NextResponse } from "next/server";
import postgres from "postgres";
import type { DriveListedFile } from "@/lib/drive/list";
import { listFolder as listDriveFolder } from "@/lib/drive/list";
import {
  fetchDriveFileMetadata as defaultFetchDriveFileMetadata,
  fetchSheetMarkdownAndBytesAtRevision,
} from "@/lib/drive/fetch";
import { firstSeenPrepareCodeFor } from "@/lib/onboarding/firstSeenPrepareFault";
import { parseSheet as parseMarkdownSheet } from "@/lib/parser";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import {
  enrichWithDrivePins,
  type DriveClient,
  type DriveFileMeta,
} from "@/lib/sync/enrichWithDrivePins";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";
import {
  runManualStageForFirstSeen as defaultRunManualStageForFirstSeen,
  type RunManualStageForFirstSeenResult,
} from "@/lib/sync/runManualStageForFirstSeen";
import {
  readFinalizeOwnershipGuard_unlocked as defaultReadFinalizeOwnershipGuardUnlocked,
  runManualSyncForShow_unlocked as defaultRunManualSyncForShowUnlocked,
  type ManualSyncResult,
} from "@/lib/sync/runManualSyncForShow";
import {
  classifySyncFailure,
  errorPayload,
  prepareProcessOneFile as defaultPrepareProcessOneFile,
  withPostgresSyncPipelineLock,
  type PreparedProcessOneFile,
} from "@/lib/sync/runScheduledCronSync";
import { readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { log } from "@/lib/log";
import { logAdminOutcome, type AdminOutcome } from "@/lib/log/logAdminOutcome";
import { emitIdentityLinkRenameUnlanded } from "@/lib/log/emitIdentityLinkRenameUnlanded";
import { emitRoleFlagsNotice, ROLE_FLAGS_EMIT_SOURCE } from "@/lib/sync/emitRoleFlagsNotice";
import { serializeError } from "@/lib/log/serializeError";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";
import type { UnlandedRename } from "@/lib/sync/applyParseResult";
import { emitDiagramVariantFailures } from "@/lib/log/emitDiagramVariantFailures";
import type { DiagramVariantFailureRow } from "@/lib/sync/snapshotAssets";

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
  // Sixth parameter REQUIRED (spec 2026-08-14 §3.1) — its absence is the whole defect: the runner
  // forwarded five arguments and processOneFile_unlocked throws SyncInfraError without `prepared`.
  // TS1016 forces the fifth parameter to drop its optional marker alongside it.
  runManualSyncForShowUnlocked?: (
    tx: LivePendingIngestionRouteTx,
    driveFileId: string,
    mode: "manual",
    fileMeta: DriveListedFile,
    deps: Parameters<typeof defaultRunManualSyncForShowUnlocked>[4] | undefined,
    prepared: PreparedProcessOneFile,
  ) => Promise<ManualSyncResult>;
  // The route prepares INSIDE its own held row lock (spec §3.1) rather than switching to the
  // locked entry point, which would put a second holder on the same hashkey (invariant 2).
  prepareProcessOneFile?: typeof defaultPrepareProcessOneFile;
  // Both route-body catch emissions write through this seam. A hardcoded module call would force
  // every route test onto the real DB (spec §3.1 R7 F2).
  logSyncSink?: typeof writeSyncLog;
  readFinalizeOwnershipGuardUnlocked?: (
    tx: LivePendingIngestionRouteTx,
    driveFileId: string,
  ) => Promise<boolean>;
  prepareFirstSeenStage?: (fileMeta: DriveListedFile) => Promise<{
    fileMeta: DriveListedFile;
    parseResult: ParseResult;
    binding: { bindingToken: string; modifiedTime: string };
  }>;
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

class FirstSeenStagePrepareError extends Error {
  readonly code: "DRIVE_FETCH_FAILED" | "STAGED_PARSE_FAILED";

  constructor(code: "DRIVE_FETCH_FAILED" | "STAGED_PARSE_FAILED", cause: unknown) {
    super(code);
    this.name = "FirstSeenStagePrepareError";
    this.code = code;
    this.cause = cause;
  }
}

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

function toDriveFileMeta(file: DriveListedFile): DriveFileMeta {
  return {
    driveFileId: file.driveFileId,
    headRevisionId: file.headRevisionId ?? "",
    md5Checksum: file.md5Checksum ?? "",
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    name: file.name,
  };
}

function defaultDriveClient(): DriveClient {
  return {
    async getFile(fileId) {
      return toDriveFileMeta(await defaultFetchDriveFileMetadata(fileId));
    },
    async listFolder(folderId) {
      return {
        folderId,
        files: (await listDriveFolder(folderId)).map(toDriveFileMeta),
      };
    },
  };
}

async function defaultPrepareFirstSeenStage(fileMeta: DriveListedFile): Promise<{
  fileMeta: DriveListedFile;
  parseResult: ParseResult;
  binding: { bindingToken: string; modifiedTime: string };
}> {
  const binding = {
    bindingToken: fileMeta.headRevisionId ?? fileMeta.modifiedTime,
    modifiedTime: fileMeta.modifiedTime,
  };
  let markdown: string;
  let xlsxBytes: ArrayBuffer | undefined;
  try {
    // Fetch markdown AND raw xlsx bytes in one export so a retried ingestion also
    // surfaces DIAGRAMS-tab embedded images (parity with cron + onboarding).
    const fetched = await fetchSheetMarkdownAndBytesAtRevision(
      fileMeta.driveFileId,
      binding.bindingToken,
    );
    markdown = fetched.markdown;
    xlsxBytes = fetched.bytes;
  } catch (cause) {
    // Same conflation as the wizard re-scan: fetchSheetMarkdownAndBytesAtRevision
    // synthesizes the workbook internally (lib/drive/fetch.ts:511-514), so a corrupt
    // xlsx throws here AFTER Drive succeeded. Classify by error identity, not by the
    // call site, or Doug is told to check his share settings for a broken workbook.
    throw new FirstSeenStagePrepareError(firstSeenPrepareCodeFor(cause), cause);
  }
  let parsed: ParsedSheet;
  try {
    parsed = parseMarkdownSheet(markdown, fileMeta.name);
  } catch (cause) {
    throw new FirstSeenStagePrepareError("STAGED_PARSE_FAILED", cause);
  }
  try {
    const parseResult = await enrichWithDrivePins(parsed, defaultDriveClient(), {
      driveFileId: fileMeta.driveFileId,
      fileMeta: toDriveFileMeta(fileMeta),
      ...(xlsxBytes !== undefined ? { xlsxBytes } : {}),
    });
    return {
      fileMeta,
      binding,
      parseResult,
    };
  } catch (cause) {
    throw new FirstSeenStagePrepareError("DRIVE_FETCH_FAILED", cause);
  }
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
    readFinalizeOwnershipGuardUnlocked:
      deps.readFinalizeOwnershipGuardUnlocked ??
      (defaultReadFinalizeOwnershipGuardUnlocked as unknown as NonNullable<
        LivePendingIngestionRouteDeps["readFinalizeOwnershipGuardUnlocked"]
      >),
    prepareFirstSeenStage: deps.prepareFirstSeenStage ?? defaultPrepareFirstSeenStage,
    prepareProcessOneFile: deps.prepareProcessOneFile ?? defaultPrepareProcessOneFile,
    logSyncSink: deps.logSyncSink ?? writeSyncLog,
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

async function readShowSlug(
  tx: LivePendingIngestionRouteTx,
  driveFileId: string,
): Promise<string | null> {
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

async function firstSeenStageResponse(
  tx: LivePendingIngestionRouteTx,
  driveFileId: string,
  result: RunManualStageForFirstSeenResult,
): Promise<Response> {
  if (result.outcome === "parsed_pending_review") {
    return NextResponse.json({ status: "parsed_pending_review", stagedId: result.stagedId });
  }
  if (result.outcome === "applied") {
    return NextResponse.json({
      status: "applied",
      slug: await readShowSlug(tx, driveFileId),
    });
  }
  if (result.outcome === "hard_failed") {
    return NextResponse.json({ status: "still_failed", errorCode: result.errorCode });
  }
  if (result.outcome === "deferred") {
    return NextResponse.json({ status: "deferred", reason: result.reason });
  }
  return NextResponse.json({ status: "parsed", stagedId: result.stagedId });
}

export async function handleLivePendingIngestionRetry(
  _request: Request,
  context: RouteContext,
  routeDeps: LivePendingIngestionRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  let adminEmail!: string;
  try {
    adminEmail = (await deps.requireAdminIdentity()).email; // canonical
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { id } = await context.params;
  // P1 dark-path guard: the entire risky region below (id-read → withRowTryLock +
  // post-commit) previously had NO try/catch — any DB/postgres.js throw surfaced as an
  // unlogged framework 500. Wrap it in a fail-open forensic guard: on throw, best-effort
  // emit PENDING_INGESTION_RETRY_FAILED (its own inner try/catch so a logger throw can't
  // change the outcome — invariant 9), then rethrow to preserve the existing 500.
  // driveFileId is declared here (null until the id-read resolves) so it is in scope for
  // the catch even when the throw is in readDriveFileIdForPendingIngestion itself.
  let driveFileId: string | null = null;
  try {
    driveFileId = await deps.readDriveFileIdForPendingIngestion(id);
    if (!driveFileId) return transitioned();

    // nav-perf tag-caching (Task 5 / whole-diff R2): capture the show id of any
    // showId-carrying outcome (applied + parse_error/source_gone recovery) INSIDE the
    // tx, but call revalidateShow AFTER withRowTryLock resolves (post-commit) — never
    // inside the tx callback (withPostgresSyncPipelineLock → sql.begin = pre-commit).
    let appliedShowId: string | null = null;
    // Observability (R4): capture the post-commit admin-outcome telemetry for a
    // committed live-show apply ONLY — gated on outcome === "applied", NOT on
    // appliedShowId (source_gone/parse_error recovery also carries showId but is
    // still_failed, so it must NOT emit PENDING_INGESTION_RETRIED). The `code`
    // literal rides ONLY the logAdminOutcome emit below, never this ref object.
    let outcome: Omit<AdminOutcome, "code"> | null = null;
    // Unit A: this route calls runManualSyncForShow_unlocked, which routes AROUND processOneFile's
    // post-commit tail (lib/sync/runManualSyncForShow.ts:287-288) — the site where cron and manual
    // emit the forensic unlanded-rename event. So the pairs are captured inside the lock here and
    // emitted below, after withRowTryLock resolves (invariant 10: never inside the held tx). The
    // first-seen branch gets no capture: runManualStageForFirstSeen hardcodes identityLinkRenames
    // to [] (lib/sync/runManualStageForFirstSeen.ts:125), so it can never produce an unlanded pair.
    let unlandedRenames: {
      pairs: UnlandedRename[];
      showId: string;
      driveFileId: string;
    } | null = null;
    // Unit C (spec §2.3): the LAST TWO discard sites, and both live on this route. The existing-show
    // branch bypasses processOneFile's post-commit tail exactly as above, and the first-seen branch's
    // callee (runManualStageForFirstSeen) now CARRIES its notice out rather than dropping it —
    // neither can emit where it obtains the notice, because both run inside withRowTryLock
    // (invariant 10). Captured here, emitted once the lock resolves.
    let roleFlagsNotice: RoleFlagsNotice | null = null;
    // Census hop 4 (spec §3): this route bypasses processOneFile's post-commit tail on the
    // existing-show branch, and runManualStageForFirstSeen carries its rows out on the
    // first-seen branch — so BOTH branches capture here, inside withRowTryLock, and the
    // single emit below runs once that lock resolves (invariant 10).
    let variantFailures: { rows: DiagramVariantFailureRow[]; showId: string } | null = null;
    const result = await deps.withRowTryLock(driveFileId, async (tx) => {
      const row = await readLockedPendingIngestion(tx, id);
      if (!row) return transitioned();
      if (row.wizard_session_id !== null) return errorResponse(409, "LIVE_ROW_REQUIRED");
      if (row.drive_file_id !== driveFileId) {
        return errorResponse(500, "LOCK_OWNERSHIP_ASSERTION_FAILED");
      }
      if (await liveShowExists(tx, row.drive_file_id)) {
        // DEF-5: refuse retry against an archived show (re-read under the held row lock) — no Drive fetch.
        if (await readShowArchived_unlocked(tx, row.drive_file_id)) {
          return errorResponse(409, "SHOW_ARCHIVED_IMMUTABLE");
        }
        if (await deps.readFinalizeOwnershipGuardUnlocked(tx, row.drive_file_id)) {
          return errorResponse(409, "FINALIZE_OWNED_SHOW");
        }
        let metadata: DriveListedFile;
        try {
          metadata = await deps.fetchDriveFileMetadata(row.drive_file_id);
        } catch (err) {
          // The route-level Drive metadata fetch faulted → 502. Distinct from the
          // PR-1 outer PENDING_INGESTION_RETRY_FAILED guard (which wraps THROWS);
          // this catch returns 502 and previously swallowed the cause. Fail-open,
          // 502 unchanged (invariant 9).
          void log.warn("pending-ingestion retry: Drive metadata fetch failed", {
            source: "api.admin.pending-ingestions.retry",
            code: "PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED",
            driveFileId: row.drive_file_id,
            error: err,
          });
          return errorResponse(502, "DRIVE_FETCH_FAILED");
        }
        const watchedFolderId = await readWatchedFolderId(tx);
        if (!watchedFolderId || !metadata.parents.includes(watchedFolderId)) {
          return errorResponse(409, "SHEET_UNAVAILABLE");
        }
        // Spec §3.1: prepare HERE, inside the row lock this route already holds, and thread the
        // result through. Switching to the locked `runManualSyncForShow` entry point was rejected —
        // it re-acquires the same hashkey on separate connections, the nested-holder deadlock
        // invariant 2 prohibits. Manual mode takes no watermark skip and no revision-race cooldown
        // inside prepareProcessOneFile, so preparation cannot spuriously skip a manual retry.
        const processDeps = { logSync: writeSyncLog };
        let prepared: PreparedProcessOneFile;
        try {
          prepared = await deps.prepareProcessOneFile(
            row.drive_file_id,
            "manual",
            metadata,
            processDeps,
          );
        } catch (error) {
          // prepareProcessOneFile converts fetch/binding failures into kind: "fetch_failure", but
          // its later preparation work (XLSX anchor extraction, the discard-and-rerun reconcile)
          // sits outside those catches and can throw. Relocated into the route, such a throw would
          // reach only the outer guard and write no row — re-creating the silence this arc closes.
          // No dedupe sentinel is needed: prepareProcessOneFile writes no sync_log rows itself.
          try {
            await deps.logSyncSink({
              driveFileId: row.drive_file_id,
              outcome: "parse_error",
              code: classifySyncFailure(error),
              payload: errorPayload(error),
            });
          } catch (sinkError) {
            // Unchained for the same stripLogEmissionCalls reason as the escalations below.
            const escalation = log.error("pending-ingestion retry prepare emit failed", {
              source: "api.admin.pending-ingestions.retry",
              code: "SYNC_LOG_EMIT_FAILED",
              driveFileId: row.drive_file_id,
              error: serializeError(sinkError),
            });
            // Invariant 10 (prod diff review R1 P0): this catch runs inside the held
            // withRowTryLock, and an app_events emit must never extend that window.
            // Fire-and-forget rather than awaited; the sync_log write above is the
            // ratified in-lock channel, this escalation is not.
            void escalation.catch(() => {
              /* best-effort: the escalation must never displace the original failure */
            });
          }
          // Rethrow the ORIGINAL error: the outer PENDING_INGESTION_RETRY_FAILED guard preserves
          // the existing 500 byte-for-byte.
          throw error;
        }
        const syncResult = await deps.runManualSyncForShowUnlocked(
          tx,
          row.drive_file_id,
          "manual",
          metadata,
          // NESTED: the 5th parameter is RunManualSyncForShowDeps, which exposes
          // processDeps?: ProcessOneFileDeps - a top-level logSync typechecks against
          // nothing and would silently write no row.
          { processDeps },
          prepared,
        );
        // nav-perf tag-caching (whole-diff R2): capture ANY showId-carrying outcome —
        // applied AND the parse_error/source_gone recovery outcomes (which now carry
        // showId + commit last_sync_status). Post-commit revalidate happens after
        // withRowTryLock resolves below. Non-showId outcomes leave appliedShowId null.
        if ("showId" in syncResult && typeof syncResult.showId === "string" && syncResult.showId) {
          appliedShowId = syncResult.showId;
        }
        if (!("skipped" in syncResult) && syncResult.outcome === "applied") {
          outcome = {
            source: "api.admin.pending-ingestions.retry",
            actorEmail: adminEmail,
            driveFileId: row.drive_file_id,
            showId: syncResult.showId,
          };
          // ManualSyncResult is a discriminated union; the `applied` narrowing above is what makes
          // unlandedRenames reachable. Absent / empty → stays null, and nothing is emitted.
          if (syncResult.unlandedRenames?.length) {
            unlandedRenames = {
              pairs: syncResult.unlandedRenames,
              showId: syncResult.showId,
              driveFileId: row.drive_file_id,
            };
          }
          // Unit C: same narrowing, same post-commit emit site below. Absent → stays null.
          if (syncResult.roleFlagsNotice) roleFlagsNotice = syncResult.roleFlagsNotice;
          // Census hop 4: same narrowing, same post-commit emit site. Absent / empty → stays null.
          if (syncResult.variantFailures?.length) {
            variantFailures = { rows: syncResult.variantFailures, showId: syncResult.showId };
          }
        }
        return await manualSyncResponse(tx, row.drive_file_id, syncResult);
      }
      let metadata: DriveListedFile;
      try {
        metadata = await deps.fetchDriveFileMetadata(row.drive_file_id);
      } catch (err) {
        // First-seen branch's route-level Drive metadata fetch → 502; same
        // fail-open breadcrumb as the existing-show branch above. 502 unchanged.
        void log.warn("pending-ingestion retry: Drive metadata fetch failed", {
          source: "api.admin.pending-ingestions.retry",
          code: "PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED",
          driveFileId: row.drive_file_id,
          error: err,
        });
        return errorResponse(502, "DRIVE_FETCH_FAILED");
      }
      const watchedFolderId = await readWatchedFolderId(tx);
      if (!watchedFolderId || !metadata.parents.includes(watchedFolderId)) {
        return errorResponse(409, "SHEET_UNAVAILABLE");
      }
      let stageDeps: Awaited<ReturnType<typeof deps.prepareFirstSeenStage>>;
      try {
        stageDeps = await deps.prepareFirstSeenStage(metadata);
      } catch (error) {
        const code =
          error instanceof FirstSeenStagePrepareError ? error.code : "DRIVE_FETCH_FAILED";
        // Spec §3.1 R4 F1: prepareFirstSeenStage IS this branch's core sync preparation (sheet
        // export, parse, Drive enrichment) — the same class as the existing-show prepare above, and
        // its typed failures previously terminated the attempt with no row. Only the recording is
        // new; the typed 502/409 responses are unchanged, and a sink failure is fail-open because
        // the response contract outranks the recording.
        try {
          await deps.logSyncSink({
            driveFileId: row.drive_file_id,
            outcome: "parse_error",
            code,
            payload: errorPayload(
              error instanceof FirstSeenStagePrepareError ? (error.cause ?? error) : error,
            ),
          });
        } catch (sinkError) {
          // Unchained for the same stripLogEmissionCalls reason as the escalations below.
          const escalation = log.error("pending-ingestion retry first-seen prepare emit failed", {
            source: "api.admin.pending-ingestions.retry",
            code: "SYNC_LOG_EMIT_FAILED",
            driveFileId: row.drive_file_id,
            error: serializeError(sinkError),
          });
          // Invariant 10 (prod diff review R1 P0): in-lock, so fire-and-forget rather than
          // awaited — an app_events emit must never extend the held-lock window.
          void escalation.catch(() => {
            /* best-effort: the typed response still returns */
          });
        }
        return errorResponse(code === "DRIVE_FETCH_FAILED" ? 502 : 409, code);
      }
      const stageResult = await deps.runManualStageForFirstSeen(tx, row.drive_file_id, {
        ...stageDeps,
        logSync: writeSyncLog,
      });
      if (stageResult.outcome === "applied") {
        appliedShowId = stageResult.showId;
        // Unit C: the notice runManualStageForFirstSeen now carries out of its own lock.
        if (stageResult.roleFlagsNotice) roleFlagsNotice = stageResult.roleFlagsNotice;
        // Census hop 5's sink: the first-seen stage carries its variant failures out the
        // same way, and this route is its only caller — dark here means dark everywhere.
        if (stageResult.variantFailures?.length) {
          variantFailures = { rows: stageResult.variantFailures, showId: stageResult.showId };
        }
        outcome = {
          source: "api.admin.pending-ingestions.retry",
          actorEmail: adminEmail,
          driveFileId: row.drive_file_id,
          showId: stageResult.showId,
        };
      }
      return await firstSeenStageResponse(tx, row.drive_file_id, stageResult);
    });
    if ("skipped" in result) return errorResponse(409, "CONCURRENT_SYNC_SKIPPED");
    // ── POST-COMMIT TAIL ────────────────────────────────────────────────────────────────────────
    // withRowTryLock (the outer sql.begin tx) has RESOLVED here: the apply is committed and the
    // roster already changed. Every step below is therefore INDEPENDENTLY isolated (whole-diff
    // review HIGH 1 + HIGH 2). Two properties, per step, neither of which held before:
    //
    //   1. A throwing step must not SUPPRESS a later one. `revalidateShow` ran un-isolated ahead of
    //      both emits, so a revalidate throw meant neither the forensic unlanded-rename event NOR
    //      the LEAD audit + bell notice ever ran; likewise a throwing unlanded emit swallowed the
    //      role-flags emit.
    //   2. A throwing step must not turn a committed apply into a failed response. An escaping
    //      throw reaches the outer PENDING_INGESTION_RETRY_FAILED guard, which RETHROWS → a 500
    //      that invites the operator to re-run an apply that already landed.
    //
    // These are deliberately SEPARATE try/catch sites, not one wrapper around the region: a single
    // catch would reintroduce exactly the suppression above. Each escalates under its own forensic
    // code via log.error (invariant 9 — surfaced, never swallowed) and never propagates.
    // Pinned by tests/api/admin/pendingIngestionRetryPostCommitIsolation.test.ts.
    //
    // `logAdminOutcome` is the one step with NO wrapper here, because it cannot throw by
    // construction: it catches everything internally for this exact reason
    // (lib/log/logAdminOutcome.ts:34-50, "telemetry must never throw over a committed mutation").
    //
    // nav-perf tag-caching (Task 5): bust the show's cache tag before returning the Response.
    // Non-applied retries leave appliedShowId null → no revalidate.
    if (appliedShowId) {
      const revalidatedShowId: string = appliedShowId;
      try {
        revalidateShow(revalidatedShowId);
      } catch (error) {
        // Assigned to a local (NOT chained) so prettier keeps `log.error(` on ONE line — a chained
        // `.catch()` splits `log` / `.error` across lines, which stripLogEmissionCalls cannot
        // match, leaking this app_events-only forensic code into the §12.4 / internal-code-enum
        // producer scans. Same constraint as the role-flags escalation below.
        const escalation = log.error("pending-ingestion retry revalidate failed", {
          source: "api.admin.pending-ingestions.retry",
          code: "PENDING_INGESTION_RETRY_REVALIDATE_FAILED",
          showId: revalidatedShowId,
          driveFileId,
          error: serializeError(error),
        });
        await escalation.catch(() => {
          /* best-effort: the escalation itself must never change the route's outcome */
        });
      }
    }
    // Observability (R4): post-commit durable telemetry — withRowTryLock has resolved
    // (apply committed) before we emit. Non-applied retries leave outcome null → no emit.
    if (outcome) {
      // TS closure-narrowing: a `let` assigned inside the withRowTryLock callback narrows
      // to `never` at a spread position; bind to a ref-typed const first (see PR #218).
      const outcomeRef: Omit<AdminOutcome, "code"> = outcome;
      await logAdminOutcome({ code: "PENDING_INGESTION_RETRIED", ...outcomeRef });
    }
    // Unit A: the forensic unlanded-rename event, POST-COMMIT on the same resolved-lock site as the
    // admin outcome above. Only a committed applied sync ever populates this ref.
    //
    // Independently isolated per the tail contract above: this event is the ONLY signal an unlanded
    // pair produces (R4), so its failure must be LOUD — but it must not take the role-flags emit
    // down with it, and it must not fail a committed apply. Same fail-open shape and the same
    // escalation code as the finalize routes' flush (lib/sync/emitRoleFlagsNotice.ts:110-122).
    if (unlandedRenames) {
      // Same TS closure-narrowing workaround as outcomeRef above: a `let` assigned inside the
      // withRowTryLock callback narrows to `never` on member access.
      const unlandedRef: { pairs: UnlandedRename[]; showId: string; driveFileId: string } =
        unlandedRenames;
      try {
        await emitIdentityLinkRenameUnlanded(unlandedRef.pairs, {
          source: "sync.identityLink",
          showId: unlandedRef.showId,
          driveFileId: unlandedRef.driveFileId,
        });
      } catch (error) {
        // Unchained for the same stripLogEmissionCalls reason as the revalidate escalation above.
        const escalation = log.error("pending-ingestion retry unlanded-rename emit failed", {
          source: "api.admin.pending-ingestions.retry",
          code: "IDENTITY_LINK_RENAME_UNLANDED_EMIT_FAILED",
          showId: unlandedRef.showId,
          driveFileId: unlandedRef.driveFileId,
          error: serializeError(error),
        });
        await escalation.catch(() => {
          /* best-effort: the escalation itself must never change the route's outcome */
        });
      }
    }
    // Census hop 4/5 sink: DIAGRAM_VARIANT_GENERATION_FAILED, POST-COMMIT on the same
    // resolved-lock site. Independently isolated per the tail contract above — a throwing
    // emit must neither suppress the capability emit below nor turn a committed retry into
    // a 500. Only a committed applied outcome ever populates this ref.
    if (variantFailures) {
      // Same TS closure-narrowing workaround as outcomeRef above.
      const variantRef: { rows: DiagramVariantFailureRow[]; showId: string } = variantFailures;
      try {
        await emitDiagramVariantFailures(variantRef.rows, { showId: variantRef.showId });
      } catch (error) {
        // Unchained for the same stripLogEmissionCalls reason as the escalations above.
        const escalation = log.error("pending-ingestion retry variant-failure emit failed", {
          source: "api.admin.pending-ingestions.retry",
          code: "DIAGRAM_VARIANT_GENERATION_EMIT_FAILED",
          showId: variantRef.showId,
          error: serializeError(error),
        });
        await escalation.catch(() => {
          /* best-effort: the escalation itself must never change the route's outcome */
        });
      }
    }
    // Unit C: the bell alert + durable LEAD audit for a capability change this retry applied — the
    // shared helper, so the durable-audit-BEFORE-alert-upsert order has one implementation. Same
    // resolved-lock site as the two emits above.
    //
    // FAIL-OPEN, matching the finalize routes (flushDeferredApplyEmits) rather than the propagating
    // sync-pipeline callers: `upsertAdminAlert` throws on RPC failure, and this runs AFTER the apply
    // committed. Letting it escape would hit the outer PENDING_INGESTION_RETRY_FAILED guard and turn
    // a successful retry into a 500, inviting the operator to re-run an apply that already landed.
    // The helper's internal ordering is unchanged, so the durable record is attempted first and a
    // throw is caught strictly after it (invariant 9 — surfaced under its own code, never swallowed).
    if (roleFlagsNotice) {
      const noticeRef: RoleFlagsNotice = roleFlagsNotice;
      try {
        await emitRoleFlagsNotice(noticeRef, { source: ROLE_FLAGS_EMIT_SOURCE });
      } catch (error) {
        // Assigned to a local (NOT chained) so prettier keeps `log.error(` on ONE line —
        // stripLogEmissionCalls cannot match a `log` / `.error` split across lines, which would
        // leak the app_events-only ROLE_FLAGS_NOTICE_EMIT_FAILED forensic code into the §12.4 /
        // internal-code-enum producer scans.
        const escalation = log.error("pending-ingestion retry role-flags notice emit failed", {
          source: "api.admin.pending-ingestions.retry",
          code: "ROLE_FLAGS_NOTICE_EMIT_FAILED",
          showId: noticeRef.showId,
          driveFileId,
          error: serializeError(error),
        });
        await escalation.catch(() => {
          /* best-effort: the escalation itself must never change the route's outcome */
        });
      }
    }
    return result;
  } catch (error) {
    // Fail-open (explicit callsite wrap): log the infra fault, then rethrow so the route's
    // existing throw→500 behavior is byte-preserved. Forensic-only (inside a log span).
    // driveFileId may be null if the throw was in the id-read leg.
    try {
      await log.error("pending-ingestion retry threw", {
        source: "api.admin.pending-ingestions.retry",
        code: "PENDING_INGESTION_RETRY_FAILED",
        driveFileId,
        error,
      });
    } catch {
      /* best-effort */
    }
    throw error;
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleLivePendingIngestionRetry(request, context);
}

export {
  depsWithDefaults as livePendingIngestionDepsWithDefaults,
  readLockedPendingIngestion,
  // Exported (spec §3.1) so the first-seen prepare-failure tests can construct the error
  // the route's `instanceof` branch keys on.
  FirstSeenStagePrepareError,
};
