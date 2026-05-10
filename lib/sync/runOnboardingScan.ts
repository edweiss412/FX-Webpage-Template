import postgres from "postgres";
import type { UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import { fetchDriveFileMetadata, fetchSheetAsMarkdownAtRevision } from "@/lib/drive/fetch";
import { listFolder as listDriveFolder, type DriveListedFile } from "@/lib/drive/list";
import { parseSheet as parseMarkdownSheet } from "@/lib/parser";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
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

const REQUIRED_WIZARD_ISOLATION_INDEXES = [
  "pending_syncs_live_drive_file_idx",
  "pending_syncs_session_drive_file_idx",
  "pending_ingestions_live_drive_file_idx",
  "pending_ingestions_session_drive_file_idx",
] as const;

type PostgresTransaction = {
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

type PreparedOnboardingFile =
  | { file: DriveListedFile; kind: "non_sheet" }
  | {
      file: DriveListedFile;
      kind: "sheet";
      binding: Phase1Binding;
      parseResult: ParseResult;
    };

export type RunOnboardingScanDeps = {
  tx?: OnboardingScanTx;
  listFolder?: (folderId: string) => Promise<DriveListedFile[]>;
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
  withShowLock?: <R>(
    driveFileId: string,
    fn: (tx: LockedShowTx<OnboardingScanTx>) => Promise<R> | R,
    options?: Parameters<typeof defaultWithShowLock<OnboardingScanTx, R>>[2],
  ) => Promise<R | ConcurrentSyncSkipped>;
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

class PostgresOnboardingScanTx implements OnboardingScanTx {
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
      triggeredReviewItems: row.triggered_review_items as never[],
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
        JSON.stringify(row.lastWarnings),
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
    const upserted = await this.one<{ staged_id: string }>(
      `
        insert into public.pending_syncs (
          drive_file_id, base_modified_time, staged_modified_time, parse_result,
          triggered_review_items, prior_last_sync_status, prior_last_sync_error,
          staged_id, source_kind, warning_summary, wizard_session_id
        )
        select $1, $2::timestamptz, $3::timestamptz, $4::jsonb, $5::jsonb, $6, $7,
               coalesce($8::uuid, gen_random_uuid()), $9, $10, $11::uuid
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
          warning_summary = excluded.warning_summary
         where public.pending_syncs.wizard_session_id = $11::uuid
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
        "onboarding_scan",
        row.warningSummary,
        this.wizardSessionId,
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
        JSON.stringify(entry.payload ? [{ ...entry.payload, code: entry.code }] : []),
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
}

async function withDefaultTx<R>(
  folderId: string,
  wizardSessionId: string,
  fn: (tx: OnboardingScanTx) => Promise<R>,
): Promise<R> {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(
        new PostgresOnboardingScanTx(
          rawTx as unknown as PostgresTransaction,
          folderId,
          wizardSessionId,
        ),
      ),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
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
        await callTx("logSync", () =>
          tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }),
        );
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
        await callTx("logSync", () =>
          tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }),
        );
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
        await callTx("logSync", () =>
          tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }),
        );
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
        await callTx("logSync", () =>
          tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }),
        );
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
        await callTx("logSync", () =>
          tx.logSync({ code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN }),
        );
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
    await callTx("logSync", () =>
      tx.logSync({
        code: "onboarding_scan_live_row_conflict",
        driveFileId: file.driveFileId,
        payload: { drive_file_id: file.driveFileId, sqlstate: state, kind },
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
          sqlstate: state,
          kind,
        },
      }),
    );
    await callTx("upsertManifest", () =>
      tx.upsertManifest({
        folderId,
        wizardSessionId,
        driveFileId: file.driveFileId,
        mimeType: file.mimeType,
        name: file.name,
        status: "live_row_conflict",
      }),
    );
    processed.push({ driveFileId: file.driveFileId, outcome: "live_row_conflict" });
    return { kind: "continue" };
  }

  return { kind: "continue" };
}

async function scanPreparedFiles(
  folderId: string,
  wizardSessionId: string,
  preparedFiles: PreparedOnboardingFile[],
  deps: Pick<RunOnboardingScanDeps, "runPhase1" | "withShowLock">,
  withTx: <R>(fn: (tx: OnboardingScanTx) => Promise<R>) => Promise<R>,
): Promise<OnboardingScanResult> {
  const processed: ProcessedOnboardingFile[] = [];
  const runPhase1Impl = deps.runPhase1 ?? runPhase1;
  const lock = deps.withShowLock ?? defaultWithShowLock;

  for (const prepared of preparedFiles) {
    const step = await withTx(async (tx) => {
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

async function prepareOnboardingFiles(
  folderId: string,
  deps: RunOnboardingScanDeps,
): Promise<PreparedOnboardingFile[]> {
  const listFolder = deps.listFolder ?? listDriveFolder;
  const files = await listFolder(folderId);
  const prepared: PreparedOnboardingFile[] = [];
  const captureBinding = deps.captureBinding ?? defaultCaptureBinding;
  const fetchMarkdownAtRevision = deps.fetchMarkdownAtRevision ?? fetchSheetAsMarkdownAtRevision;
  const parseSheet = deps.parseSheet ?? parseMarkdownSheet;
  const enrich = deps.enrichWithDrivePins ?? enrichWithDrivePins;
  const driveClient = deps.driveClient ?? defaultDriveClient();

  for (const file of files) {
    if (!isSpreadsheet(file)) {
      prepared.push({ file, kind: "non_sheet" });
      continue;
    }
    const binding = await captureBinding(file.driveFileId, file);
    const markdown = await fetchMarkdownAtRevision(file.driveFileId, binding.bindingToken);
    const parsed = parseSheet(markdown, file.name);
    const parseResult = await enrich(parsed, driveClient, {
      driveFileId: file.driveFileId,
      fileMeta: toDriveFileMeta(file),
      binding,
    });
    prepared.push({ file, kind: "sheet", binding, parseResult });
  }

  return prepared;
}

export async function runOnboardingScan(
  folderId: string,
  wizardSessionId: string,
  deps: RunOnboardingScanDeps = {},
): Promise<OnboardingScanResult> {
  const readiness = deps.tx
    ? await verifyOnboardingScanReady(deps.tx)
    : await withDefaultTx(folderId, wizardSessionId, verifyOnboardingScanReady);
  if (readiness) return readiness;

  const preparedFiles = await prepareOnboardingFiles(folderId, deps);
  if (deps.tx) {
    return await scanPreparedFiles(folderId, wizardSessionId, preparedFiles, deps, async (fn) =>
      fn(deps.tx as OnboardingScanTx),
    );
  }
  return await scanPreparedFiles(folderId, wizardSessionId, preparedFiles, deps, (fn) =>
    withDefaultTx(folderId, wizardSessionId, fn),
  );
}
