import postgres from "postgres";

import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import { prepareOnboardingFiles, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { STAGED_PARSE_SOURCE_OUT_OF_SCOPE } from "@/lib/sync/applyStaged";
import { applyRescanDecisionUnderLock } from "@/lib/onboarding/applyRescanDecisionUnderLock";

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

    // Re-openable checkpoint so the next /finalize re-processes the re-opened row.
    // A re-opened checkpoint (>=1 row) means a finalize batch ALREADY completed and this is a
    // BLOCKER HEAL (Flow B, e.g. a STAGED_PARSE_OUTDATED-blocked shadow): the manifest must stay
    // 'staged' so the sheet re-enters the batch (publish_intent preserved). When nothing re-opens,
    // this is a PRE-FINALIZE clean re-approval (Flow A / the C2/C6 scenario) and the core restores
    // the manifest to 'applied' so the Step-3 checkbox stays truthful. RETURNING makes the result a
    // per-updated-row array so `.length` is the re-opened count (tx.unsafe is typed unknown[], so a
    // bare `.count` does not type-check under `next build`). Reordered ahead of the core call (was
    // interleaved with the per-row heal): the checkpoint reopen touches only
    // wizard_finalize_checkpoints — a row set disjoint from everything the core writes — so its
    // position relative to the core is immaterial, and hoisting it keeps the lock-free core from
    // ever touching wizard_finalize_checkpoints (spec §4.2, invariant 2).
    const checkpointReopen = await tx.unsafe(
      `update public.wizard_finalize_checkpoints
          set status = 'in_progress'
        where wizard_session_id = $1::uuid
          and status in ('all_batches_complete', 'final_cas_done')
        returning wizard_session_id`,
      [wizardSessionId],
    );
    const isBlockerHeal = checkpointReopen.length > 0;

    // Capture prior state + restage + clean/dirty decision run in the lock-free shared core
    // (also reused by finalize's inline auto-heal under its already-held locks). The core reads
    // prior state ITSELF under the held show: lock (NOT from the stale pre-lock read) and never
    // touches app_settings / wizard_finalize_checkpoints / any advisory lock (spec §4.2).
    const outcome = await applyRescanDecisionUnderLock(tx, {
      wizardSessionId,
      driveFileId,
      pendingFolderId,
      prepared,
      refreshedParse,
      isBlockerHeal,
    });

    switch (outcome.kind) {
      case "schema_missing":
      case "hard_failed":
      case "not_staged":
        return { status: "needs_attention", code: outcome.code };
      case "superseded":
        return { status: "superseded" };
      case "dirty_demoted":
        return { status: "updated", needsReview: true, changed: outcome.changed, demoted: true };
      case "clean_restamped":
        return { status: "updated", needsReview: false, changed: outcome.changed, demoted: false };
      case "clean_unchecked":
        return { status: "updated", needsReview: true, changed: outcome.changed, demoted: false };
    }
  });
}
