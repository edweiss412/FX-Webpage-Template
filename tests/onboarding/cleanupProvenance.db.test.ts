/**
 * F4 Task 4.1 — REAL-Postgres data-loss regression for cleanupAbandonedFinalize's
 * first-seen interim-show delete (spec §6 / R11-1).
 *
 * Concrete failure mode: the `published = false` proxy predicate deletes a
 * PRE-EXISTING legitimately-unpublished show whose drive_file_id appears in the
 * session's applied manifest (the existing-show shadow branch creates shadows
 * "regardless of published" — master spec line 2591 b). The provenance form
 * (created_show_id + drive_file_id binding + show-side wizard_created_session_id
 * discriminator) deletes ONLY session-created interim rows.
 *
 * DB-connection convention (plan R13/R19-1): LOCAL-ONLY. The lifecycle helper's
 * default opener resolves TEST_DATABASE_URL ?? DATABASE_URL and in this repo
 * TEST_DATABASE_URL is the VALIDATION project (.env.local) — BOTH env vars are
 * pinned to the assertLocalDbUrl-validated loopback URL for the whole suite
 * (originals restored in teardown). This suite seeds and DELETES
 * app_settings/shows/manifest rows and must be impossible to point at validation.
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { cleanupAbandonedFinalize } from "@/lib/onboarding/sessionLifecycle";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

// R19-1 env pinning: defaultWithTx resolves TEST_DATABASE_URL ?? DATABASE_URL —
// deleting only one leaves the other live.
const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

const SESSION = "f4f4f4f4-0001-4001-8001-f4f4f4f4f4f4";
const OTHER_SESSION = "f4f4f4f4-0002-4002-8002-f4f4f4f4f4f4";
const PRE_EXISTING_FILE = "f4-cleanup-preexisting-file";
const SESSION_CREATED_FILE = "f4-cleanup-created-file";
const FORGED_FILE = "f4-cleanup-forged-file";
const MISMATCH_FILE = "f4-cleanup-mismatch-file";

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
// Plan R18-1: capture the ORIGINAL app_settings row BEFORE mutating the
// singleton — cleanupAbandonedFinalize ROTATES pending_wizard_session_id, so
// without restoration this suite leaks an unexpected active wizard session
// into later DB tests.
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
  sql = null;
  dbUp = false;
}

const FIXTURE_FILES = [PRE_EXISTING_FILE, SESSION_CREATED_FILE, FORGED_FILE, MISMATCH_FILE];

async function cleanupFixture() {
  const db = sql!;
  await db.unsafe(
    `delete from public.onboarding_scan_manifest where wizard_session_id in ($1::uuid, $2::uuid)`,
    [SESSION, OTHER_SESSION],
  );
  await db.unsafe(
    `delete from public.wizard_finalize_checkpoints where wizard_session_id in ($1::uuid, $2::uuid)`,
    [SESSION, OTHER_SESSION],
  );
  await db.unsafe(`delete from public.shows where drive_file_id = any($1)`, [FIXTURE_FILES]);
  await db.unsafe(`delete from public.sync_log where parse_warnings @> $1::jsonb`, [
    JSON.stringify([{ wizard_session_id: SESSION }]),
  ]);
}

async function seed() {
  const db = sql!;
  await cleanupFixture();
  // Stale active session (DB-clock based: cleanup requires
  // pending_wizard_session_at > 24h old, sessionLifecycle.ts:337).
  await db.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = now() - interval '25 hours'
      where id = 'default'`,
    [SESSION],
  );
  // Pre-existing REAL show, legitimately unpublished, approved into this
  // session (manifest applied, NO created_show_id provenance).
  const [preExisting] = (await db.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version)
     values ($1, 'Pre-existing unpublished', 'f4-preexisting', false, 'Fixture Client', 'v2')
     returning id`,
    [PRE_EXISTING_FILE],
  )) as Array<{ id: string }>;
  // Session-CREATED interim show: manifest row records provenance AND the
  // show carries the show-side discriminator (R63-1: the cleanup/reap SQL
  // joins on wizard_created_session_id).
  const [created] = (await db.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version, wizard_created_session_id)
     values ($1, 'Wizard interim', 'f4-interim', false, 'Fixture Client', 'v2', $2::uuid)
     returning id`,
    [SESSION_CREATED_FILE, SESSION],
  )) as Array<{ id: string }>;
  // R57-1/R67-1 forged-provenance negatives:
  // (i) a SAME-DRIVE forged manifest row pointing created_show_id at a
  //     pre-existing unpublished show whose wizard_created_session_id is NULL;
  const [forged] = (await db.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version)
     values ($1, 'Forged target', 'f4-forged', false, 'Fixture Client', 'v2')
     returning id`,
    [FORGED_FILE],
  )) as Array<{ id: string }>;
  // (ii) a show created by a DIFFERENT session (mismatched discriminator).
  const [mismatch] = (await db.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version, wizard_created_session_id)
     values ($1, 'Other-session interim', 'f4-mismatch', false, 'Fixture Client', 'v2', $2::uuid)
     returning id`,
    [MISMATCH_FILE, OTHER_SESSION],
  )) as Array<{ id: string }>;
  await db.unsafe(
    `insert into public.onboarding_scan_manifest (wizard_session_id, drive_file_id, folder_id, name, mime_type, status, created_show_id)
     values ($1::uuid, $2, 'f4-folder', 'pre-existing', 'application/vnd.google-apps.spreadsheet', 'applied', null),
            ($1::uuid, $3, 'f4-folder', 'created', 'application/vnd.google-apps.spreadsheet', 'applied', $4::uuid),
            ($1::uuid, $5, 'f4-folder', 'forged', 'application/vnd.google-apps.spreadsheet', 'applied', $6::uuid),
            ($1::uuid, $7, 'f4-folder', 'mismatch', 'application/vnd.google-apps.spreadsheet', 'applied', $8::uuid)`,
    [
      SESSION,
      PRE_EXISTING_FILE,
      SESSION_CREATED_FILE,
      created!.id,
      FORGED_FILE,
      forged!.id,
      MISMATCH_FILE,
      mismatch!.id,
    ],
  );
  return {
    preExistingId: preExisting!.id,
    createdId: created!.id,
    forgedId: forged!.id,
    mismatchId: mismatch!.id,
  };
}

afterAll(async () => {
  if (sql && dbUp && originalSettings) {
    await cleanupFixture().catch(() => {});
    // R18-1: restore the exact original singleton values + assert the restore landed.
    const restored = (await sql.unsafe(
      `update public.app_settings
          set pending_wizard_session_id = $1::uuid,
              pending_wizard_session_at = $2::timestamptz
        where id = 'default'
        returning pending_wizard_session_id`,
      [originalSettings.pending_wizard_session_id, originalSettings.pending_wizard_session_at],
    )) as Array<{ pending_wizard_session_id: string | null }>;
    if (restored[0]?.pending_wizard_session_id !== originalSettings.pending_wizard_session_id) {
      throw new Error("cleanupProvenance.db: app_settings restore did not land");
    }
  }
  if (sql) await sql.end({ timeout: 5 });
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
});

describe("cleanupAbandonedFinalize first-seen delete is provenance-keyed (F4 / R11-1)", () => {
  test.skipIf(!dbUp)(
    "a pre-existing published=false show approved into the session SURVIVES; the session-created interim row is deleted; forged/mismatched provenance rows survive",
    async () => {
      const { preExistingId, createdId, forgedId, mismatchId } = await seed();
      const result = await cleanupAbandonedFinalize(SESSION, {
        requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      });
      expect(result.status).toBe("cleaned");
      const allIds = [preExistingId, createdId, forgedId, mismatchId];
      const survivors = (await sql!.unsafe(
        `select id from public.shows where id = any($1::uuid[]) order by drive_file_id`,
        [allIds],
      )) as Array<{ id: string }>;
      // Concrete failure mode: the proxy predicate deletes ALL FOUR rows (all
      // are published=false with manifest-applied drive_file_ids); these
      // assertions fail against it, pass once the delete is provenance-keyed
      // (created_show_id + drive_file_id binding + wizard_created_session_id
      // discriminator). Expected survivors derived from the seed constants:
      // every fixture show EXCEPT the genuinely session-created interim row.
      const expectedSurvivors = allIds.filter((id) => id !== createdId).sort();
      expect(survivors.map((row) => row.id).sort()).toEqual(expectedSurvivors);
    },
  );
});
