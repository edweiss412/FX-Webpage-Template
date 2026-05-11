import postgres from "postgres";
import { google } from "googleapis";
import {
  upsertAdminAlert as defaultUpsertAdminAlert,
  type UpsertAdminAlertInput,
} from "@/lib/adminAlerts/upsertAdminAlert";
import {
  getActiveWatchedFolderId,
  type ActiveWatchedFolderResult,
} from "@/lib/appSettings/getWatchedFolderId";
import { canonicalize } from "@/lib/email/canonicalize";
import { fetchDriveFileMetadata, fetchSheetAsMarkdownAtRevision } from "@/lib/drive/fetch";
import { getDriveAccessToken, getDriveAuth } from "@/lib/drive/client";
import { listFolder as listDriveFolder, type DriveListedFile } from "@/lib/drive/list";
import { parseSheet as parseMarkdownSheet } from "@/lib/parser";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import {
  enrichWithDrivePins,
  type DriveClient,
  type DriveFileMeta,
  type SpreadsheetEmbeddedObject,
  type SpreadsheetSheet,
} from "@/lib/sync/enrichWithDrivePins";
import { bytesFromWebStream } from "@/lib/sync/boundedBytes";
import { makeSnapshotAssetsForApply } from "@/lib/sync/defaultSnapshotAssetsForApply";
import {
  assertShowLockHeld,
  CONCURRENT_SYNC_SKIPPED,
  type ConcurrentSyncSkipped,
  type LockableSyncTx,
  type LockedShowTx,
  withShowLock,
} from "@/lib/sync/lockedShowTx";
import {
  Phase1InfraError,
  runPhase1,
  type Phase1Args,
  type Phase1Binding,
  type Phase1Tx,
} from "@/lib/sync/phase1";
import {
  Phase2InfraError,
  runPhase2,
  type Phase2Args,
  type Phase2Mode,
  type Phase2Result,
  type RoleFlagsNotice,
  type Phase2Tx,
} from "@/lib/sync/phase2";
import { promoteSnapshotUpload as defaultPromoteSnapshotUpload } from "@/lib/sync/promoteSnapshot";
import {
  type DeferredIngestionRow,
  perFileProcessor,
  type ResolvedSyncMode,
  SyncInfraError,
  type SyncMode,
} from "@/lib/sync/perFileProcessor";

export const STAGED_PARSE_REVISION_RACE = "STAGED_PARSE_REVISION_RACE" as const;
export const STAGED_PARSE_REVISION_RACE_COOLDOWN = "STAGED_PARSE_REVISION_RACE_COOLDOWN" as const;
export const STAGED_PARSE_SOURCE_GONE = "STAGED_PARSE_SOURCE_GONE" as const;
export const SYNC_FILE_FAILED = "SYNC_FILE_FAILED" as const;
export const SYNC_INFRA_ERROR = "SYNC_INFRA_ERROR" as const;
export const SYNC_STEP_TIMEOUT = "SYNC_STEP_TIMEOUT" as const;
export const DRIVE_METADATA_MISSING = "DRIVE_METADATA_MISSING" as const;
export const SHEET_UNAVAILABLE = "SHEET_UNAVAILABLE" as const;
const DRIVE_SYNC_STEP_TIMEOUT_MS = 30_000;
type SyncFailureCode =
  | typeof SYNC_FILE_FAILED
  | typeof SYNC_INFRA_ERROR
  | typeof SYNC_STEP_TIMEOUT
  | typeof DRIVE_METADATA_MISSING
  | typeof SHEET_UNAVAILABLE
  | "LOCK_OWNERSHIP_ASSERTION_FAILED";

export type RevisionRaceCooldown = {
  retryCount: number;
  cooldownSeconds: number;
  cooldownRemainingMs: number;
};

export function revisionRaceCooldownSeconds(retryCount: number): number {
  return Math.min(60 * 2 ** retryCount, 600);
}

type RevisionRaceCooldownTx = {
  readRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<RevisionRaceCooldown | null>;
  upsertRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<{ retryCount: number; cooldownSeconds: number }>;
  deleteRevisionRaceCooldowns(driveFileId: string): Promise<void>;
};

type LiveDeferralTx = {
  readLiveDeferral(driveFileId: string): Promise<DeferredIngestionRow | null>;
  deleteLiveDeferral(driveFileId: string): Promise<void>;
};

type SnapshotApplyTx = {
  readShowId?(driveFileId: string): Promise<string | null>;
  insertPendingSnapshotUpload(row: {
    showId: string;
    driveFileId: string;
    tempPrefix: string;
    snapshotRevisionId: string;
    assetCount: number;
  }): Promise<void>;
  markPendingSnapshotDeleteStarted?(snapshotRevisionId: string): Promise<void>;
};

export type SyncPipelineTx = LockableSyncTx &
  Phase1Tx &
  Phase2Tx &
  Partial<SnapshotApplyTx> &
  Partial<RevisionRaceCooldownTx> &
  Partial<LiveDeferralTx>;

export type ProcessOneFileResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "asset_recovery" }
  | { outcome: "stage"; stagedId: string }
  | { outcome: "hard_fail"; code: string }
  | {
      outcome: "applied";
      showId: string;
      roleFlagsNotice?: RoleFlagsNotice;
      snapshotRevisionId?: string;
    }
  | { outcome: "stale"; code: string }
  | { outcome: "revision_race"; code: typeof STAGED_PARSE_REVISION_RACE }
  | {
      outcome: "revision_race_cooldown";
      code: typeof STAGED_PARSE_REVISION_RACE_COOLDOWN;
      cooldownRemainingMs: number;
      retryCount: number;
    }
  | { outcome: "source_gone"; code: typeof STAGED_PARSE_SOURCE_GONE }
  | { outcome: "source_gone"; code: typeof SHEET_UNAVAILABLE }
  | {
      outcome: "parse_error";
      code: SyncFailureCode;
    }
  | ConcurrentSyncSkipped;

export type SyncLogEntry = {
  driveFileId: string | null;
  outcome: string;
  code?: string;
  payload?: Record<string, unknown>;
};

export type CronLiveShowRow = {
  showId: string;
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  wizardSessionId: string | null;
};

type CronRecoveryTx = SyncPipelineTx & {
  markShowSheetUnavailable(
    driveFileId: string,
    code: typeof SHEET_UNAVAILABLE | typeof STAGED_PARSE_SOURCE_GONE,
  ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null }>;
  markShowDriveError(
    driveFileId: string,
    code: string,
  ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null }>;
  insertSyncLog(entry: SyncLogEntry, showId?: string | null): Promise<void>;
  upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null>;
};

export type ProcessOneFileDeps = {
  withShowLock?: (
    driveFileId: string,
    fn: (tx: LockedShowTx<SyncPipelineTx>) => Promise<ProcessOneFileResult> | ProcessOneFileResult,
    options?: Parameters<typeof withShowLock<SyncPipelineTx, ProcessOneFileResult>>[2],
  ) => Promise<ProcessOneFileResult | ConcurrentSyncSkipped>;
  perFileProcessor?: typeof perFileProcessor;
  captureBinding?: (driveFileId: string, fileMeta: DriveListedFile) => Promise<Phase1Binding>;
  fetchMarkdownAtRevision?: (driveFileId: string, revisionId: string) => Promise<string>;
  parseSheet?: (markdown: string, filename?: string) => ParsedSheet;
  enrichWithDrivePins?: (
    parsed: ParsedSheet,
    driveClient: DriveClient,
    ctx: { driveFileId: string; fileMeta: DriveFileMeta; binding: Phase1Binding },
  ) => Promise<ParseResult>;
  driveClient?: DriveClient;
  runPhase1?: typeof runPhase1;
  runPhase2?: typeof runPhase2;
  promoteSnapshotUpload?: typeof defaultPromoteSnapshotUpload;
  readRevisionRaceCooldown?: (
    driveFileId: string,
    racedHeadRevisionId: string,
  ) => Promise<RevisionRaceCooldown | null>;
  upsertAdminAlert?: typeof defaultUpsertAdminAlert;
  logSync?: (entry: SyncLogEntry) => Promise<void>;
  publishShowInvalidation?: (showId: string) => Promise<void>;
};

export type RunScheduledCronSyncDeps = {
  folderId?: string;
  getActiveWatchedFolderId?: () => Promise<ActiveWatchedFolderResult>;
  listFolder?: typeof listDriveFolder;
  logSync?: (entry: SyncLogEntry) => Promise<void>;
  listLiveShows?: () => Promise<CronLiveShowRow[]>;
  withShowLock?: <R>(
    driveFileId: string,
    fn: (tx: LockedShowTx<SyncPipelineTx>) => Promise<R> | R,
    options?: Parameters<typeof withShowLock<SyncPipelineTx, R>>[2],
  ) => Promise<R | ConcurrentSyncSkipped>;
  processOneFile?: (
    driveFileId: string,
    mode: "cron",
    fileMeta: DriveListedFile,
    deps?: Pick<ProcessOneFileDeps, "logSync">,
  ) => Promise<ProcessOneFileResult>;
};

export type RunScheduledCronSyncResult = {
  processed: Array<{
    driveFileId: string;
    result: ProcessOneFileResult;
  }>;
  summary?:
    | { outcome: "skipped"; skipReason: "no_folder_configured" }
    | { outcome: "parse_error"; code: typeof SYNC_INFRA_ERROR };
};

type PostgresTransaction = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

export const MAX_SHOW_SLUG_INSERT_ATTEMPTS = 20;

export class ShowSlugCollisionRetryExhaustedError extends Error {
  readonly code = "SHOW_SLUG_COLLISION_RETRY_EXHAUSTED";
  override readonly cause: unknown;

  constructor(baseSlug: string, attempts: number, cause: unknown) {
    super(`Could not allocate a unique show slug for ${baseSlug} after ${attempts} attempts`);
    this.name = "ShowSlugCollisionRetryExhaustedError";
    this.cause = cause;
  }
}

function isPostgresUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "23505"
  );
}

function slugCandidateForAttempt(baseSlug: string, attempt: number): string {
  return attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
}

export async function insertFirstSeenShowWithSlugRetry<T>(args: {
  baseSlug: string;
  insert: (slug: string) => Promise<T | null>;
  maxAttempts?: number;
}): Promise<T | null> {
  const maxAttempts = args.maxAttempts ?? MAX_SHOW_SLUG_INSERT_ATTEMPTS;
  let lastUniqueViolation: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await args.insert(slugCandidateForAttempt(args.baseSlug, attempt));
    } catch (cause) {
      if (!isPostgresUniqueViolation(cause)) throw cause;
      lastUniqueViolation = cause;
    }
  }

  throw new ShowSlugCollisionRetryExhaustedError(args.baseSlug, maxAttempts, lastUniqueViolation);
}

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("runScheduledCronSync requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

class PostgresPipelineTx implements SyncPipelineTx {
  constructor(private readonly tx: PostgresTransaction) {}

  async queryOne<T>(sql: string, params: unknown[]): Promise<T> {
    return (await this.one<T>(sql, params)) as T;
  }

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.tx.unsafe(sql, params)) as T[];
  }

  private async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.rows<T>(sql, params);
    return rows[0] ?? null;
  }

  async readCurrentDiagrams(driveFileId: string): Promise<unknown> {
    const row = await this.one<{ diagrams: unknown }>(
      "select diagrams from public.shows where drive_file_id = $1 limit 1",
      [driveFileId],
    );
    if (!row?.diagrams || typeof row.diagrams !== "object") return null;
    if ("current" in row.diagrams) return (row.diagrams as { current?: unknown }).current ?? null;
    return row.diagrams;
  }

  async readShowId(driveFileId: string): Promise<string | null> {
    const row = await this.one<{ id: string }>(
      "select id from public.shows where drive_file_id = $1 limit 1",
      [driveFileId],
    );
    return row?.id ?? null;
  }

  async applyDiagramSnapshot(
    driveFileId: string,
    diagrams: ParseResult["diagrams"],
  ): Promise<void> {
    await this.rows(
      `
        update public.shows
           set diagrams = $2::jsonb
         where drive_file_id = $1
      `,
      [driveFileId, JSON.stringify(diagrams)],
    );
  }

  async insertPendingSnapshotUpload(row: {
    showId: string;
    driveFileId: string;
    tempPrefix: string;
    snapshotRevisionId: string;
    assetCount: number;
  }): Promise<void> {
    await this.rows(
      `
        insert into public.pending_snapshot_uploads (
          show_id, drive_file_id, temp_prefix, snapshot_revision_id, asset_count
        )
        values ($1::uuid, $2, $3, $4::uuid, $5)
      `,
      [row.showId, row.driveFileId, row.tempPrefix, row.snapshotRevisionId, row.assetCount],
    );
  }

  async markPendingSnapshotDeleteStarted(snapshotRevisionId: string): Promise<void> {
    await this.rows(
      `
        update public.pending_snapshot_uploads
           set claim_token = coalesce(claim_token, gen_random_uuid()),
               claimed_at = coalesce(claimed_at, now()),
               claim_expires_at = coalesce(claim_expires_at, now()),
               delete_started_at = now()
         where snapshot_revision_id = $1::uuid
           and promoted_at is null
      `,
      [snapshotRevisionId],
    );
  }

  async readShowForPhase1(driveFileId: string) {
    const show = await this.one<{
      id: string;
      drive_file_id: string;
      title: string;
      client_label: string;
      client_contact: unknown;
      template_version: string;
      venue: unknown;
      dates: unknown;
      event_details: unknown;
      agenda_links: unknown;
      diagrams: unknown;
      opening_reel_drive_file_id: string | null;
      opening_reel_drive_modified_time: string | null;
      opening_reel_head_revision_id: string | null;
      opening_reel_mime_type: string | null;
      coi_status: string | null;
      pull_sheet: unknown;
      last_sync_status: string | null;
      last_sync_error: string | null;
      last_seen_modified_time: string | null;
    }>(
      `
        select *
          from public.shows
         where drive_file_id = $1
         limit 1
      `,
      [driveFileId],
    );
    if (!show) return null;

    const crewMembers = await this.rows<ParseResult["crewMembers"][number]>(
      `
        select name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info
          from public.crew_members
         where show_id = $1
         order by name
      `,
      [show.id],
    );
    const hotelReservations = await this.rows<ParseResult["hotelReservations"][number]>(
      `
        select ordinal, hotel_name, hotel_address, names, confirmation_no, check_in, check_out, notes
          from public.hotel_reservations
         where show_id = $1
         order by ordinal
      `,
      [show.id],
    );
    const rooms = await this.rows<ParseResult["rooms"][number]>(
      `
        select kind, name, dimensions, floor, setup, set_time, show_time, strike_time,
               audio, video, lighting, scenic, power, digital_signage, other, notes
          from public.rooms
         where show_id = $1
         order by name
      `,
      [show.id],
    );
    const transportation = await this.one<ParseResult["transportation"]>(
      `
        select driver_name, driver_phone, driver_email, vehicle, license_plate, color,
               parking, schedule, notes
          from public.transportation
         where show_id = $1
         limit 1
      `,
      [show.id],
    );
    const contacts = await this.rows<ParseResult["contacts"][number]>(
      `
        select kind, name, email, phone, notes
          from public.contacts
         where show_id = $1
         order by kind, name
      `,
      [show.id],
    );
    const internal = await this.one<{
      parse_warnings: ParseResult["warnings"] | null;
      raw_unrecognized: ParseResult["raw_unrecognized"] | null;
    }>(
      `
        select parse_warnings, raw_unrecognized
          from public.shows_internal
         where show_id = $1
         limit 1
      `,
      [show.id],
    );

    return {
      driveFileId: show.drive_file_id,
      lastSeenModifiedTime: show.last_seen_modified_time,
      lastSyncStatus: show.last_sync_status,
      lastSyncError: show.last_sync_error,
      priorParseResult: {
        show: {
          title: show.title,
          client_label: show.client_label,
          client_contact: show.client_contact as ParseResult["show"]["client_contact"],
          template_version: show.template_version as ParseResult["show"]["template_version"],
          venue: show.venue as ParseResult["show"]["venue"],
          dates: show.dates as ParseResult["show"]["dates"],
          schedule_phases: {},
          event_details: (show.event_details ?? {}) as ParseResult["show"]["event_details"],
          agenda_links: (show.agenda_links ?? []) as ParseResult["show"]["agenda_links"],
          coi_status: show.coi_status,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
        crewMembers,
        hotelReservations,
        rooms,
        transportation,
        contacts,
        pullSheet: show.pull_sheet as ParseResult["pullSheet"],
        diagrams: show.diagrams as ParseResult["diagrams"],
        openingReel: show.opening_reel_drive_file_id
          ? {
              driveFileId: show.opening_reel_drive_file_id,
              drive_modified_time: show.opening_reel_drive_modified_time ?? "",
              headRevisionId: show.opening_reel_head_revision_id ?? "",
              mimeType: show.opening_reel_mime_type ?? "",
            }
          : null,
        raw_unrecognized: internal?.raw_unrecognized ?? [],
        warnings: internal?.parse_warnings ?? [],
        hardErrors: [],
      },
    };
  }

  async readLivePendingSync(driveFileId: string) {
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
           and wizard_session_id is null
         limit 1
      `,
      [driveFileId],
    );
    if (!row) return null;
    return {
      driveFileId: row.drive_file_id,
      wizardSessionId: row.wizard_session_id,
      baseModifiedTime: row.base_modified_time,
      stagedModifiedTime: row.staged_modified_time,
      parseResult: row.parse_result,
      triggeredReviewItems: row.triggered_review_items as never[],
      priorLastSyncStatus: row.prior_last_sync_status,
      priorLastSyncError: row.prior_last_sync_error,
      stagedId: row.staged_id,
      sourceKind: row.source_kind,
      warningSummary: row.warning_summary,
    };
  }

  async upsertLivePendingIngestion(row: Parameters<Phase1Tx["upsertLivePendingIngestion"]>[0]) {
    await this.rows(
      `
        insert into public.pending_ingestions (
          drive_file_id, drive_file_name, last_error_code, last_error_message,
          last_warnings, wizard_session_id, last_seen_modified_time
        )
        values ($1, $2, $3, $4, $5::jsonb, null, $6::timestamptz)
        on conflict (drive_file_id) where wizard_session_id is null
        do update set
          drive_file_name = excluded.drive_file_name,
          last_attempt_at = now(),
          attempt_count = public.pending_ingestions.attempt_count + 1,
          last_error_code = excluded.last_error_code,
          last_error_message = excluded.last_error_message,
          last_warnings = excluded.last_warnings,
          last_seen_modified_time = excluded.last_seen_modified_time
      `,
      [
        row.driveFileId,
        row.driveFileName,
        row.lastErrorCode,
        row.lastErrorMessage,
        JSON.stringify(row.lastWarnings),
        row.lastSeenModifiedTime,
      ],
    );
  }

  async deleteLivePendingIngestion(driveFileId: string) {
    await this.rows(
      `
        delete from public.pending_ingestions
         where drive_file_id = $1
           and wizard_session_id is null
      `,
      [driveFileId],
    );
  }

  async upsertLivePendingSync(row: Parameters<Phase1Tx["upsertLivePendingSync"]>[0]) {
    const upserted = await this.one<{ staged_id: string }>(
      `
        insert into public.pending_syncs (
          drive_file_id, base_modified_time, staged_modified_time, parse_result,
          triggered_review_items, prior_last_sync_status, prior_last_sync_error,
          staged_id, source_kind, warning_summary, wizard_session_id
        )
        values ($1, $2::timestamptz, $3::timestamptz, $4::jsonb, $5::jsonb, $6, $7,
                coalesce($8::uuid, gen_random_uuid()), $9, $10, null)
        on conflict (drive_file_id) where wizard_session_id is null
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
          warning_summary = excluded.warning_summary
        returning staged_id
      `,
      [
        row.driveFileId,
        row.baseModifiedTime,
        row.stagedModifiedTime,
        JSON.stringify(row.parseResult),
        JSON.stringify(row.triggeredReviewItems),
        row.priorLastSyncStatus,
        row.priorLastSyncError,
        row.stagedId ?? null,
        row.sourceKind,
        row.warningSummary,
      ],
    );
    return { stagedId: upserted?.staged_id ?? row.stagedId ?? "" };
  }

  async updateShowParseError(driveFileId: string, error: { code: string; message: string }) {
    await this.rows(
      `
        update public.shows
           set last_sync_status = 'parse_error',
               last_sync_error = $2,
               last_synced_at = now()
         where drive_file_id = $1
      `,
      [driveFileId, error.code],
    );
  }

  async updateShowPendingReview(driveFileId: string) {
    await this.rows(
      `
        update public.shows
           set last_sync_status = 'pending_review',
               last_sync_error = null,
               last_synced_at = now()
         where drive_file_id = $1
      `,
      [driveFileId],
    );
  }

  async markShowSheetUnavailable(
    driveFileId: string,
    code: typeof SHEET_UNAVAILABLE | typeof STAGED_PARSE_SOURCE_GONE,
  ) {
    const row = await this.one<{ id: string; last_seen_modified_time: string | null }>(
      `
        update public.shows
           set last_sync_status = 'sheet_unavailable',
               last_sync_error = $2,
               last_synced_at = now()
         where drive_file_id = $1
         returning id, last_seen_modified_time
      `,
      [driveFileId, code],
    );
    return {
      showId: row?.id ?? null,
      lastSeenModifiedTime: row?.last_seen_modified_time ?? null,
    };
  }

  async markShowDriveError(driveFileId: string, code: string) {
    const row = await this.one<{ id: string; last_seen_modified_time: string | null }>(
      `
        update public.shows
           set last_sync_status = 'drive_error',
               last_sync_error = $2,
               last_synced_at = now()
         where drive_file_id = $1
         returning id, last_seen_modified_time
      `,
      [driveFileId, code],
    );
    return {
      showId: row?.id ?? null,
      lastSeenModifiedTime: row?.last_seen_modified_time ?? null,
    };
  }

  async insertSyncLog(entry: SyncLogEntry, showId?: string | null) {
    await this.rows(
      `
        insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings)
        values ($1::uuid, $2, $3, $4, $5::jsonb)
      `,
      [
        showId ?? null,
        entry.driveFileId,
        entry.code ?? entry.outcome,
        entry.code ? `${entry.outcome}:${entry.code}` : entry.outcome,
        JSON.stringify(entry.payload ? [{ ...entry.payload, outcome: entry.outcome }] : []),
      ],
    );
  }

  async upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null> {
    const row = await this.one<{ id: string }>(
      "select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id",
      [input.showId, input.code, JSON.stringify(input.context)],
    );
    return row?.id ?? null;
  }

  async readRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<RevisionRaceCooldown | null> {
    const row = await this.one<{
      retry_count: number;
      cooldown_seconds: number;
      cooldown_remaining_ms: number;
    }>(
      `
        with cooldown as (
          select
            retry_count,
            least((60 * power(2, retry_count))::int, 600) as cooldown_seconds,
            last_race_at
          from public.revision_race_cooldowns
         where drive_file_id = $1
           and raced_head_revision_id = $2
           and retry_count > 0
         limit 1
        )
        select
          retry_count,
          cooldown_seconds,
          greatest(
            0,
            ceil(extract(epoch from (last_race_at + cooldown_seconds * interval '1 second' - now())) * 1000)
          )::bigint as cooldown_remaining_ms
          from cooldown
         where now() < last_race_at + cooldown_seconds * interval '1 second'
      `,
      [driveFileId, racedHeadRevisionId],
    );
    if (!row) return null;
    return {
      retryCount: row.retry_count,
      cooldownSeconds: row.cooldown_seconds,
      cooldownRemainingMs: Number(row.cooldown_remaining_ms),
    };
  }

  async upsertRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<{ retryCount: number; cooldownSeconds: number }> {
    const row = await this.one<{ retry_count: number; cooldown_seconds: number }>(
      `
        with upserted as (
          insert into public.revision_race_cooldowns (
            drive_file_id, raced_head_revision_id, last_race_at, retry_count
          )
          values ($1, $2, now(), 1)
          on conflict (drive_file_id, raced_head_revision_id)
          do update set
            last_race_at = now(),
            retry_count = public.revision_race_cooldowns.retry_count + 1
          returning retry_count
        )
        select
          retry_count,
          least((60 * power(2, retry_count))::int, 600) as cooldown_seconds
          from upserted
      `,
      [driveFileId, racedHeadRevisionId],
    );
    return {
      retryCount: row?.retry_count ?? 1,
      cooldownSeconds: row?.cooldown_seconds ?? revisionRaceCooldownSeconds(1),
    };
  }

  async deleteRevisionRaceCooldowns(driveFileId: string): Promise<void> {
    await this.rows(
      `
        delete from public.revision_race_cooldowns
         where drive_file_id = $1
      `,
      [driveFileId],
    );
  }

  async readLiveDeferral(driveFileId: string): Promise<DeferredIngestionRow | null> {
    const row = await this.one<DeferredIngestionRow>(
      `
        select deferred_kind, deferred_at_modified_time
          from public.deferred_ingestions
         where drive_file_id = $1
           and wizard_session_id is null
         limit 1
      `,
      [driveFileId],
    );
    return row;
  }

  async deleteLiveDeferral(driveFileId: string): Promise<void> {
    await this.rows(
      `
        delete from public.deferred_ingestions
         where drive_file_id = $1
           and wizard_session_id is null
      `,
      [driveFileId],
    );
  }

  async deleteWizardPendingSyncsExcept(wizardSessionId: string) {
    await this.rows(
      `
        delete from public.pending_syncs
         where wizard_session_id is not null
           and wizard_session_id <> $1::uuid
      `,
      [wizardSessionId],
    );
  }

  async applyShowSnapshot(args: Parameters<Phase2Tx["applyShowSnapshot"]>[0]) {
    const existing = await this.one<{ id: string }>(
      "select id from public.shows where drive_file_id = $1 limit 1",
      [args.driveFileId],
    );
    const previousCrew = existing
      ? await this.rows<{
          name: string;
          email: string | null;
          phone: string | null;
          role: string;
          role_flags: string[];
          date_restriction: unknown;
          stage_restriction: unknown;
          flight_info: string | null;
        }>(
          `
            select name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info
              from public.crew_members
             where show_id = $1
             order by name
          `,
          [existing.id],
        )
      : [];
    const stalePredicate =
      args.staleGuard === "strict_less_than"
        ? "(last_seen_modified_time is null or last_seen_modified_time < $15::timestamptz)"
        : "(last_seen_modified_time is null or last_seen_modified_time <= $15::timestamptz)";
    const skipDiagramsStalePredicate =
      args.staleGuard === "strict_less_than"
        ? "(last_seen_modified_time is null or last_seen_modified_time < $14::timestamptz)"
        : "(last_seen_modified_time is null or last_seen_modified_time <= $14::timestamptz)";
    const updateParams = [
      args.driveFileId,
      args.parseResult.show.title,
      args.parseResult.show.client_label,
      JSON.stringify(args.parseResult.show.client_contact),
      args.parseResult.show.template_version,
      JSON.stringify(args.parseResult.show.venue),
      JSON.stringify(args.parseResult.show.dates),
      JSON.stringify(args.parseResult.show.event_details),
      JSON.stringify(args.parseResult.show.agenda_links),
      JSON.stringify(args.parseResult.diagrams),
      args.parseResult.openingReel?.driveFileId ?? null,
      args.parseResult.openingReel?.drive_modified_time ?? null,
      args.parseResult.openingReel?.headRevisionId ?? null,
      args.parseResult.openingReel?.mimeType ?? null,
      args.modifiedTime,
      args.parseResult.show.coi_status,
      JSON.stringify(args.parseResult.pullSheet),
    ];
    const skipDiagramsParams = [
      args.driveFileId,
      args.parseResult.show.title,
      args.parseResult.show.client_label,
      JSON.stringify(args.parseResult.show.client_contact),
      args.parseResult.show.template_version,
      JSON.stringify(args.parseResult.show.venue),
      JSON.stringify(args.parseResult.show.dates),
      JSON.stringify(args.parseResult.show.event_details),
      JSON.stringify(args.parseResult.show.agenda_links),
      args.parseResult.openingReel?.driveFileId ?? null,
      args.parseResult.openingReel?.drive_modified_time ?? null,
      args.parseResult.openingReel?.headRevisionId ?? null,
      args.parseResult.openingReel?.mimeType ?? null,
      args.modifiedTime,
      args.parseResult.show.coi_status,
      JSON.stringify(args.parseResult.pullSheet),
    ];
    const insertParamsForSlug = (slug: string) => [
      args.driveFileId,
      slug,
      args.parseResult.show.title,
      args.parseResult.show.client_label,
      JSON.stringify(args.parseResult.show.client_contact),
      args.parseResult.show.template_version,
      JSON.stringify(args.parseResult.show.venue),
      JSON.stringify(args.parseResult.show.dates),
      JSON.stringify(args.parseResult.show.event_details),
      JSON.stringify(args.parseResult.show.agenda_links),
      JSON.stringify(args.parseResult.diagrams),
      args.parseResult.openingReel?.driveFileId ?? null,
      args.parseResult.openingReel?.drive_modified_time ?? null,
      args.parseResult.openingReel?.headRevisionId ?? null,
      args.parseResult.openingReel?.mimeType ?? null,
      args.modifiedTime,
      args.parseResult.show.coi_status,
      JSON.stringify(args.parseResult.pullSheet),
    ];

    const updated = existing
      ? await this.one<{ id: string }>(
          args.skipDiagramsWrite
            ? `
            update public.shows
               set title = $2,
                   client_label = $3,
                   client_contact = $4::jsonb,
                   template_version = $5,
                   venue = $6::jsonb,
                   dates = $7::jsonb,
                   event_details = $8::jsonb,
                   agenda_links = $9::jsonb,
                   opening_reel_drive_file_id = $10,
                   opening_reel_drive_modified_time = $11::timestamptz,
                   opening_reel_head_revision_id = $12,
                   opening_reel_mime_type = $13,
                   last_seen_modified_time = $14::timestamptz,
                   coi_status = $15,
                   pull_sheet = $16::jsonb,
                   last_synced_at = now(),
                   last_sync_status = 'ok',
                   last_sync_error = null
             where drive_file_id = $1
               and ${skipDiagramsStalePredicate}
             returning id
          `
            : `
            update public.shows
               set title = $2,
                   client_label = $3,
                   client_contact = $4::jsonb,
                   template_version = $5,
                   venue = $6::jsonb,
                   dates = $7::jsonb,
                   event_details = $8::jsonb,
                   agenda_links = $9::jsonb,
                   diagrams = $10::jsonb,
                   opening_reel_drive_file_id = $11,
                   opening_reel_drive_modified_time = $12::timestamptz,
                   opening_reel_head_revision_id = $13,
                   opening_reel_mime_type = $14,
                   last_seen_modified_time = $15::timestamptz,
                   coi_status = $16,
                   pull_sheet = $17::jsonb,
                   last_synced_at = now(),
                   last_sync_status = 'ok',
                   last_sync_error = null
             where drive_file_id = $1
               and ${stalePredicate}
             returning id
          `,
          args.skipDiagramsWrite ? skipDiagramsParams : updateParams,
        )
      : await insertFirstSeenShowWithSlugRetry({
          baseSlug: args.slug,
          insert: async (slug) =>
            await this.one<{ id: string }>(
              `
                insert into public.shows (
                  drive_file_id, slug, title, client_label, client_contact, template_version,
                  venue, dates, event_details, agenda_links, diagrams,
                  opening_reel_drive_file_id, opening_reel_drive_modified_time,
                  opening_reel_head_revision_id, opening_reel_mime_type,
                  last_seen_modified_time, coi_status, pull_sheet,
                  last_synced_at, last_sync_status, last_sync_error
                )
                values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb,
                        $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::timestamptz,
                        $14, $15, $16::timestamptz, $17, $18::jsonb, now(), 'ok', null)
                on conflict (drive_file_id) do nothing
                returning id
              `,
              insertParamsForSlug(slug),
            ),
        });

    if (!updated) return { outcome: "stale" as const };
    return {
      outcome: "updated" as const,
      showId: updated.id,
      previousCrewNames: previousCrew.map((row) => row.name),
      previousCrewMembers: previousCrew.map((row) => ({
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        role_flags: row.role_flags as ParseResult["crewMembers"][number]["role_flags"],
        date_restriction:
          row.date_restriction as ParseResult["crewMembers"][number]["date_restriction"],
        stage_restriction:
          row.stage_restriction as ParseResult["crewMembers"][number]["stage_restriction"],
        flight_info: row.flight_info,
      })),
    };
  }

  async deleteCrewMembersNotIn(showId: string, names: string[]) {
    await this.rows("delete from public.crew_members where show_id = $1 and not (name = any($2))", [
      showId,
      names,
    ]);
  }

  async upsertCrewMembers(showId: string, members: ParseResult["crewMembers"]) {
    for (const member of members) {
      await this.rows(
        `
          insert into public.crew_members (
            show_id, name, email, phone, role, role_flags, date_restriction,
            stage_restriction, flight_info
          )
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
          on conflict (show_id, name)
          do update set
            email = excluded.email,
            phone = excluded.phone,
            role = excluded.role,
            role_flags = excluded.role_flags,
            date_restriction = excluded.date_restriction,
            stage_restriction = excluded.stage_restriction,
            flight_info = excluded.flight_info
        `,
        [
          showId,
          member.name,
          canonicalize(member.email),
          member.phone,
          member.role,
          member.role_flags,
          JSON.stringify(member.date_restriction),
          JSON.stringify(member.stage_restriction),
          member.flight_info,
        ],
      );
    }
  }

  async provisionAddedCrewAuth(showId: string, names: string[]) {
    if (names.length === 0) return;
    for (const name of names) {
      await this.rows(
        `
          insert into public.crew_member_auth (show_id, crew_name)
          values ($1, $2)
          on conflict (show_id, crew_name) do nothing
        `,
        [showId, name],
      );
    }
    await this.rows(
      `
        update public.crew_member_auth
           set current_token_version = max_issued_version,
               revoked_below_version = max_issued_version
         where show_id = $1
           and crew_name = any($2)
      `,
      [showId, names],
    );
  }

  async revokeRemovedCrewAuth(showId: string, names: string[]) {
    if (names.length === 0) return;
    await this.rows(
      `
        update public.crew_member_auth
           set revoked_below_version = greatest(revoked_below_version, max_issued_version)
         where show_id = $1
           and crew_name = any($2)
      `,
      [showId, names],
    );
  }

  async replaceHotelReservations(showId: string, rows: ParseResult["hotelReservations"]) {
    await this.rows("delete from public.hotel_reservations where show_id = $1", [showId]);
    for (const row of rows) {
      await this.rows(
        `
          insert into public.hotel_reservations (
            show_id, ordinal, hotel_name, hotel_address, names, confirmation_no,
            check_in, check_out, notes
          )
          values ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9)
        `,
        [
          showId,
          row.ordinal,
          row.hotel_name,
          row.hotel_address,
          row.names,
          row.confirmation_no,
          row.check_in,
          row.check_out,
          row.notes,
        ],
      );
    }
  }

  async replaceRooms(showId: string, rows: ParseResult["rooms"]) {
    await this.rows("delete from public.rooms where show_id = $1", [showId]);
    for (const row of rows) {
      await this.rows(
        `
          insert into public.rooms (
            show_id, kind, name, dimensions, floor, setup, set_time, show_time,
            strike_time, audio, video, lighting, scenic, power, digital_signage,
            other, notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `,
        [
          showId,
          row.kind,
          row.name,
          row.dimensions,
          row.floor,
          row.setup,
          row.set_time,
          row.show_time,
          row.strike_time,
          row.audio,
          row.video,
          row.lighting,
          row.scenic,
          row.power,
          row.digital_signage,
          row.other,
          row.notes,
        ],
      );
    }
  }

  async replaceTransportation(showId: string, row: ParseResult["transportation"]) {
    await this.rows("delete from public.transportation where show_id = $1", [showId]);
    if (!row) return;
    await this.rows(
      `
        insert into public.transportation (
          show_id, driver_name, driver_phone, driver_email, vehicle, license_plate,
          color, parking, schedule, notes
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      `,
      [
        showId,
        row.driver_name,
        row.driver_phone,
        canonicalize(row.driver_email),
        row.vehicle,
        row.license_plate,
        row.color,
        row.parking,
        JSON.stringify(row.schedule),
        row.notes,
      ],
    );
  }

  async replaceContacts(showId: string, rows: ParseResult["contacts"]) {
    await this.rows("delete from public.contacts where show_id = $1", [showId]);
    for (const row of rows) {
      await this.rows(
        `
          insert into public.contacts (show_id, kind, name, email, phone, notes)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [showId, row.kind, row.name, canonicalize(row.email), row.phone, row.notes],
      );
    }
  }

  async upsertShowsInternal(
    showId: string,
    payload: Parameters<Phase2Tx["upsertShowsInternal"]>[1],
  ) {
    await this.rows(
      `
        insert into public.shows_internal (show_id, financials, parse_warnings, raw_unrecognized)
        values ($1, $2::jsonb, $3::jsonb, $4::jsonb)
        on conflict (show_id)
        do update set
          financials = excluded.financials,
          parse_warnings = excluded.parse_warnings,
          raw_unrecognized = excluded.raw_unrecognized
      `,
      [
        showId,
        JSON.stringify(payload.financials),
        JSON.stringify(payload.parse_warnings),
        JSON.stringify(payload.raw_unrecognized),
      ],
    );
  }
}

class DriveMetadataMissingError extends Error {
  readonly code = DRIVE_METADATA_MISSING;

  constructor(driveFileId: string) {
    super(`Drive file ${driveFileId} omitted headRevisionId`);
    this.name = "DriveMetadataMissingError";
  }
}

class SyncStepTimeoutError extends Error {
  readonly code = SYNC_STEP_TIMEOUT;

  constructor(label: string) {
    super(`${label} timed out after ${DRIVE_SYNC_STEP_TIMEOUT_MS}ms`);
    this.name = "SyncStepTimeoutError";
  }
}

export async function withPostgresSyncPipelineLock<R = ProcessOneFileResult>(
  driveFileId: string,
  fn: (tx: LockedShowTx<SyncPipelineTx>) => Promise<R> | R,
  options: { tryOnly?: boolean } = { tryOnly: true },
): Promise<R | ConcurrentSyncSkipped> {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    return (await sql.begin(async (rawTx) => {
      const tx = new PostgresPipelineTx(rawTx as unknown as PostgresTransaction);
      return await withShowLock<SyncPipelineTx, R>(driveFileId, fn, {
        tx,
        tryOnly: options.tryOnly ?? true,
      });
    })) as R | ConcurrentSyncSkipped;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readPostgresRevisionRaceCooldown(
  driveFileId: string,
  racedHeadRevisionId: string,
): Promise<RevisionRaceCooldown | null> {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    const rows = (await sql.unsafe(
      `
        with cooldown as (
          select
            retry_count,
            least((60 * power(2, retry_count))::int, 600) as cooldown_seconds,
            last_race_at
          from public.revision_race_cooldowns
         where drive_file_id = $1
           and raced_head_revision_id = $2
           and retry_count > 0
         limit 1
        )
        select
          retry_count,
          cooldown_seconds,
          greatest(
            0,
            ceil(extract(epoch from (last_race_at + cooldown_seconds * interval '1 second' - now())) * 1000)
          )::bigint as cooldown_remaining_ms
          from cooldown
         where now() < last_race_at + cooldown_seconds * interval '1 second'
      `,
      [driveFileId, racedHeadRevisionId],
    )) as Array<{
      retry_count: number;
      cooldown_seconds: number;
      cooldown_remaining_ms: number;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      retryCount: row.retry_count,
      cooldownSeconds: row.cooldown_seconds,
      cooldownRemainingMs: Number(row.cooldown_remaining_ms),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function withStepTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new SyncStepTimeoutError(label));
    }, DRIVE_SYNC_STEP_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

async function defaultCaptureBinding(
  driveFileId: string,
  fileMeta: DriveListedFile,
): Promise<Phase1Binding> {
  const metadata = await fetchDriveFileMetadata(driveFileId);
  void fileMeta;
  return {
    bindingToken: metadata.headRevisionId ?? metadata.modifiedTime,
    modifiedTime: metadata.modifiedTime,
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
    async listSpreadsheetSheets(spreadsheetId) {
      const sheetsClient = google.sheets({ version: "v4", auth: getDriveAuth() });
      const response = await sheetsClient.spreadsheets.get({
        spreadsheetId,
        fields:
          "sheets(properties(title),drawings(objectId,imageProperties(contentUrl,mimeType),embeddedObject(description,title)))",
      });
      return ((response.data.sheets ?? []) as unknown[]).map((sheet) => {
        const record = sheet as {
          properties?: { title?: string | null };
          drawings?: Array<{
            objectId?: string | null;
            imageProperties?: { contentUrl?: string | null; mimeType?: string | null };
            embeddedObject?: { title?: string | null; description?: string | null };
          }>;
        };
        const embeddedObjects: SpreadsheetEmbeddedObject[] = (record.drawings ?? [])
          .filter((drawing) => drawing.objectId)
          .map((drawing) => {
            const alt =
              drawing.embeddedObject?.title ?? drawing.embeddedObject?.description ?? null;
            return {
              objectId: drawing.objectId!,
              mimeType: drawing.imageProperties?.mimeType ?? "image/png",
              ...(alt ? { alt } : {}),
              contentUrl: drawing.imageProperties?.contentUrl ?? null,
            };
          });
        return {
          title: record.properties?.title ?? "",
          embeddedObjects,
        } satisfies SpreadsheetSheet;
      });
    },
    async getEmbeddedImageBytes(_spreadsheetId, _objectId, contentUrl) {
      if (!contentUrl) return null;
      const token = await getDriveAccessToken();
      const response = await fetch(contentUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok || !response.body) return null;
      return await bytesFromWebStream(response.body, 50 * 1024 * 1024);
    },
    async getSpreadsheetRevisionId(spreadsheetId) {
      const drive = google.drive({ version: "v3", auth: getDriveAuth() });
      const response = await drive.revisions.list({
        fileId: spreadsheetId,
        fields: "revisions(id,modifiedTime)",
      });
      const revisions = response.data.revisions ?? [];
      return revisions.at(-1)?.id ?? null;
    },
  };
}

async function listPostgresLiveShows(): Promise<CronLiveShowRow[]> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(`
      select id, drive_file_id, last_seen_modified_time
        from public.shows
       where drive_file_id is not null
    `)) as Array<{
      id: string;
      drive_file_id: string;
      last_seen_modified_time: string | null;
    }>;
    return rows.map((row) => ({
      showId: row.id,
      driveFileId: row.drive_file_id,
      lastSeenModifiedTime: row.last_seen_modified_time,
      wizardSessionId: null,
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function errorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const value = candidate.code ?? candidate.status ?? candidate.response?.status;
  return typeof value === "number" ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSpreadsheetBindingRace(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /did not include an xlsx export link/i.test(message) ||
    /xlsx export failed with HTTP 404/i.test(message) ||
    /changed during xlsx export/i.test(message) ||
    /bound revision token/i.test(message)
  );
}

function isBinaryAssetRevisionRace(error: unknown): boolean {
  const message = errorMessage(error);
  if (errorCode(error) === 404 && /revision/i.test(message)) return true;
  return /bound revision/i.test(message);
}

function isSourceGone(error: unknown): boolean {
  const code = errorCode(error);
  return code === 404 && !isSpreadsheetBindingRace(error) && !isBinaryAssetRevisionRace(error);
}

async function logSync(
  deps: ProcessOneFileDeps,
  driveFileId: string,
  result: ProcessOneFileResult,
  payload?: Record<string, unknown>,
): Promise<void> {
  if ("skipped" in result) return;
  const entry: SyncLogEntry = {
    driveFileId,
    outcome: result.outcome,
  };
  if ("code" in result) entry.code = result.code;
  if ("reason" in result) entry.code = result.reason;
  if (payload) entry.payload = payload;
  await deps.logSync?.(entry);
}

export function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if ("operation" in error && typeof error.operation === "string") {
      payload.operation = error.operation;
    }
    if ("source" in error && typeof error.source === "string") {
      payload.source = error.source;
    }
    if ("code" in error && typeof error.code === "string") {
      payload.errorCode = error.code;
    }
    return payload;
  }
  return { message: String(error) };
}

async function emitDeferredRoleFlagsNotice(
  result: ProcessOneFileResult,
  deps: ProcessOneFileDeps,
): Promise<void> {
  if ("skipped" in result || result.outcome !== "applied" || !result.roleFlagsNotice) return;
  const upsertAdminAlert = deps.upsertAdminAlert ?? defaultUpsertAdminAlert;
  await upsertAdminAlert(result.roleFlagsNotice);
}

function shouldUseRevisionRaceCooldown(mode: SyncMode): boolean {
  return mode === "cron" || mode === "push";
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function modifiedTimeAdvanced(left: string, right: string | null | undefined): boolean {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  if (leftMs === null) return false;
  if (rightMs === null) return true;
  return leftMs > rightMs;
}

function listedRevisionToken(fileMeta: DriveListedFile): string {
  return fileMeta.headRevisionId ?? fileMeta.modifiedTime;
}

function fallbackBindingFromListedFile(fileMeta: DriveListedFile): Phase1Binding {
  return {
    bindingToken: listedRevisionToken(fileMeta),
    modifiedTime: fileMeta.modifiedTime,
  };
}

async function checkRevisionRaceCooldown(
  readCooldown:
    | ((driveFileId: string, racedHeadRevisionId: string) => Promise<RevisionRaceCooldown | null>)
    | undefined,
  driveFileId: string,
  racedHeadRevisionId: string,
): Promise<Extract<ProcessOneFileResult, { outcome: "revision_race_cooldown" }> | null> {
  if (!readCooldown) return null;
  const cooldown = await readCooldown(driveFileId, racedHeadRevisionId);
  if (!cooldown) return null;
  return {
    outcome: "revision_race_cooldown",
    code: STAGED_PARSE_REVISION_RACE_COOLDOWN,
    cooldownRemainingMs: cooldown.cooldownRemainingMs,
    retryCount: cooldown.retryCount,
  };
}

async function recordRevisionRaceCooldown(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  racedHeadRevisionId: string,
): Promise<void> {
  await tx.upsertRevisionRaceCooldown?.(driveFileId, racedHeadRevisionId);
}

async function recheckLiveDeferralAfterLock(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
): Promise<Extract<ProcessOneFileResult, { outcome: "skipped" }> | null> {
  if (mode !== "cron" && mode !== "push") return null;
  if (!tx.readLiveDeferral || !tx.deleteLiveDeferral) return null;

  const liveDeferral = await tx.readLiveDeferral(driveFileId);
  if (liveDeferral?.deferred_kind === "permanent_ignore") {
    return { outcome: "skipped", reason: "deferred_permanent" };
  }
  if (liveDeferral?.deferred_kind !== "defer_until_modified") return null;
  if (!modifiedTimeAdvanced(fileMeta.modifiedTime, liveDeferral.deferred_at_modified_time)) {
    return { outcome: "skipped", reason: "deferred_modtime" };
  }
  await tx.deleteLiveDeferral(driveFileId);
  return null;
}

export function classifySyncFailure(error: unknown): SyncFailureCode {
  if (
    error instanceof SyncInfraError ||
    error instanceof Phase1InfraError ||
    error instanceof Phase2InfraError
  ) {
    return SYNC_INFRA_ERROR;
  }
  if (error instanceof SyncStepTimeoutError) {
    return SYNC_STEP_TIMEOUT;
  }
  if (error instanceof DriveMetadataMissingError) {
    return DRIVE_METADATA_MISSING;
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "LOCK_OWNERSHIP_ASSERTION_FAILED"
  ) {
    return "LOCK_OWNERSHIP_ASSERTION_FAILED";
  }
  return SYNC_FILE_FAILED;
}

export async function runPhase1_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  args: Phase1Args,
  deps: ProcessOneFileDeps = {},
) {
  return await (deps.runPhase1 ?? runPhase1)(tx, args);
}

export async function runPhase2_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  args: Phase2Args,
  deps: ProcessOneFileDeps = {},
): Promise<Phase2Result> {
  return await (deps.runPhase2 ?? runPhase2)(tx, args);
}

async function markMissingShow_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  show: CronLiveShowRow,
): Promise<{ outcome: "source_gone"; code: typeof SHEET_UNAVAILABLE }> {
  await assertShowLockHeld(tx, show.driveFileId);
  const recoveryTx = tx as LockedShowTx<CronRecoveryTx>;
  const updated = await recoveryTx.markShowSheetUnavailable(show.driveFileId, SHEET_UNAVAILABLE);
  const showId = updated.showId ?? show.showId;
  const previousLastSeenModifiedTime =
    updated.lastSeenModifiedTime ?? show.lastSeenModifiedTime ?? null;
  const payload = {
    driveFileId: show.driveFileId,
    previousLastSeenModifiedTime,
  };
  await recoveryTx.insertSyncLog(
    {
      driveFileId: show.driveFileId,
      outcome: "error",
      code: SHEET_UNAVAILABLE,
      payload,
    },
    showId,
  );
  await recoveryTx.upsertAdminAlert({
    showId,
    code: "SHEET_UNAVAILABLE",
    context: {
      drive_file_id: show.driveFileId,
      previous_last_seen_modified_time: previousLastSeenModifiedTime,
    },
  });
  return { outcome: "source_gone", code: SHEET_UNAVAILABLE };
}

async function handleFetchFailure_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  fileMeta: DriveListedFile,
  binding: Phase1Binding,
  error: unknown,
  code: typeof STAGED_PARSE_SOURCE_GONE | SyncFailureCode,
): Promise<ProcessOneFileResult> {
  const existingPending = await tx.readLivePendingSync(driveFileId);
  const result =
    code === STAGED_PARSE_SOURCE_GONE
      ? { outcome: "source_gone" as const, code }
      : { outcome: "parse_error" as const, code };
  if (existingPending) return result;

  const show = await tx.readShowForPhase1(driveFileId);
  const recoveryTx = tx as LockedShowTx<CronRecoveryTx>;
  if (show) {
    const updated =
      code === STAGED_PARSE_SOURCE_GONE
        ? await recoveryTx.markShowSheetUnavailable(driveFileId, code)
        : await recoveryTx.markShowDriveError(driveFileId, code);
    const showId = updated.showId;
    const previousLastSeenModifiedTime =
      updated.lastSeenModifiedTime ?? show.lastSeenModifiedTime ?? null;
    await recoveryTx.insertSyncLog(
      {
        driveFileId,
        outcome: "error",
        code,
        payload: {
          driveFileId,
          message: errorMessage(error),
          previousLastSeenModifiedTime,
        },
      },
      showId,
    );
    if (code === STAGED_PARSE_SOURCE_GONE) {
      await recoveryTx.upsertAdminAlert({
        showId,
        code: "SHEET_UNAVAILABLE",
        context: {
          drive_file_id: driveFileId,
          failure_code: code,
          previous_last_seen_modified_time: previousLastSeenModifiedTime,
        },
      });
    }
    return result;
  }

  await tx.upsertLivePendingIngestion({
    driveFileId,
    wizardSessionId: null,
    driveFileName: fileMeta.name,
    lastErrorCode: code,
    lastErrorMessage: errorMessage(error),
    lastWarnings: [],
    lastSeenModifiedTime: binding.modifiedTime,
  });
  return result;
}

export async function processOneFile(
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps: ProcessOneFileDeps = {},
): Promise<ProcessOneFileResult> {
  const prepared = await prepareProcessOneFile(driveFileId, mode, fileMeta, deps);
  if (prepared.kind === "skip") {
    await logSync(deps, driveFileId, prepared.result, prepared.payload);
    return prepared.result;
  }

  const lock = deps.withShowLock ?? withPostgresSyncPipelineLock;
  const result = await lock(driveFileId, (lockedTx) =>
    processOneFile_unlocked(lockedTx, driveFileId, mode, fileMeta, deps, prepared),
  );
  if ("skipped" in result) {
    const skipped = { outcome: "skipped" as const, reason: CONCURRENT_SYNC_SKIPPED };
    await logSync(deps, driveFileId, skipped);
  }
  if (!("skipped" in result) && result.outcome === "applied" && result.snapshotRevisionId) {
    await (deps.promoteSnapshotUpload ?? defaultPromoteSnapshotUpload)(result.snapshotRevisionId);
  }
  await emitDeferredRoleFlagsNotice(result, deps);
  return result;
}

export type PreparedProcessOneFile =
  | {
      kind: "skip";
      result: Extract<ProcessOneFileResult, { outcome: "skipped" }>;
      payload?: Record<string, unknown>;
    }
  | { kind: "asset_recovery"; result: Extract<ProcessOneFileResult, { outcome: "asset_recovery" }> }
  | {
      kind: "revision_race_cooldown";
      result: Extract<ProcessOneFileResult, { outcome: "revision_race_cooldown" }>;
      payload: Record<string, unknown>;
    }
  | {
      kind: "revision_race";
      result: Extract<ProcessOneFileResult, { outcome: "revision_race" }>;
      racedHeadRevisionId: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "fetch_failure";
      binding: Phase1Binding;
      error: unknown;
      code: typeof STAGED_PARSE_SOURCE_GONE | SyncFailureCode;
    }
  | {
      kind: "ready";
      resolvedMode: Exclude<ResolvedSyncMode, "asset_recovery">;
      binding: Phase1Binding;
      parseResult: ParseResult;
    };

function defaultCooldownReader(
  deps: ProcessOneFileDeps,
):
  | ((driveFileId: string, racedHeadRevisionId: string) => Promise<RevisionRaceCooldown | null>)
  | undefined {
  if (deps.readRevisionRaceCooldown) return deps.readRevisionRaceCooldown;
  if (deps.withShowLock) return undefined;
  return readPostgresRevisionRaceCooldown;
}

export async function prepareProcessOneFile(
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps: ProcessOneFileDeps,
  readCooldown:
    | ((driveFileId: string, racedHeadRevisionId: string) => Promise<RevisionRaceCooldown | null>)
    | undefined = defaultCooldownReader(deps),
): Promise<PreparedProcessOneFile> {
  const gate = await (deps.perFileProcessor ?? perFileProcessor)(driveFileId, mode, fileMeta);
  if (gate.outcome === "skip") {
    return { kind: "skip", result: { outcome: "skipped", reason: gate.reason } };
  }
  if (gate.mode === "asset_recovery") {
    return { kind: "asset_recovery", result: { outcome: "asset_recovery" } };
  }

  if (shouldUseRevisionRaceCooldown(mode)) {
    const cooldown = await checkRevisionRaceCooldown(
      readCooldown,
      driveFileId,
      listedRevisionToken(fileMeta),
    );
    if (cooldown) {
      return {
        kind: "revision_race_cooldown",
        result: cooldown,
        payload: {
          racedHeadRevisionId: listedRevisionToken(fileMeta),
          cooldownRemainingMs: cooldown.cooldownRemainingMs,
          retryCount: cooldown.retryCount,
        },
      };
    }
  }

  const captureBinding = deps.captureBinding ?? defaultCaptureBinding;
  let binding: Phase1Binding;
  try {
    binding = await withStepTimeout("captureBinding", captureBinding(driveFileId, fileMeta));
  } catch (error) {
    return {
      kind: "fetch_failure",
      binding: fallbackBindingFromListedFile(fileMeta),
      error,
      code: isSourceGone(error) ? STAGED_PARSE_SOURCE_GONE : classifySyncFailure(error),
    };
  }
  if (
    shouldUseRevisionRaceCooldown(mode) &&
    binding.bindingToken !== listedRevisionToken(fileMeta)
  ) {
    const cooldown = await checkRevisionRaceCooldown(
      readCooldown,
      driveFileId,
      binding.bindingToken,
    );
    if (cooldown) {
      return {
        kind: "revision_race_cooldown",
        result: cooldown,
        payload: {
          racedHeadRevisionId: binding.bindingToken,
          cooldownRemainingMs: cooldown.cooldownRemainingMs,
          retryCount: cooldown.retryCount,
        },
      };
    }
  }

  let markdown: string;
  try {
    markdown = await withStepTimeout(
      "fetchMarkdownAtRevision",
      (deps.fetchMarkdownAtRevision ?? fetchSheetAsMarkdownAtRevision)(
        driveFileId,
        binding.bindingToken,
      ),
    );
  } catch (error) {
    if (isSpreadsheetBindingRace(error)) {
      return {
        kind: "revision_race",
        result: { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE },
        racedHeadRevisionId: binding.bindingToken,
        payload: { bindingToken: binding.bindingToken },
      };
    }
    return {
      kind: "fetch_failure",
      binding,
      error,
      code: isSourceGone(error) ? STAGED_PARSE_SOURCE_GONE : classifySyncFailure(error),
    };
  }

  const parsed = (deps.parseSheet ?? parseMarkdownSheet)(markdown, fileMeta.name);
  let enriched: ParseResult;
  try {
    enriched = await withStepTimeout(
      "enrichWithDrivePins",
      (deps.enrichWithDrivePins ?? enrichWithDrivePins)(
        parsed,
        deps.driveClient ?? defaultDriveClient(),
        { driveFileId, fileMeta: toDriveFileMeta(fileMeta), binding },
      ),
    );
  } catch (error) {
    if (isBinaryAssetRevisionRace(error)) {
      return {
        kind: "revision_race",
        result: { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE },
        racedHeadRevisionId: binding.bindingToken,
        payload: { bindingToken: binding.bindingToken },
      };
    }
    return {
      kind: "fetch_failure",
      binding,
      error,
      code: classifySyncFailure(error),
    };
  }

  let currentBinding: Phase1Binding;
  try {
    currentBinding = await withStepTimeout(
      "reverifyBinding",
      captureBinding(driveFileId, fileMeta),
    );
  } catch (error) {
    return {
      kind: "fetch_failure",
      binding,
      error,
      code: isSourceGone(error) ? STAGED_PARSE_SOURCE_GONE : classifySyncFailure(error),
    };
  }
  if (currentBinding.bindingToken !== binding.bindingToken) {
    return {
      kind: "revision_race",
      result: { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE },
      racedHeadRevisionId: binding.bindingToken,
      payload: {
        staged: binding.bindingToken,
        current: currentBinding.bindingToken,
      },
    };
  }

  return {
    kind: "ready",
    resolvedMode: gate.mode as Exclude<ResolvedSyncMode, "asset_recovery">,
    binding,
    parseResult: enriched,
  };
}

export async function processOneFile_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps: ProcessOneFileDeps = {},
  prepared?: PreparedProcessOneFile,
): Promise<ProcessOneFileResult> {
  await assertShowLockHeld(tx, driveFileId);
  if (!prepared) {
    throw new SyncInfraError(
      "processOneFile_unlocked",
      "thrown_error",
      new Error("prepared process data is required before acquiring the show lock"),
    );
  }
  const pipeline = prepared;

  const lockedDeferralSkip = await recheckLiveDeferralAfterLock(tx, driveFileId, mode, fileMeta);
  if (lockedDeferralSkip) {
    await logSync(deps, driveFileId, lockedDeferralSkip);
    return lockedDeferralSkip;
  }

  if (pipeline.kind === "skip") {
    await logSync(deps, driveFileId, pipeline.result, pipeline.payload);
    return pipeline.result;
  }
  if (pipeline.kind === "asset_recovery") {
    await logSync(deps, driveFileId, pipeline.result);
    return pipeline.result;
  }
  if (pipeline.kind === "revision_race_cooldown") {
    await logSync(deps, driveFileId, pipeline.result, pipeline.payload);
    return pipeline.result;
  }
  if (pipeline.kind === "revision_race") {
    await recordRevisionRaceCooldown(tx, driveFileId, pipeline.racedHeadRevisionId);
    await logSync(deps, driveFileId, pipeline.result, pipeline.payload);
    return pipeline.result;
  }
  if (pipeline.kind === "fetch_failure") {
    return await handleFetchFailure_unlocked(
      tx,
      driveFileId,
      fileMeta,
      pipeline.binding,
      pipeline.error,
      pipeline.code,
    );
  }

  const phase1 = await runPhase1_unlocked(
    tx,
    {
      driveFileId,
      mode: pipeline.resolvedMode,
      fileMeta,
      parseResult: pipeline.parseResult,
      binding: pipeline.binding,
    },
    deps,
  );
  if (phase1.outcome === "hard_fail") {
    const result = { outcome: "hard_fail" as const, code: phase1.code };
    await logSync(deps, driveFileId, result);
    return result;
  }
  if (phase1.outcome === "stage") {
    const result = { outcome: "stage" as const, stagedId: phase1.stagedId };
    await logSync(deps, driveFileId, result);
    return result;
  }
  if (phase1.outcome === "defer") {
    const result = { outcome: "skipped" as const, reason: phase1.reason };
    await logSync(deps, driveFileId, result, {
      kind: "mi8_debounce_skip",
      reason: phase1.reason,
    });
    return result;
  }

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
  const phase2 = await runPhase2_unlocked(
    tx,
    {
      driveFileId,
      mode: pipeline.resolvedMode as Phase2Mode,
      fileMeta,
      parseResult: pipeline.parseResult,
      binding: pipeline.binding,
      ...(snapshotAssetsForApply ? { snapshotAssetsForApply } : {}),
      ...(snapshotAssetsForApplyForShowId ? { snapshotAssetsForApplyForShowId } : {}),
    },
    deps,
  );

  if (phase2.outcome === "stale") {
    const result = { outcome: "stale" as const, code: phase2.code };
    await logSync(deps, driveFileId, result);
    return result;
  }

  const result: ProcessOneFileResult = {
    outcome: "applied" as const,
    showId: phase2.showId,
  };
  if (phase2.roleFlagsNotice) result.roleFlagsNotice = phase2.roleFlagsNotice;
  if (phase2.snapshotRevisionId) result.snapshotRevisionId = phase2.snapshotRevisionId;
  await tx.deleteRevisionRaceCooldowns?.(driveFileId);
  await deps.publishShowInvalidation?.(phase2.showId);
  await logSync(deps, driveFileId, result);
  return result;
}

export async function runScheduledCronSync(
  deps: RunScheduledCronSyncDeps = {},
): Promise<RunScheduledCronSyncResult> {
  const folderResult = deps.folderId
    ? { folderId: deps.folderId }
    : await (deps.getActiveWatchedFolderId ?? getActiveWatchedFolderId)();
  if ("kind" in folderResult) {
    if (folderResult.kind === "no_folder_configured") {
      await deps.logSync?.({
        driveFileId: null,
        outcome: "skipped",
        code: "no_folder_configured",
        payload: {
          kind: "cron_no_folder_configured",
          skip_reason: "no_folder_configured",
        },
      });
      return {
        processed: [],
        summary: { outcome: "skipped", skipReason: "no_folder_configured" },
      };
    }
    await deps.logSync?.({
      driveFileId: null,
      outcome: "parse_error",
      code: SYNC_INFRA_ERROR,
      payload: errorPayload(folderResult.cause),
    });
    return { processed: [], summary: { outcome: "parse_error", code: SYNC_INFRA_ERROR } };
  }

  const folderId = folderResult.folderId;
  const listFolder = deps.listFolder ?? listDriveFolder;
  const runOne = deps.processOneFile ?? processOneFile;
  const processDeps = deps.logSync ? { logSync: deps.logSync } : undefined;
  const files = await listFolder(folderId);
  const processed: RunScheduledCronSyncResult["processed"] = [];
  const listedDriveFileIds = new Set(files.map((file) => file.driveFileId));
  const liveShows = deps.listLiveShows
    ? await deps.listLiveShows()
    : deps.listFolder
      ? []
      : await listPostgresLiveShows();
  const missingShows = liveShows.filter(
    (show) => show.wizardSessionId === null && !listedDriveFileIds.has(show.driveFileId),
  );
  const lockMissingShow = deps.withShowLock ?? withPostgresSyncPipelineLock;

  for (const show of missingShows) {
    const result = await lockMissingShow(show.driveFileId, (lockedTx) =>
      markMissingShow_unlocked(lockedTx, show),
    );
    if ("skipped" in result) {
      processed.push({
        driveFileId: show.driveFileId,
        result,
      });
      continue;
    }
    processed.push({
      driveFileId: show.driveFileId,
      result,
    });
  }

  for (const file of files) {
    try {
      processed.push({
        driveFileId: file.driveFileId,
        result: await runOne(file.driveFileId, "cron", file, processDeps),
      });
    } catch (error) {
      const result = {
        outcome: "parse_error" as const,
        code: classifySyncFailure(error),
      };
      await deps.logSync?.({
        driveFileId: file.driveFileId,
        outcome: result.outcome,
        code: result.code,
        payload: errorPayload(error),
      });
      processed.push({
        driveFileId: file.driveFileId,
        result,
      });
    }
  }

  return { processed };
}
