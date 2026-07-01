import postgres from "postgres";
import type { UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import { mapWithConcurrency } from "@/lib/async/mapWithConcurrency";
import type { ScanProgressEvent } from "@/lib/onboarding/scanProgress";
import { fetchDriveFileMetadata, fetchSheetMarkdownWithBinding } from "@/lib/drive/fetch";
import { fetchSheetTitleToGid } from "@/lib/drive/sheetGids";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { listFolder as listDriveFolder, type DriveListedFile } from "@/lib/drive/list";
import { parseSheet as parseMarkdownSheet } from "@/lib/parser";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import { asTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import {
  enrichWithDrivePins,
  type DriveClient,
  type DriveFileMeta,
} from "@/lib/sync/enrichWithDrivePins";
import {
  type ConcurrentSyncSkipped,
  type LockedShowTx,
  type LockableSyncTx,
  withShowLock as defaultWithShowLock,
} from "@/lib/sync/lockedShowTx";
import {
  Phase1InfraError,
  runPhase1,
  type Phase1Binding,
  type Phase1PendingIngestionRow,
  type Phase1PendingSyncRow,
  type Phase1Tx,
} from "@/lib/sync/phase1";

export const WIZARD_ISOLATION_INDEXES_MISSING = "WIZARD_ISOLATION_INDEXES_MISSING" as const;
export const WIZARD_SESSION_SUPERSEDED_DURING_SCAN =
  "WIZARD_SESSION_SUPERSEDED_DURING_SCAN" as const;
export const LIVE_ROW_CONFLICT = "LIVE_ROW_CONFLICT" as const;

/**
 * Max number of sheets whose per-file preparation runs concurrently.
 * Preparation is a pre-lock, side-effect-free Drive read phase (so it
 * parallelizes safely; the downstream lock-ordered `scanPreparedFiles` stays
 * strictly sequential), but the per-file unit is non-trivial: a metadata
 * `files.get`, the xlsx-export round-trip (before-`get` + full-workbook
 * download + after-`get`), and up to two *conditional* enrich reads — an
 * opening-reel `files.get` and a linked-DIAGRAMS-folder `files.list`. It does
 * NOT issue Sheets-API / embedded-image / revision reads: the onboarding
 * `defaultDriveClient` implements only `getFile` + `listFolder`, so
 * `extractEmbeddedImages` short-circuits (see enrichWithDrivePins.ts:126). So
 * the worst case is ~6 Drive calls per sheet (1 metadata get + 3 export
 * round-trips + up to 2 conditional enrich reads), one a heavy export download.
 *
 * The bound caps in-flight Drive requests regardless of folder size — the
 * defense against unbounded fan-out. The prepare phase is wave-count-bound:
 * wall-clock is roughly ceil(sheets / cap) * per-sheet-fetch-time, so the cap
 * is the lever on the dominant serial cost. Benchmarked against the real
 * fxav-test-shows folder (19 sheets, ~1.35s/sheet), 6 -> 12 drops the prepare
 * ~40% (4 waves -> 2; ~6.5s -> ~3.9s median locally, and more on higher-latency
 * serverless where per-sheet time is larger). 12 covers typical (<=24-sheet)
 * folders in 2 waves; the gain past ~16 is marginal while the concurrent burst
 * keeps growing, so 12 balances speed against Drive load + peak memory (each
 * in-flight sheet holds a full workbook download). The throttle risk that
 * previously kept this conservative is now backstopped at the fetch layer:
 * withDriveRetry retries transient 429/5xx with bounded backoff
 * (BL-ONBOARDING-SCAN-TRANSIENT-THROTTLE-RETRY, resolved), so a single transient
 * blip no longer aborts the whole scan.
 */
export const ONBOARDING_PREPARE_CONCURRENCY = 12;

const REQUIRED_WIZARD_ISOLATION_INDEXES = [
  "pending_syncs_live_drive_file_idx",
  "pending_syncs_session_drive_file_idx",
  "pending_ingestions_live_drive_file_idx",
  "pending_ingestions_session_drive_file_idx",
] as const;

export type PostgresTransaction = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

export type OnboardingManifestStatus =
  | "staged"
  | "hard_failed"
  | "skipped_non_sheet"
  | "live_row_conflict";

export type OnboardingManifestRow = {
  folderId: string;
  wizardSessionId: string;
  driveFileId: string;
  mimeType: string;
  name: string;
  status: OnboardingManifestStatus;
};

export type WizardIsolationIndexProbe = { ok: true } | { ok: false; missing: string[] };

export type OnboardingScanTx = Phase1Tx &
  LockableSyncTx & {
    ensureWizardIsolationIndexes(): Promise<WizardIsolationIndexProbe>;
    upsertManifest(row: OnboardingManifestRow): Promise<boolean>;
    logSync(entry: {
      code: string;
      driveFileId?: string;
      payload?: Record<string, unknown>;
    }): Promise<void>;
    upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null>;
  };

export type OnboardingScanResult =
  | {
      outcome: "completed";
      processed: Array<{
        driveFileId: string;
        outcome: "staged" | "hard_failed" | "skipped_non_sheet" | "live_row_conflict";
      }>;
    }
  | {
      outcome: "schema_missing";
      code: typeof WIZARD_ISOLATION_INDEXES_MISSING;
      missingIndexes: string[];
    }
  | {
      outcome: "superseded";
      code: typeof WIZARD_SESSION_SUPERSEDED_DURING_SCAN;
      processed: Array<{
        driveFileId: string;
        outcome: "staged" | "hard_failed" | "skipped_non_sheet" | "live_row_conflict";
      }>;
    };

type ProcessedOnboardingFile = Extract<
  OnboardingScanResult,
  { outcome: "completed" }
>["processed"][number];

export type PreparedOnboardingFile =
  | { file: DriveListedFile; kind: "non_sheet" }
  | {
      file: DriveListedFile;
      kind: "sheet";
      binding: Phase1Binding;
      parseResult: ParseResult;
      // Region source anchors computed at scan (best-effort {}), persisted to
      // pending_syncs.source_anchors so finalize reads them instead of re-exporting the XLSX.
      sourceAnchors: Record<string, SourceAnchor>;
    };

export type RunOnboardingScanDeps = {
  tx?: OnboardingScanTx;
  createScanTxRunner?: (folderId: string, wizardSessionId: string) => ScanTxRunner;
  listFolder?: (folderId: string) => Promise<DriveListedFile[]>;
  fetchMarkdownWithBinding?: (
    driveFileId: string,
  ) => Promise<{ binding: Phase1Binding; markdown: string; bytes?: ArrayBuffer }>;
  // Tab title→gid lookup for exact-cell deep-link anchors. Called only when a
  // cell-anchored warning is present (rare), so it adds no per-sheet round-trip
  // to the common case. Optional/injectable; defaults to the real Sheets API.
  listSheetGids?: (driveFileId: string) => Promise<Map<string, number>>;
  parseSheet?: (markdown: string, filename?: string) => ParsedSheet;
  enrichWithDrivePins?: (
    parsed: ParsedSheet,
    driveClient: DriveClient,
    ctx: { driveFileId: string; fileMeta: DriveFileMeta; binding: Phase1Binding },
  ) => Promise<ParseResult>;
  driveClient?: DriveClient;
  runPhase1?: typeof runPhase1;
  withShowLock?: <R>(
    driveFileId: string,
    fn: (tx: LockedShowTx<OnboardingScanTx>) => Promise<R> | R,
    options?: Parameters<typeof defaultWithShowLock<OnboardingScanTx, R>>[2],
  ) => Promise<R | ConcurrentSyncSkipped>;
  /**
   * Optional progress sink. Emits `listed` once after the folder listing, one
   * `prepared` per sheet as its Drive read settles (completion order), and
   * `staging` once before the DB stage loop. Purely additive — the scan's
   * outcome is identical whether or not this is supplied. Only the Step-2 route
   * passes it (to stream NDJSON); cron/retry/restage callers omit it.
   */
  onProgress?: (event: ScanProgressEvent) => void;
};

export class OnboardingScanInfraError extends Error {
  readonly operation: string;
  override readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Onboarding scan infrastructure failure during ${operation}`);
    this.name = "OnboardingScanInfraError";
    this.operation = operation;
    this.cause = cause;
  }
}

async function callTx<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    throw new OnboardingScanInfraError(operation, cause);
  }
}

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("runOnboardingScan requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
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
      return toDriveFileMeta(await fetchDriveFileMetadata(fileId));
    },
    async listFolder(folderId) {
      return {
        folderId,
        files: (await listDriveFolder(folderId)).map(toDriveFileMeta),
      };
    },
  };
}

function sqlState(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function unwrapCause(error: unknown): unknown {
  return error instanceof Phase1InfraError ? error.cause : error;
}

function liveRowConflictKind(state: string | null): string | null {
  if (state === "42P10") return "invalid_arbiter_inference";
  if (state === "23505") return "unique_violation_against_legacy_pk";
  return null;
}

function isSpreadsheet(file: DriveListedFile): boolean {
  return file.mimeType === "application/vnd.google-apps.spreadsheet";
}

export class PostgresOnboardingScanTx implements OnboardingScanTx {
  constructor(
    private readonly tx: PostgresTransaction,
    private readonly folderId: string,
    private readonly wizardSessionId: string,
  ) {}

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.tx.unsafe(sql, params)) as T[];
  }

  private async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.rows<T>(sql, params);
    return rows[0] ?? null;
  }

  async queryOne<T>(sql: string, params: unknown[]): Promise<T> {
    return (await this.one<T>(sql, params)) as T;
  }

  async ensureWizardIsolationIndexes(): Promise<WizardIsolationIndexProbe> {
    const rows = await this.rows<{ indexname: string }>(
      `
        select indexname
          from pg_indexes
         where schemaname = 'public'
           and indexname = any($1)
      `,
      [[...REQUIRED_WIZARD_ISOLATION_INDEXES]],
    );
    const present = new Set(rows.map((row) => row.indexname));
    const missing = REQUIRED_WIZARD_ISOLATION_INDEXES.filter((name) => !present.has(name));
    return missing.length === 0 ? { ok: true } : { ok: false, missing };
  }

  async readShowForPhase1() {
    return null;
  }

  async readLivePendingSync(driveFileId: string): Promise<Phase1PendingSyncRow | null> {
    const row = await this.one<{
      drive_file_id: string;
      wizard_session_id: string | null;
      base_modified_time: string | null;
      staged_modified_time: string;
      parse_result: ParseResult;
      triggered_review_items: unknown[];
      prior_last_sync_status: string | null;
      prior_last_sync_error: string | null;
      staged_id: string;
      source_kind: string;
      warning_summary: string;
    }>(
      `
        select drive_file_id, wizard_session_id, base_modified_time, staged_modified_time,
               parse_result, triggered_review_items, prior_last_sync_status,
               prior_last_sync_error, staged_id, source_kind, warning_summary
          from public.pending_syncs
         where drive_file_id = $1
           and wizard_session_id = $2::uuid
         limit 1
      `,
      [driveFileId, this.wizardSessionId],
    );
    if (!row) return null;
    return {
      driveFileId: row.drive_file_id,
      wizardSessionId: row.wizard_session_id,
      baseModifiedTime: row.base_modified_time,
      stagedModifiedTime: row.staged_modified_time,
      parseResult: row.parse_result,
      triggeredReviewItems: asTriggeredReviewItems(row.triggered_review_items),
      priorLastSyncStatus: row.prior_last_sync_status,
      priorLastSyncError: row.prior_last_sync_error,
      stagedId: row.staged_id,
      sourceKind: row.source_kind,
      warningSummary: row.warning_summary,
    };
  }

  async upsertLivePendingIngestion(row: Phase1PendingIngestionRow): Promise<void> {
    await this.rows(
      `
        insert into public.pending_ingestions (
          drive_file_id, drive_file_name, last_error_code, last_error_message,
          last_warnings, wizard_session_id, discovered_during_folder_id, last_seen_modified_time
        )
        select $1, $2, $3, $4, $5::jsonb, $6::uuid, $7, $8::timestamptz
        where exists (
          select 1 from public.app_settings
           where id = 'default'
             and pending_wizard_session_id = $6::uuid
        )
        on conflict (drive_file_id, wizard_session_id) where wizard_session_id is not null
        do update set
          drive_file_name = excluded.drive_file_name,
          last_attempt_at = now(),
          attempt_count = public.pending_ingestions.attempt_count + 1,
          last_error_code = excluded.last_error_code,
          last_error_message = excluded.last_error_message,
          last_warnings = excluded.last_warnings,
          discovered_during_folder_id = excluded.discovered_during_folder_id,
          last_seen_modified_time = excluded.last_seen_modified_time
         where public.pending_ingestions.wizard_session_id = $6::uuid
        returning wizard_session_id
      `,
      [
        row.driveFileId,
        row.driveFileName,
        row.lastErrorCode,
        row.lastErrorMessage,
        row.lastWarnings,
        this.wizardSessionId,
        this.folderId,
        row.lastSeenModifiedTime,
      ],
    );
  }

  async deleteLivePendingIngestion(driveFileId: string): Promise<void> {
    await this.rows(
      `
        delete from public.pending_ingestions
         where drive_file_id = $1
           and wizard_session_id = $2::uuid
      `,
      [driveFileId, this.wizardSessionId],
    );
  }

  async upsertLivePendingSync(
    row: Omit<Phase1PendingSyncRow, "stagedId"> & { stagedId?: string },
  ): Promise<{ stagedId: string }> {
    // base_modified_time records the LIVE watermark this staged parse is based on — Phase D's
    // equality preflight (finalize-cas applyShadow → revisionTimesMatch) refuses the shadow
    // apply unless it still equals shows.last_seen_modified_time, and a NULL base only matches
    // a NULL live watermark. This tx deliberately blinds readShowForPhase1 (first-seen
    // semantics: full-parse onboarding review, no MI-6..14 diffs, no shows mutations), so
    // runPhase1 always passes baseModifiedTime null here — for a RE-ONBOARDED existing show
    // (live watermark non-null) a literal-null base made Phase D refuse EVERY row with
    // STAGED_PARSE_OUTDATED_AT_PHASE_D (2026-06-12 validation onboarding drill). Stamp the
    // live watermark at staging time instead, under the per-show advisory lock the scan
    // already holds; a genuine first-seen file has no shows row → subselect yields NULL and
    // the existing null-base contract is unchanged.
    const upserted = await this.one<{ staged_id: string }>(
      `
        insert into public.pending_syncs (
          drive_file_id, base_modified_time, staged_modified_time, parse_result,
          triggered_review_items, prior_last_sync_status, prior_last_sync_error,
          staged_id, source_kind, warning_summary, wizard_session_id, source_anchors
        )
        select $1,
               coalesce(
                 $2::timestamptz,
                 (select s.last_seen_modified_time from public.shows s where s.drive_file_id = $1)
               ),
               $3::timestamptz, $4::jsonb, $5::jsonb, $6, $7,
               coalesce($8::uuid, gen_random_uuid()), $9, $10, $11::uuid,
               coalesce($12::jsonb, '{}'::jsonb)
        where exists (
          select 1 from public.app_settings
           where id = 'default'
             and pending_wizard_session_id = $11::uuid
        )
        on conflict (drive_file_id, wizard_session_id) where wizard_session_id is not null
        do update set
          parsed_at = now(),
          base_modified_time = excluded.base_modified_time,
          staged_modified_time = excluded.staged_modified_time,
          parse_result = excluded.parse_result,
          triggered_review_items = excluded.triggered_review_items,
          prior_last_sync_status = excluded.prior_last_sync_status,
          prior_last_sync_error = excluded.prior_last_sync_error,
          staged_id = excluded.staged_id,
          source_kind = excluded.source_kind,
          warning_summary = excluded.warning_summary,
          source_anchors = excluded.source_anchors
         where public.pending_syncs.wizard_session_id = $11::uuid
        returning staged_id
      `,
      [
        row.driveFileId,
        row.baseModifiedTime,
        row.stagedModifiedTime,
        row.parseResult,
        row.triggeredReviewItems,
        row.priorLastSyncStatus,
        row.priorLastSyncError,
        row.stagedId ?? null,
        "onboarding_scan",
        row.warningSummary,
        this.wizardSessionId,
        // Raw object to $12::jsonb (postgres.js serializes; never JSON.stringify). Unconditional
        // refresh on conflict so a re-stage (rescan) clears/updates stale anchors (spec §5.3/§5.4).
        row.sourceAnchors ?? null,
      ],
    );
    return { stagedId: upserted?.staged_id ?? "" };
  }

  async updateShowParseError(): Promise<void> {
    throw new Error("onboarding scan must not mutate shows");
  }

  async updateShowPendingReview(): Promise<void> {
    throw new Error("onboarding scan must not mutate shows");
  }

  async deleteWizardPendingSyncsExcept(wizardSessionId: string): Promise<void> {
    await this.rows(
      `
        delete from public.pending_syncs
         where wizard_session_id is not null
           and wizard_session_id <> $1::uuid
      `,
      [wizardSessionId],
    );
  }

  async upsertManifest(row: OnboardingManifestRow): Promise<boolean> {
    const written = await this.one<{ wizard_session_id: string }>(
      `
        insert into public.onboarding_scan_manifest (
          folder_id, wizard_session_id, drive_file_id, mime_type, name, status
        )
        select $1, $2::uuid, $3, $4, $5, $6
        where exists (
          select 1 from public.app_settings
           where id = 'default'
             and pending_wizard_session_id = $2::uuid
        )
        on conflict (wizard_session_id, drive_file_id) do update
          set folder_id = excluded.folder_id,
              mime_type = excluded.mime_type,
              name = excluded.name,
              status = excluded.status,
              transitioned_at = now()
        returning wizard_session_id
      `,
      [row.folderId, row.wizardSessionId, row.driveFileId, row.mimeType, row.name, row.status],
    );
    return Boolean(written);
  }

  async logSync(entry: { code: string; driveFileId?: string; payload?: Record<string, unknown> }) {
    await this.rows(
      `
        insert into public.sync_log (drive_file_id, status, message, parse_warnings)
        values ($1, $2, $3, $4::jsonb)
      `,
      [
        entry.driveFileId ?? null,
        entry.code,
        `onboarding_scan:${entry.code}`,
        entry.payload ? [{ ...entry.payload, code: entry.code }] : [],
      ],
    );
  }

  async upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null> {
    const row = await this.one<{ id: string }>(
      "select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id",
      [input.showId, input.code, input.context],
    );
    return row?.id ?? null;
  }
}

/**
 * A scan-scoped transaction runner backed by a SINGLE Postgres connection.
 * `withTx` opens a fresh `sql.begin()` transaction per call (so each file keeps
 * its own transaction — required for the per-show advisory lock and the
 * live-row-conflict fresh-tx recovery), but every call reuses the same
 * connection instead of opening a new one per file. `close` is called once at
 * the end of the scan.
 */
export type ScanTxRunner = {
  withTx: <R>(fn: (tx: OnboardingScanTx) => Promise<R>) => Promise<R>;
  close: () => Promise<void>;
};

function defaultCreateScanTxRunner(folderId: string, wizardSessionId: string): ScanTxRunner {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });
  return {
    withTx: async <R>(fn: (tx: OnboardingScanTx) => Promise<R>): Promise<R> =>
      (await sql.begin(async (rawTx) =>
        fn(
          new PostgresOnboardingScanTx(
            rawTx as unknown as PostgresTransaction,
            folderId,
            wizardSessionId,
          ),
        ),
      )) as R,
    close: () => sql.end({ timeout: 5 }),
  };
}

type OnboardingScanStep = { kind: "continue" } | { kind: "stop"; result: OnboardingScanResult };

async function scanPreparedFileWithTx(
  folderId: string,
  wizardSessionId: string,
  tx: LockedShowTx<OnboardingScanTx>,
  prepared: PreparedOnboardingFile,
  processed: ProcessedOnboardingFile[],
  runPhase1Impl: typeof runPhase1,
): Promise<OnboardingScanStep> {
  const file = prepared.file;
  if (prepared.kind === "non_sheet") {
    const wrote = await callTx("upsertManifest", () =>
      tx.upsertManifest({
        folderId,
        wizardSessionId,
        driveFileId: file.driveFileId,
        mimeType: file.mimeType,
        name: file.name,
        status: "skipped_non_sheet",
      }),
    );
    if (!wrote) {
      await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
      return {
        kind: "stop",
        result: { outcome: "superseded", code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN, processed },
      };
    }
    processed.push({ driveFileId: file.driveFileId, outcome: "skipped_non_sheet" });
    return { kind: "continue" };
  }

  try {
    const binding = prepared.binding;
    const parseResult = prepared.parseResult;
    const result = await runPhase1Impl(tx, {
      driveFileId: file.driveFileId,
      mode: "onboarding_scan",
      fileMeta: file,
      parseResult,
      binding,
      wizardSessionId,
      // Required field on the sheet variant (always present, possibly {}), forwarded so the
      // staging upsert persists pending_syncs.source_anchors.
      sourceAnchors: prepared.sourceAnchors,
    });
    if (result.outcome === "pass") {
      await callTx("logSync", () =>
        tx.logSync({
          code: "onboarding_scan_unexpected_phase1_pass",
          driveFileId: file.driveFileId,
        }),
      );
      const wrote = await callTx("upsertManifest", () =>
        tx.upsertManifest({
          folderId,
          wizardSessionId,
          driveFileId: file.driveFileId,
          mimeType: file.mimeType,
          name: file.name,
          status: "hard_failed",
        }),
      );
      if (!wrote) {
        await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
        return {
          kind: "stop",
          result: {
            outcome: "superseded",
            code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN,
            processed,
          },
        };
      }
      processed.push({ driveFileId: file.driveFileId, outcome: "hard_failed" });
      return { kind: "continue" };
    }

    if (result.outcome === "stage") {
      if (result.stagedId.length === 0) {
        await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
        return {
          kind: "stop",
          result: {
            outcome: "superseded",
            code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN,
            processed,
          },
        };
      }
      const wrote = await callTx("upsertManifest", () =>
        tx.upsertManifest({
          folderId,
          wizardSessionId,
          driveFileId: file.driveFileId,
          mimeType: file.mimeType,
          name: file.name,
          status: "staged",
        }),
      );
      if (!wrote) {
        await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
        return {
          kind: "stop",
          result: {
            outcome: "superseded",
            code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN,
            processed,
          },
        };
      }
      processed.push({ driveFileId: file.driveFileId, outcome: "staged" });
      return { kind: "continue" };
    }

    if (result.outcome === "defer") {
      await callTx("logSync", () =>
        tx.logSync({
          code: "onboarding_scan_unexpected_phase1_defer",
          driveFileId: file.driveFileId,
          payload: { reason: result.reason },
        }),
      );
      const wrote = await callTx("upsertManifest", () =>
        tx.upsertManifest({
          folderId,
          wizardSessionId,
          driveFileId: file.driveFileId,
          mimeType: file.mimeType,
          name: file.name,
          status: "hard_failed",
        }),
      );
      if (!wrote) {
        await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
        return {
          kind: "stop",
          result: {
            outcome: "superseded",
            code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN,
            processed,
          },
        };
      }
      processed.push({ driveFileId: file.driveFileId, outcome: "hard_failed" });
      return { kind: "continue" };
    }

    if (result.outcome === "hard_fail") {
      const wrote = await callTx("upsertManifest", () =>
        tx.upsertManifest({
          folderId,
          wizardSessionId,
          driveFileId: file.driveFileId,
          mimeType: file.mimeType,
          name: file.name,
          status: "hard_failed",
        }),
      );
      if (!wrote) {
        await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
        return {
          kind: "stop",
          result: {
            outcome: "superseded",
            code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN,
            processed,
          },
        };
      }
      processed.push({ driveFileId: file.driveFileId, outcome: "hard_failed" });
      return { kind: "continue" };
    }
  } catch (error) {
    const cause = unwrapCause(error);
    const state = sqlState(cause);
    const kind = liveRowConflictKind(state);
    if (!kind) {
      if (error instanceof Phase1InfraError) {
        throw new OnboardingScanInfraError(error.operation, error.cause);
      }
      throw error;
    }
    // 25P02 abort class: the 23505/42P10 was raised by a statement ON THIS
    // per-file transaction, so the transaction is already aborted — any
    // recovery write issued here would fail with 25P02
    // in_failed_sql_transaction on real Postgres (live-reproduced; sibling of
    // the first-seen slug-collision fix in runScheduledCronSync). Rethrow a
    // typed control-flow error so the per-file transaction rolls back;
    // scanPreparedFiles records the conflict in a FRESH transaction.
    throw new OnboardingScanLiveRowConflictRollbackError(String(state), kind);
  }

  return { kind: "continue" };
}

/**
 * Control-flow error: a live-row conflict (legacy-PK 23505 / arbiter-inference
 * 42P10) aborted the per-file scan transaction. Thrown OUT of the transaction
 * so it rolls back; the caller writes the live_row_conflict recovery rows
 * (sync_log, admin alert, manifest) in a fresh transaction.
 */
class OnboardingScanLiveRowConflictRollbackError extends Error {
  constructor(
    readonly sqlstate: string,
    readonly conflictKind: string,
  ) {
    super(`onboarding scan live-row conflict (sqlstate ${sqlstate}, ${conflictKind})`);
    this.name = "OnboardingScanLiveRowConflictRollbackError";
  }
}

/**
 * Recovery writes for a live-row conflict — MUST run on a fresh transaction.
 *
 * Returns the upsertManifest boolean (false = app_settings
 * .pending_wizard_session_id no longer matches this session, i.e. the session
 * was superseded between the aborted per-file tx and this recovery tx). The
 * manifest write runs FIRST so that nothing else emits when superseded: no
 * onboarding_scan_live_row_conflict sync_log row, no LIVE_ROW_CONFLICT admin
 * alert. Mirrors the normal scan paths, which convert upsertManifest=false
 * into the WIZARD_SESSION_SUPERSEDED_DURING_SCAN stop result.
 */
async function recordLiveRowConflict(
  folderId: string,
  wizardSessionId: string,
  tx: OnboardingScanTx,
  file: DriveListedFile,
  conflict: OnboardingScanLiveRowConflictRollbackError,
): Promise<boolean> {
  const wrote = await callTx("upsertManifest", () =>
    tx.upsertManifest({
      folderId,
      wizardSessionId,
      driveFileId: file.driveFileId,
      mimeType: file.mimeType,
      name: file.name,
      status: "live_row_conflict",
    }),
  );
  if (!wrote) {
    await callTx("logSync", () => tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }));
    return false;
  }
  await callTx("logSync", () =>
    tx.logSync({
      code: "onboarding_scan_live_row_conflict",
      driveFileId: file.driveFileId,
      payload: {
        drive_file_id: file.driveFileId,
        sqlstate: conflict.sqlstate,
        kind: conflict.conflictKind,
      },
    }),
  );
  await callTx("upsertAdminAlert", () =>
    tx.upsertAdminAlert({
      showId: null,
      code: LIVE_ROW_CONFLICT,
      context: {
        drive_file_id: file.driveFileId,
        file_name: file.name,
        folder_id: folderId,
        wizard_session_id: wizardSessionId,
        sqlstate: conflict.sqlstate,
        kind: conflict.conflictKind,
      },
    }),
  );
  return true;
}

async function scanPreparedFiles(
  folderId: string,
  wizardSessionId: string,
  preparedFiles: PreparedOnboardingFile[],
  deps: Pick<RunOnboardingScanDeps, "runPhase1" | "withShowLock" | "onProgress">,
  withTx: <R>(fn: (tx: OnboardingScanTx) => Promise<R>) => Promise<R>,
): Promise<OnboardingScanResult> {
  const processed: ProcessedOnboardingFile[] = [];
  const runPhase1Impl = deps.runPhase1 ?? runPhase1;
  const lock = deps.withShowLock ?? defaultWithShowLock;
  deps.onProgress?.({ type: "staging" });

  for (const prepared of preparedFiles) {
    let step: OnboardingScanStep;
    try {
      step = await withTx(async (tx) => {
        const locked = await lock(
          prepared.file.driveFileId,
          (lockedTx) =>
            scanPreparedFileWithTx(
              folderId,
              wizardSessionId,
              lockedTx,
              prepared,
              processed,
              runPhase1Impl,
            ),
          { tx, tryOnly: false },
        );
        if ("skipped" in locked) {
          throw new OnboardingScanInfraError("withShowLock", locked);
        }
        return locked;
      });
    } catch (error) {
      if (!(error instanceof OnboardingScanLiveRowConflictRollbackError)) throw error;
      // The conflicting per-file transaction rolled back above (its 23505/42P10
      // left it aborted — writing the recovery rows there would 25P02). Record
      // the live_row_conflict in a FRESH transaction, re-acquiring the same
      // per-show lock (single-holder rule: the lock wrapper stays the one
      // holder layer, same as the scan path).
      const recorded = await withTx(async (tx) => {
        const locked = await lock(
          prepared.file.driveFileId,
          (lockedTx) =>
            recordLiveRowConflict(folderId, wizardSessionId, lockedTx, prepared.file, error),
          { tx, tryOnly: false },
        );
        if (typeof locked !== "boolean") {
          throw new OnboardingScanInfraError("withShowLock", locked);
        }
        return locked;
      });
      if (!recorded) {
        // upsertManifest=false: the wizard session was superseded between the
        // aborted per-file tx and the recovery tx. Mirror the normal scan
        // paths' superseded stop — no recovery artifacts were emitted.
        return { outcome: "superseded", code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN, processed };
      }
      processed.push({ driveFileId: prepared.file.driveFileId, outcome: "live_row_conflict" });
      continue;
    }
    if (step.kind === "stop") return step.result;
  }

  return { outcome: "completed", processed };
}

async function verifyOnboardingScanReady(
  tx: OnboardingScanTx,
): Promise<Extract<OnboardingScanResult, { outcome: "schema_missing" }> | null> {
  const probe = await callTx("ensureWizardIsolationIndexes", () =>
    tx.ensureWizardIsolationIndexes(),
  );
  if (probe.ok) return null;
  await callTx("logSync", () =>
    tx.logSync({
      code: "onboarding_scan_aborted_migration_state",
      payload: { missing_indexes: probe.missing },
    }),
  );
  return {
    outcome: "schema_missing",
    code: WIZARD_ISOLATION_INDEXES_MISSING,
    missingIndexes: probe.missing,
  };
}

export async function prepareOnboardingFiles(
  folderId: string,
  deps: RunOnboardingScanDeps,
): Promise<PreparedOnboardingFile[]> {
  const listFolder = deps.listFolder ?? listDriveFolder;
  const files = await listFolder(folderId);
  deps.onProgress?.({ type: "listed", total: files.length });
  const fetchMarkdownWithBinding = deps.fetchMarkdownWithBinding ?? fetchSheetMarkdownWithBinding;
  const listSheetGids = deps.listSheetGids ?? fetchSheetTitleToGid;
  const parseSheet = deps.parseSheet ?? parseMarkdownSheet;
  const enrich = deps.enrichWithDrivePins ?? enrichWithDrivePins;
  const driveClient = deps.driveClient ?? defaultDriveClient();

  // Per-file preparation is a pre-lock, side-effect-free Drive read (export +
  // parse + enrich). Each file is independent, so we prepare them with bounded
  // concurrency instead of serially — this is the dominant cost of an onboarding
  // scan. mapWithConcurrency preserves listed order, so the downstream
  // lock-ordered scanPreparedFiles loop is unaffected. fetchMarkdownWithBinding
  // captures the binding FROM the export's before-`get` (one fewer files.get per
  // sheet than a separate binding capture); first-seen onboarding does not need
  // the cron path's separate-capture revision-race cooldown.
  const prepareOne = async (file: DriveListedFile): Promise<PreparedOnboardingFile> => {
    if (!isSpreadsheet(file)) {
      return { file, kind: "non_sheet" };
    }
    const { binding, markdown, bytes } = await fetchMarkdownWithBinding(file.driveFileId);
    const parsed = parseSheet(markdown, file.name);
    const parseResult = await enrich(parsed, driveClient, {
      driveFileId: file.driveFileId,
      fileMeta: toDriveFileMeta(file),
      binding,
    });
    // Compute region source anchors ONCE from the already-fetched bytes (best-effort) and
    // reuse them for BOTH warning attachment AND persistence (spec §5.1). The tab-gid fetch
    // now runs for EVERY sheet (not just cell-anchored-warning sheets) so finalize can read
    // pending_syncs.source_anchors instead of re-exporting the XLSX — moved off the finalize
    // critical path onto this already-parallelized prepare phase.
    let sourceAnchors: Record<string, SourceAnchor> = {};
    // Default resolver: the lazy fetch (only reached if a cell-anchored warning exists AND the
    // eager fetch below did not run — e.g. bytes missing).
    let resolveGids = () => listSheetGids(file.driveFileId);
    if (bytes) {
      try {
        const titleToGid = await listSheetGids(file.driveFileId);
        // Cache → attachWarningAnchors reuses the SAME map, no second fetch (keeps the existing
        // "listSheetGids called once" contract for cell-anchored sheets).
        resolveGids = () => Promise.resolve(titleToGid);
        sourceAnchors = extractSourceAnchors(bytes, titleToGid);
      } catch {
        // gids/extract failed → {} anchors, and hand attachWarningAnchors an EMPTY map so it
        // degrades link-less WITHOUT a second (also-failing) network fetch.
        sourceAnchors = {};
        resolveGids = () => Promise.resolve(new Map<string, number>());
      }
    }
    // attachWarningAnchors is contractually no-throw (attachWarningAnchors.ts:14-15), but wrap it
    // anyway so anchor work can NEVER wedge the scan (plan-wide best-effort invariant), keeping
    // warning-anchor degradation independent of any region-anchor failure.
    try {
      await attachWarningAnchors(parseResult.warnings, bytes, resolveGids, sourceAnchors);
    } catch {
      /* belt-and-suspenders: best-effort, never wedges the scan */
    }
    return { file, kind: "sheet", binding, parseResult, sourceAnchors };
  };

  return mapWithConcurrency(files, ONBOARDING_PREPARE_CONCURRENCY, prepareOne, (info) =>
    deps.onProgress?.({
      type: "prepared",
      done: info.done,
      total: info.total,
      name: info.item.name,
    }),
  );
}

/**
 * Provide a `withTx` to `body` over the right connection strategy:
 *  - `deps.tx` (injected, e.g. a caller-locked tx): every withTx call runs the
 *    fn against that single tx — the caller owns the transaction/lock.
 *  - default: one reused Postgres connection (a fresh sql.begin() transaction
 *    per withTx call), closed when `body` resolves. This is the connection-reuse
 *    strategy from the scan-loop optimization; holding it open across the body's
 *    (DB-free) Drive prepare phase is fine — postgres.js reconnects on idle.
 */
async function withScanTx<R>(
  folderId: string,
  wizardSessionId: string,
  deps: RunOnboardingScanDeps,
  body: (withTx: ScanTxRunner["withTx"]) => Promise<R>,
): Promise<R> {
  if (deps.tx) {
    const tx = deps.tx;
    return await body(async (fn) => fn(tx));
  }
  const runner = (deps.createScanTxRunner ?? defaultCreateScanTxRunner)(folderId, wizardSessionId);
  try {
    return await body(runner.withTx);
  } finally {
    await runner.close();
  }
}

/**
 * Stage an ALREADY-prepared set of onboarding files (readiness probe + the
 * lock-ordered per-file scan) WITHOUT re-fetching from Drive. Split out from
 * runOnboardingScan so callers that must prepare BEFORE acquiring a lock (the
 * wizard revision-race restage) can do the slow Drive read pre-lock and call
 * this for the fast DB staging under the lock.
 */
export async function scanOnboardingPreparedFiles(
  folderId: string,
  wizardSessionId: string,
  preparedFiles: PreparedOnboardingFile[],
  deps: RunOnboardingScanDeps = {},
): Promise<OnboardingScanResult> {
  return withScanTx(folderId, wizardSessionId, deps, async (withTx) => {
    const readiness = await withTx(verifyOnboardingScanReady);
    if (readiness) return readiness;
    return await scanPreparedFiles(folderId, wizardSessionId, preparedFiles, deps, withTx);
  });
}

export async function runOnboardingScan(
  folderId: string,
  wizardSessionId: string,
  deps: RunOnboardingScanDeps = {},
): Promise<OnboardingScanResult> {
  return withScanTx(folderId, wizardSessionId, deps, async (withTx) => {
    const readiness = await withTx(verifyOnboardingScanReady);
    if (readiness) return readiness;
    // Side-effect-free, pre-lock Drive read. For the default connection strategy
    // the reused connection is held (idle) across this — postgres.js reconnects
    // transparently if the socket times out during it.
    const preparedFiles = await prepareOnboardingFiles(folderId, deps);
    return await scanPreparedFiles(folderId, wizardSessionId, preparedFiles, deps, withTx);
  });
}
