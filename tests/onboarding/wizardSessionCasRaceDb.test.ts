/**
 * F5 Task 5.2 — REAL-Postgres partial-commit regression for the wizard-session
 * CAS turnover race (BL-WIZARD-SESSION-CAS-TURNOVER-RACE).
 *
 * The unit fakes (pendingIngestionsWizardActions.test.ts) prove the
 * throw-vs-return shape but cannot prove Postgres semantics:
 *   (a) the EXISTS currency subquery re-reads app_settings at STATEMENT time
 *       under READ COMMITTED — a mid-transaction committed flip IS visible to
 *       the next statement;
 *   (b) the thrown WizardSessionSupersededRollbackError actually aborts the
 *       sql.begin transaction so the already-executed manifest UPDATE does not
 *       persist.
 * A mocked test passing while the real path partial-commits is exactly the
 * "mocked-only tests invite tautological APPROVE" class.
 *
 * Contract alignment (plan R39-1/R40-1): the SQL helpers are BOOLEAN-returning;
 * the ROUTE layer converts 0-row to the typed throw. This test mirrors the
 * route's exact conversion inside its transaction rather than expecting the
 * bare helper to throw.
 *
 * DB-connection convention (plan R16-2/R19-1): LOCAL-ONLY. The route's default
 * openers resolve TEST_DATABASE_URL ?? DATABASE_URL, and in this repo
 * TEST_DATABASE_URL is the VALIDATION project (.env.local) — so BOTH env vars
 * are pinned to the assertLocalDbUrl-validated loopback URL for the whole
 * suite (originals restored in teardown). TEST_DATABASE_URL-as-validation
 * appears ONLY in explicitly labeled close-out commands, never here.
 */
import { afterAll, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import {
  handleWizardPendingIngestionAction,
  transitionManifestRow,
  upsertWizardDeferral,
} from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

// R19-1 env pinning: the route/lib default openers resolve
// TEST_DATABASE_URL ?? DATABASE_URL — deleting only one leaves the other live.
const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

const W1 = "f5f5f5f5-0001-4001-8001-f5f5f5f5f5f5";
const W2 = "f5f5f5f5-0002-4002-8002-f5f5f5f5f5f5";
const FILE = "f5-cas-race-file";
const FOLDER = "f5-cas-race-folder";

// Probe the connection at module top-level: `test.skipIf` is evaluated at
// collection time (before beforeAll), so `dbUp` must be settled before then.
let sql: ReturnType<typeof postgres> | null = null;
let superseder: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let originalSettings: {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
} | null = null;
try {
  const probe = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  const rows = (await probe.unsafe(
    `select pending_wizard_session_id, pending_folder_id from public.app_settings where id = 'default'`,
    [],
  )) as Array<{ pending_wizard_session_id: string | null; pending_folder_id: string | null }>;
  originalSettings = rows[0] ?? { pending_wizard_session_id: null, pending_folder_id: null };
  sql = probe;
  superseder = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  dbUp = true;
} catch {
  if (sql) await sql.end().catch(() => {});
  sql = null;
  superseder = null;
  dbUp = false;
}

async function cleanupFixtureRows(): Promise<void> {
  if (!sql) return;
  await sql.unsafe(`delete from public.pending_ingestions where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.deferred_ingestions where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.onboarding_scan_manifest where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.pending_syncs where drive_file_id = $1`, [FILE]);
  await sql.unsafe(
    `delete from public.admin_alerts where code = 'WIZARD_SESSION_SUPERSEDED_RACE' and context->>'drive_file_id' = $1`,
    [FILE],
  );
}

afterAll(async () => {
  if (sql && dbUp && originalSettings) {
    await cleanupFixtureRows().catch(() => {});
    await sql
      .unsafe(
        `update public.app_settings set pending_wizard_session_id = $1::uuid, pending_folder_id = $2 where id = 'default'`,
        [originalSettings.pending_wizard_session_id, originalSettings.pending_folder_id],
      )
      .catch(() => {});
  }
  if (sql) await sql.end().catch(() => {});
  if (superseder) await superseder.end().catch(() => {});
  // Restore the pinned env vars (R19-1).
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
});

type PendingIngestionRow = {
  id: string;
  drive_file_id: string;
  wizard_session_id: string;
  discovered_during_folder_id: string | null;
  last_seen_modified_time: string | null;
};

async function seed(): Promise<{ pendingIngestionId: string }> {
  await cleanupFixtureRows();
  await sql!.unsafe(
    `update public.app_settings set pending_wizard_session_id = $1::uuid, pending_folder_id = $2 where id = 'default'`,
    [W1, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'F5 race fixture', 'hard_failed')`,
    [FOLDER, W1, FILE],
  );
  const rows = (await sql!.unsafe(
    `insert into public.pending_ingestions
       (drive_file_id, drive_file_name, last_error_code, last_error_message,
        wizard_session_id, discovered_during_folder_id, last_seen_modified_time)
     values ($1, 'f5-race.xlsx', 'MI_1_MISSING_REQUIRED_TAB', 'f5 fixture',
             $2::uuid, $3, '2026-06-11T00:00:00.000Z'::timestamptz)
     returning id`,
    [FILE, W1, FOLDER],
  )) as Array<{ id: string }>;
  return { pendingIngestionId: rows[0]!.id };
}

async function readPendingIngestionRow(id: string): Promise<PendingIngestionRow | null> {
  const rows = (await sql!.unsafe(
    `select id, drive_file_id, wizard_session_id, discovered_during_folder_id, last_seen_modified_time
       from public.pending_ingestions where id = $1::uuid`,
    [id],
  )) as unknown as PendingIngestionRow[];
  return rows[0] ?? null;
}

async function readManifestRow(wizardSessionId: string, driveFileId: string) {
  const rows = (await sql!.unsafe(
    `select status from public.onboarding_scan_manifest
      where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [wizardSessionId, driveFileId],
  )) as Array<{ status: string }>;
  return rows[0]!;
}

async function readDeferralRows(driveFileId: string) {
  return (await sql!.unsafe(
    `select drive_file_id, wizard_session_id, deferred_kind from public.deferred_ingestions
      where drive_file_id = $1`,
    [driveFileId],
  )) as unknown as Array<{ wizard_session_id: string | null; deferred_kind: string }>;
}

function assertLoopbackOpenersPinned(): void {
  // Guard assertion (R19-1): the default route openers must resolve to the
  // validated loopback URL before the first route call.
  expect(assertLocalDbUrl(process.env.TEST_DATABASE_URL!)).toBe(DB_URL);
  expect(assertLocalDbUrl(process.env.DATABASE_URL!)).toBe(DB_URL);
}

async function flipSessionTo(sessionId: string): Promise<void> {
  await superseder!.unsafe(
    `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
    [sessionId],
  );
}

test.skipIf(!dbUp)(
  "manifest UPDATE succeeds, session flips, deferral predicate misses → ALL THREE rows unchanged after the abort",
  async () => {
    const { pendingIngestionId } = await seed();
    const row = (await readPendingIngestionRow(pendingIngestionId))!;

    await expect(
      withPostgresSyncPipelineLock(
        FILE,
        async (tx) => {
          const manifestTransitioned = await transitionManifestRow(
            tx as never,
            row as never,
            "defer_until_modified",
          );
          expect(manifestTransitioned).toBe(true); // statement 1 really executed in-tx
          // The race: a committed supersession lands between statement 1 and statement 2.
          await flipSessionTo(W2);
          // R40-1: helper is BOOLEAN-returning; mirror the route's exact conversion here.
          const ok = await upsertWizardDeferral(tx as never, row as never, "defer_until_modified");
          if (!ok) {
            throw new WizardSessionSupersededRollbackError({
              attemptedAction: "defer_until_modified",
              supersededSessionId: W1,
              pendingIngestionId,
              driveFileId: row.drive_file_id,
            });
          }
          throw new Error("unreachable: predicate should have missed (ok === false)");
        },
        { tryOnly: false },
      ),
    ).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);

    // Post-abort state: NOTHING committed.
    const manifest = await readManifestRow(W1, FILE);
    expect(manifest.status).toBe("hard_failed"); // statement-1's transition rolled back
    expect(await readDeferralRows(FILE)).toEqual([]); // no stale-session deferral
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull(); // row not deleted
  },
);

test.skipIf(!dbUp)(
  "half (i): a supersession visible BEFORE any mutating statement → typed 409, nothing commits (route-level)",
  async () => {
    const { pendingIngestionId } = await seed();
    await flipSessionTo(W2);

    assertLoopbackOpenersPinned();
    const response = await handleWizardPendingIngestionAction(
      { params: Promise.resolve({ id: pendingIngestionId }) },
      { requireAdminIdentity: async () => ({ email: "admin@example.com" }) }, // real withRowTx + real DB
      "defer_until_modified",
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect((await readManifestRow(W1, FILE)).status).toBe("hard_failed");
    expect(await readDeferralRows(FILE)).toEqual([]);
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull();
  },
);
