import { NextResponse } from "next/server";
import postgres from "postgres";
import { subscribeToWatchedFolder as defaultSubscribeToWatchedFolder } from "@/lib/drive/watch";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  parseShadowPayloadForApply,
  type ParsedShadowPayloadForApply,
} from "@/lib/onboarding/shadowPayload";
import { applyStagedCore, normalizeTimestamptz } from "@/lib/sync/applyStagedCore";
import { revisionTimesMatch } from "@/lib/sync/applyStaged";
import { adoptShowLockHeld } from "@/lib/sync/lockedShowTx";
import { makeSyncPipelineTx, type SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

const OK_CODE = "OK" as const;

export type FinalizeCasRouteTx = {
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

export type FinalizeCasRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: FinalizeCasRouteTx) => Promise<R>) => Promise<R>;
  // F1 Task 1.5: the per-row callback also receives the canonical SyncPipelineTx built from the
  // SAME raw postgres.js transaction that acquired the per-show advisory lock — the shared apply
  // core runs on the holder's transaction, acquire-free (spec §3.3 single-holder rule).
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: FinalizeCasRouteTx, pipelineTx: SyncPipelineTx) => Promise<R>,
  ) => Promise<R>;
  subscribeToWatchedFolder?: (folderId: string) => Promise<unknown>;
};

type SessionRow = {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
  watched_folder_id: string | null;
};

type CheckpointRow = {
  status: "in_progress" | "all_batches_complete" | "final_cas_done";
  batches_completed: number;
};

type ShadowRow = {
  wizard_session_id: string;
  drive_file_id: string;
  show_id: string;
  applied_by_email: string;
  applied_at_intent: string | Date;
  payload: unknown;
};

type ShadowApplyResult =
  | {
      drive_file_id: string;
      code: typeof OK_CODE;
      // Response metadata, NOT an error code (no §12.4 row; invariant 5 unaffected — OK rows
      // never render through the error catalog). Mirrors the live MI-12 reject contract.
      disposition?: "discarded_by_reviewer_choice";
    }
  | {
      drive_file_id: string;
      code:
        | "STAGED_PARSE_OUTDATED_AT_PHASE_D"
        | "STAGED_REVIEW_ITEMS_CORRUPT"
        | "STAGED_PARSE_RESULT_CORRUPT";
    };

type FinalizeCasResult =
  | {
      status: "finalize_complete";
      wizard_session_id: string;
      watched_folder_id: string;
      idempotent?: true;
      per_row?: ShadowApplyResult[];
    }
  | Response;

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("onboarding finalize-cas route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const rows = (await rawTx.unsafe(sql, [...params])) as T[];
      return { rows, rowCount: rows.length };
    },
  } satisfies FinalizeCasRouteTx;
}

async function defaultWithTx<R>(fn: (tx: FinalizeCasRouteTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> })),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: FinalizeCasRouteTx, pipelineTx: SyncPipelineTx) => Promise<R>,
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

function depsWithDefaults(deps: FinalizeCasRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withTx: deps.withTx ?? defaultWithTx,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    subscribeToWatchedFolder: deps.subscribeToWatchedFolder ?? defaultSubscribeToWatchedFolder,
  };
}

function errorResponse(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

/**
 * Plan R16-1 (F1 Task 1.5): session DISCOVERY is a PLAIN read — no row lock. The authoritative
 * app_settings FOR UPDATE re-check (readSessionForUpdate) is taken ONLY after `tryFinalizeLock`
 * succeeds, matching the global total order finalize-lock → app_settings → per-show that
 * cleanupAbandonedFinalize (lib/onboarding/sessionLifecycle.ts) and Phase B both follow. Taking
 * app_settings first (the R7 sketch) is an AB-BA deadlock against cleanup under overlap.
 */
async function readSession(tx: FinalizeCasRouteTx): Promise<SessionRow> {
  const { rows } = await tx.query<SessionRow>(
    `
      select pending_wizard_session_id, pending_folder_id, watched_folder_id
        from public.app_settings
       where id = 'default'
    `,
  );
  return rows[0] ?? {
    pending_wizard_session_id: null,
    pending_folder_id: null,
    watched_folder_id: null,
  };
}

/**
 * The authoritative session-currency re-check (plan R16-1): holds the app_settings row lock
 * from here through the tail `promoteSettings` CAS, so a MID-flight supersession attempt
 * BLOCKS until Phase D commits — the detect-at-tail-only window (old-session shadow applies
 * committing durably before the 409) is closed. A PRE-superseded session never reaches this
 * point with a matching id (the plain discovery read already saw the new session and hits the
 * existing typed aborts).
 */
async function readSessionForUpdate(tx: FinalizeCasRouteTx): Promise<SessionRow> {
  const { rows } = await tx.query<SessionRow>(
    `
      select pending_wizard_session_id, pending_folder_id, watched_folder_id
        from public.app_settings
       where id = 'default'
       for update
    `,
  );
  return rows[0] ?? {
    pending_wizard_session_id: null,
    pending_folder_id: null,
    watched_folder_id: null,
  };
}

async function readLatestFinalizedCheckpoint(tx: FinalizeCasRouteTx): Promise<{ wizard_session_id: string } | null> {
  const { rows } = await tx.query<{ wizard_session_id: string }>(
    `
      select wizard_session_id
        from public.wizard_finalize_checkpoints
       where status = 'final_cas_done'
       order by last_processed_at desc nulls last
       limit 1
    `,
  );
  return rows[0] ?? null;
}

async function tryFinalizeLock(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<boolean> {
  const { rows } = await tx.query<{ locked: boolean }>(
    `select pg_try_advisory_xact_lock(hashtext('finalize:' || $1)) as locked`,
    [wizardSessionId],
  );
  return rows[0]?.locked === true;
}

async function readCheckpoint(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<CheckpointRow | null> {
  const { rows } = await tx.query<CheckpointRow>(
    `
      select status, batches_completed
        from public.wizard_finalize_checkpoints
       where wizard_session_id = $1::uuid
       for update
    `,
    [wizardSessionId],
  );
  return rows[0] ?? null;
}

async function approvedCount(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<number> {
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

async function unresolvedManifestCount(
  tx: FinalizeCasRouteTx,
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

async function readShadowRows(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<ShadowRow[]> {
  const { rows } = await tx.query<ShadowRow>(
    `
      select wizard_session_id, drive_file_id, show_id, applied_by_email, applied_at_intent, payload
       from public.shows_pending_changes
       where wizard_session_id = $1::uuid
       order by drive_file_id
    `,
    [wizardSessionId],
  );
  return rows;
}

async function deleteShadowRows(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<void> {
  await tx.query(
    `delete from public.shows_pending_changes where wizard_session_id = $1::uuid`,
    [wizardSessionId],
  );
}

async function deleteAppliedShadowRow(tx: FinalizeCasRouteTx, row: ShadowRow): Promise<void> {
  await tx.query(
    `
      delete from public.shows_pending_changes
       where wizard_session_id = $1::uuid
         and drive_file_id = $2
    `,
    [row.wizard_session_id, row.drive_file_id],
  );
}

// Phase D is SQL-only (spec §3.4) — no Drive I/O. The fileMeta the apply core forwards into
// runPhase2 is synthesized from the shadow payload (name from the staged parse, modifiedTime =
// the staged instant); runPhase2 binds on `binding.modifiedTime`, not on fileMeta.
function syntheticFileMeta(
  row: ShadowRow,
  parsed: Extract<ParsedShadowPayloadForApply, { ok: true }>,
): DriveListedFile {
  return {
    driveFileId: row.drive_file_id,
    name: parsed.parseResult.show.title ?? row.drive_file_id,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: parsed.stagedModifiedTime,
    parents: [],
  };
}

/**
 * F1 Task 1.5: Phase D existing-show apply routes through the SHARED apply core — the bespoke
 * shows-only UPDATE and `insertShadowAudit` ('[]'/'{}' provenance stubs) were DELETED (their
 * drift was the origin incident's class; the second-copy tripwire pins they never reappear).
 *
 * NO legacy `!parse_result → deleteAppliedShadowRow + OK` branch (plan R8 finding 1): a
 * parse_result-less shadow used to be CONSUMED and reported successful — the damaged shadow
 * disappeared during finalize-cas leaving stale live data with no retry surface. The parser
 * fails it closed instead (shadow RETAINED, typed per-row code, siblings continue).
 */
async function applyShadow(
  tx: FinalizeCasRouteTx,
  pipelineTx: SyncPipelineTx,
  row: ShadowRow,
): Promise<ShadowApplyResult> {
  const parsed = parseShadowPayloadForApply(row.payload);
  if (!parsed.ok) return { drive_file_id: row.drive_file_id, code: parsed.code }; // shadow retained

  const live = (
    await tx.query<{ id: string; last_seen_modified_time: string | Date | null; diagrams: unknown }>(
      `
        select id, last_seen_modified_time, diagrams
          from public.shows
         where drive_file_id = $1
      `,
      [row.drive_file_id],
    )
  ).rows[0];
  if (!live) return { drive_file_id: row.drive_file_id, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };

  // EQUALITY preflight — replaces the legacy `<=` CAS predicate (spec §3.2 R21-1): an
  // advanced-but-still-<= live watermark is a baseline the reviewer never saw and must REFUSE.
  // revisionTimesMatch handles postgres.js Date vs ISO-string instants.
  if (!revisionTimesMatch(live.last_seen_modified_time, parsed.baseModifiedTime)) {
    return { drive_file_id: row.drive_file_id, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };
  }

  const lockedTx = await adoptShowLockHeld(pipelineTx, row.drive_file_id);
  const core = await applyStagedCore(lockedTx, {
    sourceScope: "wizard",
    driveFileId: row.drive_file_id,
    show: {
      showId: live.id,
      lastSeenModifiedTime: normalizeTimestamptz(live.last_seen_modified_time),
      diagrams: live.diagrams,
    },
    parseResult: parsed.parseResult,
    triggeredReviewItems: parsed.triggeredReviewItems,
    reviewerChoices: parsed.reviewerChoices,
    stagedId: parsed.stagedId,
    stagedModifiedTime: parsed.stagedModifiedTime, // holds baseModifiedTime analogue (spec §3.2)
    baseModifiedTime: parsed.baseModifiedTime, // → sync_audit.base_modified_time
    appliedByEmail: row.applied_by_email,
    appliedAt: normalizeTimestamptz(row.applied_at_intent), // = wizard_approved_at snapshot (T1.4)
    auditSource: "onboarding_finalize_cas",
    fileMeta: syntheticFileMeta(row, parsed),
    mi11Items: parsed.mi11Items, // → runPhase2 writes sync_holds BEFORE the hold-aware apply
    // plan R24-2/R26-1/R31-1: choice-aware feed derivation lives INSIDE applyStagedCore, AFTER
    // its reviewer-choice validation — reject-resolved items excluded; independent-resolved
    // items dropped so writeAutoApplyChanges cannot derive crew_renamed for a choice the
    // operator declined. applyShadow passes ONLY the raw payload fields (D-2).
    feedPolicy: { kind: "choice_aware" },
    skipDiagramsWrite: false, // payload diagrams already canonical (spec §3.4)
  });

  if (core.outcome === "invalid_request") {
    return { drive_file_id: row.drive_file_id, code: "STAGED_REVIEW_ITEMS_CORRUPT" };
  }
  if (core.outcome === "discarded_by_choice") {
    // Mirror of the live MI-12 reject contract (applyStaged.ts reject branch; pinned by
    // tests/sync/applyStaged.test.ts:1118-1147): nothing applied, NO Phase 2, NO audit, live
    // row untouched. The shadow is the wizard's staged-row analogue of deleteLivePendingSync's
    // target, so it is CONSUMED-as-discarded; the live watermark is unchanged, so the next cron
    // pass re-stages the change for dashboard re-review — the `try_again` analogue.
    // (restoreShowStatus is N/A: stageExistingShowShadow never altered the live row's status.)
    await deleteAppliedShadowRow(tx, row);
    return {
      drive_file_id: row.drive_file_id,
      code: OK_CODE,
      disposition: "discarded_by_reviewer_choice",
    };
  }
  if (core.outcome !== "applied") {
    // stale_baseline (core's redundant second defense) / stale_write (runPhase2's internal CAS).
    return { drive_file_id: row.drive_file_id, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" };
  }
  await deleteAppliedShadowRow(tx, row);
  return { drive_file_id: row.drive_file_id, code: OK_CODE };
}

/**
 * F1 Task 1.5 (spec §3.4 R18-1): the publish flip is NARROWED to session-CREATED shows. Every
 * created_show_id consumer joins ALL of (plan R47-1/R55-1/R56-1/R50-1):
 *   - m.created_show_id = s.id        (the provenance pointer)
 *   - m.drive_file_id = s.drive_file_id   (never trust created_show_id bare — a forged/stale
 *     manifest row pointing at an UNRELATED unpublished show must not publish it)
 *   - s.wizard_created_session_id = m.wizard_session_id  (show-side discriminator: a same-drive
 *     forge cannot publish a deliberately-unpublished pre-existing show — its discriminator is
 *     NULL and no manifest write can change it)
 *   - m.status = 'applied'            (rows written by the finalize path; defense-in-depth)
 *   - m.drive_file_id = any($2::text[])   (bound to the EXACT locked set acquired in this tail —
 *     a manifest row inserted after the lock-set SELECT is NOT published by this run)
 *
 * Publish-flip lock topology (plan R49-2 — invariant 2): the flip is a `shows` mutation and runs
 * under per-show advisory locks, acquired SORTED and LAST in the outer transaction (which
 * already holds finalize: → app_settings per R16-1 — per-show last preserves the global order;
 * the per-row apply loop's locks were released when its row transactions committed).
 *
 * Existing-show shadow applies PRESERVE the live `published` value automatically — the payload
 * never carries `published` and applyShowSnapshot's UPDATE arm never writes it.
 */
async function publishAppliedWizardShows(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<void> {
  const { rows } = await tx.query<{ drive_file_id: string }>(
    `
      select drive_file_id
        from public.onboarding_scan_manifest
       where wizard_session_id = $1::uuid
         and status = 'applied'
         and created_show_id is not null
       order by drive_file_id
    `,
    [wizardSessionId],
  );
  const lockedDriveFileIds = rows.map((row) => row.drive_file_id);
  if (lockedDriveFileIds.length === 0) return;
  for (const driveFileId of lockedDriveFileIds) {
    await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
  }
  await tx.query<{ published: boolean }>(
    `
      update public.shows s
         set published = true
        from public.onboarding_scan_manifest m
       where m.wizard_session_id = $1::uuid
         and m.status = 'applied'
         and m.created_show_id = s.id
         and m.drive_file_id = s.drive_file_id
         and s.wizard_created_session_id = m.wizard_session_id
         and m.drive_file_id = any($2::text[])
      returning true as published
    `,
    [wizardSessionId, lockedDriveFileIds],
  );
}

/**
 * WM-R7 finding 1 — upgrade-safety preflight (FAIL-CLOSED). A setup that ran Phase B on
 * pre-provenance code (before migration 20260611000000) left `status='applied'` manifest rows
 * with `created_show_id` NULL and a `published=false` first-seen show whose
 * `wizard_created_session_id` is NULL. The narrowed flip above selects only provenance-bearing
 * rows, so the final CAS would COMPLETE (final_cas_done, settings promoted) publishing ZERO
 * rows — the show stays invisible with no pending row to recover. Detect the legacy-ambiguous
 * shape inside the locked transaction, BEFORE any row apply/flip, and refuse with the cataloged
 * ONBOARDING_LEGACY_ROW_AMBIGUOUS recovery code instead of completing (recovery: re-run setup
 * so the sheet is restaged — the wizard re-scan restages first-seen rows — or contact the
 * developer).
 *
 * Shadow-backed rows are EXCLUDED: existing-show shadows legitimately carry NULL
 * created_show_id (only first-seen creates write it) and are consumed by the apply loop later
 * in this same run. A shadowless match is ambiguous by construction — it cannot be
 * distinguished from an abandoned pre-provenance first-seen row — so the preflight refuses
 * rather than guessing.
 */
async function legacyAmbiguousManifestRows(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<string[]> {
  const { rows } = await tx.query<{ drive_file_id: string }>(
    `
      select m.drive_file_id
        from public.onboarding_scan_manifest m
        join public.shows s
          on s.drive_file_id = m.drive_file_id
       where m.wizard_session_id = $1::uuid
         and m.status = 'applied'
         and m.created_show_id is null
         and s.published = false
         and s.wizard_created_session_id is null
         and not exists (
               select 1
                 from public.shows_pending_changes p
                where p.wizard_session_id = m.wizard_session_id
                  and p.drive_file_id = m.drive_file_id
             )
       order by m.drive_file_id
    `,
    [wizardSessionId],
  );
  return rows.map((row) => row.drive_file_id);
}

async function deleteWizardDeferrals(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<void> {
  await tx.query(`delete from public.deferred_ingestions where wizard_session_id = $1::uuid`, [
    wizardSessionId,
  ]);
}

async function promoteSettings(
  tx: FinalizeCasRouteTx,
  wizardSessionId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ watched_folder_id: string | null }>(
    `
      update public.app_settings
         set watched_folder_id = pending_folder_id,
             watched_folder_name = pending_folder_name,
             watched_folder_set_by_email = pending_folder_set_by_email,
             watched_folder_set_at = pending_folder_set_at,
             pending_folder_id = null,
             pending_folder_name = null,
             pending_folder_set_by_email = null,
             pending_folder_set_at = null,
             pending_wizard_session_id = null,
             pending_wizard_session_at = null,
             updated_at = now()
       where id = 'default'
         and pending_wizard_session_id = $1::uuid
         and pending_folder_id is not null
       returning watched_folder_id
    `,
    [wizardSessionId],
  );
  return rows[0]?.watched_folder_id ?? null;
}

async function markFinalCasDone(tx: FinalizeCasRouteTx, wizardSessionId: string): Promise<void> {
  await tx.query<CheckpointRow>(
    `
      update public.wizard_finalize_checkpoints
         set status = 'final_cas_done',
             last_processed_at = now()
       where wizard_session_id = $1::uuid
      returning status, batches_completed
    `,
    [wizardSessionId],
  );
}

async function runFinalizeCas(
  tx: FinalizeCasRouteTx,
  deps: ReturnType<typeof depsWithDefaults>,
): Promise<FinalizeCasResult> {
  // R16-1: PLAIN candidate-discovery read — no row lock yet (lock order: finalize: first).
  const session = await readSession(tx);
  const wizardSessionId = session.pending_wizard_session_id;
  if (!wizardSessionId || !session.pending_folder_id) {
    const finalized = await readLatestFinalizedCheckpoint(tx);
    if (finalized && session.watched_folder_id) {
      return {
        status: "finalize_complete",
        wizard_session_id: finalized.wizard_session_id,
        watched_folder_id: session.watched_folder_id,
        idempotent: true,
      };
    }
    return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
  }

  if (!(await tryFinalizeLock(tx, wizardSessionId))) {
    return errorResponse(409, "CONCURRENT_FINALIZE_IN_FLIGHT");
  }

  // R16-1: authoritative FOR UPDATE re-check AFTER the finalize lock — the row lock is held
  // through the tail promoteSettings CAS, so a mid-flight supersession BLOCKS until commit.
  const current = await readSessionForUpdate(tx);
  if (current.pending_wizard_session_id !== wizardSessionId || !current.pending_folder_id) {
    return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
  }

  const checkpoint = await readCheckpoint(tx, wizardSessionId);
  if (!checkpoint) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
  if (checkpoint.status !== "all_batches_complete") {
    return errorResponse(409, "WIZARD_FINALIZE_BATCHES_PENDING");
  }

  const approved = await approvedCount(tx, wizardSessionId);
  if (approved > 0) {
    return errorResponse(409, "WIZARD_FINALIZE_BATCHES_PENDING", { approved_count: approved });
  }

  const unresolved = await unresolvedManifestCount(tx, wizardSessionId);
  if (unresolved > 0) {
    return errorResponse(409, "ONBOARDING_NOT_RESOLVED", {
      unresolved_manifest_count: unresolved,
    });
  }

  // WM-R7 finding 1: legacy-ambiguity preflight runs BEFORE any row apply/flip — a refusal
  // must leave the session fully recoverable (no shadow consumed, nothing published, settings
  // unpromoted, checkpoint NOT final_cas_done).
  const legacyAmbiguous = await legacyAmbiguousManifestRows(tx, wizardSessionId);
  if (legacyAmbiguous.length > 0) {
    return errorResponse(409, "ONBOARDING_LEGACY_ROW_AMBIGUOUS", {
      per_row: legacyAmbiguous.map((driveFileId) => ({
        drive_file_id: driveFileId,
        code: "ONBOARDING_LEGACY_ROW_AMBIGUOUS",
      })),
    });
  }

  const shadowResults: ShadowApplyResult[] = [];
  for (const row of await readShadowRows(tx, wizardSessionId)) {
    shadowResults.push(
      await deps.withRowTx(row.drive_file_id, (rowTx, pipelineTx) =>
        applyShadow(rowTx, pipelineTx, row),
      ),
    );
  }
  const blocked = shadowResults.filter((row) => row.code !== "OK");
  if (blocked.length > 0) {
    return errorResponse(409, "STAGED_PARSE_OUTDATED_AT_PHASE_D", { per_row: shadowResults });
  }
  await deleteShadowRows(tx, wizardSessionId);
  await publishAppliedWizardShows(tx, wizardSessionId);
  await deleteWizardDeferrals(tx, wizardSessionId);
  const watchedFolderId = await promoteSettings(tx, wizardSessionId);
  if (!watchedFolderId) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
  await markFinalCasDone(tx, wizardSessionId);

  return {
    status: "finalize_complete",
    wizard_session_id: wizardSessionId,
    watched_folder_id: watchedFolderId,
    // Per-row results surface even on success — the discarded_by_reviewer_choice disposition
    // is the operator's confirmation that a rejected identity change was NOT applied.
    ...(shadowResults.length > 0 ? { per_row: shadowResults } : {}),
  };
}

export async function handleOnboardingFinalizeCas(
  _request: Request,
  routeDeps: FinalizeCasRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  try {
    const result = await deps.withTx((tx) => runFinalizeCas(tx, deps));
    if (result instanceof Response) return result;
    await deps.subscribeToWatchedFolder(result.watched_folder_id);
    return NextResponse.json(result);
  } catch (error) {
    // Never leak an empty 500: the final-CAS step parses shadow payloads and runs DB work that
    // may fault. Any unexpected throw becomes a typed JSON error + console.error, mirroring
    // handleOnboardingFinalize.
    console.error(
      `onboarding finalize-cas: unexpected failure: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
    return errorResponse(500, "ONBOARDING_FINALIZE_INTERNAL_ERROR");
  }
}

export async function POST(request: Request): Promise<Response> {
  return await handleOnboardingFinalizeCas(request);
}
