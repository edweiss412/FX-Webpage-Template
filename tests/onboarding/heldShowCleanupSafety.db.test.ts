/**
 * Task B4 — spec §7.5 / AC5 structural regression pin.
 *
 * A deliberate **Held** show (`published=false`, `archived=false`,
 * `wizard_created_session_id = <session>`) created by a finalize session that
 * reached `final_cas_done` (a COMPLETED session) must survive BOTH
 * abandoned-finalize cleanup paths:
 *
 *  - `cleanupAbandonedFinalize(session)` — only proceeds while the session is
 *    STILL `app_settings.pending_wizard_session_id` AND >24h stale
 *    (`sessionLifecycle.ts:346-356`). A successful finalize-cas clears
 *    `pending_wizard_session_id = null` (`finalize-cas/route.ts:590`), so a
 *    completed session never matches → it no-ops (`already_cleaned`) and
 *    deletes nothing.
 *  - `reapStaleOnboardingSessions` — gates its show-delete on `if (!terminal)`
 *    where `terminal = checkpoint.status === 'final_cas_done'`
 *    (`sessionLifecycle.ts:633-664`). A terminal session deletes NO shows; the
 *    terminal-session sweep only touches staging tables (manifest/pending/
 *    deferred), never `public.shows`.
 *
 * This test CONFIRMS existing safety (it passes GREEN against current code).
 * If it FAILS, that is a real §7.5 violation — do not weaken the test.
 *
 * DB-connection convention (mirrors reapStaleSessionsDb.test.ts): LOCAL-ONLY;
 * BOTH env vars pinned to the assertLocalDbUrl-validated loopback URL,
 * originals restored in afterAll.
 */
import { afterAll, expect, test } from "vitest";
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

// The single COMPLETED finalize session under test.
const S = "b4000000-0000-4000-8000-b4b4b4b4b4b4";
const FIXTURE_SESSIONS = [S];
const FIXTURE_DRIVE_PREFIX = "b4-held-";
const HELD_DRIVE_ID = `${FIXTURE_DRIVE_PREFIX}held`;
const ADMIN = { email: "admin@example.com" };
// Backdated past the 24h staleness window used by both cleanup paths.
const BACK = "now() - interval '25 hours'";

let sql: ReturnType<typeof postgres> | null = null;
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
  dbUp = true;
} catch {
  if (sql) await sql.end().catch(() => {});
  sql = null;
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
      // postgres.js serializes a $N::jsonb param itself — pass via sql.json,
      // never JSON.stringify (double-encode → jsonb string scalar).
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
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
});

async function insertHeldShow(): Promise<string> {
  // A deliberate Held show: published=false, archived=false, with wizard
  // provenance pointing at the completed session S.
  const rows = (await sql!.unsafe(
    `insert into public.shows
       (drive_file_id, title, slug, published, archived, client_label, template_version, wizard_created_session_id)
     values ($1, 'B4 held fixture', 'b4-held-fixture', false, false, 'Fixture Client', 'v2', $2::uuid)
     returning id`,
    [HELD_DRIVE_ID, S],
  )) as Array<{ id: string }>;
  return rows[0]!.id;
}

async function insertCompletedCheckpoint(): Promise<void> {
  // status='final_cas_done' → the session is TERMINAL. last_processed_at
  // backdated so neither cleanup path treats it as "recently active".
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints
       (wizard_session_id, status, batches_completed, last_processed_at)
     values ($1::uuid, 'final_cas_done', 1, ${BACK})`,
    [S],
  );
}

async function insertHeldManifest(createdShowId: string): Promise<void> {
  // The first-seen manifest row for the Held show: created_show_id binds the
  // provenance, publish_intent=false marks it as the unchecked (deliberately
  // Held) row. Backdated so it counts as stale.
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (wizard_session_id, drive_file_id, folder_id, name, mime_type, status, created_show_id, publish_intent, observed_at, transitioned_at)
     values ($1::uuid, $2, 'b4-held-folder', $2, 'application/vnd.google-apps.spreadsheet', 'applied', $3::uuid, false, ${BACK}, ${BACK})`,
    [S, HELD_DRIVE_ID, createdShowId],
  );
}

async function showExists(id: string): Promise<boolean> {
  const rows = (await sql!.unsafe(`select 1 from public.shows where id = $1::uuid`, [
    id,
  ])) as Array<unknown>;
  return rows.length === 1;
}

test.skipIf(!dbUp)(
  "§7.5/AC5: a Held show from a COMPLETED (final_cas_done) finalize session survives both cleanupAbandonedFinalize and reapStaleOnboardingSessions",
  { timeout: 30000 },
  async () => {
    await cleanupFixtures();

    // Post-finalize world: the wizard ended, so there is NO pending session.
    // (A successful finalize-cas clears pending_wizard_session_id=null.)
    await sql!.unsafe(
      `update public.app_settings
          set pending_wizard_session_id = null,
              pending_wizard_session_at = null
        where id = 'default'`,
    );

    const heldShowId = await insertHeldShow();
    await insertCompletedCheckpoint();
    await insertHeldManifest(heldShowId);

    // Sanity: the Held show is present and in the Held shape before cleanup.
    expect(await showExists(heldShowId)).toBe(true);

    // (1) cleanupAbandonedFinalize(S): S is NOT the pending session, so the
    //     staleSession SELECT finds 0 rows and the owner check returns
    //     `already_cleaned` WITHOUT touching shows. Must not throw, must not
    //     delete the Held show.
    const cleanupResult = await cleanupAbandonedFinalize(S, {
      requireAdminIdentity: async () => ADMIN,
    });
    expect(cleanupResult.status).toBe("already_cleaned");
    expect(
      await showExists(heldShowId),
      "cleanupAbandonedFinalize must NOT delete a Held show",
    ).toBe(true);

    // (2) reapStaleOnboardingSessions: S is a candidate (not the active
    //     session) but TERMINAL (final_cas_done), so the `if (!terminal)`
    //     show-delete block is skipped — NO shows are deleted. The terminal
    //     staging sweep may remove the manifest row, but never the show.
    await reapStaleOnboardingSessions({ requireAdminIdentity: async () => ADMIN });
    expect(
      await showExists(heldShowId),
      "reapStaleOnboardingSessions must NOT delete a terminal session's Held show",
    ).toBe(true);

    // Final invariant (§7.5): the Held show row still exists after BOTH paths.
    expect(await showExists(heldShowId)).toBe(true);
  },
);
