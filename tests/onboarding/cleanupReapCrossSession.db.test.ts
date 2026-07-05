/**
 * T11 (finalize-resume-deadlock §5.5 R9) — cleanupAbandonedFinalize's discard
 * purge is SESSION-SCOPED, so it never orphans a DIFFERENT stale session's rows.
 *
 * Concrete failure mode (the bug this pins): the old purge (purgeWizardRows)
 * deleted ALL wizard rows across ALL sessions and unconditionally truncated
 * onboarding_scan_manifest. So discarding the active session A would also delete
 * a stale NON-active session B's staging rows WITHOUT holding B's show: locks,
 * racing reapStaleOnboardingSessions (which locks B's show: ids and depends on
 * B's manifest to delete B's interim show) → B's unpublished interim show is
 * orphaned. The fix scopes the discard delete to `wizard_session_id = A` only;
 * B's rows + interim show survive, so a subsequent reap still reaps B correctly.
 *
 * DB-connection convention (plan R13/R19-1): LOCAL-ONLY. defaultWithTx resolves
 * TEST_DATABASE_URL ?? DATABASE_URL and in this repo TEST_DATABASE_URL is the
 * VALIDATION project — BOTH env vars are pinned to the assertLocalDbUrl-validated
 * loopback for the whole suite (originals restored in teardown).
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";
import {
  cleanupAbandonedFinalize,
  reapStaleOnboardingSessions,
} from "@/lib/onboarding/sessionLifecycle";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

// A = active session being discarded; B = stale NON-active session that must survive.
const A = "cbcbcbcb-000a-4a00-8a00-cbcbcbcbcbcb";
const B = "cbcbcbcb-000b-4b00-8b00-cbcbcbcbcbcb";
const A_FILE = "cross-session-a-file";
const B_FILE = "cross-session-b-file";
const FIXTURE_SESSIONS = [A, B];
const FIXTURE_FILES = [A_FILE, B_FILE];
const BACK = "now() - interval '25 hours'";
const ADMIN = { email: "admin@example.com" };

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let originalSettings: {
  pending_wizard_session_id: string | null;
  pending_wizard_session_at: string | null;
} | null = null;
try {
  const probe = postgres(DB_URL, { max: 2, idle_timeout: 2, connect_timeout: 3, prepare: false });
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
  dbUp = true;
} catch {
  if (sql) await sql.end().catch(() => {});
  sql = null;
  dbUp = false;
}

async function cleanupFixture(): Promise<void> {
  const db = sql!;
  for (const table of [
    "shows_pending_changes",
    "wizard_finalize_checkpoints",
    "onboarding_scan_manifest",
    "pending_syncs",
    "pending_ingestions",
    "deferred_ingestions",
  ]) {
    await db
      .unsafe(`delete from public.${table} where wizard_session_id = any($1::uuid[])`, [
        FIXTURE_SESSIONS,
      ])
      .catch(() => {});
  }
  await db.unsafe(`delete from public.shows where drive_file_id = any($1)`, [FIXTURE_FILES]);
  for (const session of FIXTURE_SESSIONS) {
    await db
      .unsafe(
        `delete from public.sync_log
          where status in ('reap_stale_session', 'cleanup_abandoned_finalize')
            and parse_warnings @> $1::jsonb`,
        [db.json([{ wizard_session_id: session }] as never) as never],
      )
      .catch(() => {});
  }
}

async function insertShow(driveFileId: string, slug: string, createdBy: string): Promise<string> {
  const rows = (await sql!.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version, wizard_created_session_id)
     values ($1, 'cross-session interim', $2, false, 'Fixture Client', 'v2', $3::uuid)
     returning id`,
    [driveFileId, slug, createdBy],
  )) as Array<{ id: string }>;
  return rows[0]!.id;
}

async function insertManifest(session: string, driveFileId: string, createdShowId: string) {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (wizard_session_id, drive_file_id, folder_id, name, mime_type, status, created_show_id, observed_at, transitioned_at)
     values ($1::uuid, $2, 'cross-session-folder', $2, 'application/vnd.google-apps.spreadsheet', 'applied', $3::uuid, ${BACK}, ${BACK})`,
    [session, driveFileId, createdShowId],
  );
}

async function insertPendingSync(session: string, driveFileId: string) {
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, staged_modified_time, parse_result, source_kind, warning_summary, wizard_session_id, parsed_at)
     values ($1, '2026-06-01T00:00:00.000Z'::timestamptz, '{}'::jsonb, 'onboarding_scan', '', $2::uuid, ${BACK})`,
    [driveFileId, session],
  );
}

async function sessionRows(table: string, session: string): Promise<number> {
  const rows = (await sql!.unsafe(
    `select count(*)::int as n from public.${table} where wizard_session_id = $1::uuid`,
    [session],
  )) as Array<{ n: number }>;
  return rows[0]!.n;
}

async function showExists(id: string): Promise<boolean> {
  const rows = (await sql!.unsafe(`select 1 from public.shows where id = $1::uuid`, [
    id,
  ])) as Array<unknown>;
  return rows.length === 1;
}

afterAll(async () => {
  if (sql && dbUp && originalSettings) {
    await cleanupFixture().catch(() => {});
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
  if (sql) await sql.end({ timeout: 5 });
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
});

describe("cleanupAbandonedFinalize discard purge is session-scoped (T11 / R9)", () => {
  test.skipIf(!dbUp)(
    "discarding active session A leaves stale non-active session B's rows + interim show intact, and a subsequent reap still reaps B",
    { timeout: 30000 },
    async () => {
      await cleanupFixture();
      // Active session A, backdated 25h → eligible for the 24h-stale discard path.
      await sql!.unsafe(
        `update public.app_settings
            set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = ${BACK}
          where id = 'default'`,
        [A],
      );
      const aShow = await insertShow(A_FILE, "cross-session-a", A);
      await insertManifest(A, A_FILE, aShow);
      await insertPendingSync(A, A_FILE);

      // Stale NON-active session B (never referenced by app_settings), full debris + interim show.
      const bShow = await insertShow(B_FILE, "cross-session-b", B);
      await insertManifest(B, B_FILE, bShow);
      await insertPendingSync(B, B_FILE);

      // Discard A.
      const result = await cleanupAbandonedFinalize(A, { requireAdminIdentity: async () => ADMIN });
      expect(result.status).toBe("cleaned");

      // A is fully purged (session-scoped delete removed its rows + provenance interim show).
      expect(await sessionRows("onboarding_scan_manifest", A)).toBe(0);
      expect(await sessionRows("pending_syncs", A)).toBe(0);
      expect(await showExists(aShow)).toBe(false);

      // B SURVIVES untouched — the concrete failure mode (global purge) would have deleted these.
      expect(await sessionRows("onboarding_scan_manifest", B)).toBe(1);
      expect(await sessionRows("pending_syncs", B)).toBe(1);
      expect(await showExists(bShow)).toBe(true);

      // A subsequent reap still finds B's provenance and reaps it in full.
      const reap = await reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN });
      const bOutcome = reap.sessions.find((s) => s.wizardSessionId === B);
      expect(bOutcome?.outcome).toBe("reaped_full");
      expect(await sessionRows("onboarding_scan_manifest", B)).toBe(0);
      expect(await sessionRows("pending_syncs", B)).toBe(0);
      expect(await showExists(bShow)).toBe(false);
    },
  );
});
