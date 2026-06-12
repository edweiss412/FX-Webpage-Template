/**
 * F5 Task 5.5 (R6 HIGH) — REAL-Postgres race regression for the discardStaged
 * wizard branch (S3/S4 of the class sweep).
 *
 * Concrete failure mode caught: the mocked tests inject vi.fn(async () =>
 * true/false) for every statement — a transposed parameter in the EXISTS
 * clause, a predicate written against the wrong column, or an EXISTS subquery
 * that doesn't re-read app_settings at statement time would ship GREEN through
 * them; only the real default SQL executing against real Postgres catches it
 * (the mocked-only-tests-invite-tautological-APPROVE class).
 *
 * Harness mirrors tests/onboarding/wizardSessionCasRaceDb.test.ts exactly:
 * loopback-only (assertLocalDbUrl), BOTH TEST_DATABASE_URL and DATABASE_URL
 * pinned (R19-1), a SECOND postgres() connection plays the superseder, afterAll
 * restores app_settings and deletes fixture rows. The hook-style dep performs
 * the mid-tx flip AFTER the manifest statement, so the SQL under test is the
 * PRODUCTION default, not a fake.
 */
import { afterAll, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import {
  defaultMarkWizardManifestDiscarded,
  discardStaged_unlocked,
} from "@/lib/sync/discardStaged";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

const W1 = "f5f5f5f5-0003-4003-8003-f5f5f5f5f5f5";
const W2 = "f5f5f5f5-0004-4004-8004-f5f5f5f5f5f5";
const FILE = "f5-discard-cas-race-file";
const FOLDER = "f5-discard-cas-race-folder";
const SID = "f5f5f5f5-0005-4005-8005-f5f5f5f5f5f5";

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
  await sql.unsafe(`delete from public.pending_syncs where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.deferred_ingestions where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.onboarding_scan_manifest where drive_file_id = $1`, [FILE]);
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
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
});

async function seedDiscardFixture(): Promise<void> {
  await cleanupFixtureRows();
  await sql!.unsafe(
    `update public.app_settings set pending_wizard_session_id = $1::uuid, pending_folder_id = $2 where id = 'default'`,
    [W1, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'F5 discard race fixture', 'staged')`,
    [FOLDER, W1, FILE],
  );
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, staged_id, staged_modified_time, parse_result, source_kind,
        warning_summary, wizard_session_id, triggered_review_items)
     values ($1, $2::uuid, '2026-06-11T00:00:00.000Z'::timestamptz, $3::jsonb,
             'onboarding_scan', '', $4::uuid, '[]'::jsonb)`,
    [FILE, SID, JSON.stringify({ show: { title: "F5 Discard Race" } }), W1],
  );
}

async function readDeferralRows(driveFileId: string) {
  return (await sql!.unsafe(
    `select wizard_session_id, deferred_kind from public.deferred_ingestions where drive_file_id = $1`,
    [driveFileId],
  )) as unknown as Array<{ wizard_session_id: string | null }>;
}

async function readManifestStatus(): Promise<string> {
  const rows = (await sql!.unsafe(
    `select status from public.onboarding_scan_manifest
      where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [W1, FILE],
  )) as Array<{ status: string }>;
  return rows[0]!.status;
}

async function readWizardPendingSync() {
  const rows = (await sql!.unsafe(
    `select staged_id from public.pending_syncs
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [FILE, W1],
  )) as Array<{ staged_id: string }>;
  return rows[0] ?? null;
}

test.skipIf(!dbUp)(
  "discard race: deferral + manifest CAS succeed, session flips, pending-sync delete predicate misses → typed rollback, ALL rows unchanged",
  async () => {
    await seedDiscardFixture();

    // Hook-style dep (plan-sanctioned): the REAL default manifest CAS runs,
    // then the committed supersession lands — between the manifest statement
    // and deleteWizardPendingSync. Every statement is the PRODUCTION SQL.
    const hookDeps = {
      markWizardManifestDiscarded: async (
        tx: Parameters<typeof defaultMarkWizardManifestDiscarded>[0],
        driveFileId: string,
        wizardSessionId: string,
        status: Parameters<typeof defaultMarkWizardManifestDiscarded>[3],
      ): Promise<boolean> => {
        const marked = await defaultMarkWizardManifestDiscarded(
          tx,
          driveFileId,
          wizardSessionId,
          status,
        );
        expect(marked).toBe(true); // manifest CAS really executed in-tx while W1 was current
        await superseder!.unsafe(
          `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
          [W2],
        );
        return marked;
      },
    };

    await expect(
      withPostgresSyncPipelineLock(
        FILE,
        (tx) =>
          discardStaged_unlocked(
            tx,
            {
              driveFileId: FILE,
              sourceScope: "wizard",
              wizardSessionId: W1,
              stagedId: SID,
              variant: "permanent_ignore",
            },
            hookDeps,
          ),
        { tryOnly: false },
      ),
    ).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);

    // Post-abort: the WHOLE wizard-branch transaction rolled back — nothing persisted.
    expect(await readDeferralRows(FILE)).toEqual([]); // deferral write rolled back
    expect(await readManifestStatus()).toBe("staged"); // manifest CAS rolled back
    expect(await readWizardPendingSync()).not.toBeNull(); // pending_syncs row survives
  },
);
