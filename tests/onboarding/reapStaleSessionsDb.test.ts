/**
 * F4 Task 4.4 — REAL-Postgres integration for reapStaleOnboardingSessions.
 *
 * Covers (plan 04-f4 Task 4.4):
 *  - preservation matrix: active session A, stale session B (full debris),
 *    deferred-only session C, FRESH non-active session D (rotated minutes ago,
 *    checkpoint last_processed_at NULL), pre-existing published=false shows,
 *    forged/mismatched provenance (R57-1/R67-1);
 *  - two-run idempotency for a terminal final_cas_done session E (R4 HIGH);
 *  - concurrent cleanupAbandonedFinalize overlap (R5 HIGH) — per-session tx
 *    boundary means no 40P01;
 *  - retry-route overlap (R15 HIGH) — plain-SELECT collection + advisory-first
 *    ordering means no AB-BA with a held pipeline lock + FOR UPDATE row lock;
 *  - R42-1(a)/R38-1 late-row race through the REAL defaultWithTx: lock-set
 *    expansion retries from a fresh sorted set (pass-through allowlist), and
 *    persistent expansion exhausts the budget → skipped_unstable with zero
 *    deletes and no sync_log.
 *
 * DB-connection convention (plan R13/R19-1): LOCAL-ONLY; BOTH env vars pinned
 * to the assertLocalDbUrl-validated loopback URL (originals restored).
 */
import { afterAll, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";
import {
  cleanupAbandonedFinalize,
  reapStaleOnboardingSessions,
  type ReapedSession,
} from "@/lib/onboarding/sessionLifecycle";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

// Sorted: A < B < C < D < E < F < G < H < R < U (hex order).
const A = "f4aaaaaa-0000-4000-8000-f4f4f4f4f4f4"; // active
const B = "f4bbbbbb-0000-4000-8000-f4f4f4f4f4f4"; // stale, full debris
const C = "f4cccccc-0000-4000-8000-f4f4f4f4f4f4"; // stale, deferred-only
const D = "f4dddddd-0000-4000-8000-f4f4f4f4f4f4"; // FRESH non-active
const E = "f4eeeeee-0000-4000-8000-f4f4f4f4f4f4"; // terminal final_cas_done
const F = "f4ffffff-0001-4000-8000-f4f4f4f4f4f4"; // active+stale (cleanup overlap)
const G = "f4ffffff-0002-4000-8000-f4f4f4f4f4f4"; // stale, shares a drive id with F
const H = "f4ffffff-0003-4000-8000-f4f4f4f4f4f4"; // stale (retry-route overlap)
const R = "f4ffffff-0004-4000-8000-f4f4f4f4f4f4"; // stale (expansion retry)
const U = "f4ffffff-0005-4000-8000-f4f4f4f4f4f4"; // stale (skipped_unstable)
const FIXTURE_SESSIONS = [A, B, C, D, E, F, G, H, R, U];
const FIXTURE_DRIVE_PREFIX = "f4-reap-";
const ADMIN = { email: "admin@example.com" };
const BACK = "now() - interval '25 hours'";

let sql: ReturnType<typeof postgres> | null = null;
let driver: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let originalSettings: {
  pending_wizard_session_id: string | null;
  pending_wizard_session_at: string | null;
} | null = null;
try {
  const probe = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  const rows = (await probe.unsafe(
    `select pending_wizard_session_id, pending_wizard_session_at::text as pending_wizard_session_at
       from public.app_settings where id = 'default'`,
    [],
  )) as Array<{
    pending_wizard_session_id: string | null;
    pending_wizard_session_at: string | null;
  }>;
  originalSettings = rows[0] ?? {
    pending_wizard_session_id: null,
    pending_wizard_session_at: null,
  };
  sql = probe;
  // Dedicated single-connection driver for SESSION-scoped advisory locks
  // (pg_advisory_lock/unlock) used by the lock-dance tests. Same lock space as
  // the reap's pg_advisory_xact_lock.
  driver = postgres(DB_URL, { max: 1, idle_timeout: 30, connect_timeout: 3, prepare: false });
  dbUp = true;
} catch {
  if (sql) await sql.end().catch(() => {});
  sql = null;
  driver = null;
  dbUp = false;
}

async function cleanupFixtures(): Promise<void> {
  const db = sql!;
  for (const table of [
    "shows_pending_changes",
    "wizard_finalize_checkpoints",
    "onboarding_scan_manifest",
    "pending_syncs",
    "pending_ingestions",
    "deferred_ingestions",
  ]) {
    await db.unsafe(`delete from public.${table} where wizard_session_id = any($1::uuid[])`, [
      FIXTURE_SESSIONS,
    ]);
  }
  await db.unsafe(`delete from public.shows where drive_file_id like $1`, [
    `${FIXTURE_DRIVE_PREFIX}%`,
  ]);
  for (const session of FIXTURE_SESSIONS) {
    await db.unsafe(
      `delete from public.sync_log
        where status in ('reap_stale_session', 'cleanup_abandoned_finalize')
          and parse_warnings @> $1::jsonb`,
      // postgres.js serializes a $N::jsonb param itself — pass the raw value
      // via sql.json, never JSON.stringify (double-encode → jsonb string scalar).
      [db.json([{ wizard_session_id: session }] as never) as never],
    );
  }
}

afterAll(async () => {
  if (sql && dbUp && originalSettings) {
    await cleanupFixtures().catch(() => {});
    await sql
      .unsafe(
        `update public.app_settings
            set pending_wizard_session_id = $1::uuid,
                pending_wizard_session_at = $2::timestamptz
          where id = 'default'`,
        [originalSettings.pending_wizard_session_id, originalSettings.pending_wizard_session_at],
      )
      .catch(() => {});
  }
  if (sql) await sql.end().catch(() => {});
  if (driver) await driver.end().catch(() => {});
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
});

function fixtureSessions(result: { sessions: ReapedSession[] }): ReapedSession[] {
  // The local dev DB may hold foreign stale debris from other suites; scope
  // assertions to this suite's sessions.
  return result.sessions.filter((s) => FIXTURE_SESSIONS.includes(s.wizardSessionId));
}

async function setActiveSession(sessionId: string | null, backdated: boolean): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = ${backdated ? BACK : "now()"}
      where id = 'default'`,
    [sessionId],
  );
}

async function insertShow(input: {
  driveFileId: string;
  slug: string;
  createdBy?: string | null;
}): Promise<string> {
  const rows = (await sql!.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version, wizard_created_session_id)
     values ($1, 'F4 reap fixture', $2, false, 'Fixture Client', 'v2', $3::uuid)
     returning id`,
    [input.driveFileId, input.slug, input.createdBy ?? null],
  )) as Array<{ id: string }>;
  return rows[0]!.id;
}

async function insertManifest(input: {
  session: string;
  driveFileId: string;
  createdShowId?: string | null;
  backdated: boolean;
  status?: string;
}): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (wizard_session_id, drive_file_id, folder_id, name, mime_type, status, created_show_id, observed_at, transitioned_at)
     values ($1::uuid, $2, 'f4-reap-folder', $2, 'application/vnd.google-apps.spreadsheet', $3, $4::uuid,
             ${input.backdated ? `${BACK}, ${BACK}` : "now(), now()"})`,
    [input.session, input.driveFileId, input.status ?? "applied", input.createdShowId ?? null],
  );
}

async function insertPendingSync(input: {
  session: string;
  driveFileId: string;
  backdated: boolean;
}): Promise<void> {
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, staged_modified_time, parse_result, source_kind, warning_summary, wizard_session_id, parsed_at)
     values ($1, '2026-06-01T00:00:00.000Z'::timestamptz, '{}'::jsonb, 'onboarding_scan', '', $2::uuid,
             ${input.backdated ? BACK : "now()"})`,
    [input.driveFileId, input.session],
  );
}

async function insertPendingIngestion(input: {
  session: string;
  driveFileId: string;
  backdated: boolean;
}): Promise<void> {
  await sql!.unsafe(
    `insert into public.pending_ingestions
       (drive_file_id, drive_file_name, last_error_code, last_error_message, wizard_session_id, first_seen_at, last_attempt_at)
     values ($1, $1, 'MI_1_MISSING_REQUIRED_TAB', 'f4 reap fixture', $2::uuid,
             ${input.backdated ? `${BACK}, ${BACK}` : "now(), now()"})`,
    [input.driveFileId, input.session],
  );
}

async function insertDeferral(input: {
  session: string;
  driveFileId: string;
  backdated: boolean;
}): Promise<void> {
  await sql!.unsafe(
    `insert into public.deferred_ingestions
       (drive_file_id, wizard_session_id, deferred_kind, deferred_at)
     values ($1, $2::uuid, 'defer_until_modified', ${input.backdated ? BACK : "now()"})`,
    [input.driveFileId, input.session],
  );
}

async function insertShadow(input: {
  session: string;
  driveFileId: string;
  showId: string;
  backdated: boolean;
}): Promise<void> {
  await sql!.unsafe(
    `insert into public.shows_pending_changes
       (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent, staged_at)
     values ($1::uuid, $2, $3::uuid, '{}'::jsonb, 'admin@example.com', ${input.backdated ? BACK : "now()"}, ${input.backdated ? BACK : "now()"})`,
    [input.session, input.driveFileId, input.showId],
  );
}

async function insertCheckpoint(input: {
  session: string;
  status: "in_progress" | "all_batches_complete" | "final_cas_done";
  lastProcessedAt: "backdated" | "null";
}): Promise<void> {
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints
       (wizard_session_id, status, batches_completed, last_processed_at)
     values ($1::uuid, $2, 1, ${input.lastProcessedAt === "backdated" ? BACK : "null"})`,
    [input.session, input.status],
  );
}

async function sessionRows(table: string, session: string): Promise<number> {
  const rows = (await sql!.unsafe(
    `select count(*)::int as n from public.${table} where wizard_session_id = $1::uuid`,
    [session],
  )) as Array<{ n: number }>;
  return rows[0]!.n;
}

async function reapSyncLogCount(session: string): Promise<number> {
  const rows = (await sql!.unsafe(
    `select count(*)::int as n from public.sync_log
      where status = 'reap_stale_session' and parse_warnings @> $1::jsonb`,
    // Raw value via sql.json — JSON.stringify double-encodes (postgres.js).
    [sql!.json([{ wizard_session_id: session }] as never) as never],
  )) as Array<{ n: number }>;
  return rows[0]!.n;
}

async function showExists(id: string): Promise<boolean> {
  const rows = (await sql!.unsafe(`select 1 from public.shows where id = $1::uuid`, [
    id,
  ])) as Array<unknown>;
  return rows.length === 1;
}

// --- lock-dance helpers (R42-1/R38-1) ------------------------------------

async function waitFor(cond: () => Promise<boolean>, label: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function advisoryWaitersOn(driveFileId: string): Promise<number> {
  // pg_advisory_xact_lock(hashtext(...)) takes the ONE-ARG bigint form:
  // pg_locks stores objid = the key's low 32 bits.
  const rows = (await sql!.unsafe(
    `select count(*)::int as n
       from pg_locks
      where locktype = 'advisory'
        and not granted
        and objid = ((hashtext('show:' || $1)::bigint) & 4294967295)::oid`,
    [driveFileId],
  )) as Array<{ n: number }>;
  return rows[0]!.n;
}

async function driverLock(driveFileId: string): Promise<void> {
  await driver!.unsafe(`select pg_advisory_lock(hashtext('show:' || $1))`, [driveFileId]);
}

async function driverUnlock(driveFileId: string): Promise<void> {
  await driver!.unsafe(`select pg_advisory_unlock(hashtext('show:' || $1))`, [driveFileId]);
}

// ---------------------------------------------------------------------------

test.skipIf(!dbUp)(
  "preservation matrix: B+C reaped in full, A (active) + D (fresh non-active) + pre-existing/forged/mismatched shows survive, sync_log per reaped session",
  { timeout: 30000 },
  async () => {
    await cleanupFixtures();
    await setActiveSession(A, false);

    // A — active session staging (DEFAULT timestamps).
    await insertManifest({
      session: A,
      driveFileId: "f4-reap-a-m1",
      createdShowId: null,
      backdated: false,
      status: "staged",
    });
    await insertPendingSync({ session: A, driveFileId: "f4-reap-a-p1", backdated: false });

    // Pre-existing published=false shows (no wizard provenance).
    const preExistingId = await insertShow({ driveFileId: "f4-reap-b-pre", slug: "f4-reap-pre" });
    const forgedTargetId = await insertShow({
      driveFileId: "f4-reap-b-forged",
      slug: "f4-reap-forged",
    });
    // Interim show created by ANOTHER session (D) — mismatched discriminator.
    const xsessInterimId = await insertShow({
      driveFileId: "f4-reap-b-xsess",
      slug: "f4-reap-xsess",
      createdBy: D,
    });
    // B's genuinely session-created interim show.
    const interimId = await insertShow({
      driveFileId: "f4-reap-b-interim",
      slug: "f4-reap-interim",
      createdBy: B,
    });

    // B — stale session, every activity column backdated past 24h.
    await insertCheckpoint({ session: B, status: "in_progress", lastProcessedAt: "backdated" });
    await insertManifest({
      session: B,
      driveFileId: "f4-reap-b-interim",
      createdShowId: interimId,
      backdated: true,
    });
    await insertManifest({
      session: B,
      driveFileId: "f4-reap-b-pre",
      createdShowId: null,
      backdated: true,
    });
    // R67-1 forged provenance: created_show_id points at a pre-existing show
    // with a MATCHING drive id but NULL wizard_created_session_id.
    await insertManifest({
      session: B,
      driveFileId: "f4-reap-b-forged",
      createdShowId: forgedTargetId,
      backdated: true,
    });
    // R57-1 mismatched discriminator: created_show_id points at ANOTHER
    // session's interim show.
    await insertManifest({
      session: B,
      driveFileId: "f4-reap-b-xsess",
      createdShowId: xsessInterimId,
      backdated: true,
    });
    await insertShadow({
      session: B,
      driveFileId: "f4-reap-b-pre",
      showId: preExistingId,
      backdated: true,
    });
    await insertPendingSync({ session: B, driveFileId: "f4-reap-b-p1", backdated: true });
    await insertPendingIngestion({ session: B, driveFileId: "f4-reap-b-i1", backdated: true });
    await insertDeferral({ session: B, driveFileId: "f4-reap-b-d1", backdated: true });

    // C — stale, ONLY a deferred_ingestions row (the F5 commit-window residue shape).
    await insertDeferral({ session: C, driveFileId: "f4-reap-c-d1", backdated: true });

    // D — FRESH non-active (rotated minutes ago): checkpoint last_processed_at
    // NULL, staging rows at DEFAULT now() timestamps.
    await insertCheckpoint({ session: D, status: "in_progress", lastProcessedAt: "null" });
    await insertManifest({
      session: D,
      driveFileId: "f4-reap-d-m1",
      createdShowId: null,
      backdated: false,
      status: "staged",
    });
    await insertPendingSync({ session: D, driveFileId: "f4-reap-d-p1", backdated: false });
    await insertShadow({
      session: D,
      driveFileId: "f4-reap-d-s1",
      showId: preExistingId,
      backdated: false,
    });

    const result = await reapStaleOnboardingSessions({
      requireAdminIdentity: async () => ADMIN,
    });

    // Result lists B and C (sorted) and does NOT list A or D.
    expect(fixtureSessions(result)).toEqual([
      { wizardSessionId: B, outcome: "reaped_full" },
      { wizardSessionId: C, outcome: "reaped_full" },
    ]);

    // Every B/C-scoped row across all six tables is gone.
    for (const table of [
      "wizard_finalize_checkpoints",
      "onboarding_scan_manifest",
      "shows_pending_changes",
      "pending_syncs",
      "pending_ingestions",
      "deferred_ingestions",
    ]) {
      expect(await sessionRows(table, B), `${table}: B rows must be gone`).toBe(0);
      expect(await sessionRows(table, C), `${table}: C rows must be gone`).toBe(0);
    }
    // B's interim show is gone; the pre-existing, forged-target, and
    // mismatched-provenance shows survive (concrete failure mode: the
    // published=false proxy — or provenance without the drive binding +
    // discriminator — deletes them).
    expect(await showExists(interimId)).toBe(false);
    expect(await showExists(preExistingId)).toBe(true);
    expect(await showExists(forgedTargetId)).toBe(true);
    expect(await showExists(xsessInterimId)).toBe(true);

    // EVERY A-scoped row and EVERY D-scoped row (incl. D's checkpoint) survive.
    // Concrete failure mode: without the 24h activity guard, D — non-active,
    // no recent last_processed_at — is reaped and a newly-superseded session's
    // staging is destroyed.
    expect(await sessionRows("onboarding_scan_manifest", A)).toBe(1);
    expect(await sessionRows("pending_syncs", A)).toBe(1);
    expect(await sessionRows("wizard_finalize_checkpoints", D)).toBe(1);
    expect(await sessionRows("onboarding_scan_manifest", D)).toBe(1);
    expect(await sessionRows("pending_syncs", D)).toBe(1);
    expect(await sessionRows("shows_pending_changes", D)).toBe(1);

    // A reap_stale_session sync_log row exists per reaped session, none for A/D.
    expect(await reapSyncLogCount(B)).toBe(1);
    expect(await reapSyncLogCount(C)).toBe(1);
    expect(await reapSyncLogCount(A)).toBe(0);
    expect(await reapSyncLogCount(D)).toBe(0);
  },
);

test.skipIf(!dbUp)(
  "two-run idempotency (R4 HIGH): run 1 sweeps terminal session E's residue; run 2 reaps nothing, leaves preserved rows byte-identical, adds zero sync_log rows",
  { timeout: 30000 },
  async () => {
    await cleanupFixtures();
    await setActiveSession(A, false);
    const anchorShowId = await insertShow({
      driveFileId: "f4-reap-e-anchor",
      slug: "f4-reap-e-anchor",
    });
    await insertCheckpoint({ session: E, status: "final_cas_done", lastProcessedAt: "backdated" });
    await insertShadow({
      session: E,
      driveFileId: "f4-reap-e-s1",
      showId: anchorShowId,
      backdated: true,
    });
    await insertDeferral({ session: E, driveFileId: "f4-reap-e-d1", backdated: true });

    const run1 = await reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN });
    expect(fixtureSessions(run1)).toEqual([{ wizardSessionId: E, outcome: "reaped_orphan_rows" }]);
    expect(await sessionRows("deferred_ingestions", E)).toBe(0);
    expect(await sessionRows("wizard_finalize_checkpoints", E)).toBe(1);
    expect(await sessionRows("shows_pending_changes", E)).toBe(1);
    expect(await reapSyncLogCount(E)).toBe(1);

    const preservedBefore = (await sql!.unsafe(
      `select c.*, s.* from public.wizard_finalize_checkpoints c
         join public.shows_pending_changes s on s.wizard_session_id = c.wizard_session_id
        where c.wizard_session_id = $1::uuid`,
      [E],
    )) as Array<Record<string, unknown>>;
    const logCountBefore = (await sql!.unsafe(
      `select count(*)::int as n from public.sync_log where status = 'reap_stale_session'`,
    )) as Array<{ n: number }>;

    const run2 = await reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN });
    expect(fixtureSessions(run2)).toEqual([]); // still a candidate, zero deletes → skipped_no_residue
    const preservedAfter = (await sql!.unsafe(
      `select c.*, s.* from public.wizard_finalize_checkpoints c
         join public.shows_pending_changes s on s.wizard_session_id = c.wizard_session_id
        where c.wizard_session_id = $1::uuid`,
      [E],
    )) as Array<Record<string, unknown>>;
    expect(preservedAfter).toEqual(preservedBefore); // byte-identical preserved surfaces
    const logCountAfter = (await sql!.unsafe(
      `select count(*)::int as n from public.sync_log where status = 'reap_stale_session'`,
    )) as Array<{ n: number }>;
    expect(logCountAfter[0]!.n).toBe(logCountBefore[0]!.n); // ZERO new log rows
    expect(await reapSyncLogCount(E)).toBe(1);
  },
);

test.skipIf(!dbUp)(
  "concurrent cleanupAbandonedFinalize overlap (R5 HIGH): reap + cleanup on sessions sharing a drive_file_id both settle, no 40P01",
  { timeout: 30000 },
  async () => {
    await cleanupFixtures();
    // F is the ACTIVE session and stale by DB clock (cleanup's eligibility).
    await setActiveSession(F, true);
    await insertManifest({
      session: F,
      driveFileId: "f4-reap-shared",
      createdShowId: null,
      backdated: true,
    });
    await insertPendingSync({ session: F, driveFileId: "f4-reap-shared", backdated: true });
    // G is a stale NON-active session sharing F's drive id (+ one of its own).
    await insertPendingSync({ session: G, driveFileId: "f4-reap-shared", backdated: true });
    await insertPendingIngestion({ session: G, driveFileId: "f4-reap-g-only", backdated: true });

    const outcomes = await Promise.all([
      reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      cleanupAbandonedFinalize(F, { requireAdminIdentity: async () => ADMIN }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    ]);
    // A deadlock manifests as Postgres aborting one party with SQLSTATE 40P01
    // (surfaced inside OnboardingSessionInfraError's message). BOTH must settle
    // successfully — the per-session tx boundary releases the reap's show:
    // locks before any next finalize: acquisition.
    for (const outcome of outcomes) {
      if (!outcome.ok) {
        throw new Error(`overlap participant failed: ${String((outcome.error as Error).message)}`);
      }
    }
  },
);

test.skipIf(!dbUp)(
  "retry-route overlap (R15 HIGH): reap runs while a pipeline-locked route tx holds the show advisory lock + a FOR UPDATE row lock — both settle, no 40P01",
  { timeout: 30000 },
  async () => {
    await cleanupFixtures();
    await setActiveSession(A, false);
    await insertPendingIngestion({ session: H, driveFileId: "f4-reap-h1", backdated: true });

    let releaseRoute!: () => void;
    const routeParked = new Promise<void>((resolve) => {
      releaseRoute = resolve;
    });
    let routeHoldsLocks!: () => void;
    const routeReady = new Promise<void>((resolve) => {
      routeHoldsLocks = resolve;
    });

    // The retry route's exact sequence: show ADVISORY lock first
    // (withPostgresSyncPipelineLock), THEN the FOR UPDATE row lock.
    const routePromise = withPostgresSyncPipelineLock(
      "f4-reap-h1",
      async (tx) => {
        await (tx as unknown as { queryOne<T>(s: string, p: unknown[]): Promise<T> }).queryOne(
          `select id from public.pending_ingestions where drive_file_id = $1 and wizard_session_id = $2 for update`,
          ["f4-reap-h1", H],
        );
        routeHoldsLocks();
        await routeParked; // park mid-transaction, locks held
        return { done: true };
      },
      { tryOnly: false },
    );

    await routeReady;
    const reapPromise = reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN });
    // Give the reap time to reach (and block on) show:f4-reap-h1, then release.
    await waitFor(
      async () => (await advisoryWaitersOn("f4-reap-h1")) > 0,
      "reap blocked on show lock",
    );
    releaseRoute();

    const [routeResult, reapResult] = await Promise.all([routePromise, reapPromise]);
    expect(routeResult).toEqual({ done: true });
    // Concrete failure mode: a reap that row-locked H's rows during collection
    // (FOR UPDATE) while the route holds the advisory lock and waits on the
    // same row is an AB-BA deadlock — plain-SELECT collection + advisory-first
    // ordering is what makes this settle. After the release the reap proceeds.
    expect(fixtureSessions(reapResult)).toEqual([{ wizardSessionId: H, outcome: "reaped_full" }]);
    expect(await sessionRows("pending_ingestions", H)).toBe(0);
  },
);

test.skipIf(!dbUp)(
  "R42-1(a)/R38-1 late-row race through the REAL defaultWithTx: lock-set expansion rolls back, retries with a fresh set covering the new id, and reaps in full",
  { timeout: 45000 },
  async () => {
    await cleanupFixtures();
    await setActiveSession(A, false);
    await insertPendingSync({ session: R, driveFileId: "f4-reap-zz", backdated: true });

    // Driver holds show:f4-reap-zz so the reap's single sorted acquisition pass
    // BLOCKS — a deterministic window between its initial collection and its
    // under-lock re-collection.
    await driverLock("f4-reap-zz");
    try {
      const reapPromise = reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN });
      await waitFor(
        async () => (await advisoryWaitersOn("f4-reap-zz")) > 0,
        "reap blocked on f4-reap-zz",
      );
      // A stale-tab action commits a NEW-drive row mid-window.
      await insertPendingSync({ session: R, driveFileId: "f4-reap-aa", backdated: true });
      await driverUnlock("f4-reap-zz");

      const result = await reapPromise;
      // R38-1 is what this proves end-to-end: the REAL defaultWithTx passes
      // ReapLockSetExpandedError through un-wrapped, so the retry loop sees it
      // and re-runs the session instead of surfacing an infra 500. The retry's
      // fresh lock set covers the new id, so the session reaps in full.
      expect(fixtureSessions(result)).toEqual([{ wizardSessionId: R, outcome: "reaped_full" }]);
      expect(await sessionRows("pending_syncs", R)).toBe(0);
      expect(await reapSyncLogCount(R)).toBe(1); // exactly one — the aborted attempt logged nothing
    } finally {
      await driverUnlock("f4-reap-zz").catch(() => {});
    }
  },
);

test.skipIf(!dbUp)(
  "R38-1: persistent lock-set expansion exhausts the retry budget through the REAL defaultWithTx → skipped_unstable, zero deletes, no sync_log",
  { timeout: 45000 },
  async () => {
    await cleanupFixtures();
    await setActiveSession(A, false);
    await insertPendingSync({ session: U, driveFileId: "f4-reap-z9", backdated: true });

    let held = "f4-reap-z9";
    await driverLock(held);
    try {
      const reapPromise = reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN });
      // Three cycles — one per retry-budget attempt. Each cycle: wait for the
      // reap to block on the held id, commit a NEW lower-sorted row, take its
      // lock BEFORE releasing the current one, release. The re-collection then
      // always finds an id outside the held set → ReapLockSetExpandedError on
      // every attempt → budget exhausted.
      for (let cycle = 1; cycle <= 3; cycle++) {
        await waitFor(
          async () => (await advisoryWaitersOn(held)) > 0,
          `reap blocked on ${held} (cycle ${cycle})`,
        );
        const next = `f4-reap-a${cycle}`; // a1 < a2 < a3 < z9
        await insertPendingSync({ session: U, driveFileId: next, backdated: true });
        await driverLock(next);
        await driverUnlock(held);
        held = next;
      }
      const result = await reapPromise;
      expect(fixtureSessions(result)).toEqual([
        { wizardSessionId: U, outcome: "skipped_unstable" },
      ]);
      // Zero deletes: every seeded row (z9 + a1 + a2 + a3) survives.
      expect(await sessionRows("pending_syncs", U)).toBe(4);
      expect(await reapSyncLogCount(U)).toBe(0);
    } finally {
      await driverUnlock(held).catch(() => {});
    }
  },
);
