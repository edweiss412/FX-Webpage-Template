import { NextResponse } from "next/server";
import postgres from "postgres";
import type { DriveListedFile } from "@/lib/drive/list";
import { fetchDriveFileMetadata as defaultFetchDriveFileMetadata } from "@/lib/drive/fetch";
import { deriveSlug } from "@/lib/parser/slug";
import type { ParseResult } from "@/lib/parser/types";
import { insertFirstSeenShowWithSlugRetry } from "@/lib/sync/runScheduledCronSync";
import { revisionTimesMatch } from "@/lib/sync/applyStaged";
import { asParseResult, coerceJsonbArray } from "@/lib/db/coerceJsonbObject";
import { canonicalize } from "@/lib/email/canonicalize";

const BATCH_CAP = 100;
const REVIEWER_CHOICES_VERSION = 1;
const OK_CODE = "OK" as const;
const STAGED_PARSE_REVISION_RACE_DURING_FINALIZE =
  "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE" as const;
const STAGED_PARSE_SOURCE_OUT_OF_SCOPE = "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" as const;
const WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED =
  "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED" as const;
// not-subject:M5-D8 — error CODE identifier (admin-log-only, routed through the
// §12.4 catalog), not inline user-facing copy; matches only because the name ends in ERROR.
const ONBOARDING_FINALIZE_INTERNAL_ERROR = "ONBOARDING_FINALIZE_INTERNAL_ERROR" as const;

export type FinalizeRouteTx = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
};

export type FinalizeRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: FinalizeRouteTx) => Promise<R>) => Promise<R>;
  withRowTx?: <R>(driveFileId: string, fn: (tx: FinalizeRouteTx) => Promise<R>) => Promise<R>;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  batchCap?: number;
};

type ActiveSessionRow = {
  pending_wizard_session_id: string | null;
};

type CheckpointRow = {
  wizard_session_id: string;
  status: "in_progress" | "all_batches_complete" | "final_cas_done";
  batches_completed: number;
};

type PendingFinalizeRow = {
  drive_file_id: string;
  staged_id: string;
  staged_modified_time: string;
  parse_result: ParseResult;
  wizard_reviewer_choices: unknown[];
  wizard_reviewer_choices_version: number | null;
  wizard_approved_by_email: string | null;
};

type PerRowResult =
  | {
      drive_file_id: string;
      wizard_session_id: string;
      code: typeof OK_CODE;
    }
  | {
      drive_file_id: string;
      wizard_session_id: string;
      code:
        | typeof STAGED_PARSE_REVISION_RACE_DURING_FINALIZE
        | typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE
        | typeof WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED
        | "DRIVE_FETCH_FAILED";
      re_apply_url: string;
    };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("onboarding finalize route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const rows = (await rawTx.unsafe(sql, [...params])) as T[];
      return { rows, rowCount: rows.length };
    },
  } satisfies FinalizeRouteTx;
}

async function defaultWithTx<R>(fn: (tx: FinalizeRouteTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(
        postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }),
      ),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: FinalizeRouteTx) => Promise<R>,
): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) => {
      const tx = postgresTxAdapter(
        rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> },
      );
      await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
      return await fn(tx);
    })) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: FinalizeRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withTx: deps.withTx ?? defaultWithTx,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    fetchDriveFileMetadata: deps.fetchDriveFileMetadata ?? defaultFetchDriveFileMetadata,
    batchCap: deps.batchCap ?? BATCH_CAP,
  };
}

function errorResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Response {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

// `row.staged_modified_time` is read from pending_syncs via postgres.js, which
// parses `timestamptz` into a JS Date (NOT an ISO string). Delegating to the
// shared revisionTimesMatch compares by exact instant without the millisecond
// loss that `Date.parse(<Date>)` caused — the finalize peer of the apply
// revision-race false positive (M12 Phase 0.F smoke 3). A genuinely different
// instant still mismatches, so a real edit still demotes. Missing values stay a
// non-match (finalize must not publish a sheet it can't reverify).
function sameTimestamp(
  left: string | Date | null | undefined,
  right: string | Date | null | undefined,
): boolean {
  if (left == null || right == null) return false;
  return revisionTimesMatch(left, right);
}

function reApplyUrl(wizardSessionId: string, driveFileId: string): string {
  return `/admin/onboarding/staged/${encodeURIComponent(wizardSessionId)}/${encodeURIComponent(driveFileId)}`;
}

function requireApprovedByEmail(row: PendingFinalizeRow): string {
  if (!row.wizard_approved_by_email) {
    throw new Error("approved onboarding row is missing wizard_approved_by_email");
  }
  return row.wizard_approved_by_email;
}

async function readActiveSession(tx: FinalizeRouteTx): Promise<string | null> {
  const { rows } = await tx.query<ActiveSessionRow>(
    `
      select pending_wizard_session_id
        from public.app_settings
       where id = 'default'
       for update
    `,
  );
  return rows[0]?.pending_wizard_session_id ?? null;
}

async function tryFinalizeLock(tx: FinalizeRouteTx, wizardSessionId: string): Promise<boolean> {
  const { rows } = await tx.query<{ locked: boolean }>(
    `select pg_try_advisory_xact_lock(hashtext('finalize:' || $1)) as locked`,
    [wizardSessionId],
  );
  return rows[0]?.locked === true;
}

async function ensureCheckpoint(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
): Promise<CheckpointRow | null> {
  const inserted = await tx.query<CheckpointRow>(
    `
      insert into public.wizard_finalize_checkpoints (wizard_session_id)
      values ($1::uuid)
      on conflict (wizard_session_id) do nothing
      returning wizard_session_id, status, batches_completed
    `,
    [wizardSessionId],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await tx.query<CheckpointRow>(
    `
      select status, batches_completed, wizard_session_id
        from public.wizard_finalize_checkpoints
       where wizard_session_id = $1::uuid
       for update
    `,
    [wizardSessionId],
  );
  return existing.rows[0] ?? null;
}

async function unresolvedManifestCount(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
): Promise<number> {
  const { rows } = await tx.query<{ unresolved_count: number }>(
    `
      select count(*)::int as unresolved_count
        from public.onboarding_scan_manifest
       where wizard_session_id = $1::uuid
         and status in ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict')
    `,
    [wizardSessionId],
  );
  return rows[0]?.unresolved_count ?? 0;
}

async function selectApprovedRows(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  limit: number,
): Promise<PendingFinalizeRow[]> {
  const { rows } = await tx.query<PendingFinalizeRow>(
    `
      select drive_file_id, staged_id, staged_modified_time, parse_result,
             wizard_reviewer_choices, wizard_reviewer_choices_version,
             wizard_approved_by_email
        from public.pending_syncs
       where wizard_session_id = $1::uuid
         and wizard_approved = true
       order by drive_file_id
       limit $2
    `,
    [wizardSessionId, limit],
  );
  return rows;
}

async function countApprovedRows(tx: FinalizeRouteTx, wizardSessionId: string): Promise<number> {
  const { rows } = await tx.query<{ approved_count: number }>(
    `
      select count(*)::int as approved_count
        from public.pending_syncs
       where wizard_session_id = $1::uuid
         and wizard_approved = true
    `,
    [wizardSessionId],
  );
  return rows[0]?.approved_count ?? 0;
}

async function demotePending(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  driveFileId: string,
  code:
    | typeof STAGED_PARSE_REVISION_RACE_DURING_FINALIZE
    | typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE
    | typeof WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED
    | "DRIVE_FETCH_FAILED",
): Promise<void> {
  await tx.query<{ demoted: boolean }>(
    `
      update public.pending_syncs
         set wizard_approved = false,
             wizard_approved_by_email = null,
             wizard_approved_at = null,
             wizard_reviewer_choices = null,
             wizard_reviewer_choices_version = null,
             last_finalize_failure_code = $3
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
      returning true as demoted
    `,
    [driveFileId, wizardSessionId, code],
  );
  await tx.query(
    `
      update public.onboarding_scan_manifest
         set status = 'staged',
             transitioned_at = now()
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
    `,
    [driveFileId, wizardSessionId],
  );
}

async function showExists(tx: FinalizeRouteTx, driveFileId: string): Promise<boolean> {
  const { rows } = await tx.query<{ exists: boolean }>(
    `
      select exists (
        select 1 from public.shows where drive_file_id = $1
      )
    `,
    [driveFileId],
  );
  return rows[0]?.exists === true;
}

async function readPendingFolderId(tx: FinalizeRouteTx): Promise<string | null> {
  const { rows } = await tx.query<{ pending_folder_id: string | null }>(
    `select pending_folder_id from public.app_settings where id = 'default' limit 1`,
  );
  return rows[0]?.pending_folder_id ?? null;
}

async function applyFirstSeenDraft(
  tx: FinalizeRouteTx,
  row: PendingFinalizeRow,
): Promise<string | null> {
  const parseResult = row.parse_result;
  return await insertFirstSeenShowWithSlugRetry({
    baseSlug: deriveSlug(parseResult, []),
    insert: async (slug) => {
      const inserted = await tx.query<{ show_id: string }>(
        `
          insert into public.shows (
            drive_file_id, slug, title, client_label, client_contact, template_version,
            venue, dates, event_details, agenda_links, diagrams,
            opening_reel_drive_file_id, opening_reel_drive_modified_time,
            opening_reel_head_revision_id, opening_reel_mime_type,
            last_seen_modified_time, coi_status, pull_sheet,
            last_synced_at, last_sync_status, last_sync_error, published
          )
          values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb,
                  $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::timestamptz,
                  $14, $15, $16::timestamptz, $17, $18::jsonb,
                  now(), 'ok', null, false)
          on conflict (drive_file_id) do nothing
          returning id as show_id
        `,
        [
          row.drive_file_id,
          slug,
          parseResult.show.title,
          parseResult.show.client_label,
          parseResult.show.client_contact,
          parseResult.show.template_version,
          parseResult.show.venue,
          parseResult.show.dates,
          parseResult.show.event_details,
          parseResult.show.agenda_links,
          parseResult.diagrams,
          parseResult.openingReel?.driveFileId ?? null,
          parseResult.openingReel?.drive_modified_time ?? null,
          parseResult.openingReel?.headRevisionId ?? null,
          parseResult.openingReel?.mimeType ?? null,
          row.staged_modified_time,
          parseResult.show.coi_status,
          parseResult.pullSheet,
        ],
      );
      return inserted.rows[0]?.show_id ?? null;
    },
  });
}

async function insertFinalizeAudit(
  tx: FinalizeRouteTx,
  input: {
    showId: string;
    row: PendingFinalizeRow;
    appliedByEmail: string;
  },
): Promise<void> {
  await tx.query<{ id: string }>(
    `
      insert into public.sync_audit (
        show_id, drive_file_id, applied_by, staged_id, triggered_review_items,
        reviewer_choices, derived_side_effects, parse_result_summary,
        base_modified_time, staged_modified_time
      )
      values (
        $1::uuid, $2, $3, $4::uuid, '[]'::jsonb,
        $5::jsonb, '{}'::jsonb,
        jsonb_build_object('title', $6::text, 'source', 'onboarding_finalize'),
        null, $7::timestamptz
      )
      returning id
    `,
    [
      input.showId,
      input.row.drive_file_id,
      canonicalize(input.appliedByEmail),
      input.row.staged_id,
      input.row.wizard_reviewer_choices ?? [],
      input.row.parse_result.show.title,
      input.row.staged_modified_time,
    ],
  );
}

async function stageExistingShowShadow(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  row: PendingFinalizeRow,
): Promise<void> {
  await tx.query<{ show_id: string }>(
    `
      insert into public.shows_pending_changes (
        drive_file_id, wizard_session_id, show_id, payload,
        applied_by_email, applied_at_intent
      )
      select $1, $2::uuid, s.id,
             jsonb_build_object(
               'parse_result', $3::jsonb,
               'staged_modified_time', $4::timestamptz,
               'staged_id', $5::uuid,
               'reviewer_choices', $6::jsonb
             ),
             $7, now()
        from public.shows s
       where s.drive_file_id = $1
      on conflict (wizard_session_id, drive_file_id)
      do update set
        show_id = excluded.show_id,
        payload = excluded.payload,
        applied_by_email = excluded.applied_by_email,
        applied_at_intent = excluded.applied_at_intent,
        staged_at = now()
      returning show_id
    `,
    [
      row.drive_file_id,
      wizardSessionId,
      row.parse_result,
      row.staged_modified_time,
      row.staged_id,
      row.wizard_reviewer_choices ?? [],
      canonicalize(requireApprovedByEmail(row)),
    ],
  );
}

async function deleteApprovedPending(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  row: PendingFinalizeRow,
): Promise<void> {
  await tx.query<{ deleted: boolean }>(
    `
      delete from public.pending_syncs
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and staged_id = $3::uuid
         and wizard_approved = true
      returning true as deleted
    `,
    [row.drive_file_id, wizardSessionId, row.staged_id],
  );
}

async function advanceCheckpoint(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  status: "in_progress" | "all_batches_complete",
): Promise<void> {
  await tx.query<CheckpointRow>(
    `
      update public.wizard_finalize_checkpoints
         set status = $2,
             batches_completed = batches_completed + 1,
             last_processed_at = now()
       where wizard_session_id = $1::uuid
      returning wizard_session_id, status, batches_completed
    `,
    [wizardSessionId, status],
  );
}

async function finalizeBatchTailResponse(input: {
  tx: FinalizeRouteTx;
  wizardSessionId: string;
  remainingCount: number;
  unresolvedManifestCount: number;
  perRow: PerRowResult[];
}): Promise<Response> {
  const hasPerRowFailures = input.perRow.some((row) => row.code !== OK_CODE);
  const status =
    input.remainingCount === 0 && input.unresolvedManifestCount === 0 && !hasPerRowFailures
      ? "all_batches_complete"
      : "batch_complete";
  await advanceCheckpoint(
    input.tx,
    input.wizardSessionId,
    status === "all_batches_complete" ? "all_batches_complete" : "in_progress",
  );
  return NextResponse.json({
    status,
    wizard_session_id: input.wizardSessionId,
    remaining_count: input.remainingCount,
    unresolved_manifest_count: input.unresolvedManifestCount,
    per_row: input.perRow,
  });
}

async function processApprovedRow(input: {
  row: PendingFinalizeRow;
  wizardSessionId: string;
  tx: FinalizeRouteTx;
  fetchDriveFileMetadata: (driveFileId: string) => Promise<DriveListedFile>;
}): Promise<PerRowResult> {
  const { row, wizardSessionId, tx } = input;

  if (row.wizard_reviewer_choices_version !== REVIEWER_CHOICES_VERSION) {
    await demotePending(
      tx,
      wizardSessionId,
      row.drive_file_id,
      WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED,
    );
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }

  let metadata: DriveListedFile;
  try {
    metadata = await input.fetchDriveFileMetadata(row.drive_file_id);
  } catch {
    await demotePending(tx, wizardSessionId, row.drive_file_id, "DRIVE_FETCH_FAILED");
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: "DRIVE_FETCH_FAILED",
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }
  const pendingFolderId = await readPendingFolderId(tx);
  if (!pendingFolderId || !metadata.parents.includes(pendingFolderId)) {
    await demotePending(tx, wizardSessionId, row.drive_file_id, STAGED_PARSE_SOURCE_OUT_OF_SCOPE);
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }

  if (!sameTimestamp(metadata.modifiedTime, row.staged_modified_time)) {
    await demotePending(
      tx,
      wizardSessionId,
      row.drive_file_id,
      STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
    );
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }

  // `parse_result` is jsonb read via postgres.js. A legacy row written by the
  // old double-encoding writer comes back as a STRING SCALAR; dereferencing
  // `.show` on it threw an uncaught TypeError → empty 500 (M12 Phase 0.F smoke
  // 3). asParseResult tolerates BOTH a real object and a JSON-string-of-object,
  // and throws a TYPED error on genuinely-corrupt data (caught by the
  // never-empty-500 wrapper around the publish loop).
  // Coerce parse_result AND wizard_reviewer_choices: a row approved before the
  // double-encode fix carries each as a legacy jsonb STRING SCALAR. Passing the
  // raw scalar to a `$N::jsonb` audit/shadow param would re-store the corruption
  // permanently. coerceJsonbArray decodes the legacy string-of-array.
  const coercedRow = {
    ...row,
    parse_result: asParseResult(row.parse_result),
    wizard_reviewer_choices: coerceJsonbArray(row.wizard_reviewer_choices),
  };

  if (await showExists(tx, row.drive_file_id)) {
    await stageExistingShowShadow(tx, wizardSessionId, coercedRow);
    await deleteApprovedPending(tx, wizardSessionId, row);
    return { drive_file_id: row.drive_file_id, wizard_session_id: wizardSessionId, code: OK_CODE };
  }

  const showId = await applyFirstSeenDraft(tx, coercedRow);
  if (showId) {
    await insertFinalizeAudit(tx, {
      showId,
      row: coercedRow,
      appliedByEmail: requireApprovedByEmail(coercedRow),
    });
  }
  await deleteApprovedPending(tx, wizardSessionId, row);
  return { drive_file_id: row.drive_file_id, wizard_session_id: wizardSessionId, code: OK_CODE };
}

export async function handleOnboardingFinalize(
  _request: Request,
  deps: FinalizeRouteDeps = {},
): Promise<Response> {
  const runtime = depsWithDefaults(deps);
  try {
    await runtime.requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  try {
    return await runtime.withTx(async (tx) => {
      const wizardSessionId = await readActiveSession(tx);
      if (!wizardSessionId) {
        return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
      }

      const locked = await tryFinalizeLock(tx, wizardSessionId);
      if (!locked) return errorResponse(409, "CONCURRENT_FINALIZE_IN_FLIGHT");

      const checkpoint = await ensureCheckpoint(tx, wizardSessionId);
      if (!checkpoint) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
      if (checkpoint.status === "final_cas_done") {
        return NextResponse.json({
          status: "all_batches_complete",
          wizard_session_id: wizardSessionId,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        });
      }

      const approvedRows = await selectApprovedRows(tx, wizardSessionId, runtime.batchCap);
      const unresolved = await unresolvedManifestCount(tx, wizardSessionId);
      if (
        checkpoint.status === "all_batches_complete" &&
        approvedRows.length === 0 &&
        unresolved === 0
      ) {
        return NextResponse.json({
          status: "all_batches_complete",
          wizard_session_id: wizardSessionId,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        });
      }
      if (approvedRows.length === 0 && unresolved > 0) {
        return errorResponse(409, "ONBOARDING_NOT_RESOLVED", {
          unresolved_manifest_count: unresolved,
        });
      }

      if (approvedRows.length === 0) {
        return await finalizeBatchTailResponse({
          tx,
          wizardSessionId,
          remainingCount: 0,
          unresolvedManifestCount: 0,
          perRow: [],
        });
      }

      const perRow: PerRowResult[] = [];
      for (const row of approvedRows) {
        const result = await runtime.withRowTx(row.drive_file_id, (rowTx) =>
          processApprovedRow({
            row,
            wizardSessionId,
            tx: rowTx,
            fetchDriveFileMetadata: runtime.fetchDriveFileMetadata,
          }),
        );
        perRow.push(result);
      }

      const remainingCount = await countApprovedRows(tx, wizardSessionId);
      const unresolvedAfterBatch = await unresolvedManifestCount(tx, wizardSessionId);
      return await finalizeBatchTailResponse({
        tx,
        wizardSessionId,
        remainingCount,
        unresolvedManifestCount: unresolvedAfterBatch,
        perRow,
      });
    });
  } catch (error) {
    // Never leak an empty 500 (Next returns no body for an uncaught throw → the
    // client's response.json() fails with "Unexpected end of JSON input"). Any
    // unexpected throw in the finalize transaction becomes a typed, parseable
    // JSON error, and the underlying message is logged so the next failure is
    // diagnosable from logs rather than a truncated TypeError. (M12 Phase 0.F
    // smoke-3 structural defense.)
    console.error(
      `onboarding finalize: unexpected failure: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
    return errorResponse(500, ONBOARDING_FINALIZE_INTERNAL_ERROR);
  }
}

export async function POST(request: Request): Promise<Response> {
  return await handleOnboardingFinalize(request);
}
