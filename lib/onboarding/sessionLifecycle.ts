import { randomUUID as defaultRandomUUID } from "node:crypto";
import postgres from "postgres";

export type AppSettingsRow = {
  id: "default";
  watched_folder_id: string | null;
  watched_folder_name: string | null;
  watched_folder_set_by_email: string | null;
  watched_folder_set_at: string | null;
  active_signing_key_id: string;
  pending_folder_id: string | null;
  pending_folder_name: string | null;
  pending_folder_set_by_email: string | null;
  pending_folder_set_at: string | null;
  pending_wizard_session_id: string | null;
  pending_wizard_session_at: string | null;
  updated_at: string;
};

export type OnboardingSessionTx = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
};

export type OnboardingRotateResult =
  | {
      settings: AppSettingsRow;
      rotated: true;
    }
  | {
      settings: AppSettingsRow;
      rotated: false;
      suppressed: "WIZARD_FINALIZE_BATCHES_PENDING";
    };

export type PurgeAndRotateIfStaleResult =
  | { settings: AppSettingsRow; rotated: true }
  | {
      settings: AppSettingsRow;
      rotated: false;
      suppressed?: "WIZARD_FINALIZE_BATCHES_PENDING";
    };

export type CleanupAbandonedFinalizeResult = {
  status: "cleaned" | "already_cleaned";
  settings?: AppSettingsRow;
};

export class OnboardingSessionInfraError extends Error {
  readonly code = "ONBOARDING_SESSION_INFRA";

  constructor(message: string) {
    super(message);
    this.name = "OnboardingSessionInfraError";
  }
}

export class CleanupRequiresStaleSessionError extends Error {
  readonly code = "CLEANUP_REQUIRES_STALE_SESSION";
  readonly status = 409;

  constructor(
    readonly reason: "session_too_fresh" | "finalize_active_within_last_hour",
    readonly context: Record<string, unknown>,
  ) {
    super(`Cleanup requires a stale onboarding session: ${reason}`);
    this.name = "CleanupRequiresStaleSessionError";
  }
}

// R24-1/R27-1: thrown when the reap's locked-set recheck (or post-delete residue
// check) discovers a session row whose drive_file_id was not advisory-locked —
// the per-session transaction rolls back and the caller retries from a clean
// sorted lock set (bounded budget, then `skipped_unstable`). Acquiring the new
// id in-place while holding higher-sorted locks would be the AB-BA class
// against any alphabetical locker.
class ReapLockSetExpandedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReapLockSetExpandedError";
  }
}

export type SessionLifecycleDeps = {
  randomUUID?: () => string;
  withTx?: <R>(fn: (tx: OnboardingSessionTx) => Promise<R>) => Promise<R>;
  requireAdminIdentity?: () => Promise<{ email: string }>;
  suppressIfFinalizePending?: boolean;
};

type DriveFileIdRow = {
  drive_file_id: string;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("onboarding session lifecycle requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const rows = (await rawTx.unsafe(sql, [...params])) as T[];
      return { rows, rowCount: rows.length };
    },
  } satisfies OnboardingSessionTx;
}

async function defaultWithTx<R>(fn: (tx: OnboardingSessionTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(
        postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }),
      ),
    )) as R;
  } catch (error) {
    // Pass-through allowlist (R38-1): typed control-flow errors the CALLER
    // handles must escape un-wrapped. ReapLockSetExpandedError drives the
    // reap's bounded rollback-and-retry loop — wrapping it as infra would turn
    // every lock-set expansion into a route 500 instead of skipped_unstable.
    if (error instanceof CleanupRequiresStaleSessionError) throw error;
    if (error instanceof ReapLockSetExpandedError) throw error;
    throw new OnboardingSessionInfraError(
      `onboarding session transaction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: SessionLifecycleDeps) {
  return {
    randomUUID: deps.randomUUID ?? defaultRandomUUID,
    withTx: deps.withTx ?? defaultWithTx,
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
  };
}

const APP_SETTINGS_COLUMNS = `
  id,
  watched_folder_id,
  watched_folder_name,
  watched_folder_set_by_email,
  watched_folder_set_at,
  active_signing_key_id,
  pending_folder_id,
  pending_folder_name,
  pending_folder_set_by_email,
  pending_folder_set_at,
  pending_wizard_session_id,
  pending_wizard_session_at,
  updated_at
`;

async function purgeWizardRows(tx: OnboardingSessionTx): Promise<void> {
  await tx.query(`delete from public.pending_syncs where wizard_session_id is not null`);
  await tx.query(`delete from public.pending_ingestions where wizard_session_id is not null`);
  await tx.query(`delete from public.onboarding_scan_manifest`);
  await tx.query(`delete from public.deferred_ingestions where wizard_session_id is not null`);
}

// Thread 2a (spec §5.5 R9): the discard purge for cleanupAbandonedFinalize is
// SESSION-SCOPED — it deletes ONLY the session being discarded, never the global
// cross-session sweep purgeWizardRows performs. This makes "lock the active
// session's five-table union" (lockCleanupDriveFiles) both COMPLETE (covers
// every row the purge removes) and CORRECT (a stale NON-active session B's rows
// are left to reapStaleOnboardingSessions, which locks B's show: ids — cleanup
// no longer races the reap on another session's rows and orphans B's interim
// show). purgeAndRotateOnboardingSession / purgeAndRotateIfStale keep the global
// purgeWizardRows — they legitimately reset all wizard staging.
async function purgeWizardRowsForSession(
  tx: OnboardingSessionTx,
  sessionId: string,
  lockedDriveFileIds: readonly string[],
): Promise<void> {
  // Whole-diff R2 HIGH — every delete is constrained to the LOCKED drive-id set,
  // never wizard_session_id alone (mirrors reapOneSession R42-1). A stale-tab
  // scan/recovery committing a NEW-drive row for this session AFTER the reap-set
  // recheck must NOT be swept without holding show:<new_drive_id>; the post-delete
  // residue check in cleanupAbandonedFinalize then aborts if such a row appeared.
  // (drive_file_id is NOT NULL in all four tables' DDL, so no row escapes via NULL.)
  await tx.query(
    `delete from public.pending_syncs where wizard_session_id = $1::uuid and drive_file_id = any($2)`,
    [sessionId, lockedDriveFileIds],
  );
  await tx.query(
    `delete from public.pending_ingestions where wizard_session_id = $1::uuid and drive_file_id = any($2)`,
    [sessionId, lockedDriveFileIds],
  );
  await tx.query(
    `delete from public.onboarding_scan_manifest where wizard_session_id = $1::uuid and drive_file_id = any($2)`,
    [sessionId, lockedDriveFileIds],
  );
  await tx.query(
    `delete from public.deferred_ingestions where wizard_session_id = $1::uuid and drive_file_id = any($2)`,
    [sessionId, lockedDriveFileIds],
  );
}

// Thread 2a (spec §5.5 R7/R8): ADVISORY-BEFORE-ROW cleanup locking, mirroring the
// proven reap path. Collect the DISCARDED session's FULL drive-id union via the
// SAME five-table union collectReapDriveFileIds uses (PLAIN reads, NO FOR UPDATE
// anywhere — a FOR UPDATE before the show: advisory locks is AB-BA against every
// show:-first recovery route: staged Apply on 'staged' rows, Unapprove on
// 'applied' rows, discard, extract-agenda), then acquire every show: advisory
// lock in one globally-sorted acquisition. The old applied/shadow FOR UPDATE is
// removed. Returns the locked, sorted id set (caller currently ignores it).
async function lockCleanupDriveFiles(
  tx: OnboardingSessionTx,
  sessionId: string,
): Promise<string[]> {
  const driveFileIds = await collectReapDriveFileIds(tx, sessionId); // sorted, plain read
  for (const driveFileId of driveFileIds) {
    await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
  }
  return driveFileIds;
}

// Thread 2b (spec §5.1/§5.4): the provably-stuck predicate. Mirrors the route's
// countRemainingCleanRows (finalize/route.ts:423) — a row is FINISHABLE-clean iff
// its manifest is at a non-blocking status ('staged'|'applied') AND it is not a
// demoted-and-not-yet-reapplied failure (wizard_approved OR no failure code). When
// this count is 0, a further /finalize call would process nothing; combined with
// >0 unresolved rows that means the session can never finish on its own → stuck.
async function finishableCleanCount(tx: OnboardingSessionTx, sessionId: string): Promise<number> {
  const { rows } = await tx.query<{ finishable_count: number }>(
    `
      select count(*)::int as finishable_count
        from public.pending_syncs ps
        join public.onboarding_scan_manifest m
          on m.wizard_session_id = ps.wizard_session_id
         and m.drive_file_id = ps.drive_file_id
       where ps.wizard_session_id = $1::uuid
         and m.status in ('staged', 'applied')
         and (ps.wizard_approved = true or ps.last_finalize_failure_code is null)
    `,
    [sessionId],
  );
  return rows[0]?.finishable_count ?? 0;
}

// Thread 2b (spec §5.4/§5.5 step 3): the UNRESOLVED (blocking) drive_file_id set.
// Mirrors the route's unresolvedManifestCount (finalize/route.ts:344) predicate but
// returns the id set (not just a count) so the under-lock recheck can detect that a
// concurrent recovery route RESOLVED one of these rows while cleanup waited on the
// show: lock. Count = returned length. Blocking = a genuine error/conflict manifest
// status OR a demoted 'staged' row still carrying a finalize failure code.
async function unresolvedManifestDriveFileIds(
  tx: OnboardingSessionTx,
  sessionId: string,
): Promise<string[]> {
  const { rows } = await tx.query<DriveFileIdRow>(
    `
      select m.drive_file_id
        from public.onboarding_scan_manifest m
        left join public.pending_syncs ps
          on ps.wizard_session_id = m.wizard_session_id and ps.drive_file_id = m.drive_file_id
       where m.wizard_session_id = $1::uuid
         and (
           m.status in ('hard_failed', 'live_row_conflict', 'discard_retryable')
           or (m.status = 'staged' and ps.last_finalize_failure_code is not null)
         )
    `,
    [sessionId],
  );
  return rows.map((r) => r.drive_file_id);
}

export async function purgeAndRotateOnboardingSession(
  deps: SessionLifecycleDeps = {},
): Promise<OnboardingRotateResult> {
  const runtime = depsWithDefaults(deps);
  return await runtime.withTx(async (tx) => {
    if (deps.suppressIfFinalizePending) {
      const suppressed = await tx.query<{ one: number }>(
        `
          select 1 as one
            from public.app_settings a
            join public.wizard_finalize_checkpoints c
              on c.wizard_session_id = a.pending_wizard_session_id
           where a.id = 'default'
             and c.batches_completed > 0
             and c.status <> 'final_cas_done'
           limit 1
        `,
      );
      if (suppressed.rowCount > 0) {
        const { rows } = await tx.query<AppSettingsRow>(
          `select ${APP_SETTINGS_COLUMNS} from public.app_settings where id = 'default'`,
        );
        const settings = rows[0];
        if (!settings) {
          throw new OnboardingSessionInfraError("app_settings default row was not found");
        }
        await tx.query(
          `
            insert into public.sync_log (status, message, parse_warnings)
            values (
              $1,
              'onboarding re-run setup suppressed because finalize batches are pending',
              jsonb_build_array(jsonb_build_object('wizard_session_id', $2::uuid, 'source', 'rerun_setup_suppressed', 'code', $1))
            )
          `,
          ["WIZARD_FINALIZE_BATCHES_PENDING", settings.pending_wizard_session_id],
        );
        return { settings, rotated: false, suppressed: "WIZARD_FINALIZE_BATCHES_PENDING" };
      }
    }

    const newSessionId = runtime.randomUUID();
    const { rows } = await tx.query<AppSettingsRow>(
      `
        update public.app_settings
           set pending_wizard_session_id = $1::uuid,
               pending_wizard_session_at = now(),
               updated_at = now()
         where id = 'default'
         returning ${APP_SETTINGS_COLUMNS}
      `,
      [newSessionId],
    );
    const settings = rows[0];
    if (!settings) {
      throw new OnboardingSessionInfraError("app_settings default row was not found");
    }

    await purgeWizardRows(tx);
    return { settings, rotated: true };
  });
}

export async function purgeAndRotateIfStale(
  deps: SessionLifecycleDeps = {},
): Promise<PurgeAndRotateIfStaleResult> {
  const runtime = depsWithDefaults(deps);
  return await runtime.withTx(async (tx) => {
    const newSessionId = runtime.randomUUID();
    const rotated = await tx.query<AppSettingsRow>(
      `
        update public.app_settings
           set pending_wizard_session_id = $1::uuid,
               pending_wizard_session_at = now(),
               updated_at = now()
         where id = 'default'
           and pending_wizard_session_at is not null
           and pending_wizard_session_at < now() - interval '24 hours'
           and not exists (
             select 1
               from public.wizard_finalize_checkpoints c
              where c.wizard_session_id = app_settings.pending_wizard_session_id
                and c.batches_completed > 0
           )
         returning ${APP_SETTINGS_COLUMNS}
      `,
      [newSessionId],
    );

    if (rotated.rows[0]) {
      await purgeWizardRows(tx);
      return { settings: rotated.rows[0], rotated: true };
    }

    const { rows } = await tx.query<AppSettingsRow>(
      `select ${APP_SETTINGS_COLUMNS} from public.app_settings where id = 'default'`,
    );
    const settings = rows[0];
    if (!settings) {
      throw new OnboardingSessionInfraError("app_settings default row was not found");
    }

    const suppressed = await tx.query<{ one: number }>(
      `
        select 1 as one
          from public.app_settings a
          join public.wizard_finalize_checkpoints c
            on c.wizard_session_id = a.pending_wizard_session_id
         where a.id = 'default'
           and a.pending_wizard_session_at is not null
           and a.pending_wizard_session_at < now() - interval '24 hours'
           and c.batches_completed > 0
         limit 1
      `,
    );

    if (suppressed.rowCount > 0) {
      await tx.query(
        `
          insert into public.sync_log (status, message, parse_warnings)
          values (
            $1,
            'onboarding auto-rotate suppressed because finalize batches are pending',
            jsonb_build_array(jsonb_build_object('wizard_session_id', $2::uuid, 'code', $1))
          )
        `,
        ["WIZARD_FINALIZE_BATCHES_PENDING", settings.pending_wizard_session_id],
      );
      return { settings, rotated: false, suppressed: "WIZARD_FINALIZE_BATCHES_PENDING" };
    }

    return { settings, rotated: false };
  });
}

export async function cleanupAbandonedFinalize(
  sessionId: string,
  deps: SessionLifecycleDeps = {},
): Promise<CleanupAbandonedFinalizeResult> {
  const runtime = depsWithDefaults(deps);
  const admin = await runtime.requireAdminIdentity();

  return await runtime.withTx(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('finalize:' || $1))`, [sessionId]);

    // Own the app_settings row (for the rotation at the end) and read whether the
    // pending session is 24h-stale in ONE go — comparing `now()` in SQL, never JS,
    // avoids clock/timezone skew.
    const owner = await tx.query<AppSettingsRow & { is_stale: boolean }>(
      `
        select ${APP_SETTINGS_COLUMNS},
               (pending_wizard_session_at is not null
                and pending_wizard_session_at < now() - interval '24 hours') as is_stale
          from public.app_settings
         where id = 'default'
         for update
      `,
    );
    if (owner.rows[0]?.pending_wizard_session_id !== sessionId) {
      return { status: "already_cleaned" };
    }
    const isStale = owner.rows[0].is_stale === true;

    // Thread 2b (spec §5.1/§5.4): a session is PROVABLY STUCK when it has zero
    // finishable-clean rows AND at least one unresolved (blocking) row — a further
    // /finalize would process nothing yet finish stays blocked, so it can never
    // complete on its own. A stuck session may be discarded IMMEDIATELY, regardless
    // of the 24h age gate AND regardless of the 1-hour finalize-recency gate.
    const preLockUnresolvedIds = await unresolvedManifestDriveFileIds(tx, sessionId);
    const finishableCount = await finishableCleanCount(tx, sessionId);
    const stuck = finishableCount === 0 && preLockUnresolvedIds.length > 0;

    if (!stuck) {
      // Not stuck → the ordinary staleness contract applies.
      if (!isStale) {
        throw new CleanupRequiresStaleSessionError("session_too_fresh", {
          wizard_session_id: sessionId,
          pending_wizard_session_at: owner.rows[0].pending_wizard_session_at ?? null,
        });
      }
      // Stale-but-not-stuck: an actively-progressing finalize must still block a
      // discard. Stuck sessions bypass THIS gate too (spec §5.4).
      const recentFinalize = await tx.query<{ id: string }>(
        `
          select id
            from public.wizard_finalize_checkpoints
           where wizard_session_id = $1::uuid
             and status = 'in_progress'
             and last_processed_at is not null
             and last_processed_at > now() - interval '1 hour'
           for update
        `,
        [sessionId],
      );
      if (recentFinalize.rowCount > 0) {
        throw new CleanupRequiresStaleSessionError("finalize_active_within_last_hour", {
          wizard_session_id: sessionId,
        });
      }
    }

    const lockedReapIds = await lockCleanupDriveFiles(tx, sessionId);

    // Invariant 2 under-lock recheck (whole-diff R1 HIGH) — the reap LOCK-SET must
    // not have EXPANDED. purgeWizardRowsForSession issues SESSION-scoped deletes
    // across the five reap tables, so a row a concurrent scan/recovery INSERTed for
    // this session AFTER lockCleanupDriveFiles's initial collect (or while cleanup
    // waited on the show: locks) would be purged WITHOUT ever holding show:<new id>.
    // Acquiring that lock in-place now — while already holding higher-sorted show:
    // locks — is the exact AB-BA hazard lockReapDriveFiles throws to avoid, so we do
    // NOT lock-and-continue: we re-collect under the held locks and, if any id is not
    // already held, ABORT the discard (purge nothing). A newly-appearing row also
    // means the session is actively changing, so session_too_fresh is the correct
    // operator-facing signal (mirrors the resolved-recovery abort below).
    const heldReap = new Set(lockedReapIds);
    const recheckReap = await collectReapDriveFileIds(tx, sessionId);
    if (recheckReap.some((id) => !heldReap.has(id))) {
      throw new CleanupRequiresStaleSessionError("session_too_fresh", {
        wizard_session_id: sessionId,
        pending_wizard_session_at: owner.rows[0].pending_wizard_session_at ?? null,
      });
    }

    // Under-lock reads (spec §5.5 step 3) — one authoritative snapshot of the
    // session's blocking + finishable state, now that the show: locks serialize
    // every recovery/scan on this session's ids. Reused by both under-lock gates.
    const postUnresolvedIds = await unresolvedManifestDriveFileIds(tx, sessionId);
    const postFinishable = await finishableCleanCount(tx, sessionId);

    // Whole-diff R3 HIGH — re-evaluate the FULL eligibility ladder UNDER the locks.
    // The pre-lock stuck/stale/recency decision is only an early-out: a finishable
    // row that a concurrent scan/recovery committed BEFORE lockCleanupDriveFiles's
    // collect (so it is in the locked set and the R1 expansion guard does NOT fire)
    // can have flipped the session OUT of "stuck". A fresh, no-longer-stuck session
    // must be blocked, not discarded — so re-apply the same ladder against the
    // authoritative under-lock counts. isStale is stable here (app_settings row is
    // held FOR UPDATE since the owner read).
    const postStuck = postFinishable === 0 && postUnresolvedIds.length > 0;
    if (!postStuck) {
      if (!isStale) {
        throw new CleanupRequiresStaleSessionError("session_too_fresh", {
          wizard_session_id: sessionId,
          pending_wizard_session_at: owner.rows[0].pending_wizard_session_at ?? null,
        });
      }
      const recentFinalize = await tx.query<{ id: string }>(
        `
          select id
            from public.wizard_finalize_checkpoints
           where wizard_session_id = $1::uuid
             and status = 'in_progress'
             and last_processed_at is not null
             and last_processed_at > now() - interval '1 hour'
           for update
        `,
        [sessionId],
      );
      if (recentFinalize.rowCount > 0) {
        throw new CleanupRequiresStaleSessionError("finalize_active_within_last_hour", {
          wizard_session_id: sessionId,
        });
      }
    }

    // Under-lock recovery recheck (spec §5.5 step 3) — BOTH paths. A recovery route
    // (staged Apply / Unapprove) takes the row's show: advisory lock BEFORE mutating
    // its row; cleanup collects the same show: locks (advisory-before-row, Task 5)
    // and may have waited behind such a recovery. If ANY drive_file_id that was
    // unresolved pre-lock is now RESOLVED, the operator is actively recovering the
    // blocked sheet — abort the discard (purge nothing) rather than wipe their
    // in-flight recovery, even when the session is still technically stuck. Runs on
    // the stale path too, so a stuck-only recheck fails T10's stale×Apply cell.
    if (preLockUnresolvedIds.length > 0) {
      const postLockUnresolved = new Set(postUnresolvedIds);
      const recovered = preLockUnresolvedIds.filter((id) => !postLockUnresolved.has(id));
      if (recovered.length > 0) {
        throw new CleanupRequiresStaleSessionError("session_too_fresh", {
          wizard_session_id: sessionId,
          pending_wizard_session_at: owner.rows[0].pending_wizard_session_at ?? null,
          recovered_drive_file_ids: recovered,
        });
      }
    }

    // Whole-diff R2 HIGH — every drive-id-bearing delete below is constrained to
    // the LOCKED set (lockedReapIds), mirroring reapOneSession R42-1. Combined with
    // the post-delete residue check, this guarantees no row is deleted without
    // holding its show: lock even if a scan/recovery inserts a NEW-drive row for
    // this session mid-transaction (after the reap-set recheck above).
    await tx.query(
      `delete from public.shows_pending_changes where wizard_session_id = $1::uuid and drive_file_id = any($2)`,
      [sessionId, lockedReapIds],
    );
    // F4 Task 4.1 (spec §6 / R11-1): the first-seen interim-show delete is
    // PROVENANCE-keyed (created_show_id written by F1 Phase B in the same
    // per-row tx as the show INSERT), never the `published = false` proxy —
    // the existing-show shadow branch creates shadows regardless of published
    // (master spec line 2591 b), so the proxy deleted pre-existing
    // legitimately-unpublished shows approved into a shadow. R48-2: the
    // drive_file_id binding + R57-1 show-side wizard_created_session_id
    // discriminator defeat forged-provenance manifest rows. `published = false`
    // stays as a belt-and-suspenders guard (a session-created row that somehow
    // got published must never be deleted here).
    //
    // not-subject-to-revalidate (nav-perf tag-caching Task 9): this DELETE removes ONLY first-seen
    // INTERIM shows with `published = false`. The crew page gates on published=true
    // (getShowForViewer.ts:291), so an unpublished interim show has NO served data-cache entry —
    // deleting it cannot leave a stale rendered `show-${id}` tag, so no revalidate is needed.
    await tx.query(
      `
        delete from public.shows s
         using public.onboarding_scan_manifest m
         where m.wizard_session_id = $1::uuid
           and m.created_show_id = s.id
           and m.drive_file_id = s.drive_file_id
           and s.wizard_created_session_id = m.wizard_session_id
           and m.drive_file_id = any($2)
           and s.published = false
      `,
      [sessionId, lockedReapIds],
    );
    await purgeWizardRowsForSession(tx, sessionId, lockedReapIds);
    // wizard_finalize_checkpoints is per-SESSION (no drive_file_id), so it stays
    // session-scoped — matches reapOneSession's checkpoint delete.
    await tx.query(
      `delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
      [sessionId],
    );

    // Whole-diff R2 HIGH — post-delete residue check (mirrors reapOneSession
    // R42-1). The id-scoped deletes above removed only the locked set. If ANY
    // session-scoped row REMAINS in a drive-id-bearing reap table, a scan/recovery
    // inserted a NEW-drive row for this session mid-transaction (after the recheck)
    // — deleting it would violate invariant 2, so abort the whole discard (throw →
    // tx rollback, nothing committed) and let the admin retry with a fresh lock set.
    for (const table of REAP_DRIVE_ID_TABLES) {
      const residue = await tx.query(
        `select 1 from public.${table} where wizard_session_id = $1::uuid limit 1`,
        [sessionId],
      );
      if (residue.rowCount > 0) {
        throw new CleanupRequiresStaleSessionError("session_too_fresh", {
          wizard_session_id: sessionId,
          pending_wizard_session_at: owner.rows[0].pending_wizard_session_at ?? null,
        });
      }
    }
    await tx.query(
      `
        insert into public.sync_log (status, message, parse_warnings)
        values (
          'cleanup_abandoned_finalize',
          'abandoned onboarding finalize cleaned up by an admin',
          -- $2::text: bare $2 only appears inside jsonb_build_object, so postgres cannot infer
          -- its type — real-DB execution failed with "could not determine data type of parameter
          -- $2" (surfaced by tests/onboarding/finalizeCleanupOverlap.db.test.ts; fake-tx suites
          -- never execute the SQL).
          jsonb_build_array(jsonb_build_object('wizard_session_id', $1::uuid, 'admin_email', $2::text))
        )
      `,
      [sessionId, admin.email],
    );

    const newSessionId = runtime.randomUUID();
    const { rows } = await tx.query<AppSettingsRow>(
      `
        update public.app_settings
           set pending_wizard_session_id = $1::uuid,
               pending_wizard_session_at = now(),
               updated_at = now()
         where id = 'default'
         returning ${APP_SETTINGS_COLUMNS}
      `,
      [newSessionId],
    );
    const settings = rows[0];
    if (!settings) {
      throw new OnboardingSessionInfraError("app_settings default row was not found");
    }

    return { status: "cleaned", settings };
  });
}

// ---------------------------------------------------------------------------
// F4 — stale checkpoint / orphaned shadow reap (spec §6).
//
// A NEW, strictly session-scoped stale-debris reap — NOT a loop over
// cleanupAbandonedFinalize. The reap NEVER calls purgeWizardRows (whose deletes
// are cross-session and whose manifest truncate is unconditional) and NEVER
// touches app_settings beyond plain reads (no rotation, no row lock).
// ---------------------------------------------------------------------------

export type ReapedSession = {
  wizardSessionId: string;
  outcome:
    | "reaped_full"
    | "reaped_orphan_rows"
    | "skipped_active"
    | "skipped_recent_finalize"
    | "skipped_fresh_activity"
    | "skipped_no_residue"
    | "skipped_unstable"; // R27/R28: lock-set expanded on every retry (budget 3) — no deletes, no sync_log
};

export type ReapStaleSessionsResult = { sessions: ReapedSession[] };

const REAP_STAGING_TABLES = [
  "pending_syncs",
  "pending_ingestions",
  "deferred_ingestions",
  "onboarding_scan_manifest",
] as const;

const REAP_DRIVE_ID_TABLES = [
  "onboarding_scan_manifest",
  "shows_pending_changes",
  "pending_syncs",
  "pending_ingestions",
  "deferred_ingestions",
] as const;

async function readActiveSessionId(tx: OnboardingSessionTx): Promise<string | null> {
  // Plain read, deliberately NOT `for update` (spec §3.3 row "app_settings"):
  // taking the app_settings row lock here while later acquiring finalize/show
  // locks would add a third lock class against cleanupAbandonedFinalize's
  // finalize-lock → app_settings order for no benefit. A plain read is safe
  // because every rotation mints a fresh randomUUID() (purgeAndRotate*,
  // cleanup): a candidate stale session can never become the active session
  // again, and the reap's DELETEs are all wizard_session_id-scoped, so rows of
  // a newly-rotated session are structurally untouchable.
  const { rows } = await tx.query<{ pending_wizard_session_id: string | null }>(
    `select pending_wizard_session_id from public.app_settings where id = 'default'`,
  );
  return rows[0]?.pending_wizard_session_id ?? null;
}

async function collectReapDriveFileIds(
  tx: OnboardingSessionTx,
  sessionId: string,
): Promise<string[]> {
  // Union across ALL FIVE session-scoped surfaces (lockCleanupDriveFiles only
  // covers applied-manifest + shadows; spec §6 R5-1 requires pending_syncs,
  // pending_ingestions AND deferred_ingestions too — a stale session can hold
  // ONLY a deferred row, the F5 commit-window residue shape).
  //
  // PLAIN SELECT — deliberately NO row locks (R15 HIGH). Taking FOR UPDATE row
  // locks BEFORE the show: advisory locks inverts the order every
  // pending-ingestion action uses: withPostgresSyncPipelineLock takes the show
  // ADVISORY lock first (retry/route.ts), THEN readLockedPendingIngestion
  // row-locks. A concurrent stale-tab retry holding the advisory lock and
  // waiting on our row lock, while we hold the row lock and wait on its
  // advisory lock, is an AB-BA deadlock — the same advisory-before-row rule
  // the PF11 lock-order test pins for RPCs. The union is RE-COLLECTED under
  // the advisory locks (the re-check replaces the row-lock guarantee).
  const driveFileIds = new Set<string>();
  for (const table of REAP_DRIVE_ID_TABLES) {
    const { rows } = await tx.query<DriveFileIdRow>(
      `select drive_file_id from public.${table} where wizard_session_id = $1::uuid`,
      [sessionId],
    );
    for (const row of rows) driveFileIds.add(row.drive_file_id);
  }
  return [...driveFileIds].sort((a, b) => a.localeCompare(b));
}

async function lockReapDriveFiles(tx: OnboardingSessionTx, sessionId: string): Promise<string[]> {
  // R24-1/R27-1 algorithm: collect WITHOUT row locks → acquire ALL show locks
  // from ONE globally sorted list, exactly once → re-collect under the locks.
  // If the re-collection discovers ANY id not already held (regardless of sort
  // position), we must NOT acquire it in-place — acquiring while holding
  // higher-sorted locks is the AB-BA class against any alphabetical locker
  // (lockCleanupDriveFiles, F2's order-by loop). Instead throw; the caller
  // rolls back this session's transaction and retries the session from a clean
  // lock set (bounded retries, then `skipped_unstable` with zero deletes and
  // no sync_log row).
  const initial = await collectReapDriveFileIds(tx, sessionId); // already sorted
  for (const driveFileId of initial) {
    await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
  }
  const recheck = await collectReapDriveFileIds(tx, sessionId);
  const held = new Set(initial);
  if (recheck.some((id) => !held.has(id))) {
    throw new ReapLockSetExpandedError(`reap lock set expanded for session ${sessionId}`);
  }
  // R43-1: the LOCKED set — every drive-id-bearing DELETE + the residue check
  // below are bound to exactly this array.
  return initial;
}

async function reapOneSession(
  tx: OnboardingSessionTx,
  sessionId: string,
  adminEmail: string,
): Promise<ReapedSession> {
  // (1) Session lifecycle lock FIRST — same lock finalize Phase B and
  //     cleanupAbandonedFinalize take, same layer (JS-side SQL), single holder.
  await tx.query(`select pg_advisory_xact_lock(hashtext('finalize:' || $1))`, [sessionId]);

  // (2) Re-check eligibility UNDER the lock (spec §6 R3-1/R5-1/R12-1).
  if ((await readActiveSessionId(tx)) === sessionId) {
    return { wizardSessionId: sessionId, outcome: "skipped_active" };
  }
  // Deliberately NO `for update` on this read (deviation from cleanup's
  // sibling check): under the finalize advisory lock no finalize worker can
  // advance this session's checkpoint concurrently, and a reap-side row lock
  // before the show: advisory locks would be a row-before-advisory ordering
  // (R15 class). The 24h activity guard below subsumes this 1-hour guard; it
  // is kept because spec §6 names it explicitly.
  const recent = await tx.query<{ id: string }>(
    `
      select id
        from public.wizard_finalize_checkpoints
       where wizard_session_id = $1::uuid
         and status = 'in_progress'
         and last_processed_at is not null
         and last_processed_at > now() - interval '1 hour'
    `,
    [sessionId],
  );
  if (recent.rowCount > 0) {
    return { wizardSessionId: sessionId, outcome: "skipped_recent_finalize" };
  }
  // (2b) Freshness re-check UNDER the lock (R1 HIGH): a just-rotated
  //      non-active session is NOT stale. Eligible only if the session's
  //      most-recent activity across every session-scoped surface is older
  //      than 24 hours (cleanup's staleness convention). NULL activity max
  //      (no timestamped rows anywhere; wizard_finalize_checkpoints has no
  //      timestamp column other than last_processed_at) ⇒ nothing to preserve
  //      ⇒ stale: coalesce(... , true).
  const freshness = await tx.query<{ stale: boolean }>(
    `
      select coalesce(greatest(
        (select max(last_processed_at) from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid),
        (select max(staged_at) from public.shows_pending_changes where wizard_session_id = $1::uuid),
        (select greatest(max(parsed_at), max(wizard_approved_at)) from public.pending_syncs where wizard_session_id = $1::uuid),
        (select greatest(max(observed_at), max(transitioned_at)) from public.onboarding_scan_manifest where wizard_session_id = $1::uuid),
        (select greatest(max(first_seen_at), max(last_attempt_at)) from public.pending_ingestions where wizard_session_id = $1::uuid),
        (select max(deferred_at) from public.deferred_ingestions where wizard_session_id = $1::uuid)
      ) < now() - interval '24 hours', true) as stale
    `,
    [sessionId],
  );
  if (!freshness.rows[0]?.stale) {
    return { wizardSessionId: sessionId, outcome: "skipped_fresh_activity" };
  }

  // (3) Per-show advisory locks for every affected drive_file_id, single
  //     globally-sorted acquisition (R24-1).
  const lockedDriveFileIds = await lockReapDriveFiles(tx, sessionId);

  // (4) Terminal sessions (final_cas_done) get the orphan-row sweep ONLY
  //     (spec §6 R5-2): staging tables are reapable, but the terminal
  //     checkpoint row and any retained CAS-failure shadows are
  //     operator-recovery surface and stay.
  const checkpoint = await tx.query<{ status: string }>(
    `select status from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
    [sessionId],
  );
  const terminal = checkpoint.rows.some((row) => row.status === "final_cas_done");

  // (5) Deletes, COUNTED. Terminal-session idempotency (R4 HIGH): a
  //     final_cas_done session's checkpoint + retained CAS-failure shadows are
  //     PRESERVED surfaces, so a completed session with nothing else would
  //     otherwise stay a candidate forever — every reap run would re-"reap"
  //     it, inflate the success count, and spam sync_log while deleting
  //     nothing. Every DELETE therefore carries `returning 1 as deleted` (the
  //     postgres tx adapter derives rowCount from returned rows — a bare
  //     DELETE reports 0), counts are summed, and a zero-delete run exits as
  //     skipped_no_residue with NO sync_log row.
  let deleted = 0;
  if (!terminal) {
    // First-seen interim rows: provenance-keyed (created_show_id + drive
    // binding + show-side discriminator + locked-set membership), NEVER the
    // published=false proxy (R11-1/R48-2/R49-1/R57-1).
    //
    // not-subject-to-revalidate (nav-perf tag-caching Task 9): same as the abandon-cleanup DELETE
    // above — removes ONLY `published = false` interim shows, which have no served crew data-cache
    // entry (getShowForViewer gates on published=true), so there is no `show-${id}` tag to bust.
    deleted += (
      await tx.query(
        `
          delete from public.shows s
           using public.onboarding_scan_manifest m
           where m.wizard_session_id = $1::uuid
             and m.created_show_id = s.id
             and m.drive_file_id = s.drive_file_id
             and s.wizard_created_session_id = m.wizard_session_id
             and m.drive_file_id = any($2)
             and s.published = false
          returning 1 as deleted
        `,
        [sessionId, lockedDriveFileIds],
      )
    ).rowCount;
    deleted += (
      await tx.query(
        `delete from public.shows_pending_changes where wizard_session_id = $1::uuid and drive_file_id = any($2) returning 1 as deleted`,
        [sessionId, lockedDriveFileIds],
      )
    ).rowCount;
    deleted += (
      await tx.query(
        `delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid returning 1 as deleted`,
        [sessionId],
      )
    ).rowCount;
  }
  for (const table of REAP_STAGING_TABLES) {
    // R42-1: deletes are constrained to the LOCKED drive-id set, never
    // wizard_session_id alone — a stale-tab action committing a NEW-drive row
    // after the recheck must not be swept without holding show:<new_drive_id>.
    // (drive_file_id is NOT NULL in all four tables' DDL, so no row escapes
    // the lock contract via NULL.)
    deleted += (
      await tx.query(
        `delete from public.${table} where wizard_session_id = $1::uuid and drive_file_id = any($2) returning 1 as deleted`,
        [sessionId, lockedDriveFileIds],
      )
    ).rowCount;
  }
  // R42-1: post-delete residue check — if any session-scoped row remains in a
  // swept table (i.e., a row outside the locked set appeared mid-transaction),
  // throw ReapLockSetExpandedError so the bounded retry re-runs the session
  // with a fresh lock set (or skipped_unstable).
  // R45-1: the residue surface depends on session state — TERMINAL
  // (final_cas_done) sessions intentionally PRESERVE their checkpoint +
  // shows_pending_changes shadows (operator recovery), so scanning shadows
  // there would false-positive every terminal reap into skipped_unstable and
  // roll back the deferral sweep F5 depends on. Non-terminal sessions include
  // shadows.
  const residueTables: readonly string[] = terminal
    ? REAP_STAGING_TABLES
    : [...REAP_STAGING_TABLES, "shows_pending_changes"];
  for (const table of residueTables) {
    const residue = await tx.query(
      `select 1 from public.${table} where wizard_session_id = $1::uuid limit 1`,
      [sessionId],
    );
    if (residue.rowCount > 0) {
      throw new ReapLockSetExpandedError(`post-delete residue in ${table}`);
    }
  }
  if (deleted === 0) {
    // Nothing but preserved surfaces (terminal checkpoint / retained shadows):
    // not a reap.
    return { wizardSessionId: sessionId, outcome: "skipped_no_residue" };
  }
  await tx.query(
    `
      insert into public.sync_log (status, message, parse_warnings)
      values (
        'reap_stale_session',
        'stale onboarding session debris reaped by an admin',
        -- $2::text/$3::int: bare params only appear inside jsonb_build_object,
        -- so postgres cannot infer their types (same class as the cleanup
        -- sync_log insert; fake-tx suites never execute the SQL).
        jsonb_build_array(jsonb_build_object('wizard_session_id', $1::uuid, 'admin_email', $2::text, 'deleted_rows', $3::int))
      )
    `,
    [sessionId, adminEmail, deleted],
  );
  return { wizardSessionId: sessionId, outcome: terminal ? "reaped_orphan_rows" : "reaped_full" };
}

export async function reapStaleOnboardingSessions(
  deps: SessionLifecycleDeps = {},
): Promise<ReapStaleSessionsResult> {
  const runtime = depsWithDefaults(deps);
  const admin = await runtime.requireAdminIdentity();

  // STEP 1 — read-only candidate enumeration in its OWN transaction. Takes no
  // locks; every candidate is fully re-validated under its session's finalize
  // lock in step 2.
  const candidates = await runtime.withTx(async (tx) => {
    const { rows } = await tx.query<{ wizard_session_id: string }>(
      `
        select distinct wizard_session_id from (
          select wizard_session_id from public.wizard_finalize_checkpoints
          union all select wizard_session_id from public.onboarding_scan_manifest
          union all select wizard_session_id from public.shows_pending_changes
          union all select wizard_session_id from public.pending_syncs
          union all select wizard_session_id from public.pending_ingestions
          union all select wizard_session_id from public.deferred_ingestions
        ) candidate_sessions
        where wizard_session_id is not null
          and wizard_session_id is distinct from (
            select pending_wizard_session_id from public.app_settings where id = 'default'
          )
        order by wizard_session_id
      `,
    );
    return rows;
  });

  // STEP 2 — ONE TRANSACTION PER SESSION (R5 HIGH — deadlock prevention, NOT
  // an optimization). A single outer tx would still hold session A's show:
  // locks while requesting session B's finalize: lock (show→finalize). A
  // concurrent cleanupAbandonedFinalize(B) holds finalize:B and then waits on
  // an overlapping show: lock (finalize→show) — classic AB-BA. Committing per
  // session releases ALL advisory locks (pg_advisory_XACT_lock) before the
  // next session's finalize lock is requested, so the only ordering any
  // concurrent holder ever observes is cleanup's own finalize→show. Trade-off:
  // the reap is no longer all-or-nothing across sessions — a failure mid-list
  // leaves earlier sessions reaped (each internally atomic), mirroring Phase
  // D's ratified per-row independence.
  const sessions: ReapedSession[] = [];
  for (const candidate of candidates) {
    // R28-1: bounded rollback-and-retry OUTSIDE the per-session transaction. A
    // ReapLockSetExpandedError aborts that session's tx (locks released); we
    // retry from a clean sorted lock set; budget exhausted → skipped_unstable
    // (no deletes, no sync_log). R38-1: defaultWithTx passes
    // ReapLockSetExpandedError through un-wrapped (see its allowlist) — without
    // that, the loop below never sees it and the route would 500
    // REAP_STALE_SESSIONS_FAILED instead of returning skipped_unstable.
    let outcome: ReapedSession | null = null;
    for (let attempt = 0; attempt < 3 && outcome === null; attempt++) {
      try {
        outcome = await runtime.withTx((tx) =>
          reapOneSession(tx, candidate.wizard_session_id, admin.email),
        );
      } catch (error) {
        if (!(error instanceof ReapLockSetExpandedError)) throw error;
      }
    }
    sessions.push(
      outcome ?? { wizardSessionId: candidate.wizard_session_id, outcome: "skipped_unstable" },
    );
  }
  // R29-2: skipped_unstable MUST be visible to the admin caller — silently
  // dropping it lets an operator believe the sweep completed while debris
  // remains. Return reaped + skipped_unstable; the quiet skips
  // (active/fresh/recent/no_residue) stay filtered (intentional, covered by
  // tests).
  return {
    sessions: sessions.filter(
      (s) => s.outcome.startsWith("reaped") || s.outcome === "skipped_unstable",
    ),
  };
}
