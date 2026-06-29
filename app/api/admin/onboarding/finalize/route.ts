import { NextResponse } from "next/server";
import postgres from "postgres";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  fetchDriveFileMetadata as defaultFetchDriveFileMetadata,
  fetchSheetMarkdownWithBinding,
} from "@/lib/drive/fetch";
import { fetchSheetTitleToGid } from "@/lib/drive/sheetGids";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import { parsedShowTitle } from "@/lib/onboarding/blockerDisplayName";
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
  // Computes the section deep-link anchors for a sheet (XLSX bytes + tab gids → extractSourceAnchors),
  // mirroring the cron path. Injectable so tests can supply a deterministic map without Drive I/O.
  fetchOnboardingSourceAnchors?: (driveFileId: string) => Promise<Record<string, SourceAnchor>>;
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
  // Task B2: finalize processes EVERY clean row, not only wizard_approved=true. This flag keys
  // the 4-branch split in processApprovedRow and seeds the manifest's publish_intent (checked →
  // CAS flips to Live; unchecked → the created show stays Held, published=false).
  wizard_approved: boolean;
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
      display_name?: string;
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

// Compute section deep-link anchors the same way the cron path does
// (runScheduledCronSync ~2444): XLSX bytes + tab title→gid map → extractSourceAnchors. Called
// PRE-LOCK in the finalize loop, so this Drive export never runs while the per-show advisory lock
// is held.
async function defaultFetchOnboardingSourceAnchors(
  driveFileId: string,
): Promise<Record<string, SourceAnchor>> {
  const { bytes } = await fetchSheetMarkdownWithBinding(driveFileId);
  const titleToGid = await fetchSheetTitleToGid(driveFileId);
  return extractSourceAnchors(bytes, titleToGid);
}

function depsWithDefaults(deps: FinalizeRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withTx: deps.withTx ?? defaultWithTx,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    fetchDriveFileMetadata: deps.fetchDriveFileMetadata ?? defaultFetchDriveFileMetadata,
    fetchOnboardingSourceAnchors:
      deps.fetchOnboardingSourceAnchors ?? defaultFetchOnboardingSourceAnchors,
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

// Task B2: an UNCHECKED first-seen row carries no reviewer choices (the wizard never recorded
// them). Its triggered_review_items are the apply-only ONBOARDING_SCAN_REVIEW sentinel(s)
// (lib/sync/phase1.ts sentinelFor), whose only allowed action is "apply" (applyStagedCore
// allowedActions). Synthesize the default apply-all choice set so validateReviewerChoices passes
// and the staged parse applies wholesale, exactly as a checked apply would.
function synthesizeDefaultChoices(items: TriggeredReviewItem[]): ReviewerChoice[] {
  return items.map((item) => ({ item_id: item.id, action: "apply" as const }));
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
        from public.onboarding_scan_manifest m
        left join public.pending_syncs ps
          on ps.wizard_session_id = m.wizard_session_id and ps.drive_file_id = m.drive_file_id
       where m.wizard_session_id = $1::uuid
         -- Task B1 / spec 7.3 finishable set: blocking statuses are exactly
         -- (hard_failed, live_row_conflict, discard_retryable). A FRESH clean 'staged'
         -- row (unchecked, created Held by B2) is NOT counted -- only genuine
         -- error/conflict rows block finish.
         --
         -- whole-diff R1 HIGH (demoted-row finalize-retry bypass): a DEMOTED
         -- finalize-failure row is reset to status='staged' by demotePending with its
         -- pending_syncs.last_finalize_failure_code set. Such a row is EXCLUDED by the
         -- Task-B2 finishable selector (so it isn't auto-Held-created -- it must be
         -- re-applied), but if it weren't also counted here a SECOND /finalize call would
         -- see zero selected + zero unresolved rows and advance to all_batches_complete,
         -- silently bypassing the failed sheet. So count a 'staged' row whose pending_syncs
         -- row carries a non-null last_finalize_failure_code as BLOCKING again. A fresh
         -- unchecked-clean 'staged' row (no failure code) stays non-blocking -> becomes Held.
         and (
           m.status in ('hard_failed', 'live_row_conflict', 'discard_retryable')
           or (m.status = 'staged' and ps.last_finalize_failure_code is not null)
         )
    `,
    [wizardSessionId],
  );
  return rows[0]?.unresolved_count ?? 0;
}

// Task B2 (Held model): finalize creates a show for EVERY clean row, checked AND unchecked — so
// the batch selector picks up ALL FINISHABLE clean pending_syncs rows for the session, not only
// wizard_approved=true. "Finishable clean" =
//   (1) the manifest sits at a non-blocking status ('staged' or 'applied') — blocking statuses
//       (hard_failed / discard_retryable / live_row_conflict) never have a processable row; AND
//   (2) the row is NOT a demoted-and-not-yet-reapplied failure. A demoted row keeps
//       last_finalize_failure_code set with wizard_approved=false and manifest='staged'; it must
//       wait for operator re-apply, NOT be re-processed every batch (it would just re-fail, never
//       letting finish complete). A FRESH unchecked-clean row also has wizard_approved=false but
//       last_finalize_failure_code IS NULL — that one we DO process into a Held show. A re-applied
//       row is wizard_approved=true again (its stale failure code is irrelevant), so the
//       `wizard_approved = true OR last_finalize_failure_code is null` predicate selects it too.
// wizard_approved is carried into the row shape to key the 4-branch split + publish_intent stamp.
async function selectFinishableCleanRows(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  limit: number,
): Promise<PendingFinalizeRow[]> {
  const { rows } = await tx.query<PendingFinalizeRow>(
    `
      select ps.drive_file_id, ps.staged_id, ps.staged_modified_time, ps.parse_result,
             ps.wizard_approved,
             ps.wizard_reviewer_choices, ps.wizard_reviewer_choices_version,
             ps.wizard_approved_by_email, ps.wizard_approved_at,
             ps.triggered_review_items, ps.base_modified_time
        from public.pending_syncs ps
        join public.onboarding_scan_manifest m
          on m.wizard_session_id = ps.wizard_session_id
         and m.drive_file_id = ps.drive_file_id
       where ps.wizard_session_id = $1::uuid
         and m.status in ('staged', 'applied')
         and (ps.wizard_approved = true or ps.last_finalize_failure_code is null)
       order by ps.drive_file_id
       limit $2
    `,
    [wizardSessionId, limit],
  );
  return rows;
}

// Task B2: the multi-batch remaining count mirrors the FINISHABLE-clean selector predicate (not a
// bare pending_syncs count) so a >batchCap folder loops correctly until every finishable row is
// consumed, while a demoted-and-not-yet-reapplied row is excluded here too (it surfaces via
// unresolvedManifestCount, which keeps finish blocked until it is re-applied or resolved).
async function countRemainingCleanRows(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
): Promise<number> {
  const { rows } = await tx.query<{ remaining_count: number }>(
    `
      select count(*)::int as remaining_count
        from public.pending_syncs ps
        join public.onboarding_scan_manifest m
          on m.wizard_session_id = ps.wizard_session_id
         and m.drive_file_id = ps.drive_file_id
       where ps.wizard_session_id = $1::uuid
         and m.status in ('staged', 'applied')
         and (ps.wizard_approved = true or ps.last_finalize_failure_code is null)
    `,
    [wizardSessionId],
  );
  return rows[0]?.remaining_count ?? 0;
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
    | typeof RESCAN_REVIEW_REQUIRED
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
  publishIntent: boolean,
): Promise<void> {
  // Task B2: stamp publish_intent in the SAME provenance UPDATE — checked rows (true) are flipped
  // to Live by the CAS step (B3, narrowed to publish_intent=true); unchecked rows (false) leave
  // the created show Held (published=false).
  const recorded = await tx.query<{ recorded: boolean }>(
    `
      update public.onboarding_scan_manifest
         set created_show_id = $3::uuid,
             publish_intent = $4
       where drive_file_id = $1 and wizard_session_id = $2::uuid
         and exists (select 1 from public.app_settings
                      where id = 'default' and pending_wizard_session_id = $2::uuid)
      returning true as recorded
    `,
    [driveFileId, wizardSessionId, showId, publishIntent],
  );
  if (recorded.rowCount === 0) {
    throw new FirstSeenProvenanceRaceError(driveFileId, wizardSessionId);
  }
}

// Task B2: stamp publish_intent on the manifest WITHOUT touching created_show_id — used by the
// existing-show-checked branch (which stages a shadow and creates no first-seen show, so
// recordCreatedShowProvenance does not apply). Plain UPDATE: no provenance-race guard (the shadow
// path has no created_show_id to bind to the active session).
async function stampManifestPublishIntent(
  tx: FinalizeRouteTx,
  wizardSessionId: string,
  driveFileId: string,
  publishIntent: boolean,
): Promise<void> {
  await tx.query(
    `
      update public.onboarding_scan_manifest
         set publish_intent = $3
       where drive_file_id = $1 and wizard_session_id = $2::uuid
    `,
    [driveFileId, wizardSessionId, publishIntent],
  );
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
               -- F1: a file that was FIRST-SEEN at scan time (no shows row → pending base NULL,
               -- the correct first-seen contract) can gain a live show out-of-band before Phase B
               -- (cron first-seen auto-publish — runScheduledCronSync.insertFirstSeenShow). Carrying
               -- the stale NULL base into the existing-show shadow makes Phase D's equality preflight
               -- (finalize-cas applyShadow → revisionTimesMatch) refuse every such row against the now
               -- non-null live watermark, blocking final publish though nothing changed. Coalesce to
               -- the live watermark read in THIS INSERT…SELECT (under the per-show advisory lock the
               -- route already holds) — a no-op when the pending base is non-null (genuine staleness
               -- still refuses), mirroring the scan-time coalesce in upsertLivePendingSync.
               'base_modified_time', coalesce($9::timestamptz, s.last_seen_modified_time)
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
  // Task B2: consumes the pending row for EVERY clean row (checked AND unchecked). The
  // (drive_file_id, wizard_session_id, staged_id) triple already identifies the exact row, so the
  // old `and wizard_approved = true` predicate is dropped — otherwise an unchecked row
  // (wizard_approved=false) would survive and re-block finish or orphan (data loss).
  await tx.query<{ deleted: boolean }>(
    `
      delete from public.pending_syncs
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and staged_id = $3::uuid
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
  finalizerEmail: string;
  // nav-perf tag-caching (Task 6): the first-seen apply writes public.shows (+ children) via the
  // shared core. The created show's id is collected here so the route can `revalidateShow(id)`
  // POST-COMMIT (after deps.withTx resolves) — NEVER inside this per-row tx (pre-commit = stale).
  // The existing-show branch only STAGES into shows_pending_changes (no rendered crew-DATA write
  // until finalize-cas Phase D), so it does not collect an id here.
  appliedShowIds: Set<string>;
  // Section deep-link anchors computed PRE-LOCK by the caller (best-effort; undefined when the
  // Drive read failed). Consumed ONLY by the first-seen branch's applyStagedCore call so the
  // created show persists shows.source_anchors instead of the {} default.
  sourceAnchors?: Record<string, SourceAnchor>;
}): Promise<PerRowResult> {
  const { row, wizardSessionId, tx } = input;

  // Task B2: the reviewer-choices version is a CHECKED-row contract — only checked rows carry
  // real choices + version=1. An UNCHECKED row has version=null (the wizard never recorded
  // choices); it must NOT be demoted for that. Enforce the version only for checked rows.
  if (row.wizard_approved && row.wizard_reviewer_choices_version !== REVIEWER_CHOICES_VERSION) {
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

  // §5.6 — generation-scoped re-read of parse_result under the already-held show: lock.
  // selectFinishableCleanRows (outer tx, no show: lock) ran first; an agenda extraction
  // that completed between that read and here may have updated parse_result in
  // pending_syncs under the same show: lock.  Re-reading here — inside defaultWithRowTx
  // which already holds pg_advisory_xact_lock(hashtext('show:' || drive_file_id)) at
  // :164 — captures any such update at zero lock-acquisition cost.  No new advisory lock
  // is acquired; adoptShowLockHeld (below) asserts only.
  // Generation-scoped: the WHERE pins (wizard_session_id, drive_file_id, staged_id,
  // staged_modified_time) so a mid-flight rescan that replaced the row (new staged_id or
  // modified_time) returns 0 rows → stale demote, no publish.
  // Drive-light: finalize does NO per-PDF Drive call here — spec §5.7 temporal-scope
  // delegates post-publish re-validation to the cron path.
  const freshRead = await tx.query<{ parse_result: ParseResult }>(
    `select parse_result from public.pending_syncs
      where wizard_session_id = $1::uuid
        and drive_file_id = $2
        and staged_id = $3::uuid
        and staged_modified_time = $4::timestamptz`,
    [wizardSessionId, row.drive_file_id, row.staged_id, row.staged_modified_time],
  );
  if (freshRead.rowCount === 0) {
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
  const rereadRow: PendingFinalizeRow = {
    ...row,
    parse_result: freshRead.rows[0]!.parse_result,
  };

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
    ...rereadRow,
    parse_result: asParseResult(rereadRow.parse_result),
    wizard_reviewer_choices: coerceJsonbArray(rereadRow.wizard_reviewer_choices),
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
    if (row.wizard_approved) {
      // existing-show + CHECKED: unchanged — stage the shadow for the Phase D apply. publish_intent
      // is N/A to the first-seen flip (this row never creates a show) but stamp it true for
      // consistency with the manifest's checked/unchecked contract.
      await stageExistingShowShadow(tx, wizardSessionId, coercedRow, parsedItems.items);
      await stampManifestPublishIntent(tx, wizardSessionId, row.drive_file_id, true);
      await deleteApprovedPending(tx, wizardSessionId, row);
      return {
        drive_file_id: row.drive_file_id,
        wizard_session_id: wizardSessionId,
        code: OK_CODE,
      };
    }
    // existing-show + UNCHECKED — spec §7.4 D10 NO-OP. Doug left an already-Live show unchecked:
    // do NOT stage a shadow, do NOT touch public.shows (the Live show is unchanged). Just resolve
    // the manifest (status='applied', no created show, publish_intent=false → flip-excluded since
    // created_show_id IS NULL) and consume the pending row so it can't block finish or orphan.
    await tx.query(
      `
        update public.onboarding_scan_manifest
           set status = 'applied',
               created_show_id = null,
               publish_intent = false,
               transitioned_at = now()
         where drive_file_id = $1 and wizard_session_id = $2::uuid
      `,
      [row.drive_file_id, wizardSessionId],
    );
    await deleteApprovedPending(tx, wizardSessionId, row);
    return { drive_file_id: row.drive_file_id, wizard_session_id: wizardSessionId, code: OK_CODE };
  }

  // First-seen branch (F1 Task 1.3 + Task B2): the FULL Phase-2 apply via the shared core —
  // children + shows_internal + auth-contract calls — with published=false preserved
  // (firstSeenPublished), the show-side session discriminator written in the same INSERT
  // (wizardCreatedSessionId), NO feed rows (the feed documents changes to LIVE shows). Audit
  // provenance differs by checked/unchecked:
  //   - CHECKED:   approving admin + Apply-click instant (spec §3.1 R8-1), the row's real choices.
  //   - UNCHECKED: the FINALIZER (the row has no approver — wizard_approved_by_email is null) +
  //     the finish instant (wizard_approved_at is null) + synthesized apply-all choices over the
  //     ONBOARDING_SCAN_REVIEW sentinel(s). The created show stays Held (publish_intent=false).
  const stagedModifiedTimeIso = normalizeTimestamptz(row.staged_modified_time);
  if (!stagedModifiedTimeIso) {
    throw new Error("approved onboarding row is missing staged_modified_time");
  }

  const appliedByEmail = row.wizard_approved
    ? requireApprovedByEmail(coercedRow) // approving admin
    : input.finalizerEmail; // unchecked: the finalizer (no approver on the row)
  const appliedAt = row.wizard_approved
    ? normalizeTimestamptz(row.wizard_approved_at) // Apply-click instant
    : new Date().toISOString(); // unchecked: finish instant (wizard_approved_at is null)
  const reviewerChoices = row.wizard_approved
    ? (coercedRow.wizard_reviewer_choices as ReviewerChoice[])
    : synthesizeDefaultChoices(parsedItems.items); // unchecked: apply-all over the sentinel(s)

  const lockedTx = await adoptShowLockHeld(input.pipelineTx, row.drive_file_id);
  const core = await applyStagedCore(lockedTx, {
    sourceScope: "wizard",
    driveFileId: row.drive_file_id,
    show: null, // first-seen: gated by !showExists above
    parseResult: coercedRow.parse_result,
    triggeredReviewItems: parsedItems.items,
    reviewerChoices,
    stagedId: row.staged_id,
    stagedModifiedTime: stagedModifiedTimeIso,
    baseModifiedTime: null, // no live row → equality preflight trivially holds
    appliedByEmail,
    appliedAt,
    auditSource: "onboarding_finalize",
    fileMeta: metadata,
    mi11Items: [], // first-seen: no prior crew → MI-11 impossible
    feedPolicy: { kind: "none" }, // first-seen writes NO show_change_log rows (spec §3.1)
    skipDiagramsWrite: false, // payload diagrams already canonical (spec §3.4)
    firstSeenPublished: false,
    // R59-1/R60-1: threaded ApplyStagedCoreArgs → Phase2Args → applyShowSnapshot → the
    // first-seen INSERT writes shows.wizard_created_session_id in the SAME statement.
    wizardCreatedSessionId: wizardSessionId,
    // Deep-link anchors (computed pre-lock) → the first-seen INSERT writes shows.source_anchors so
    // "In sheet" links resolve to the right tab immediately, matching the cron path. Omitted (never
    // {}) on a Drive failure so the apply still succeeds (the #gid=0 fallback keeps links safe).
    ...(input.sourceAnchors !== undefined ? { sourceAnchors: input.sourceAnchors } : {}),
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
  // per-row transaction (FirstSeenProvenanceRaceError), leaving pending_syncs untouched. The same
  // UPDATE stamps publish_intent (= checked) so the CAS flip (B3) publishes only checked rows.
  await recordCreatedShowProvenance(
    tx,
    wizardSessionId,
    row.drive_file_id,
    core.showId,
    row.wizard_approved,
  );
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
  let finalizerEmail: string;
  try {
    // Task B2: capture the finalizing admin's email — it is the audit actor for unchecked
    // first-seen rows (those have no approver on the pending row).
    const admin = await runtime.requireAdminIdentity();
    finalizerEmail = admin.email;
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

      const approvedRows = await selectFinishableCleanRows(tx, wizardSessionId, runtime.batchCap);
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
        // Compute deep-link source anchors PRE-LOCK (before withRowTx takes the per-show advisory
        // lock) — mirrors the cron path, which fetches/computes anchors in its prepare phase, not
        // under the lock. Best-effort: a Drive failure must NEVER block materialization, so on error
        // we apply with anchors omitted (the #gid=0 fallback keeps "In sheet" safe and the next full
        // sync / backfill fills them in). Computed for every approved row; only the first-seen branch
        // of processApprovedRow consumes it (existing-show rows ignore it).
        let sourceAnchors: Record<string, SourceAnchor> | undefined;
        try {
          sourceAnchors = await runtime.fetchOnboardingSourceAnchors(row.drive_file_id);
        } catch (error) {
          console.warn(
            `onboarding finalize: source-anchor computation failed for ${row.drive_file_id}; applying without anchors`,
            error,
          );
          sourceAnchors = undefined;
        }
        let result: PerRowResult;
        try {
          result = await runtime.withRowTx(row.drive_file_id, (rowTx, pipelineTx) =>
            processApprovedRow({
              row,
              wizardSessionId,
              tx: rowTx,
              pipelineTx,
              fetchDriveFileMetadata: runtime.fetchDriveFileMetadata,
              finalizerEmail,
              appliedShowIds,
              ...(sourceAnchors !== undefined ? { sourceAnchors } : {}),
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
        // Narrow `result` to the failure variant BEFORE spreading (a bare ternary leaves
        // `result` as the full union — the OK variant has no display_name, so
        // {...okVariant, display_name} is not assignable under exactOptionalPropertyTypes).
        if (result.code === OK_CODE) {
          perRow.push(result);
        } else {
          const displayTitle = parsedShowTitle(row.parse_result);
          perRow.push(displayTitle ? { ...result, display_name: displayTitle } : result);
        }
      }

      const remainingCount = await countRemainingCleanRows(tx, wizardSessionId);
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
