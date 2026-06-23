import { NextResponse } from "next/server";
import postgres from "postgres";
import type { DriveListedFile } from "@/lib/drive/list";
import { fetchDriveFileMetadata as defaultFetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import { makeSyncPipelineTx, type SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import { revisionTimesMatch, STAGED_REVIEW_ITEMS_CORRUPT } from "@/lib/sync/applyStaged";
import { isReviewerChoice, isStructurallyValidReviewItem } from "@/lib/staging/reviewPayloadGuards";
import {
  applyStagedCore,
  normalizeTimestamptz,
  type ReviewerChoice,
} from "@/lib/sync/applyStagedCore";
import { adoptShowLockHeld } from "@/lib/sync/lockedShowTx";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import { asParseResult, coerceJsonbArray } from "@/lib/db/coerceJsonbObject";
import { canonicalize } from "@/lib/email/canonicalize";
import { revalidateShow } from "@/lib/data/showCacheTag";

const BATCH_CAP = 100;
const REVIEWER_CHOICES_VERSION = 1;
const OK_CODE = "OK" as const;
const STAGED_PARSE_REVISION_RACE_DURING_FINALIZE =
  "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE" as const;
const STAGED_PARSE_SOURCE_OUT_OF_SCOPE = "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" as const;
const WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED =
  "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED" as const;
// §12.4-cataloged (lib/messages/catalog.ts WIZARD_SESSION_SUPERSEDED) — reused, no new code.
const WIZARD_SESSION_SUPERSEDED = "WIZARD_SESSION_SUPERSEDED" as const;
// not-subject:M5-D8 — error CODE identifier (admin-log-only, routed through the
// §12.4 catalog), not inline user-facing copy; matches only because the name ends in ERROR.
const ONBOARDING_FINALIZE_INTERNAL_ERROR = "ONBOARDING_FINALIZE_INTERNAL_ERROR" as const;

export type FinalizeRouteTx = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
};

export type FinalizeRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: FinalizeRouteTx) => Promise<R>) => Promise<R>;
  // F1 Task 1.3: the per-row callback also receives the canonical SyncPipelineTx built from the
  // SAME raw postgres.js transaction that acquired the per-show advisory lock — the shared apply
  // core runs on the holder's transaction, acquire-free (spec §3.3 single-holder rule).
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: FinalizeRouteTx, pipelineTx: SyncPipelineTx) => Promise<R>,
  ) => Promise<R>;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  batchCap?: number;
};

/**
 * F1 Task 1.3 defense-in-depth: thrown when the created_show_id provenance UPDATE matches 0
 * rows (the active-session EXISTS predicate failed — a supersession committed mid-row). The
 * throw aborts the per-row transaction, rolling back the just-applied show/children/audit so
 * the pending_syncs row survives untouched (no permanent invisible orphan). TODAY the outer
 * app_settings FOR UPDATE makes this unreachable (lock-topology DB test pins that); the guard
 * protects future lock refactors. The per-row loop maps it to a demote +
 * WIZARD_SESSION_SUPERSEDED PerRowResult.
 */
export class FirstSeenProvenanceRaceError extends Error {
  readonly code = WIZARD_SESSION_SUPERSEDED;

  constructor(
    readonly driveFileId: string,
    readonly wizardSessionId: string,
  ) {
    super(
      `first-seen provenance not recorded for ${driveFileId}: wizard session ` +
        `${wizardSessionId} is no longer active — rolling back the per-row apply`,
    );
    this.name = "FirstSeenProvenanceRaceError";
  }
}

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
  // postgres.js parses timestamptz into a JS Date despite the string annotation elsewhere —
  // normalizeTimestamptz at the read boundary.
  wizard_approved_at: string | Date | null;
  triggered_review_items: unknown;
  base_modified_time: string | Date | null;
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
        | typeof WIZARD_SESSION_SUPERSEDED
        | typeof STAGED_REVIEW_ITEMS_CORRUPT
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
  fn: (tx: FinalizeRouteTx, pipelineTx: SyncPipelineTx) => Promise<R>,
): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) => {
      const raw = rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> };
      const tx = postgresTxAdapter(raw);
      await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
      // The pipeline tx rides the SAME raw transaction that just took the per-show lock — the
      // shared apply core only ADOPTS it (pg_locks ownership probe), never acquires (§3.3).
      return await fn(tx, makeSyncPipelineTx(raw));
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

/**
 * Plan R25-1/R29-1 (F1 Task 1.3): session discovery is a PLAIN read — no row lock. The
 * app_settings FOR UPDATE row lock is taken ONLY after `tryFinalizeLock` succeeds
 * (readActiveSessionForUpdate below), matching cleanupAbandonedFinalize's global total order
 * finalize-lock → app_settings (lib/onboarding/sessionLifecycle.ts cleanupAbandonedFinalize).
 * The old order (FOR UPDATE first) inverted it — AB-BA under cleanup/finalize overlap. Pinned
 * by tests/auth/advisoryLockRpcDeadlock.test.ts (lock-order structural test).
 */
async function readCandidateSessionId(tx: FinalizeRouteTx): Promise<string | null> {
  const { rows } = await tx.query<ActiveSessionRow>(
    `
      select pending_wizard_session_id
        from public.app_settings
       where id = 'default'
    `,
  );
  return rows[0]?.pending_wizard_session_id ?? null;
}

async function readActiveSessionForUpdate(tx: FinalizeRouteTx): Promise<string | null> {
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
             wizard_approved_by_email, wizard_approved_at,
             triggered_review_items, base_modified_time
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
    | typeof WIZARD_SESSION_SUPERSEDED
    | typeof STAGED_REVIEW_ITEMS_CORRUPT
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

// The bespoke applyFirstSeenDraft / insertFinalizeAudit writers were DELETED in F1 Task 1.3:
// their shows-only INSERT + '[]'/'{}' audit stubs were THE origin incident (0 crew / 0 rooms /
// empty shows_internal with last_sync_status='ok'). The first-seen branch now runs the shared
// apply core (lib/sync/applyStagedCore.ts) — children + shows_internal + auth-contract calls +
// real audit provenance — and the second-copy tripwire (Task 1.7) pins that no bespoke
// public.shows writer reappears here.

/**
 * Record which show this manifest row's first-seen finalize created — returning-checked, in
 * the SAME per-row transaction as the apply. The EXISTS predicate binds the write to the
 * still-active wizard session; 0 rows → FirstSeenProvenanceRaceError (typed rollback BEFORE
 * deleteApprovedPending consumes the staging row).
 */
async function recordCreatedShowProvenance(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  driveFileId: string,
  showId: string,
): Promise<void> {
  const recorded = await tx.query<{ recorded: boolean }>(
    `
      update public.onboarding_scan_manifest
         set created_show_id = $3::uuid
       where drive_file_id = $1 and wizard_session_id = $2::uuid
         and exists (select 1 from public.app_settings
                      where id = 'default' and pending_wizard_session_id = $2::uuid)
      returning true as recorded
    `,
    [driveFileId, wizardSessionId, showId],
  );
  if (recorded.rowCount === 0) {
    throw new FirstSeenProvenanceRaceError(driveFileId, wizardSessionId);
  }
}

// WM-R9 archived-show disposition: this Phase B staging path does NOT gate on shows.archived —
// it relies on the Phase D guard (finalize-cas applyShadow's readShowArchived_unlocked re-check
// under the per-row held lock, mirroring applyStaged_unlocked). Rationale: (a) staging writes
// ONLY shows_pending_changes — the archived show itself is untouched, so DEF-4 immutability is
// not violated at stage time; (b) a stage-time gate cannot close the race anyway (a show
// archived AFTER staging still needs the lock-held apply-time re-check, which is therefore the
// single authoritative guard — the same layering the live pipeline uses: pending_syncs staging
// is ungated, applyStaged_unlocked refuses at apply time); (c) the Phase D refusal is typed +
// recoverable (SHOW_ARCHIVED_IMMUTABLE per-row, shadow retained, unarchive → re-run final CAS).
// A duplicate gate here would add surface without adding guarantee.
async function stageExistingShowShadow(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  row: PendingFinalizeRow,
  triggeredReviewItems: TriggeredReviewItem[],
): Promise<void> {
  // F1 Task 1.4: deleteApprovedPending consumes the pending_syncs row right after this INSERT,
  // so triggered_review_items + base_modified_time exist ONLY in this payload by Phase D —
  // without them, choice validation, MI-11 detection, and deriveAuthSideEffects would run
  // against nothing (spec §3.2 R1-1/R20-1). The items param is the DECODED array (never the
  // raw column value — re-storing a legacy double-encoded scalar through $::jsonb would
  // preserve the corruption). applied_at_intent snapshots the Apply click (wizard_approved_at),
  // NOT staging time (spec §3.1 R8-1).
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
               'reviewer_choices', $6::jsonb,
               'triggered_review_items', $8::jsonb,
               'base_modified_time', $9::timestamptz
             ),
             $7, $10::timestamptz
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
      triggeredReviewItems,
      normalizeTimestamptz(row.base_modified_time),
      normalizeTimestamptz(row.wizard_approved_at),
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
  pipelineTx: SyncPipelineTx;
  fetchDriveFileMetadata: (driveFileId: string) => Promise<DriveListedFile>;
  // nav-perf tag-caching (Task 6): the first-seen apply writes public.shows (+ children) via the
  // shared core. The created show's id is collected here so the route can `revalidateShow(id)`
  // POST-COMMIT (after deps.withTx resolves) — NEVER inside this per-row tx (pre-commit = stale).
  // The existing-show branch only STAGES into shows_pending_changes (no rendered crew-DATA write
  // until finalize-cas Phase D), so it does not collect an id here.
  appliedShowIds: Set<string>;
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

  // F1 Task 1.4: parsed for BOTH branches — the existing-show shadow copies the DECODED items
  // array into its payload (never the raw column value), and the first-seen core consumes it.
  const parsedItems = parseTriggeredReviewItems(row.triggered_review_items);
  if (!parsedItems.ok) {
    // Approved rows are parseable BY CONSTRUCTION (the wizard approve branch refuses corrupt
    // items before approval) — reaching this is data corruption → the route's typed-500 wrapper.
    throw new Error("approved onboarding row has corrupt triggered_review_items");
  }

  // WM-R6 — third instance of the malformed-ELEMENT class (WM-R4 choices on shadows,
  // WM-R5 items on shadows; shared guards live in lib/staging/reviewPayloadGuards.ts).
  // parseTriggeredReviewItems and coerceJsonbArray are array-only checks: a stored
  // `[null]` / invalid object would reach the apply core and throw inside
  // validateReviewerChoices (`choice.item_id`, `items.map((item) => item.id)`) or
  // deriveAuthSideEffects' per-invariant name derefs — surfacing as a route-level
  // ONBOARDING_FINALIZE_INTERNAL_ERROR that wedges the WHOLE batch with no per-row
  // recovery. Instead, demote the one row to the existing per-row recovery path
  // (approval revert + manifest → 'staged' + §12.4-cataloged code, re-applyable via
  // the staged review page) and let batch siblings continue. Guarded BEFORE the
  // branch so a malformed existing-show row is caught here too, not at Phase D.
  if (
    !parsedItems.items.every(isStructurallyValidReviewItem) ||
    !coercedRow.wizard_reviewer_choices.every(isReviewerChoice)
  ) {
    await demotePending(tx, wizardSessionId, row.drive_file_id, STAGED_REVIEW_ITEMS_CORRUPT);
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: STAGED_REVIEW_ITEMS_CORRUPT,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }

  if (await showExists(tx, row.drive_file_id)) {
    await stageExistingShowShadow(tx, wizardSessionId, coercedRow, parsedItems.items);
    await deleteApprovedPending(tx, wizardSessionId, row);
    return { drive_file_id: row.drive_file_id, wizard_session_id: wizardSessionId, code: OK_CODE };
  }

  // First-seen branch (F1 Task 1.3): the FULL Phase-2 apply via the shared core — children +
  // shows_internal + auth-contract calls — with published=false preserved (firstSeenPublished),
  // the show-side session discriminator written in the same INSERT (wizardCreatedSessionId),
  // NO feed rows (the feed documents changes to LIVE shows), and REAL audit provenance
  // (approving admin + Apply-click instant, spec §3.1 R8-1).
  const stagedModifiedTimeIso = normalizeTimestamptz(row.staged_modified_time);
  if (!stagedModifiedTimeIso) {
    throw new Error("approved onboarding row is missing staged_modified_time");
  }

  const lockedTx = await adoptShowLockHeld(input.pipelineTx, row.drive_file_id);
  const core = await applyStagedCore(lockedTx, {
    sourceScope: "wizard",
    driveFileId: row.drive_file_id,
    show: null, // first-seen: gated by !showExists above
    parseResult: coercedRow.parse_result,
    triggeredReviewItems: parsedItems.items,
    reviewerChoices: coercedRow.wizard_reviewer_choices as ReviewerChoice[],
    stagedId: row.staged_id,
    stagedModifiedTime: stagedModifiedTimeIso,
    baseModifiedTime: null, // no live row → equality preflight trivially holds
    appliedByEmail: requireApprovedByEmail(coercedRow), // approving admin, NOT the finalizer
    appliedAt: normalizeTimestamptz(row.wizard_approved_at), // Apply-click instant, NOT now()
    auditSource: "onboarding_finalize",
    fileMeta: metadata,
    mi11Items: [], // first-seen: no prior crew → MI-11 impossible
    feedPolicy: { kind: "none" }, // first-seen writes NO show_change_log rows (spec §3.1)
    skipDiagramsWrite: false, // payload diagrams already canonical (spec §3.4)
    firstSeenPublished: false,
    // R59-1/R60-1: threaded ApplyStagedCoreArgs → Phase2Args → applyShowSnapshot → the
    // first-seen INSERT writes shows.wizard_created_session_id in the SAME statement.
    wizardCreatedSessionId: wizardSessionId,
  });

  if (core.outcome === "stale_write") {
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
  if (core.outcome !== "applied") {
    // invalid_request / stale_baseline / discarded_by_choice are corrupt-by-construction here:
    // approved rows passed validateReviewerChoices at approval time and a first-seen row has no
    // live baseline → typed-500 wrapper.
    throw new Error(
      `onboarding finalize first-seen apply refused (${core.outcome}` +
        `${"code" in core ? `: ${core.code}` : ""}) for ${row.drive_file_id}`,
    );
  }

  // Provenance BEFORE consuming the staging row — a race throws and rolls back the whole
  // per-row transaction (FirstSeenProvenanceRaceError), leaving pending_syncs untouched.
  await recordCreatedShowProvenance(tx, wizardSessionId, row.drive_file_id, core.showId);
  await deleteApprovedPending(tx, wizardSessionId, row);
  // nav-perf tag-caching (Task 6): record the created show for the POST-COMMIT revalidate. Added
  // ONLY after the apply + provenance + staging-consume all succeed in this per-row tx; the
  // actual revalidateShow fires after the OUTER deps.withTx resolves (post-commit).
  input.appliedShowIds.add(core.showId);
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

  // nav-perf tag-caching (Task 6): first-seen apply created-show ids, collected DURING the apply
  // (inside the per-row txns) and revalidated AFTER deps.withTx resolves (post-commit) — never
  // inside the tx (pre-commit revalidate = stale cache bug, spec §4.2).
  const appliedShowIds = new Set<string>();
  try {
    const response = await runtime.withTx(async (tx) => {
      // R25-1/R29-1 lock order: discover the candidate session WITHOUT a row lock, acquire
      // finalize:<session>, THEN take the app_settings FOR UPDATE row lock and re-check the
      // candidate is still the active session (supersession between discovery and lock → 409).
      const wizardSessionId = await readCandidateSessionId(tx);
      if (!wizardSessionId) {
        return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
      }

      const locked = await tryFinalizeLock(tx, wizardSessionId);
      if (!locked) return errorResponse(409, "CONCURRENT_FINALIZE_IN_FLIGHT");

      const activeSessionId = await readActiveSessionForUpdate(tx);
      if (activeSessionId !== wizardSessionId) {
        return errorResponse(409, WIZARD_SESSION_SUPERSEDED);
      }

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
        let result: PerRowResult;
        try {
          result = await runtime.withRowTx(row.drive_file_id, (rowTx, pipelineTx) =>
            processApprovedRow({
              row,
              wizardSessionId,
              tx: rowTx,
              pipelineTx,
              fetchDriveFileMetadata: runtime.fetchDriveFileMetadata,
              appliedShowIds,
            }),
          );
        } catch (error) {
          if (!(error instanceof FirstSeenProvenanceRaceError)) throw error;
          // The throw aborted the per-row transaction (show/children/audit rolled back; the
          // pending_syncs row survives). Demote it in a FRESH per-row tx (re-acquiring the
          // per-show lock) so the operator gets the existing demote/re-apply recovery path.
          await runtime.withRowTx(row.drive_file_id, async (rowTx) => {
            await demotePending(
              rowTx,
              wizardSessionId,
              row.drive_file_id,
              WIZARD_SESSION_SUPERSEDED,
            );
          });
          result = {
            drive_file_id: row.drive_file_id,
            wizard_session_id: wizardSessionId,
            code: WIZARD_SESSION_SUPERSEDED,
            re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
          };
        }
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
    // POST-COMMIT: deps.withTx has resolved (the outer finalize transaction committed), so the
    // first-seen shows are durably visible. Revalidate each show's data-cache tag now, before the
    // Response — a pre-commit revalidate would re-cache the OLD fan-out (spec §4.2).
    for (const showId of appliedShowIds) {
      revalidateShow(showId);
    }
    return response;
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
