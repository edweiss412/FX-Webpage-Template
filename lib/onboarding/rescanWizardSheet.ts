import postgres from "postgres";

import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  PostgresOnboardingScanTx,
  prepareOnboardingFiles,
  scanOnboardingPreparedFiles,
  type OnboardingScanTx,
  type PostgresTransaction,
} from "@/lib/sync/runOnboardingScan";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { STAGED_PARSE_SOURCE_OUT_OF_SCOPE } from "@/lib/sync/applyStaged";
import { computeRescanDecision } from "@/lib/onboarding/rescanDecision";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { parseShadowPayloadForApply } from "@/lib/onboarding/shadowPayload";
import { asParseResult } from "@/lib/db/coerceJsonbObject";
import { summarizeDataGaps, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";

/**
 * Result of a per-sheet Re-scan (spec §5.4). `status:"updated"` is the only
 * mutating outcome; `needsReview=true` means the row is currently unapproved (the
 * operator must re-review before publish) — this is true both for a fresh demotion
 * AND for a row that was already unapproved, so it cannot alone tell the client
 * whether content just regressed. `demoted` disambiguates: `true` only for the
 * DIRTY branch (§6.1 — content regressed, or a corrupt prior forced fail-closed
 * review), `false` for every clean outcome (re-stamped OR clean-but-unapproved).
 * Every other status is a typed, NON-mutating guard outcome. `code` is always a
 * §12.4-cataloged code (the route renders it via `lookupDougFacing`, never raw —
 * invariant 5).
 */
export type RescanResult =
  | { status: "updated"; needsReview: boolean; changed: boolean; demoted: boolean }
  | { status: "needs_attention"; code: string }
  | { status: "busy"; code: "CONCURRENT_FINALIZE_IN_FLIGHT" }
  | { status: "superseded" | "no_active_session" | "not_found" | "not_a_sheet" };

export type RescanDeps = {
  /** Drive metadata fetch for the single re-scanned file (default: real Drive). */
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  /** Parse/prepare the single file (default: real export+parse). */
  prepareOnboardingFiles?: typeof prepareOnboardingFiles;
  /**
   * TOCTOU test seam — invoked AFTER the side-effect-free pre-lock Drive read,
   * BEFORE the locked transaction. The TOCTOU test mutates approval here to prove
   * prior state is captured UNDER the lock, not before it (spec §5.3 finding 1).
   */
  afterDriveRead?: () => void | Promise<void>;
  /**
   * Yields a RAW postgres.js transaction (exposes `.unsafe(sql, params)`) so a
   * `PostgresOnboardingScanTx` can be constructed directly on it (mirrors the
   * `.db.test.ts` harness). The default opens a `postgres()` connection and runs
   * `sql.begin(fn)`, closing after. NOT a finalize-style `.query()`-only adapter —
   * `PostgresOnboardingScanTx` calls `tx.unsafe` (plan finding r2-3).
   */
  withTx?: <R>(fn: (rawTx: PostgresTransaction) => Promise<R>) => Promise<R>;
};

const STAGED_PARSE_FAILED = "STAGED_PARSE_FAILED" as const;
const DRIVE_FETCH_FAILED = "DRIVE_FETCH_FAILED" as const;

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("rescanWizardSheet requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

/**
 * Default runtime: a fresh `postgres()` connection + `sql.begin(fn)`, closed
 * after. Each `withTx` call is its own transaction (the pre-lock advisory read
 * and the locked mutation are separate transactions — only the second holds the
 * locks). Mirrors `withShowLock`'s connection lifecycle (`lockedShowTx.ts:97`).
 */
async function defaultWithTx<R>(fn: (rawTx: PostgresTransaction) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, prepare: false });
  try {
    return (await sql.begin(async (tx) => fn(tx as unknown as PostgresTransaction))) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function isoOf(value: unknown): string | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

type PriorState = {
  priorReady: boolean;
  priorApprovedByEmail: string | null;
  priorParse: ParseResult | null;
  priorDataGaps: DataGapsSummary | null;
  priorStagedModifiedTime: unknown;
};

/**
 * Capture authoritative prior state UNDER the held lock (spec §5.3 step 2.0):
 * `pending_syncs` (Flow A), else the `shows_pending_changes` shadow (Flow B, read
 * fail-closed via `parseShadowPayloadForApply`), else neither (first-seen).
 */
async function capturePriorState(
  tx: PostgresTransaction,
  wizardSessionId: string,
  driveFileId: string,
): Promise<PriorState> {
  const psRows = (await tx.unsafe(
    `select wizard_approved, wizard_approved_by_email, parse_result, staged_modified_time
       from public.pending_syncs
      where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [wizardSessionId, driveFileId],
  )) as Array<{
    wizard_approved: boolean;
    wizard_approved_by_email: string | null;
    parse_result: ParseResult | null;
    staged_modified_time: unknown;
  }>;
  const ps = psRows[0];
  if (ps) {
    // Fail-closed (matching Flow B's `parseShadowPayloadForApply`): validate the
    // stored Flow-A `parse_result` via `asParseResult` rather than casting the raw
    // jsonb. Re-scan is the UI's recovery for a corrupt / no-details card, so a
    // previously-ready row whose prior parse is unreadable must NOT throw inside
    // `computeRescanDecision`'s `runInvariants` (a `{}` / non-object prior derefs
    // `prior.crewMembers.length` → TypeError → empty 500). On invalid/corrupt →
    // priorParse=null, which the §6 DIRTY clause (`priorReady && priorParse === null`)
    // turns into a forced review instead of a thrown 500.
    let priorParse: ParseResult | null = null;
    try {
      priorParse = ps.parse_result == null ? null : asParseResult(ps.parse_result);
    } catch {
      priorParse = null;
    }
    return {
      priorReady: ps.wizard_approved === true,
      priorApprovedByEmail: ps.wizard_approved_by_email,
      priorParse,
      priorDataGaps: priorParse ? summarizeDataGaps(priorParse.warnings) : null,
      priorStagedModifiedTime: ps.staged_modified_time,
    };
  }

  const shRows = (await tx.unsafe(
    `select payload, applied_by_email
       from public.shows_pending_changes
      where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [wizardSessionId, driveFileId],
  )) as Array<{ payload: unknown; applied_by_email: string | null }>;
  const sh = shRows[0];
  if (sh) {
    const parsed = parseShadowPayloadForApply(sh.payload);
    if (parsed.ok) {
      return {
        priorReady: true,
        priorApprovedByEmail: sh.applied_by_email,
        priorParse: parsed.parseResult,
        priorDataGaps: summarizeDataGaps(parsed.parseResult.warnings),
        priorStagedModifiedTime: parsed.stagedModifiedTime,
      };
    }
    // Corrupt shadow: can't diff for cleanliness → prior=null (drives the §6 DIRTY clause).
    return {
      priorReady: true,
      priorApprovedByEmail: sh.applied_by_email,
      priorParse: null,
      priorDataGaps: null,
      priorStagedModifiedTime: null,
    };
  }

  return {
    priorReady: false,
    priorApprovedByEmail: null,
    priorParse: null,
    priorDataGaps: null,
    priorStagedModifiedTime: null,
  };
}

/**
 * Per-sheet Re-scan orchestration (spec §5). Re-fetches one Drive file, re-parses,
 * re-stages it under the finalize→app_settings→show lock order (identical to
 * finalize, so no AB-BA deadlock — AGENTS.md invariant 2), heals any finalize
 * blocker state, then auto-keeps approval iff the refresh is "clean" (§6) else
 * demotes the row to `RESCAN_REVIEW_REQUIRED`.
 *
 * The slow Drive read is side-effect-free and runs PRE-LOCK; only the mutations
 * run under the lock. Prior state is captured UNDER the lock (NOT before the Drive
 * window) so a concurrent approve/unapprove is never lost (spec §5.3 finding 1).
 */
export async function rescanWizardSheet(
  driveFileId: string,
  wizardSessionId: string,
  deps: RescanDeps = {},
): Promise<RescanResult> {
  const withTx = deps.withTx ?? defaultWithTx;

  // ── §5.2 pre-lock: side-effect-free Drive read + folder-scope guard ──
  // Preliminary NON-mutating app_settings read (advisory; the authoritative
  // session re-check is the FOR UPDATE read under the lock below).
  const settings = await withTx(async (tx) => {
    const rows = (await tx.unsafe(
      `select pending_folder_id, pending_wizard_session_id
         from public.app_settings where id = 'default' limit 1`,
    )) as Array<{ pending_folder_id: string | null; pending_wizard_session_id: string | null }>;
    return rows[0] ?? null;
  });
  if (
    !settings ||
    settings.pending_folder_id === null ||
    settings.pending_wizard_session_id === null
  ) {
    return { status: "no_active_session" };
  }
  if (settings.pending_wizard_session_id !== wizardSessionId) {
    return { status: "superseded" };
  }
  const pendingFolderId = settings.pending_folder_id;

  let prepared;
  try {
    const metadata = await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId);
    // Folder-scope guard (spec §5.2): a file moved OUT of the setup folder must not
    // be re-staged by id, mirroring retrySingleFile.ts:232-234 + finalize's demotion.
    if (!metadata.parents.includes(pendingFolderId)) {
      return { status: "needs_attention", code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE };
    }
    const preparedFiles = await (deps.prepareOnboardingFiles ?? prepareOnboardingFiles)(
      pendingFolderId,
      { listFolder: async () => [metadata] },
    );
    prepared = preparedFiles[0];
  } catch {
    // Drive fetch / export failure or timeout (pre-lock → NO mutation, spec §5.2).
    return { status: "needs_attention", code: DRIVE_FETCH_FAILED };
  }
  if (!prepared) return { status: "not_found" };
  if (prepared.kind === "non_sheet") return { status: "not_a_sheet" };
  const refreshedParse = prepared.parseResult;

  // TOCTOU seam: lets a test mutate approval AFTER the Drive read, BEFORE the lock,
  // so the under-lock capture is what decides clean/dirty (spec §5.3 finding 1).
  await deps.afterDriveRead?.();

  // ── §5.3 locked mutation (lock order = finalize → app_settings → show) ──
  return await withTx(async (tx) => {
    // (1) finalize:<session> TRY lock — a finalize in flight ⇒ busy, NO mutation.
    const lockRows = (await tx.unsafe(
      `select pg_try_advisory_xact_lock(hashtext('finalize:' || $1)) as locked`,
      [wizardSessionId],
    )) as Array<{ locked: boolean }>;
    if (lockRows[0]?.locked !== true) {
      return { status: "busy", code: "CONCURRENT_FINALIZE_IN_FLIGHT" };
    }
    // (2) app_settings FOR UPDATE — authoritative session re-check.
    const sessRows = (await tx.unsafe(
      `select pending_wizard_session_id from public.app_settings where id = 'default' for update`,
    )) as Array<{ pending_wizard_session_id: string | null }>;
    if (sessRows[0]?.pending_wizard_session_id !== wizardSessionId) {
      return { status: "superseded" };
    }
    // (3) manifest-membership guard (plan finding r2-1) — no row ⇒ not_found, NO mutation.
    const manRows = (await tx.unsafe(
      `select 1 as ok from public.onboarding_scan_manifest
        where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [wizardSessionId, driveFileId],
    )) as unknown[];
    if (manRows.length === 0) return { status: "not_found" };
    // (4) show:<driveFileId> blocking lock (single holder — the scan adopts it below).
    await tx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);

    // Step 2.0 — capture authoritative prior state UNDER the lock.
    const prior = await capturePriorState(tx, wizardSessionId, driveFileId);

    // (a) re-stage on the SAME locked tx; the scan's internal show: lock is satisfied by
    // the held-lock passthrough (single acquirer — no nesting, AGENTS.md invariant 2).
    const scanTx = new PostgresOnboardingScanTx(
      tx,
      pendingFolderId,
      wizardSessionId,
    ) as unknown as LockedShowTx<OnboardingScanTx>;
    const scan = await scanOnboardingPreparedFiles(pendingFolderId, wizardSessionId, [prepared], {
      tx: scanTx,
      withShowLock: async (_id, fn) => fn(scanTx),
    });

    if (scan.outcome === "schema_missing") {
      return { status: "needs_attention", code: scan.code };
    }
    if (scan.outcome === "superseded") {
      return { status: "superseded" };
    }
    const processed = scan.processed.find((p) => p.driveFileId === driveFileId);
    if (processed?.outcome === "hard_failed") {
      // The orphan shadow is superseded by this re-scan; the hard_failed manifest keeps
      // final CAS blocked via unresolvedManifestCount (spec §5.3 Flow-B postcondition).
      await tx.unsafe(
        `delete from public.shows_pending_changes
          where wizard_session_id = $1::uuid and drive_file_id = $2`,
        [wizardSessionId, driveFileId],
      );
      // Demote any retained Flow-A approval: a hard-failing re-scan writes only the manifest +
      // pending_ingestions, so an approved pending_syncs row survives with choices keyed to the OLD
      // staged item ids. A later Step-3 Retry re-stages fresh sentinel ids while upsertLivePendingSync
      // preserves wizard_approved/wizard_reviewer_choices, so those stale choices would fail
      // validateReviewerChoices (EXTRA_REVIEWER_CHOICE → invalid_request) and wedge the whole finalize
      // batch with an uncaught ONBOARDING_FINALIZE_INTERNAL_ERROR. Revert to unapproved (CHECK-satisfying
      // null payload) so the retried row re-enters the normal review path (audit C3).
      await tx.unsafe(
        `update public.pending_syncs
            set wizard_approved = false, wizard_approved_by_email = null, wizard_approved_at = null,
                wizard_reviewer_choices = null, wizard_reviewer_choices_version = null,
                last_finalize_failure_code = $3
          where wizard_session_id = $1::uuid and drive_file_id = $2`,
        [wizardSessionId, driveFileId, RESCAN_REVIEW_REQUIRED],
      );
      const errRows = (await tx.unsafe(
        `select last_error_code from public.pending_ingestions
          where wizard_session_id = $1::uuid and drive_file_id = $2`,
        [wizardSessionId, driveFileId],
      )) as Array<{ last_error_code: string | null }>;
      return {
        status: "needs_attention",
        code: errRows[0]?.last_error_code ?? STAGED_PARSE_FAILED,
      };
    }
    if (processed?.outcome !== "staged") {
      // skipped_non_sheet / live_row_conflict / absent — defensive, NOT expected for a
      // single in-folder sheet that passed the pre-lock non_sheet guard.
      return { status: "needs_attention", code: STAGED_PARSE_FAILED };
    }

    // Read back the just-staged row: the fresh staged_modified_time + the blinded
    // sentinel item(s) (new randomUUID ids).
    const stagedRow = one(
      (await tx.unsafe(
        `select staged_modified_time, triggered_review_items
           from public.pending_syncs
          where wizard_session_id = $1::uuid and drive_file_id = $2`,
        [wizardSessionId, driveFileId],
      )) as Array<{ staged_modified_time: unknown; triggered_review_items: TriggeredReviewItem[] }>,
    );
    const sentinelItems = stagedRow.triggered_review_items ?? [];
    const changed = isoOf(stagedRow.staged_modified_time) !== isoOf(prior.priorStagedModifiedTime);

    // (b) heal finalize state (idempotent — no-op for a fresh Flow-A row, the blocker fix for Flow B).
    await tx.unsafe(
      `delete from public.shows_pending_changes
        where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [wizardSessionId, driveFileId],
    );
    // Re-stageable: status='staged' (preserve publish_intent — not touched here).
    await tx.unsafe(
      `update public.onboarding_scan_manifest
          set status = 'staged', transitioned_at = now()
        where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [wizardSessionId, driveFileId],
    );
    // Re-openable checkpoint so the next /finalize re-processes the re-opened row.
    // A re-opened checkpoint (>=1 row) means a finalize batch ALREADY completed and this is a
    // BLOCKER HEAL (Flow B, e.g. a STAGED_PARSE_OUTDATED-blocked shadow): the manifest must stay
    // 'staged' so the sheet re-enters the batch (publish_intent preserved). When nothing re-opens,
    // this is a PRE-FINALIZE clean re-approval (Flow A / the C2/C6 scenario) and the manifest is
    // restored to 'applied' below so the Step-3 checkbox stays truthful. RETURNING makes the result
    // a per-updated-row array so `.length` is the re-opened count (tx.unsafe is typed unknown[],
    // so a bare `.count` does not type-check under `next build`).
    const checkpointReopen = await tx.unsafe(
      `update public.wizard_finalize_checkpoints
          set status = 'in_progress'
        where wizard_session_id = $1::uuid
          and status in ('all_batches_complete', 'final_cas_done')
        returning wizard_session_id`,
      [wizardSessionId],
    );
    const isBlockerHeal = checkpointReopen.length > 0;

    // (c) clean rule (§6).
    const { dirty, decisionItems } = computeRescanDecision(
      prior.priorParse,
      refreshedParse,
      prior.priorDataGaps,
    );
    // A previously-ready sheet whose prior parse is unreadable (corrupt shadow) can't be
    // verified clean → force re-review (§6 DIRTY clause; that clause needs priorReady).
    const isDirty = dirty || (prior.priorReady && prior.priorParse === null);

    if (isDirty) {
      // DIRTY → demote-shaped block (spec §6.1): truly blocks finalize via
      // last_finalize_failure_code, and carries the decision items for the reapply surface.
      const triggered = [...sentinelItems, ...decisionItems];
      await tx.unsafe(
        `update public.pending_syncs
            set wizard_approved = false, wizard_approved_by_email = null, wizard_approved_at = null,
                wizard_reviewer_choices = null, wizard_reviewer_choices_version = null,
                last_finalize_failure_code = $3, triggered_review_items = $4::jsonb
          where wizard_session_id = $1::uuid and drive_file_id = $2`,
        [wizardSessionId, driveFileId, RESCAN_REVIEW_REQUIRED, triggered],
      );
      return { status: "updated", needsReview: true, changed, demoted: true };
    }

    if (prior.priorReady) {
      // CLEAN + previously-ready → re-stamp approval (§6.2). The approval-payload fields are
      // non-null by construction (priorApprovedByEmail is Flow A's approver or Flow B's shadow
      // applied_by_email), required by pending_syncs_approved_requires_full_payload. Choices
      // are REGENERATED (one apply per new staged item) — the re-parse minted fresh item ids,
      // so the prior choices reference deleted ids (would 500 at finalize).
      const choices = sentinelItems.map((item) => ({ item_id: item.id, action: "apply" }));
      await tx.unsafe(
        `update public.pending_syncs
            set wizard_approved = true, wizard_approved_by_email = $3, wizard_approved_at = now(),
                wizard_reviewer_choices = $4::jsonb, wizard_reviewer_choices_version = 1,
                last_finalize_failure_code = null
          where wizard_session_id = $1::uuid and drive_file_id = $2`,
        [wizardSessionId, driveFileId, prior.priorApprovedByEmail, choices],
      );
      // Restore the manifest to 'applied' to match the retained approval — but ONLY for a
      // pre-finalize clean re-approval (Flow A, the C2/C6 scenario), NOT a blocker heal. The
      // line-354 heal reset it to 'staged'; a re-stamped CHECKED row that never went through a
      // finalize batch MUST stay 'applied' or the Step-3 UI (checked-state = status==='applied')
      // renders it unchecked/Held while finalize still publishes it Live off wizard_approved=true
      // (audit C2/C6). For a BLOCKER HEAL (a finalize batch already completed and was re-opened
      // above, Flow B), the heal's 'staged' MUST stand so the sheet re-enters the batch.
      if (!isBlockerHeal) {
        await tx.unsafe(
          `update public.onboarding_scan_manifest
              set status = 'applied', transitioned_at = now()
            where wizard_session_id = $1::uuid and drive_file_id = $2`,
          [wizardSessionId, driveFileId],
        );
      }
      return { status: "updated", needsReview: false, changed, demoted: false };
    }

    // CLEAN + not previously-ready → clear any prior demotion code (un-block) and keep the row
    // un-approved (fresh-unchecked semantics). Nulling the approval fields keeps the
    // wizard_approved=false branch of the CHECK satisfied unconditionally.
    await tx.unsafe(
      `update public.pending_syncs
          set wizard_approved = false, wizard_approved_by_email = null, wizard_approved_at = null,
              wizard_reviewer_choices = null, wizard_reviewer_choices_version = null,
              last_finalize_failure_code = null
        where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [wizardSessionId, driveFileId],
    );
    return { status: "updated", needsReview: true, changed, demoted: false };
  });
}

function one<T>(rows: T[]): T {
  return rows[0]!;
}
