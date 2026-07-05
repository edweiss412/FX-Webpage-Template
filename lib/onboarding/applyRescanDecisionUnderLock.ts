import {
  PostgresOnboardingScanTx,
  scanOnboardingPreparedFiles,
  type OnboardingScanTx,
  type PostgresTransaction,
  type PreparedOnboardingFile,
} from "@/lib/sync/runOnboardingScan";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { computeRescanDecision } from "@/lib/onboarding/rescanDecision";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { parseShadowPayloadForApply } from "@/lib/onboarding/shadowPayload";
import { asParseResult } from "@/lib/db/coerceJsonbObject";
import { summarizeDataGaps, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";

const STAGED_PARSE_FAILED = "STAGED_PARSE_FAILED" as const;

/**
 * Input to the lock-free per-row Re-scan decision core. The caller (rescanWizardSheet OR
 * finalize's inline auto-heal) MUST already hold the `show:<driveFileId>` advisory lock; this
 * core acquires NO lock. `isBlockerHeal` is computed by the caller from its checkpoint reopen
 * and gates the manifest-'applied'-restore on the clean+ready branch.
 */
export type RescanDecisionInput = {
  wizardSessionId: string;
  driveFileId: string;
  pendingFolderId: string;
  /** The freshly re-staged sheet; the caller pre-checks `kind === "sheet"`. */
  prepared: Extract<PreparedOnboardingFile, { kind: "sheet" }>;
  /** = `prepared.parseResult` — the refreshed parse diffed against the under-lock prior. */
  refreshedParse: ParseResult;
  /**
   * True iff the caller's checkpoint reopen re-opened >=1 row (a finalize batch already
   * completed → BLOCKER HEAL, Flow B): the manifest 'staged' heal MUST stand so the sheet
   * re-enters the batch. False for a pre-finalize clean re-approval (Flow A) → the manifest
   * is restored to 'applied' so the Step-3 checkbox stays truthful.
   */
  isBlockerHeal: boolean;
};

/**
 * The per-row-surface outcome. The caller maps each variant back to its user-facing shape:
 * `schema_missing`/`hard_failed`/`not_staged` → needs_attention(code); `superseded` →
 * superseded; the three `*_demoted`/`clean_*` → the `updated` shape (needsReview/demoted).
 */
export type RescanDecisionOutcome =
  | { kind: "schema_missing"; code: string }
  | { kind: "superseded" }
  | { kind: "hard_failed"; code: string }
  | { kind: "not_staged"; code: string }
  | { kind: "dirty_demoted"; changed: boolean }
  | { kind: "clean_restamped"; changed: boolean } // previously-ready → approval re-stamped
  | { kind: "clean_unchecked"; changed: boolean }; // not previously-ready → left unapproved

/** Test seam — inject the restage so a fake-tx unit isolates the decision from real staging. */
export type ApplyRescanDecisionDeps = {
  scanOnboardingPreparedFiles?: typeof scanOnboardingPreparedFiles;
};

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

function one<T>(rows: T[]): T {
  return rows[0]!;
}

/**
 * The lock-free per-row-surface core of a Re-scan (spec §4.2). It CAPTURES prior state
 * itself under the passed (already-locked) `tx`, re-stages the single sheet via
 * `scanOnboardingPreparedFiles` (pass-through `withShowLock` that adopts, never acquires),
 * reads back the fresh staged row, computes the clean/dirty decision, and writes the
 * per-row demote/re-stamp to `pending_syncs` + `onboarding_scan_manifest` +
 * `shows_pending_changes` for the single `driveFileId`.
 *
 * HARD INVARIANT (§4.2): this core acquires NO advisory lock, and reads/writes NEITHER
 * `public.app_settings` NOR `public.wizard_finalize_checkpoints`. Finalize's outer tx holds
 * both FOR UPDATE on a SEPARATE connection; a per-row touch here would cross-transaction
 * deadlock. The lock acquisition, app_settings re-check, and checkpoint reopen stay in the
 * caller — the caller passes the checkpoint's verdict in as `isBlockerHeal`.
 */
export async function applyRescanDecisionUnderLock(
  tx: PostgresTransaction,
  input: RescanDecisionInput,
  deps: ApplyRescanDecisionDeps = {},
): Promise<RescanDecisionOutcome> {
  const { wizardSessionId, driveFileId, pendingFolderId, prepared, refreshedParse, isBlockerHeal } =
    input;
  const runScan = deps.scanOnboardingPreparedFiles ?? scanOnboardingPreparedFiles;

  // Step 2.0 — capture authoritative prior state UNDER the held lock.
  const prior = await capturePriorState(tx, wizardSessionId, driveFileId);

  // (a) re-stage on the SAME locked tx; the scan's internal show: lock is satisfied by
  // the held-lock passthrough (single acquirer — no nesting, AGENTS.md invariant 2).
  const scanTx = new PostgresOnboardingScanTx(
    tx,
    pendingFolderId,
    wizardSessionId,
  ) as unknown as LockedShowTx<OnboardingScanTx>;
  const scan = await runScan(pendingFolderId, wizardSessionId, [prepared], {
    tx: scanTx,
    withShowLock: async (_id, fn) => fn(scanTx),
  });

  if (scan.outcome === "schema_missing") {
    return { kind: "schema_missing", code: scan.code };
  }
  if (scan.outcome === "superseded") {
    return { kind: "superseded" };
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
    return { kind: "hard_failed", code: errRows[0]?.last_error_code ?? STAGED_PARSE_FAILED };
  }
  if (processed?.outcome !== "staged") {
    // skipped_non_sheet / live_row_conflict / absent — defensive, NOT expected for a
    // single in-folder sheet that passed the pre-lock non_sheet guard.
    return { kind: "not_staged", code: STAGED_PARSE_FAILED };
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
    return { kind: "dirty_demoted", changed };
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
    // (b) heal reset it to 'staged'; a re-stamped CHECKED row that never went through a
    // finalize batch MUST stay 'applied' or the Step-3 UI (checked-state = status==='applied')
    // renders it unchecked/Held while finalize still publishes it Live off wizard_approved=true
    // (audit C2/C6). For a BLOCKER HEAL (a finalize batch already completed and was re-opened
    // by the caller, Flow B), the heal's 'staged' MUST stand so the sheet re-enters the batch.
    if (!isBlockerHeal) {
      await tx.unsafe(
        `update public.onboarding_scan_manifest
            set status = 'applied', transitioned_at = now()
          where wizard_session_id = $1::uuid and drive_file_id = $2`,
        [wizardSessionId, driveFileId],
      );
    }
    return { kind: "clean_restamped", changed };
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
  return { kind: "clean_unchecked", changed };
}
