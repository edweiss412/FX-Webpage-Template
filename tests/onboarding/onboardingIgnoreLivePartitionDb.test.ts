import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleWizardPendingIngestionPermanentIgnore } from "@/app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route";

/**
 * Task C1 — onboarding "Ignore" writes the DURABLE LIVE partition.
 *
 * Before: the onboarding permanent_ignore route delegated to the wizard-scoped
 * handleAction, which wrote a deferred_ingestions row with wizard_session_id =
 * <session> (via upsertWizardDeferral). purgeWizardRows at finalize deletes every
 * `wizard_session_id IS NOT NULL` deferral, so the ignored sheet re-surfaced. Cron's
 * skip gate reads only the live partition (wizard_session_id IS NULL).
 *
 * After: permanent_ignore writes the LIVE partition (wizard_session_id = NULL,
 * deferred_kind = 'permanent_ignore', deferred_by_email = canonicalize(admin),
 * drive_file_name = <sheet name>, deferred_at_modified_time = NULL), mirroring the
 * live discard route's upsertLiveDeferral. The row SURVIVES a purgeWizardRows-style
 * delete of wizard_session_id IS NOT NULL rows. The pending_ingestions row + manifest
 * row still leave the wizard list.
 *
 * Every assertion reads back from the DB; the purge is simulated with the exact
 * predicate purgeWizardRows uses (lib/onboarding/sessionLifecycle.ts:168).
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1";
const FOLDER = "c1-ignore-folder";
const DRIVE_FILE_ID = "c1-ignore-drive-file";
const PENDING_ID = "c1c1c1c1-2222-4222-8222-c1c1c1c1c1c1";
const SHEET_NAME = "C1 Ignore Fixture.gsheet";
const ADMIN_EMAIL = "Doug.Larson@FXAV.com"; // mixed-case → canonicalize must lowercase it

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 2,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

function one<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.pending_ingestions where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.deferred_ingestions where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

async function seed(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  // A wizard-scoped pending_ingestion (couldn't-read card) with a known sheet name.
  await sql!.unsafe(
    `insert into public.pending_ingestions
       (id, drive_file_id, drive_file_name, wizard_session_id, discovered_during_folder_id,
        last_error_code, last_error_message, last_seen_modified_time)
     values ($1::uuid, $2, $3, $4::uuid, $5, 'PARSE_FAILED', 'could not read', '2026-06-20T00:00:00.000Z')`,
    [PENDING_ID, DRIVE_FILE_ID, SHEET_NAME, SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', $4, 'hard_failed')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'hard_failed'`,
    [FOLDER, SESSION, DRIVE_FILE_ID, SHEET_NAME],
  );
}

const context = { params: Promise.resolve({ id: PENDING_ID }) };

function req(): Request {
  return new Request(
    `https://crew.fxav.test/api/admin/onboarding/pending_ingestions/${PENDING_ID}/permanent_ignore`,
    {
      method: "POST",
    },
  );
}

beforeAll(() => {
  if (!dbUp) return;
  // Route openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH to local loopback.
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await seed();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("Task C1 — onboarding Ignore writes the durable live partition (real DB)", () => {
  test.skipIf(!dbUp)(
    "permanent_ignore writes a live (wizard_session_id IS NULL) deferral with admin email + sheet name, and removes the pending row",
    async () => {
      const response = await handleWizardPendingIngestionPermanentIgnore(req(), context, {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()) as { status: string }).toEqual({ status: "ignored" });

      // The live-partition deferral row exists with the right shape.
      const deferral = one(
        await sql!.unsafe(
          `select wizard_session_id, deferred_kind, deferred_by_email, drive_file_name,
                  deferred_at_modified_time
             from public.deferred_ingestions
            where drive_file_id = $1`,
          [DRIVE_FILE_ID],
        ),
      ) as {
        wizard_session_id: string | null;
        deferred_kind: string;
        deferred_by_email: string | null;
        drive_file_name: string | null;
        deferred_at_modified_time: string | null;
      };
      expect(deferral.wizard_session_id).toBeNull(); // LIVE partition
      expect(deferral.deferred_kind).toBe("permanent_ignore");
      expect(deferral.deferred_by_email).toBe(ADMIN_EMAIL.toLowerCase()); // canonicalized
      expect(deferral.drive_file_name).toBe(SHEET_NAME);
      expect(deferral.deferred_at_modified_time).toBeNull();

      // The pending_ingestions row left the wizard list.
      expect(
        (
          await sql!.unsafe(`select 1 from public.pending_ingestions where id = $1::uuid`, [
            PENDING_ID,
          ])
        ).length,
      ).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "the live deferral SURVIVES a purgeWizardRows-style delete of wizard_session_id IS NOT NULL rows",
    async () => {
      const response = await handleWizardPendingIngestionPermanentIgnore(req(), context, {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
      });
      expect(response.status).toBe(200);

      // Simulate the finalize purge (lib/onboarding/sessionLifecycle.ts:168): delete every
      // wizard-scoped deferral. A live-partition row (wizard_session_id IS NULL) must survive.
      await sql!.unsafe(
        `delete from public.deferred_ingestions where wizard_session_id is not null`,
        [],
      );

      const surviving = await sql!.unsafe(
        `select 1 from public.deferred_ingestions
          where drive_file_id = $1 and wizard_session_id is null`,
        [DRIVE_FILE_ID],
      );
      expect(surviving.length).toBe(1); // durable across finalize
    },
  );
});
