import postgres from "postgres";

import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import { prepareOnboardingFiles, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { STAGED_PARSE_SOURCE_OUT_OF_SCOPE } from "@/lib/sync/applyStaged";
import { applyRescanDecisionUnderLock } from "@/lib/onboarding/applyRescanDecisionUnderLock";
import {
  overrideSnapshot,
  type OverrideSnapshot,
  type PullSheetOverride,
} from "@/lib/sync/pullSheetOverride";

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
  | {
      status: "updated";
      needsReview: boolean;
      changed: boolean;
      demoted: boolean;
      /** Causal driver(s) of a demote (spec 2026-07-17 §4.3). `[]` on a clean re-stage. */
      reviewCodes: string[];
    }
  | { status: "needs_attention"; code: string }
  | { status: "busy"; code: "CONCURRENT_FINALIZE_IN_FLIGHT" }
  // §5.7/I5a locked-snapshot protocol: the pre-lock parse was produced under an override that
  // another holder changed in the TOCTOU window before the show: lock — the parse is stale and
  // nothing is written. Refuse-and-retry; the next rescan re-derives under the current override.
  | { status: "stale_override_refused" }
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
  /**
   * The lock-free clean/dirty decision core (default: real). Injectable so a unit
   * test can drive a specific outcome without seeding the full staged state — mirrors
   * the finalize route, which already injects this core.
   */
  applyRescanDecisionUnderLock?: typeof applyRescanDecisionUnderLock;
};

const DRIVE_FETCH_FAILED = "DRIVE_FETCH_FAILED" as const;

/** §5.7 snapshot equality: both null, or same tabName+fingerprint. null↔set differs. */
function pullSheetOverrideSnapshotsEqual(a: OverrideSnapshot, b: OverrideSnapshot): boolean {
  if (a === null || b === null) return a === b;
  return a.tabName === b.tabName && a.fingerprint === b.fingerprint;
}

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
    // (4) show:<driveFileId> blocking lock (single holder — the core adopts it below).
    await tx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);

    // (4a) §5.7/I5a locked-snapshot protocol: the pre-lock export was produced under
    // `prepared.pullSheetOverrideUsed`. Re-read pull_sheet_override UNDER the show: lock; if a
    // concurrent holder (Task-6 content-change auto-clear, or the Task-8 accept/revoke RPC)
    // changed it in the TOCTOU window, the pre-lock parse is STALE — refuse-and-retry WITHOUT
    // writing any staged/live result (the next rescan re-derives under the current override).
    // Destructure returned-vs-thrown explicitly (invariant 9): a read fault throws to the outer
    // catch (needs_attention), never a silent proceed on a stale parse.
    const preLockSnapshot: OverrideSnapshot = prepared.pullSheetOverrideUsed ?? null;
    const lockedOverrideRows = (await tx.unsafe(
      `select pull_sheet_override as override_json from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid limit 1`,
      [driveFileId, wizardSessionId],
    )) as Array<{ override_json: PullSheetOverride | null }>;
    const lockedSnapshot = overrideSnapshot(lockedOverrideRows[0]?.override_json ?? null);
    if (!pullSheetOverrideSnapshotsEqual(preLockSnapshot, lockedSnapshot)) {
      return { status: "stale_override_refused" };
    }

    // Blocker-heal detection: a COMPLETED checkpoint ('all_batches_complete' /
    // 'final_cas_done') means a finalize batch already ran and this re-scan is a
    // BLOCKER HEAL (Flow B, e.g. a STAGED_PARSE_OUTDATED-blocked shadow) — the manifest
    // must stay 'staged' so the sheet re-enters the batch (publish_intent preserved).
    // A NON-complete checkpoint is a PRE-FINALIZE clean re-approval (Flow A / the C2/C6
    // scenario) and the core restores the manifest to 'applied' so the Step-3 checkbox
    // stays truthful. Read the status WITHOUT mutating (RETURNING `.length` type-checks
    // as unknown[] under `next build`, so use `.length` of the select).
    //
    // Whole-diff R3 MEDIUM: the reopen was previously HOISTED here (unconditionally set
    // 'in_progress' before the core ran). If the core then early-returned a non-healing
    // outcome (schema_missing / superseded / not_staged / hard_failed), the checkpoint
    // was left 'in_progress' with NOTHING healed, stranding the admin on a resume
    // surface with no processable row. Now we only DETECT here and PERFORM the reopen
    // after a healing outcome. The core still never touches wizard_finalize_checkpoints
    // (spec §4.2, invariant 2) — the reopen UPDATE lives here in the lock holder. The
    // finalize:<session> lock is held, so no concurrent finalize can change the status
    // between this select and the later update.
    const completeCheckpoint = await tx.unsafe(
      `select 1 as ok from public.wizard_finalize_checkpoints
        where wizard_session_id = $1::uuid
          and status in ('all_batches_complete', 'final_cas_done')`,
      [wizardSessionId],
    );
    const isBlockerHeal = completeCheckpoint.length > 0;

    // Capture prior state + restage + clean/dirty decision run in the lock-free shared core
    // (also reused by finalize's inline auto-heal under its already-held locks). The core reads
    // prior state ITSELF under the held show: lock (NOT from the stale pre-lock read) and never
    // touches app_settings / wizard_finalize_checkpoints / any advisory lock (spec §4.2).
    const outcome = await (deps.applyRescanDecisionUnderLock ?? applyRescanDecisionUnderLock)(tx, {
      wizardSessionId,
      driveFileId,
      pendingFolderId,
      prepared,
      refreshedParse,
      isBlockerHeal,
    });

    // Reopen a completed checkpoint ONLY on a healing outcome, so the next /finalize
    // re-processes the healed row. Non-reopenable outcomes leave it untouched.
    const reopenCompletedCheckpoint = async () => {
      if (!isBlockerHeal) return;
      await tx.unsafe(
        `update public.wizard_finalize_checkpoints
            set status = 'in_progress'
          where wizard_session_id = $1::uuid
            and status in ('all_batches_complete', 'final_cas_done')`,
        [wizardSessionId],
      );
    };

    switch (outcome.kind) {
      case "schema_missing":
      case "hard_failed":
      case "not_staged":
        return { status: "needs_attention", code: outcome.code };
      case "superseded":
        return { status: "superseded" };
      case "dirty_demoted":
        await reopenCompletedCheckpoint();
        return {
          status: "updated",
          needsReview: true,
          changed: outcome.changed,
          demoted: true,
          reviewCodes: outcome.reviewCodes,
        };
      case "clean_restamped":
        await reopenCompletedCheckpoint();
        return {
          status: "updated",
          needsReview: false,
          changed: outcome.changed,
          demoted: false,
          reviewCodes: [],
        };
      case "clean_unchecked":
        await reopenCompletedCheckpoint();
        return {
          status: "updated",
          needsReview: true,
          changed: outcome.changed,
          demoted: false,
          reviewCodes: [],
        };
    }
  });
}
